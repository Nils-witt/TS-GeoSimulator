/*
 * ApiConnector.ts
 * ---------------
 * Client for the go-unit-mangement JSON API (see api/openapi.yaml of that project).
 * Exports: ApiConnector
 * Purpose: load and create units, push simulated positions via PATCH /api/units/{id}
 * and keep the local unit cache in sync through the /api/units/events stream.
 */

import {Unit} from '../entities/Unit';
import {AbstractConnector} from './AbstractConnector';
import {ApplicationLogger} from '../utils/Logger';
import {UUID} from 'crypto';
import {LatLonPosition, TimedLatLonPosition} from '../Types';
import {PositionUpdateEvent, StatusEvent, RouteEvent} from '../events/Events';

interface ApiPosition {
    lat: number;
    lon: number;
    height?: number | null;
    timestamp?: string | null;
}

interface ApiUnit {
    id: string;
    name: string;
    position: ApiPosition | null;
    symbol: Record<string, string> | null;
    tacticalName: Record<string, string> | null;
    createdAt: string;
    updatedAt: string;
}

interface ApiLoginResponse {
    token: string;
    tokenType: 'Bearer';
    expiresAt: string;
}

export class ApiConnector extends AbstractConnector {
    private apiUrl: string;
    private apiToken: string;
    private units: Record<string, Unit> = {};

    private eventSocket: WebSocket | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;

    // Position updates are sent one request at a time per unit; newer positions replace queued ones.
    private pendingPositions: Map<string, ApiPosition | null> = new Map<string, ApiPosition | null>();
    private positionsInFlight: Set<string> = new Set<string>();

    constructor(uuid: string, apiUrl: string, apiToken: string) {
        super(uuid);
        // Accept both the server root and the /api base as configured URL.
        this.apiUrl = apiUrl.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
        this.apiToken = apiToken;
    }

    connect(): void {
        ApplicationLogger.info('Connecting ApiConnector...', {service: this.constructor.name, id: this.getId()});
    }

    disconnect(): void {
        ApplicationLogger.info('Disconnecting ApiConnector...', {service: this.constructor.name, id: this.getId()});
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.eventSocket?.close();
        this.eventSocket = null;
    }

    async setup(): Promise<void> {
        await this.loadAllUnits();
        this.connect();
    }

    public override lookUpEntityUUID(name: string): UUID | null {
        for (const unit of Object.values(this.units)) {
            if (unit.getName() == name) {
                return unit.getId() as UUID;
            }
        }
        return null;
    }

    async onEntityPositionUpdate(event: PositionUpdateEvent): Promise<void> {
        const position = event.getPosition();
        await this.queuePositionUpdate(event.getSource().getId(), position ? this.toApiPosition(position) : null);
    }

    async onEntityStatusUpdate(event: StatusEvent): Promise<void> {
        // The API has no unit status field.
        ApplicationLogger.debug(`Ignoring status update ${event.getStatus()} for ${event.getSource().getId()}`, {
            service: this.constructor.name,
            id: this.getId(),
        });
        return Promise.resolve();
    }

    async onEntityRouteUpdate(event: RouteEvent): Promise<void> {
        // The API has no unit route field.
        ApplicationLogger.debug(`Ignoring route update for ${event.getSource().getId()}`, {
            service: this.constructor.name,
            id: this.getId(),
        });
        return Promise.resolve();
    }

    public async testLogin(): Promise<boolean> {
        try {
            await this.callApi('/auth/me', 'GET');
            return true;
        } catch (e) {
            ApplicationLogger.warn(`Token verification failed: ${e}`, {
                service: this.constructor.name,
                id: this.getId(),
            });
            return false;
        }
    }

    public async login(username: string, password: string): Promise<string> {
        const data = (await this.callApi('/auth/login', 'POST', {username, password}, false)) as ApiLoginResponse;
        this.apiToken = data.token;
        return data.token;
    }

    public async logout(): Promise<void> {
        await this.callApi('/auth/logout', 'POST');
        this.apiToken = '';
    }

    private async callApi(path: string, method: string, body?: object, authenticate = true): Promise<object | null> {
        const headers = new Headers();
        if (authenticate && this.apiToken) {
            headers.append('Authorization', `Bearer ${this.apiToken}`);
        }

        const requestOptions: RequestInit = {
            method: method,
            headers: headers,
        };
        if (body) {
            requestOptions['body'] = JSON.stringify(body);
            headers.append('Content-Type', 'application/json');
        }

        const response = await fetch(this.apiUrl + path, requestOptions);
        if (!response.ok) {
            let message = response.statusText;
            try {
                message = ((await response.json()) as {error: string}).error;
            } catch {
                // Body is not the documented {"error": "..."} object.
            }
            throw new Error(`${method} ${path} failed with status ${response.status}: ${message}`);
        }
        if (response.status === 204) {
            return null;
        }
        return (await response.json()) as object;
    }

    public async fetchData(path: string): Promise<object | null> {
        return this.callApi(path, 'GET');
    }

    async loadUnit(id: string): Promise<Unit | null> {
        try {
            const unit = this.toUnit((await this.callApi(`/units/${id}`, 'GET')) as ApiUnit);
            this.units[id] = unit;
            return unit;
        } catch (e) {
            ApplicationLogger.error(`Error loading unit ${id}: ${e}`, {
                service: this.constructor.name,
                id: this.getId(),
            });
            return null;
        }
    }

    async loadAllUnits(): Promise<Record<string, Unit>> {
        const units: Record<string, Unit> = {};
        try {
            for (const rawUnit of (await this.callApi('/units', 'GET')) as ApiUnit[]) {
                units[rawUnit.id] = this.toUnit(rawUnit);
            }
            this.units = units;
        } catch (e) {
            ApplicationLogger.error(`Error fetching units: ${e}`, {service: this.constructor.name, id: this.getId()});
        }
        return units;
    }

    async saveUnit(unit: Unit): Promise<Unit> {
        const id = unit.getId();
        // PATCH for existing units, so that position, symbol and tactical name are kept.
        const res = id
            ? await this.callApi(`/units/${id}`, 'PATCH', {name: unit.getName()})
            : await this.callApi('/units', 'POST', {name: unit.getName()});
        const saved = this.toUnit(res as ApiUnit);
        this.units[saved.getId() as string] = saved;
        return saved;
    }

    private async queuePositionUpdate(unitId: string, position: ApiPosition | null): Promise<void> {
        this.pendingPositions.set(unitId, position);
        if (this.positionsInFlight.has(unitId)) {
            return;
        }
        this.positionsInFlight.add(unitId);
        try {
            while (this.pendingPositions.has(unitId)) {
                const next = this.pendingPositions.get(unitId) ?? null;
                this.pendingPositions.delete(unitId);
                try {
                    await this.callApi(`/units/${unitId}/position`, 'PUT', next!);
                } catch (e) {
                    ApplicationLogger.error(`Error updating position of unit ${unitId}: ${e}`, {
                        service: this.constructor.name,
                        id: this.getId(),
                    });
                }
            }
        } finally {
            this.positionsInFlight.delete(unitId);
        }
    }

    private toUnit(raw: ApiUnit): Unit {
        return Unit.of({id: raw.id, name: raw.name});
    }

    private toApiPosition(position: LatLonPosition | TimedLatLonPosition): ApiPosition {
        const apiPosition: ApiPosition = {lat: position.latitude, lon: position.longitude};
        if ('timestamp' in position) {
            apiPosition.timestamp = new Date(position.timestamp).toISOString();
        }
        return apiPosition;
    }
}
