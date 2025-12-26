require('dotenv').config()

import {WebSocketConnector} from "./connectors/WebSocketConnector";
import {Vehicle} from "./entities/Vehicle";
import {randomUUID, UUID} from "crypto";
import {EventListener} from "./Types";
import {setInterval} from 'node:timers';
import {ApplicationLogger} from "./utils/Logger";

class GeoSimulator {

    // Format: Map<EventName, Array<ListenerFunction>>
    private listeners: Map<string, EventListener[]> = new Map();
    private apiConnector: WebSocketConnector = new WebSocketConnector(process.env.WS_ENDPOINT || '', process.env.WS_ACCESS_KEY || '', true);

    constructor() {
        // Initialization code here
    }

    start() {
        ApplicationLogger.info("Starting GeoSimulator", {service: this.constructor.name});
        this.apiConnector.connect();
        const vehicle = new Vehicle(process.env.WS_OBJECT_ID as UUID || randomUUID());
        this.apiConnector.attachEntity(vehicle);

        vehicle.start();
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
