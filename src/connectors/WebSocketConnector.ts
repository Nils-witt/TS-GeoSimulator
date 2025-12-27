import {AbstractEntity} from '../entities/AbstractEntity';
import {UUID} from 'crypto';
import {PositionUpdateEvent} from '../events/PositionUpdateEvent';
import {ApplicationLogger} from '../utils/Logger';
import {AbstractConnector} from './AbstractConnector';
import {randomUUID} from "node:crypto";

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
    private attachedEntities: Map<UUID, AbstractEntity> = new Map<UUID, AbstractEntity>();


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
        ApplicationLogger.info(`Connecting to WebSocket at ${this.apiUrl}...`, {
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


    attachEntity(entity: AbstractEntity) {
        ApplicationLogger.info(`Attempting to attach entity: ${entity.getId()}`, {
            service: this.constructor.name,
            id: this.getId()
        });

        this.attachedEntities.set(entity.getId(), entity);

        entity.on('positionUpdate', (event: Event) => {
            const position = (event as PositionUpdateEvent).getPosition();
            ApplicationLogger.debug(`Received position at: ${position?.longitude.toFixed(4)} / ${position?.latitude.toFixed(4)} for entity ${entity.getId()}`, {
                service: this.constructor.name,
                id: this.getId()
            });
            if (this.socket && this.socket.readyState == WebSocket.OPEN) {
                const message = {
                    command: 'model.update',
                    model: 'NamedGeoReferencedItem',
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
        });

    }

}