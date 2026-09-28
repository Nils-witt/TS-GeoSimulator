/*
 * WebUIConnector.ts
 * -----------------
 * Built-in web interface for the simulator.
 * Exports: WebUIConnector
 * Purpose: persist the status/route/position history of every attached entity in SQLite and serve it
 * via a small JSON API, a Server-Sent-Events stream (/api/events) and the static page in /public.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import {AbstractConnector} from './AbstractConnector';
import {AbstractEntity} from '../entities/AbstractEntity';
import {Vehicle} from '../entities/Vehicle';
import {EntityPositionUpdateEvent} from '../events/EntityPositionUpdateEvent';
import {EntityStatusEvent} from '../events/EntityStatusEvent';
import {EntityRouteEvent} from '../events/EntityRouteEvent';
import {LatLonPosition} from '../Types';
import {SqliteConnector} from './SqliteConnector';
import {ApplicationLogger} from '../utils/Logger';

const MAX_POSITIONS = 5000;
const MAX_STATUSES = 500;
const MAX_ROUTES = 50;

const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');
const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
};

interface EntityState {
    id: string;
    name: string;
    simulator: string | null;
    status: number | null;
    position: LatLonPosition | null;
    route: LatLonPosition[];
    updatedAt: number;
}

export class WebUIConnector extends AbstractConnector {
    private port: number;
    private host: string;
    private server: http.Server | null = null;
    private clients: Set<http.ServerResponse> = new Set<http.ServerResponse>();
    private states: Map<string, EntityState> = new Map<string, EntityState>();
    private store: SqliteConnector;

    constructor(id: string, databasePath: string, port = 8080, host = '127.0.0.1') {
        super(id);
        this.port = port;
        this.host = host;
        this.store = new SqliteConnector(`${id}-store`, databasePath);
    }

    async setup(): Promise<void> {
        fs.mkdirSync(path.dirname(this.store.getPath()), {recursive: true});
        await this.store.setup();
        this.connect();
    }

    connect(): void {
        if (this.server) {
            return;
        }
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        this.server.on('error', (e) => {
            ApplicationLogger.error(`Web UI server error: ${e}`, {service: this.constructor.name, id: this.getId()});
        });
        this.server.listen(this.port, this.host, () => {
            ApplicationLogger.info(`Web UI available at http://${this.host}:${this.port}/`, {
                service: this.constructor.name,
                id: this.getId(),
            });
        });
    }

    disconnect(): void {
        for (const client of this.clients) {
            client.end();
        }
        this.clients.clear();
        this.server?.close();
        this.server = null;
        this.store.disconnect();
    }

    override attachEntity(entity: AbstractEntity): void {
        super.attachEntity(entity);
        this.store.attachEntity(entity);
        if (this.states.has(entity.getId())) {
            return;
        }
        const state: EntityState = {
            id: entity.getId(),
            name: entity.getName(),
            simulator: null,
            status: null,
            position: entity.getPosition(),
            route: [],
            updatedAt: Date.now(),
        };
        if (entity instanceof Vehicle) {
            state.simulator = entity.getSimulatorName();
            state.status = entity.getStatus();
            state.route = entity.getRoute() ?? [];
            // A RouteSimulator fetches its route during setup(), before connectors are attached.
            if (state.route.length > 0) {
                this.store.onEntityRouteUpdate(new EntityRouteEvent(entity, state.route));
            }
        }
        this.states.set(entity.getId(), state);
    }

    async onEntityPositionUpdate(event: EntityPositionUpdateEvent): Promise<void> {
        const state = this.states.get(event.getEntity().getId());
        if (!state) {
            return;
        }
        const position = event.getPosition();
        const timestamp = position && 'timestamp' in position ? position.timestamp : Date.now();
        state.position = position ? {latitude: position.latitude, longitude: position.longitude} : null;
        state.updatedAt = timestamp;
        this.broadcast('position', {
            id: state.id,
            latitude: position?.latitude ?? null,
            longitude: position?.longitude ?? null,
            timestamp,
        });
    }

    async onEntityStatusUpdate(event: EntityStatusEvent): Promise<void> {
        const state = this.states.get(event.getEntity().getId());
        if (!state) {
            return;
        }
        state.status = event.getStatus();
        state.updatedAt = Date.now();
        this.broadcast('status', {id: state.id, status: state.status, timestamp: state.updatedAt});
    }

    async onEntityRouteUpdate(event: EntityRouteEvent): Promise<void> {
        const state = this.states.get(event.getEntity().getId());
        if (!state) {
            return;
        }
        state.route = event.getRoute();
        state.updatedAt = Date.now();
        this.broadcast('route', {id: state.id, route: state.route, timestamp: state.updatedAt});
    }

    private summary(state: EntityState): object {
        return {
            id: state.id,
            name: state.name,
            simulator: state.simulator,
            status: state.status,
            position: state.position,
            route: state.route,
            updatedAt: state.updatedAt,
        };
    }

    private broadcast(type: string, data: object): void {
        const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const client of this.clients) {
            client.write(payload);
        }
    }

    private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
        res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
        res.end(JSON.stringify(body));
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        if (req.method !== 'GET') {
            this.sendJson(res, 405, {error: 'Method not allowed'});
            return;
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean);

        if (parts[0] !== 'api') {
            this.serveStatic(url.pathname, res);
            return;
        }

        // GET /api/events
        if (parts.length === 2 && parts[1] === 'events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-store',
                Connection: 'keep-alive',
            });
            res.write(': connected\n\n');
            this.clients.add(res);
            req.on('close', () => this.clients.delete(res));
            return;
        }

        // GET /api/vehicles
        if (parts.length === 2 && parts[1] === 'vehicles') {
            this.sendJson(
                res,
                200,
                [...this.states.values()].map((s) => this.summary(s)),
            );
            return;
        }

        // GET /api/vehicles/:id and /api/vehicles/:id/history
        if (parts.length >= 3 && parts[1] === 'vehicles') {
            const state = this.states.get(decodeURIComponent(parts[2]));
            if (!state) {
                this.sendJson(res, 404, {error: 'Vehicle not found'});
                return;
            }
            if (parts.length === 3) {
                this.sendJson(res, 200, this.summary(state));
                return;
            }
            if (parts.length === 4 && parts[3] === 'history') {
                this.sendHistory(state.id, res);
                return;
            }
        }

        this.sendJson(res, 404, {error: 'Not found'});
    }

    private async sendHistory(entityId: string, res: http.ServerResponse): Promise<void> {
        try {
            const [positions, statuses, routes] = await Promise.all([
                this.store.getPositions(entityId, MAX_POSITIONS),
                this.store.getStatuses(entityId, MAX_STATUSES),
                this.store.getRoutes(entityId, MAX_ROUTES),
            ]);
            this.sendJson(res, 200, {positions, statuses, routes});
        } catch (e) {
            ApplicationLogger.error(`Error loading history of ${entityId}: ${e}`, {
                service: this.constructor.name,
                id: this.getId(),
            });
            this.sendJson(res, 500, {error: 'Could not load history'});
        }
    }

    private serveStatic(pathname: string, res: http.ServerResponse): void {
        const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const filePath = path.resolve(PUBLIC_DIR, relative);
        if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
            this.sendJson(res, 404, {error: 'Not found'});
            return;
        }
        fs.readFile(filePath, (err, data) => {
            if (err) {
                this.sendJson(res, 404, {error: 'Not found'});
                return;
            }
            res.writeHead(200, {
                'Content-Type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
            });
            res.end(data);
        });
    }
}
