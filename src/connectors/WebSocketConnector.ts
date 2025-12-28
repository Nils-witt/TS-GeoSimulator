import {ApplicationLogger} from '../utils/Logger';
import {AbstractConnector} from './AbstractConnector';
import {randomUUID} from "node:crypto";
import {EntityPositionUpdateEvent} from "../events/EntityPositionUpdateEvent";

interface WebSocketMessage {
    command: string;
    data: Map<string, string | number | boolean | null>;
}


export class WebSocketConnector extends AbstractConnector {
    private apiUrl: string;
    private token: string;
    private autoReconnect = true;
    private socket: WebSocket | null = null;
    private errorCount = 0;


    constructor(apiUrl: string, authToken: string, autoReconnect = false, id: string = randomUUID()) {
        super(id);

        this.autoReconnect = autoReconnect;
        this.apiUrl = apiUrl;
        this.token = authToken;

        if (autoReconnect) {
            this.connect();
        }
    }

    async setup(): Promise<void> {
        ApplicationLogger.info('Setting up WebSocketConnector...', {service: this.constructor.name, id: this.getId()});
        return Promise.resolve();
    }

    connect(): void {
        ApplicationLogger.info(`Connecting to WebSocket at ${this.apiUrl.substring(0,20)}...`, {
            service: this.constructor.name,
            id: this.getId()
        });
        this.socket = new WebSocket(this.apiUrl + '?token=' + this.token);
        if (this.errorCount > 10) {
            ApplicationLogger.error('Maximum reconnection attempts reached. Stopping auto-reconnect.', {
                service: this.constructor.name,
                id: this.getId()
            });
            this.autoReconnect = false;
            return;
        }

        this.socket.onopen = () => {
            ApplicationLogger.info('Connected to WebSocket.', {service: this.constructor.name, id: this.getId()});
            this.errorCount = 0;
        };
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data as string) as WebSocketMessage;
                ApplicationLogger.debug(`Received WebSocket message: ${event.data}`, {
                    service: this.constructor.name,
                    data: data
                });
                // Handle incoming messages as needed
            } catch (e) {
                ApplicationLogger.error('Error parsing WebSocket message:', {
                    service: this.constructor.name,
                    error: e,
                    data: event.data as string
                });
            }
        };
        this.socket.onerror = (error) => {
            ApplicationLogger.error('WebSocket error:', error);
            this.errorCount++;

        };
        this.socket.onclose = () => {
            ApplicationLogger.info('Disconnected from WebSocket.', {service: this.constructor.name, id: this.getId()});
            if (this.autoReconnect) {
                setTimeout(() => this.connect(), 1000 * (this.errorCount + 1)); // Reconnect after 5 seconds
            } else {
                this.socket = null;
            }
        };
    }

    disconnect() {
        ApplicationLogger.info('Disconnecting from WebSocket...', {service: this.constructor.name, id: this.getId()});
        this.autoReconnect = false;

        if (this.socket) {
            this.socket.close();
        }
    }

    onEntityPositionUpdate(event: EntityPositionUpdateEvent): Promise<void> {
        const position = event.getPosition();
        const entity = event.getEntity();

        if (this.socket && this.socket.readyState == WebSocket.OPEN) {
            const message = {
                command: 'model.update',
                model: 'Unit',
                id: entity.getId(),
                data: {
                    latitude: position ? position.latitude : null,
                    longitude: position ? position.longitude : null
                }
            };
            this.socket.send(JSON.stringify(message));
        } else {
            ApplicationLogger.warn('WebSocket is not connected. Cannot send position update.', {
                service: this.constructor.name,
                id: this.getId()
            });
        }
        return Promise.resolve();
    }

}