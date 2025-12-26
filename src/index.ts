import * as fs from "node:fs";
import {ConfigType, EventListener} from "./Types";
import {setInterval} from 'node:timers';
import {ApplicationLogger} from "./utils/Logger";
import {Vehicle} from "./entities/Vehicle";
import {UUID} from "crypto";
import {AbstractConnector} from "./connectors/AbstractConnector";
import {WebSocketConnector} from "./connectors/WebSocketConnector";

require('dotenv').config()

class GeoSimulator {

    // Format: Map<EventName, Array<ListenerFunction>>
    private listeners: Map<string, EventListener[]> = new Map();
    private config: ConfigType | null = null;

    private vehicles: Map<string, Vehicle> = new Map();
    private connectors: Map<string, AbstractConnector> = new Map();

    constructor() {
        // Initialization code here
    }

    loadConfig() {
        const raw = fs.readFileSync(process.env.CONFIG_PATH || './data/config.json', 'utf-8');
        const data = JSON.parse(raw);
        this.config = data as ConfigType;
    }

    setUpSimulations() {
        if (!this.config) {
            ApplicationLogger.error("Configuration not loaded. Cannot set up simulations.", {service: this.constructor.name});
            return;
        }
        // Set up simulations based on this.config
        ApplicationLogger.info("Setting up simulations based on configuration.", {service: this.constructor.name});

        this.config.connectors.forEach(conn => {
            ApplicationLogger.info(`Configuring connector: ${conn.connector} at ${conn.id}`, {service: this.constructor.name});
            // Here you would set up the actual connector instances
            if (conn.connector === "WebSocketConnector") {
                const connector = new WebSocketConnector(conn.data['url'], conn.data['token'], true);
                this.connectors.set(conn.id, connector);
                ApplicationLogger.info(`WebSocketConnector configured with data: ${JSON.stringify(conn.data)}`, {service: this.constructor.name});
            }
        })

        this.config.vehicles.forEach((vehicle) => {
            ApplicationLogger.info(`Setting up simulation for vehicle ID: ${vehicle.id}`, {service: this.constructor.name});
            const simVehicle = new Vehicle(vehicle.id as UUID);
            this.vehicles.set(vehicle.id, simVehicle);
            // Attach connectors to vehicle
            vehicle.connectors.forEach(connId => {
                const connector = this.connectors.get(connId);
                if (connector) {
                    connector.attachEntity(simVehicle);
                    ApplicationLogger.info(`Attached connector ${connId} to vehicle ${vehicle.id}`, {service: this.constructor.name});
                } else {
                    ApplicationLogger.warn(`Connector ${connId} not found for vehicle ${vehicle.id}`, {service: this.constructor.name});
                }
            });
        })
    }

    start() {
        ApplicationLogger.info("Starting GeoSimulator", {service: this.constructor.name});
        this.loadConfig();

        this.setUpSimulations();

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
