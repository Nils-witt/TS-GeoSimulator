import {ApplicationLogger} from '../utils/Logger';
import {AbstractConnector} from './AbstractConnector';
import {randomUUID} from "node:crypto";
import {EntityPositionUpdateEvent} from "../events/EntityPositionUpdateEvent";
import {LatLonPosition} from "../Types";
import {EntityStatusEvent} from "../events/EntityStatusEvent";

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
    private storedPositions: Map<string, EntityPositionUpdateEvent> = new Map<string, EntityPositionUpdateEvent>();
    private storedStatus: Map<string, EntityStatusEvent> = new Map<string, EntityStatusEvent>();


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
            // Send any queued messages

            this.storedPositions.forEach(event => {
                const position = event.getPosition() as LatLonPosition;
                const entity = event.getEntity();
                const message = {
                    command: 'model.update',
                    model: 'Unit',
                    id: entity.getId(),
                    data: {
                        latitude: position ? position.latitude : null,
                        longitude: position ? position.longitude : null
                    }
                };
                this.socket!.send(JSON.stringify(message));
                this.storedPositions.delete(entity.getId());
            })

            this.storedStatus.forEach(event => {
                const entity = event.getEntity();
                const status = event.getStatus();
                const message = {
                    command: 'model.update',
                    model: 'Unit',
                    id: entity.getId(),
                    data: {
                        unit_status: status
                    }
                };
                this.socket!.send(JSON.stringify(message));
                this.storedStatus.delete(entity.getId());
            })
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
            ApplicationLogger.error('WebSocket error:', {service: this.constructor.name, error: error});
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
            ApplicationLogger.debug(`Sending position update via WebSocket. Unit: ${entity.getId()} Pos: ${JSON.stringify(position)}`, {service: this.constructor.name, id: this.getId()});
            this.socket.send(JSON.stringify(message));
        } else {
            this.storedPositions.set(event.getEntity().getId(), event)
            ApplicationLogger.warn('WebSocket is not connected. Cannot send position update.', {
                service: this.constructor.name,
                id: this.getId()
            });
        }
        return Promise.resolve();
    }
    onEntityStatusUpdate(event: EntityStatusEvent): Promise<void> {
        const status = event.getStatus();
        const entity = event.getEntity();
        ApplicationLogger.info(`Received WebSocket status: ${event.getStatus()}`, {service: this.constructor.name, id: this.getId()});
        if (this.socket && this.socket.readyState == WebSocket.OPEN) {
            const message = {
                command: 'model.update',
                model: 'Unit',
                id: entity.getId(),
                data: {
                    unit_status: status
                }
            };
            this.socket.send(JSON.stringify(message));
        } else {
            this.storedStatus.set(event.getEntity().getId(), event)
            ApplicationLogger.warn('WebSocket is not connected. Cannot send position update.', {
                service: this.constructor.name,
                id: this.getId()
            });
        }
        return Promise.resolve();
    }


}