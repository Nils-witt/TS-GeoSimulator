/*
 * ConfigStore.ts
 * --------------
 * Persists the simulator configuration (connectors and vehicles) in SQLite.
 * Exports: ConfigStore, validateConfig, CONNECTOR_TYPES, SIMULATOR_TYPES
 * Purpose: replace the static config.json so the configuration can be edited through the web UI.
 */

import {Database} from 'sqlite';
import {ConfigType, LatLonPosition} from '../Types';

export const CONNECTOR_TYPES: Record<string, string[]> = {
    ApiConnector: ['url', 'token'],
    WebSocketConnector: ['url', 'token'],
    SqliteConnector: ['databasePath'],
};

export const SIMULATOR_TYPES: Record<string, string[]> = {
    RouteSimulator: ['start', 'end'],
    RandomRouteSimulator: ['corner1', 'corner2'],
    EmergencyDispatchSimulator: ['corner1', 'corner2', 'homeLocation'],
};

type ConnectorConfig = ConfigType['connectors'][number];
type VehicleConfig = ConfigType['vehicles'][number];

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is LatLonPosition {
    return (
        isObject(value) &&
        typeof value.latitude === 'number' &&
        typeof value.longitude === 'number' &&
        Math.abs(value.latitude) <= 90 &&
        Math.abs(value.longitude) <= 180
    );
}

/**
 * Checks an untrusted config object (e.g. a request body).
 * Returns a list of human-readable problems; an empty list means the config is valid.
 */
export function validateConfig(config: unknown): string[] {
    if (!isObject(config) || !Array.isArray(config.connectors) || !Array.isArray(config.vehicles)) {
        return ['Config must be an object with "connectors" and "vehicles" arrays.'];
    }
    const errors: string[] = [];
    const connectorIds = new Set<string>();

    config.connectors.forEach((conn: unknown, i: number) => {
        const where = `Connector ${i + 1}`;
        if (!isObject(conn)) {
            errors.push(`${where}: must be an object.`);
            return;
        }
        if (typeof conn.id !== 'string' || conn.id.trim() === '') {
            errors.push(`${where}: ID is required.`);
        } else if (connectorIds.has(conn.id)) {
            errors.push(`${where}: ID "${conn.id}" is used more than once.`);
        } else {
            connectorIds.add(conn.id);
        }
        const fields = typeof conn.connector === 'string' ? CONNECTOR_TYPES[conn.connector] : undefined;
        if (!fields) {
            errors.push(`${where}: unknown connector type "${String(conn.connector)}".`);
            return;
        }
        if (!isObject(conn.data)) {
            errors.push(`${where}: data must be an object.`);
            return;
        }
        for (const field of fields) {
            if (typeof conn.data[field] !== 'string' || conn.data[field] === '') {
                errors.push(`${where}: "${field}" is required.`);
            }
        }
    });

    const names = new Set<string>();
    config.vehicles.forEach((vehicle: unknown, i: number) => {
        const where = `Vehicle ${i + 1}`;
        if (!isObject(vehicle)) {
            errors.push(`${where}: must be an object.`);
            return;
        }
        if (typeof vehicle.name !== 'string' || vehicle.name.trim() === '') {
            errors.push(`${where}: name is required.`);
        } else if (names.has(vehicle.name)) {
            // Vehicles without an ID are matched to API units by name.
            errors.push(`${where}: name "${vehicle.name}" is used more than once.`);
        } else {
            names.add(vehicle.name);
        }
        if (typeof vehicle.enabled !== 'boolean') {
            errors.push(`${where}: "enabled" must be true or false.`);
        }
        if (vehicle.id != null && typeof vehicle.id !== 'string') {
            errors.push(`${where}: ID must be a string.`);
        }
        if (!Array.isArray(vehicle.connectors) || vehicle.connectors.some((c) => typeof c !== 'string')) {
            errors.push(`${where}: connectors must be a list of connector IDs.`);
        } else {
            for (const connId of vehicle.connectors as string[]) {
                if (!connectorIds.has(connId)) {
                    errors.push(`${where}: connector "${connId}" does not exist.`);
                }
            }
        }
        const fields = typeof vehicle.simulator === 'string' ? SIMULATOR_TYPES[vehicle.simulator] : undefined;
        if (!fields) {
            errors.push(`${where}: unknown simulator "${String(vehicle.simulator)}".`);
            return;
        }
        if (!isObject(vehicle.data)) {
            errors.push(`${where}: data must be an object.`);
            return;
        }
        if (typeof vehicle.data.speed !== 'number' || !(vehicle.data.speed > 0)) {
            errors.push(`${where}: speed must be a positive number.`);
        }
        for (const field of fields) {
            if (!isPosition(vehicle.data[field])) {
                errors.push(`${where}: "${field}" must be a valid latitude/longitude.`);
            }
        }
    });

    return errors;
}

