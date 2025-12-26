import * as fs from 'node:fs';
import {ConfigType, EventListener} from './Types';
import {setInterval} from 'node:timers';
import {ApplicationLogger} from './utils/Logger';
import {Vehicle} from './entities/Vehicle';
import {UUID} from 'crypto';
import {AbstractConnector} from './connectors/AbstractConnector';
import {WebSocketConnector} from './connectors/WebSocketConnector';
import {config} from 'dotenv';

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
            ApplicationLogger.error('Configuration not loaded. Cannot set up simulations.', {service: this.constructor.name});
            return;
        }
        // Set up simulations based on this.config
        ApplicationLogger.info('Setting up simulations based on configuration.', {service: this.constructor.name});

        for (const conn of this.config.connectors) {
            ApplicationLogger.info(`Configuring connector: ${conn.connector} at ${conn.id}`, {service: this.constructor.name});
            // Here you would set up the actual connector instances
            if (conn.connector === 'WebSocketConnector') {
                const connector = new WebSocketConnector(conn.data['url'] as string, conn.data['token'] as string, true);
                this.connectors.set(conn.id, connector);
                await connector.setup();
                ApplicationLogger.info(`WebSocketConnector configured with data: ${JSON.stringify(conn.data)}`, {service: this.constructor.name});
            }
        }

        for (const vehicle of this.config.vehicles) {
            ApplicationLogger.info(`Setting up simulation for vehicle ID: ${vehicle.id}`, {service: this.constructor.name});
            const simVehicle = new Vehicle(vehicle.id as UUID, vehicle.movementType);
            await simVehicle.setup();
            this.vehicles.set(vehicle.id, simVehicle);

            // Attach connectors to vehicle
            for (const connId of vehicle.connectors) {
                const connector = this.connectors.get(connId);
                if (connector) {
                    connector.attachEntity(simVehicle);
                    ApplicationLogger.info(`Attached connector ${connId} to vehicle ${vehicle.id}`, {service: this.constructor.name});
                } else {
                    ApplicationLogger.warn(`Connector ${connId} not found for vehicle ${vehicle.id}`, {service: this.constructor.name});
                }
            }
        }
    }

    async start() {
        ApplicationLogger.info('Starting GeoSimulator', {service: this.constructor.name});
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
