import * as fs from 'node:fs';
import {ConfigType, EventListener, LatLonPosition} from './Types';
import {setInterval} from 'node:timers';
import {ApplicationLogger} from './utils/Logger';
import {Vehicle} from './entities/Vehicle';
import {UUID} from 'crypto';
import {AbstractConnector} from './connectors/AbstractConnector';
import {WebSocketConnector} from './connectors/WebSocketConnector';
import {config} from 'dotenv';
import {RouteSimulator} from "./simulator/RouteSimulator";
import {AbstractSimulator} from "./simulator/AbstractSimulator";
import {RandomRouteSimulator} from "./simulator/RandomRouteSimulator";
import {SqliteConnector} from "./connectors/SqliteConnector";

config();

class GeoSimulator {

    // Format: Map<EventName, Array<ListenerFunction>>
    private listeners = new Map<string, EventListener[]>();
    private config: ConfigType | null = null;

    private vehicles = new Map<string, Vehicle>();
    private connectors = new Map<string, AbstractConnector>();

    constructor() {
        // Initialization code here
    }

    loadConfig() {
        const raw = fs.readFileSync(process.env.CONFIG_PATH || './data/config.json', 'utf-8');
        this.config = JSON.parse(raw) as ConfigType;
    }

    async setUpSimulations() {
        if (!this.config) {
            ApplicationLogger.error('Configuration not loaded. Cannot set up simulations.', {service: this.constructor.name, id: 'Main'});
            return;
        }
        // Set up simulations based on this.config
        ApplicationLogger.info('Setting up simulations based on configuration.', {service: this.constructor.name, id: 'Main'});

        for (const conn of this.config.connectors) {
            ApplicationLogger.info(`Configuring connector: ${conn.connector} at ${conn.id}`, {service: this.constructor.name, id: 'Main'});
            // Here you would set up the actual connector instances
            if (conn.connector === 'WebSocketConnector') {
                const connector = new WebSocketConnector(conn.data['url'] as string, conn.data['token'] as string, true, conn.id);
                this.connectors.set(conn.id, connector);
                await connector.setup();
                ApplicationLogger.info(`WebSocketConnector configured with data: ${JSON.stringify(conn.data)}`, {service: this.constructor.name, id: 'Main'});
            }else if (conn.connector === 'SqliteConnector') {
                const sqliteConnector = new SqliteConnector(conn.id, conn.data['databasePath'] as string);
                this.connectors.set(conn.id, sqliteConnector);
                await sqliteConnector.setup();
                ApplicationLogger.info(`SqliteConnector configured.`, {service: this.constructor.name, id: 'Main'});
            }
        }

        for (const vehicle of this.config.vehicles) {
            ApplicationLogger.info(`Setting up simulation for vehicle ID: ${vehicle.id}`, {service: this.constructor.name, id: 'Main'});
            if (!vehicle.enabled) {
                continue;
            }
            const simVehicle = new Vehicle(vehicle.id as UUID);
            let simulatorInstance: AbstractSimulator | null = null;

            if (vehicle.simulator === 'RouteSimulator') {
                const data = vehicle.data as Record<string, string | number | boolean | LatLonPosition>;

                simulatorInstance = new RouteSimulator({
                        start: data['start'] as LatLonPosition,
                        end: data['end'] as LatLonPosition,
                        speedMps: data['speed'] as number,
                        updateIntervalMs: 2000,
                        profile: data['movementType'] as string || 'driving'
                    }
                );

            } else if (vehicle.simulator === 'RandomRouteSimulator') {
                const data = vehicle.data as Record<string, string | number | boolean | LatLonPosition>;
                simulatorInstance = new RandomRouteSimulator({
                    coord1: data['corner1'] as LatLonPosition,
                    coord2: data['corner2'] as LatLonPosition,
                    routeSimulatorOptions: {
                        speedMps: data['speed'] as number,
                        updateIntervalMs: 2000,
                        profile: data['movementType'] as string || 'driving'
                    }
                });

            }

            if (simulatorInstance == null) {
                ApplicationLogger.error(`Simulator instance could not be created. Vehicle ID: ${vehicle.id}`, {service: this.constructor.name, id: 'Main'});
                continue
            }
            await simVehicle.setup(simulatorInstance);
            this.vehicles.set(vehicle.id, simVehicle);

            // Attach connectors to vehicle
            for (const connId of vehicle.connectors) {
                const connector = this.connectors.get(connId);
                if (connector) {
                    connector.attachEntity(simVehicle);
                    ApplicationLogger.info(`Attached connector ${connId} to vehicle ${vehicle.id}`, {service: this.constructor.name, id: 'Main'});
                } else {
                    ApplicationLogger.warn(`Connector ${connId} not found for vehicle ${vehicle.id}`, {service: this.constructor.name, id: 'Main'});
                }
            }
        }
    }

    async start() {
        ApplicationLogger.info('Starting GeoSimulator', {service: this.constructor.name, id: 'Main'});
        this.loadConfig();

        await this.setUpSimulations();

        for (const vehicle of this.vehicles.values()) {
            vehicle.start();
        }
    }


    on(eventName: string, listener: EventListener) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName)!.push(listener);
    }

    emit(event: Event) {
        const eventListeners = this.listeners.get(event.type);
        if (eventListeners) {
            for (const listener of eventListeners) {
                listener(event);
            }
        }
    }


}

if (require.main === module) {
    const simulator = new GeoSimulator();
    simulator.start();
    setInterval(() => {
        /* emtpy */
    }, 10000); // Keep the Node.js event loop alive
}
