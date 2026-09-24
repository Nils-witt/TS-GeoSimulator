/*
 * ApiConnector.ts
 * ---------------
 * Remote API client used to load map styles, overlays and named objects from server.
 * Exports: ApiConnector singleton
 * Purpose: wrap fetch calls and present a StorageInterface-like API to the app.
 */

import {Unit} from '../entities/Unit';
import {EntityPositionUpdateEvent} from "../events/EntityPositionUpdateEvent";
import {EntityRouteEvent} from "../events/EntityRouteEvent";
import {EntityStatusEvent} from "../events/EntityStatusEvent";
import {AbstractConnector} from "./AbstractConnector";
import {randomUUID} from "node:crypto";
import {WebSocketConnector} from "./WebSocketConnector";
import {ApplicationLogger} from "../utils/Logger";
import {UUID} from "crypto";


export class ApiConnector extends AbstractConnector {

    private units: Record<string, Unit> = {};

    async connect(): Promise<void> {
        ApplicationLogger.info("Connecting ApiConnector...", {service: this.constructor.name, id: this.getId()});
        await this.websocketConnector.setup();
    }

    disconnect(): void {
        ApplicationLogger.info("Disconnecting ApiConnector...", {service: this.constructor.name, id: this.getId()});
        this.websocketConnector.disconnect();
    }

    async setup(): Promise<void> {
        await Promise.all([
            this.websocketConnector.setup(),
            this.loadAllUnits()
        ])

    }

    public override lookUpEntityUUID(name: string): UUID | null {
        for (const unit of Object.values(this.units)) {
            if (unit.getName() == name) {
                return unit.getId() as UUID;
            }
        }
        return null;
    }

    async onEntityPositionUpdate(event: EntityPositionUpdateEvent): Promise<void> {
        await this.websocketConnector.onEntityPositionUpdate(event);
    }

    async onEntityStatusUpdate(event: EntityStatusEvent): Promise<void> {
        await this.websocketConnector.onEntityStatusUpdate(event);
    }

    async onEntityRouteUpdate(event: EntityRouteEvent): Promise<void> {
        await this.websocketConnector.onEntityRouteUpdate(event);
    }

    private apiUrl: string;
    private apiToken: string;
    private websocketConnector: WebSocketConnector;

    constructor(apiUrl: string, apiToken: string) {
        const id = randomUUID()
        super(id);
        this.apiUrl = apiUrl;
        this.apiToken = apiToken;
        this.websocketConnector = new WebSocketConnector(apiUrl.replace('http', 'ws') + '/ws/', apiToken, true, id);
    }


    public async testLogin(): Promise<boolean> {
        const url = this.apiUrl + '/token/verify/';
        const myHeaders = new Headers();
        myHeaders.append('Content-Type', 'application/json');

        const data = {
            token: this.apiUrl
        };
        const requestOptions = {
            method: 'POST',
            headers: myHeaders,
            body: JSON.stringify(data)
        };
        try {
            const res = await fetch(url, requestOptions);
            return res.ok
        } catch (e) {
            console.error('Error preparing request options:', e);
            return false;
        }
    }


    public async login(username: string, password: string): Promise<string> {
        const url = this.apiUrl + '/token/';
        const myHeaders = new Headers();
        myHeaders.append('Content-Type', 'application/json');

        const raw = JSON.stringify({username, password});

        const requestOptions = {
            method: 'POST',
            headers: myHeaders,
            body: raw
        };

        try {
            const res = await fetch(url, requestOptions);
            if (res.ok) {
                const data: { access: string } = await res.json() as { access: string };
                return data.access
            } else {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
        } catch (e) {
            console.error('Error preparing request options:', e);
            throw e;
        }
    }

    private async callApi(url: string, method: string, headers: Headers = new Headers(), body?: object): Promise<object | null> {

        if (this.apiToken) {
            headers.append('Authorization', `Bearer ${this.apiToken}`);
        }

        const requestOptions: RequestInit = {
            method: method,
            headers: headers
        };
        if (body) {
            requestOptions['body'] = JSON.stringify(body);
            headers.append('Content-Type', 'application/json');
        }

        const response = await fetch(url, requestOptions);
        if (!response.ok) {
            console.log(await response.text())

            throw new Error(`HTTP error! status: ${response.status}`);
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return await response.json();
        } catch (e) {
            console.error('Error parsing JSON:', e);
            return null;
        }
    }

    public async fetchData(url: string): Promise<object | null> {
        return this.callApi(url, 'GET');
    }


    loadUnit(id: string): Promise<Unit | null> {
        throw new Error('loadMapGroup not implemented: ' + id);
    }

    loadAllUnits(): Promise<Record<string, Unit>> {
        return new Promise<Record<string, Unit>>(resolve => {
            const units: Record<string, Unit> = {};
            const url = this.apiUrl + '/units/';

            this.fetchData(url)
                .then(data => {
                    for (const rawUnit of data as {
                        id: string,
                        name: string,
                    }[]) {
                        units[rawUnit.id] = Unit.of({
                            id: rawUnit.id,
                            name: rawUnit.name,
                        });
                    }
                    this.units = units;
                    resolve(units);
                })
                .catch(e => {
                    console.error('Error fetching overlay layers:', e);
                });
        });
    }

    async saveUnit(unit: Unit): Promise<Unit> {

        const res = await this.callApi(this.apiUrl + '/units/', 'POST', new Headers(), unit.record());
        return Unit.of(res as {
            id: string,
            name: string,
        });
    }

    replaceUnits(units: Unit[]): Promise<void> {
        throw new Error('Not Available on this Provider : replaceUnits ' + units.length);
    }

    deleteUnit(id: string): Promise<void> {
        throw new Error(`Method not implemented. deleteUnit: ${id}`);
    }

}