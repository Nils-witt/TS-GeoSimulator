/*
 * LiveStateConnector.ts
 * ---------------------
 * Tracks the live state of every simulated entity for the web server.
 * Exports: LiveStateConnector, LiveUpdateListener, VehicleSummary, VehicleHistory
 * Purpose: keep the current status/position/route of each attached entity in memory, persist their history
 * in SQLite and notify subscribers (the server's event stream) about every change.
 */

import {Database} from 'sqlite';
import {AbstractConnector} from './AbstractConnector';
import {AbstractEntity} from '../entities/AbstractEntity';
import {Vehicle} from '../entities/Vehicle';
import {LatLonPosition, SimulatorDetails} from '../Types';
import {PositionRecord, RouteRecord, SqliteConnector, StatusRecord} from './SqliteConnector';
import {DetailsEvent, PositionUpdateEvent, StatusEvent, RouteEvent} from '../events/Events';

const MAX_POSITIONS = 5000;
const MAX_STATUSES = 500;
const MAX_ROUTES = 50;

export interface VehicleSummary {
    id: string;
    name: string;
    simulator: string | null;
    status: number | null;
    position: LatLonPosition | null;
    route: LatLonPosition[];
    details: SimulatorDetails | null;
    updatedAt: number;
}

export interface VehicleHistory {
    positions: PositionRecord[];
    statuses: StatusRecord[];
    routes: RouteRecord[];
}

export type LiveUpdateListener = (type: 'position' | 'status' | 'route' | 'details' | 'reload', data: object) => void;

export class LiveStateConnector extends AbstractConnector {
    private states: Map<string, VehicleSummary> = new Map<string, VehicleSummary>();
    private listeners: Set<LiveUpdateListener> = new Set<LiveUpdateListener>();
    private store: SqliteConnector;

    constructor(id: string, db: Database) {
        super(id);
        this.store = new SqliteConnector(`${id}-store`, db);
    }

    async setup(): Promise<void> {
        await this.store.setup();
    }

    connect(): void {
        /* Nothing to connect to, the state is kept in memory and in the shared database. */
    }

    disconnect(): void {
        this.listeners.clear();
    }

    /** Registers a listener for live updates and returns a function that removes it again. */
    subscribe(listener: LiveUpdateListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getVehicles(): VehicleSummary[] {
        return [...this.states.values()];
    }

    getVehicle(id: string): VehicleSummary | null {
        return this.states.get(id) ?? null;
    }

    async getHistory(id: string): Promise<VehicleHistory> {
        const [positions, statuses, routes] = await Promise.all([
            this.store.getPositions(id, MAX_POSITIONS),
            this.store.getStatuses(id, MAX_STATUSES),
            this.store.getRoutes(id, MAX_ROUTES),
        ]);
        return {positions, statuses, routes};
    }

    async clearHistory(id: string): Promise<void> {
        await this.store.clearHistory(id);
    }

    override detachAll(): void {
        super.detachAll();
        this.store.detachAll();
        this.states.clear();
    }

    override detachEntity(id: string): void {
        super.detachEntity(id);
        this.store.detachEntity(id);
        this.states.delete(id);
    }

    /** Tells subscribers that the set of vehicles changed. */
    notifyReloaded(): void {
        this.publish('reload', {});
    }

    override attachEntity(entity: AbstractEntity): void {
        super.attachEntity(entity);
        this.store.attachEntity(entity);
        if (this.states.has(entity.getId())) {
            return;
        }
        const state: VehicleSummary = {
            id: entity.getId(),
            name: entity.getName(),
            simulator: null,
            status: null,
            position: entity.getPosition(),
            route: [],
            details: null,
            updatedAt: Date.now(),
        };
        if (entity instanceof Vehicle) {
            state.simulator = entity.getSimulatorName();
            state.status = entity.getStatus();
            state.route = entity.getRoute();
            state.details = entity.getDetails();
            // A RouteSimulator fetches its route during setup(), before connectors are attached.
            if (state.route.length > 0) {
                this.store.onEntityRouteUpdate(new RouteEvent(entity, state.route));
            }
        }
        this.states.set(entity.getId(), state);
    }

    async onEntityPositionUpdate(event: PositionUpdateEvent): Promise<void> {
        const state = this.states.get(event.getSource().getId());
        if (!state) {
            return;
        }
        const position = event.getPosition();
        const timestamp = position && 'timestamp' in position ? position.timestamp : Date.now();
        state.position = position ? {latitude: position.latitude, longitude: position.longitude} : null;
        state.updatedAt = timestamp;
        this.publish('position', {
            id: state.id,
            latitude: position?.latitude ?? null,
            longitude: position?.longitude ?? null,
            timestamp,
        });
    }

    async onEntityStatusUpdate(event: StatusEvent): Promise<void> {
        const state = this.states.get(event.getSource().getId());
        if (!state) {
            return;
        }
        state.status = event.getStatus();
        state.updatedAt = Date.now();
        this.publish('status', {id: state.id, status: state.status, timestamp: state.updatedAt});
    }

    async onEntityRouteUpdate(event: RouteEvent): Promise<void> {
        const state = this.states.get(event.getSource().getId());
        if (!state) {
            return;
        }
        state.route = event.getRoute();
        state.updatedAt = Date.now();
        this.publish('route', {id: state.id, route: state.route, timestamp: state.updatedAt});
    }

    override async onEntityDetailsUpdate(event: DetailsEvent): Promise<void> {
        const state = this.states.get(event.getSource().getId());
        if (!state) {
            return;
        }
        state.details = event.getDetails();
        this.publish('details', {id: state.id, details: state.details, timestamp: Date.now()});
    }

    private publish(type: Parameters<LiveUpdateListener>[0], data: object): void {
        for (const listener of this.listeners) {
            listener(type, data);
        }
    }
}
