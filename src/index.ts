import {WebSocketConnector} from "./connectors/WebSocketConnector";
import {Vehicle} from "./entities/Vehicle";
import {randomUUID} from "crypto";
import {EventListener} from "./Types";
import {setInterval} from 'node:timers';
import {ApplicationLogger} from "./utils/Logger";

const token = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzY3NTUwNTA5LCJpYXQiOjE3NjY1MTM3MDksImp0aSI6ImZhZDI3Mjg2Yzk0NjQ0ODM4MDQwMTgwMDZjN2UzZjliIiwidXNlcl9pZCI6IjIiLCJvdmVybGF5cyI6WyIyMDI0X3B1ZW1hIl0sImlzX3N1cGVydXNlciI6dHJ1ZSwidmlld19hbGwiOnRydWV9.Q8AMc8gqzIBUUm7OmxzunbOulmcFhVWOF5m7MVhg6096M1I4WHNBJlBhb8GxywmSSbBUMX6W30sbnoGqDha0fg"
class GeoSimulator {

    // Format: Map<EventName, Array<ListenerFunction>>
    private listeners: Map<string, EventListener[]> = new Map();
    private apiConnector: WebSocketConnector = new WebSocketConnector("wss://map.home.nils-witt.de/api/ws/", token,true);

    constructor() {
        // Initialization code here
    }

    start() {
        ApplicationLogger.info("Starting GeoSimulator", {service: this.constructor.name});
        this.apiConnector.connect();

        // Start simulation logic here
        const vehicle = new Vehicle(randomUUID());
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