export class ConfigStore {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    async setup(): Promise<void> {
        await this.db.run(`CREATE TABLE IF NOT EXISTS config_connectors
                           (
                               id        TEXT PRIMARY KEY,
                               position  INTEGER NOT NULL,
                               connector TEXT    NOT NULL,
                               data      TEXT    NOT NULL
                           )`);
        await this.db.run(`CREATE TABLE IF NOT EXISTS config_vehicles
                           (
                               key        INTEGER PRIMARY KEY AUTOINCREMENT,
                               position   INTEGER NOT NULL,
                               name       TEXT    NOT NULL UNIQUE,
                               enabled    INTEGER NOT NULL,
                               entity_id  TEXT    NULL,
                               simulator  TEXT    NOT NULL,
                               data       TEXT    NOT NULL,
                               connectors TEXT    NOT NULL
                           )`);
    }

    async isEmpty(): Promise<boolean> {
        const connectors = await this.db.get<{n: number}>('SELECT COUNT(*) AS n FROM config_connectors');
        const vehicles = await this.db.get<{n: number}>('SELECT COUNT(*) AS n FROM config_vehicles');
        return (connectors?.n ?? 0) === 0 && (vehicles?.n ?? 0) === 0;
    }

    async load(): Promise<ConfigType> {
        const connectors = await this.db.all<{id: string; connector: string; data: string}[]>(
            'SELECT id, connector, data FROM config_connectors ORDER BY position',
        );
        const vehicles = await this.db.all<
            {
                name: string;
                enabled: number;
                entity_id: string | null;
                simulator: string;
                data: string;
                connectors: string;
            }[]
        >('SELECT name, enabled, entity_id, simulator, data, connectors FROM config_vehicles ORDER BY position');

        return {
            connectors: connectors.map((c): ConnectorConfig => ({
                id: c.id,
                connector: c.connector,
                data: JSON.parse(c.data) as ConnectorConfig['data'],
            })),
            vehicles: vehicles.map((v): VehicleConfig => ({
                name: v.name,
                enabled: v.enabled === 1,
                id: v.entity_id ?? undefined,
                simulator: v.simulator,
                data: JSON.parse(v.data) as VehicleConfig['data'],
                connectors: JSON.parse(v.connectors) as string[],
            })),
        };
    }

    /** Replaces the stored config. The caller is responsible for validating it first. */
    async save(config: ConfigType): Promise<void> {
        await this.db.run('BEGIN');
        try {
            await this.db.run('DELETE FROM config_connectors');
            await this.db.run('DELETE FROM config_vehicles');
            for (const [i, conn] of config.connectors.entries()) {
                await this.db.run(
                    'INSERT INTO config_connectors (id, position, connector, data) VALUES (?, ?, ?, ?)',
                    conn.id,
                    i,
                    conn.connector,
                    JSON.stringify(conn.data),
                );
            }
            for (const [i, vehicle] of config.vehicles.entries()) {
                await this.db.run(
                    `INSERT INTO config_vehicles (position, name, enabled, entity_id, simulator, data, connectors)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    i,
                    vehicle.name,
                    vehicle.enabled ? 1 : 0,
                    vehicle.id || null,
                    vehicle.simulator,
                    JSON.stringify(vehicle.data),
                    JSON.stringify(vehicle.connectors),
                );
            }
            await this.db.run('COMMIT');
        } catch (e) {
            await this.db.run('ROLLBACK');
            throw e;
        }
    }

    /** Remembers an ID that was looked up or created for a vehicle, so the next start reuses it. */
    async setVehicleId(name: string, id: string): Promise<void> {
        await this.db.run('UPDATE config_vehicles SET entity_id = ? WHERE name = ? AND entity_id IS NULL', id, name);
    }
}
