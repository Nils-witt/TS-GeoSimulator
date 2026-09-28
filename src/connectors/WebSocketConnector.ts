import {ApplicationLogger} from '../utils/Logger';
import {AbstractConnector} from './AbstractConnector';
import {randomUUID} from 'node:crypto';
import {PositionUpdateEvent, StatusEvent, RouteEvent} from '../events/Events';

interface WebSocketMessage {
    command: string;
    data: Map<string, string | number | boolean | null>;
}

interface UnitUpdate {
    command: 'model.update';
    model: 'Unit';
    id: string;
    data: Record<string, unknown>;
}

export class WebSocketConnector extends AbstractConnector {
    private apiUrl: string;
    private token: string;
    private autoReconnect = true;
    private socket: WebSocket | null = null;
    private errorCount = 0;
    // Latest unsent update per entity and kind, sent once the socket is open again.
    private pending: Map<string, UnitUpdate> = new Map<string, UnitUpdate>();

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
        ApplicationLogger.info(`Connecting to WebSocket at ${this.apiUrl.substring(0, 75)}...`, {
            service: this.constructor.name,
            id: this.getId(),
        });
        if (this.errorCount > 10) {
            ApplicationLogger.error('Maximum reconnection attempts reached. Stopping auto-reconnect.', {
                service: this.constructor.name,
                id: this.getId(),
            });
            this.autoReconnect = false;
            return;
        }
        this.socket = new WebSocket(this.apiUrl + '?token=' + this.token);

        this.socket.onopen = () => {
            ApplicationLogger.info('Connected to WebSocket.', {service: this.constructor.name, id: this.getId()});
            this.errorCount = 0;
            const queued = [...this.pending.values()];
            this.pending.clear();
            for (const message of queued) {
                this.socket!.send(JSON.stringify(message));
            }
        };
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data as string) as WebSocketMessage;
                ApplicationLogger.debug(`Received WebSocket message: ${event.data}`, {
                    service: this.constructor.name,
                    data: data,
                });
                // Handle incoming messages as needed
            } catch (e) {
                ApplicationLogger.error('Error parsing WebSocket message:', {
                    service: this.constructor.name,
                    error: e,
                    data: event.data as string,
                });
            }
        };
        this.socket.onerror = (error) => {
            ApplicationLogger.error('WebSocket error:' + error, {
                service: this.constructor.name,
                error: error,
                id: this.getId(),
            });
            this.errorCount++;
        };
        this.socket.onclose = () => {
            ApplicationLogger.info('Disconnected from WebSocket.', {service: this.constructor.name, id: this.getId()});
            if (this.autoReconnect) {
                setTimeout(() => this.connect(), 1000 * (this.errorCount + 1)); // Back off by one second per error
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

    onEntityPositionUpdate(event: PositionUpdateEvent): Promise<void> {
        const position = event.getPosition();
        ApplicationLogger.debug(`Position update for unit ${event.getSource().getId()}: ${JSON.stringify(position)}`, {
            service: this.constructor.name,
            id: this.getId(),
        });
        this.send('position', event.getSource().getId(), {
            latitude: position ? position.latitude : null,
            longitude: position ? position.longitude : null,
        });
        return Promise.resolve();
    }

    onEntityStatusUpdate(event: StatusEvent): Promise<void> {
        this.send('status', event.getSource().getId(), {unit_status: event.getStatus()});
        return Promise.resolve();
    }

    onEntityRouteUpdate(event: RouteEvent): Promise<void> {
        this.send('route', event.getSource().getId(), {route: event.getRoute()});
        return Promise.resolve();
    }

    /** Sends a unit update, or keeps it (replacing older ones of the same kind) until the socket is open. */
    private send(kind: 'position' | 'status' | 'route', unitId: string, data: Record<string, unknown>): void {
        const message: UnitUpdate = {command: 'model.update', model: 'Unit', id: unitId, data};
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
            return;
        }
        this.pending.set(`${kind}:${unitId}`, message);
        ApplicationLogger.warn(`WebSocket is not connected. Queued ${kind} update.`, {
            service: this.constructor.name,
            id: this.getId(),
        });
    }
}
