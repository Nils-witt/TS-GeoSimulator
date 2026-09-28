import {AbstractConnector} from './AbstractConnector';
import sqlite3 from 'sqlite3';
import {Database, open} from 'sqlite';
import {LatLonPosition, TimedLatLonPosition} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {EntityPositionUpdateEvent} from '../events/EntityPositionUpdateEvent';
import {EntityStatusEvent} from '../events/EntityStatusEvent';
import {EntityRouteEvent} from '../events/EntityRouteEvent';

export interface PositionRecord {
    latitude: number | null;
    longitude: number | null;
    timestamp: number;
}

export interface StatusRecord {
    status: number;
    timestamp: number;
}

export interface RouteRecord {
    route: LatLonPosition[];
    timestamp: number;
}

export class SqliteConnector extends AbstractConnector {
    private db: Database | null = null;
    private path: string | null = null;
    // Whether this connector opened the database itself (and therefore has to close it).
    private ownsDatabase = true;

    constructor(id: string, database: string | Database) {
        super(id);
        if (typeof database === 'string') {
            this.path = database;
        } else {
            this.db = database;
            this.ownsDatabase = false;
        }
    }

    async onEntityPositionUpdate(event: EntityPositionUpdateEvent): Promise<void> {
        if (this.db && event.getEntity()) {
            const entity = event.getEntity();
            const position = event.getPosition();
            if (position) {
                let timestamp = Date.now();
                if ('timestamp' in position) {
                    timestamp = (position as TimedLatLonPosition).timestamp;
                }
                await this.db.run(
                    'INSERT INTO positions (entity_id, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)',
                    entity.getId(),
                    position.latitude,
                    position.longitude,
                    timestamp,
                );
            }
        }
    }

    async onEntityStatusUpdate(event: EntityStatusEvent): Promise<void> {
        if (this.db && event.getEntity()) {
            const entity = event.getEntity();
            const status = event.getStatus();
            if (status) {
                const timestamp = Date.now();
                await this.db.run(
                    'INSERT INTO unit_status (entity_id, status, timestamp) VALUES (?,  ?, ?)',
                    entity.getId(),
                    status,
                    timestamp,
                );
            }
        }
    }

    async onEntityRouteUpdate(event: EntityRouteEvent): Promise<void> {
        if (this.db && event.getEntity()) {
            const entity = event.getEntity();
            const route = event.getRoute();
            const timestamp = Date.now();
            await this.db.run(
                'INSERT INTO unit_routes (entity_id, route, timestamp) VALUES (?,  ?, ?)',
                entity.getId(),
                JSON.stringify(route),
                timestamp,
            );
        }
    }

    connect(): void {
        /* Connection is handled in setup() */
    }

    disconnect(): void {
        if (this.db && this.ownsDatabase) {
            this.db.close();
            ApplicationLogger.info('Disconnected from SQLite database.', {
                service: this.constructor.name,
                id: this.getId(),
            });
        }
    }

    async setup(): Promise<void> {
        if (!this.db) {
            this.db = await open({
                filename: this.path as string,
                driver: sqlite3.Database,
            });
            ApplicationLogger.info('Connected to SQLite database.', {service: this.constructor.name, id: this.getId()});
        }

        await this.db.run(`CREATE TABLE IF NOT EXISTS positions
                           (
                               id        INTEGER PRIMARY KEY AUTOINCREMENT,
                               entity_id TEXT    NOT NULL,
                               latitude  REAL    NULL,
                               longitude REAL    NULL,
                               timestamp INTEGER NOT NULL
                           )`);
        await this.db.run(`CREATE TABLE IF NOT EXISTS unit_status
                           (
                               id        INTEGER PRIMARY KEY AUTOINCREMENT,
                               entity_id TEXT    NOT NULL,
                               status    INTEGER NOT NULL,
                               timestamp INTEGER NOT NULL
                           )`);
        await this.db.run(`CREATE TABLE IF NOT EXISTS unit_routes
                           (
                               id        INTEGER PRIMARY KEY AUTOINCREMENT,
                               entity_id TEXT    NOT NULL,
                               route     TEXT    NOT NULL,
                               timestamp INTEGER NOT NULL
                           )`);
        await this.db.run('CREATE INDEX IF NOT EXISTS positions_entity ON positions (entity_id, timestamp)');
        await this.db.run('CREATE INDEX IF NOT EXISTS unit_status_entity ON unit_status (entity_id, timestamp)');
        await this.db.run('CREATE INDEX IF NOT EXISTS unit_routes_entity ON unit_routes (entity_id, timestamp)');
        ApplicationLogger.info('SQLite database setup complete.', {service: this.constructor.name, id: this.getId()});
    }

    // The history queries return the newest `limit` rows in chronological order.

    async getPositions(entityId: string, limit: number): Promise<PositionRecord[]> {
        if (!this.db) {
            return [];
        }
        const rows = await this.db.all<PositionRecord[]>(
            'SELECT latitude, longitude, timestamp FROM positions WHERE entity_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?',
            entityId,
            limit,
        );
        return rows.reverse();
    }

    async getStatuses(entityId: string, limit: number): Promise<StatusRecord[]> {
        if (!this.db) {
            return [];
        }
        const rows = await this.db.all<StatusRecord[]>(
            'SELECT status, timestamp FROM unit_status WHERE entity_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?',
            entityId,
            limit,
        );
        return rows.reverse();
    }

    async getRoutes(entityId: string, limit: number): Promise<RouteRecord[]> {
        if (!this.db) {
            return [];
        }
        const rows = await this.db.all<{route: string; timestamp: number}[]>(
            'SELECT route, timestamp FROM unit_routes WHERE entity_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?',
            entityId,
            limit,
        );
        return rows.reverse().map((r) => ({route: JSON.parse(r.route) as LatLonPosition[], timestamp: r.timestamp}));
    }
}
