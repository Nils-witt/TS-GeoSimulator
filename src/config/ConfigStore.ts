/*
 * ConfigStore.ts
 * --------------
 * Persists the simulator configuration (connectors and vehicles) in SQLite.
 * Validation of untrusted input lives in validation.ts.
 */

import {randomUUID, UUID} from 'node:crypto';
import {Database} from 'sqlite';
import {ConfigType, ConnectorConfig, VehicleConfig} from '../Types';

interface ConnectorRow {
    id: string;
    name: string;
    connector: string;
    data: string;
}
const CONNECTOR_COLUMNS = 'id, name, connector, data';
interface VehicleRow {
    name: string;
    enabled: number;
    // Never null after setup(), see assignVehicleIds().
    entity_id: string;
    simulator: string;
    data: string;
    connectors: string;
}
const VEHICLE_COLUMNS = 'name, enabled, entity_id, simulator, data, connectors';

function toConnector(row: ConnectorRow): ConnectorConfig {
    return {
        id: row.id as UUID,
        name: row.name,
        connector: row.connector,
        data: JSON.parse(row.data) as ConnectorConfig['data'],
    };
}

function toVehicle(row: VehicleRow): VehicleConfig {
    return {
        name: row.name,
        enabled: row.enabled === 1,
        id: row.entity_id as UUID,
        simulator: row.simulator,
        data: JSON.parse(row.data) as VehicleConfig['data'],
        connectors: JSON.parse(row.connectors) as UUID[],
    };
}

export class ConfigStore {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    async setup(): Promise<void> {
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
        await this.migrateConnectorIds();
        await this.assignVehicleIds();
        await this.createConnectorTable();
    }

    private async createConnectorTable(): Promise<void> {
        await this.db.run(`CREATE TABLE IF NOT EXISTS config_connectors
                           (
                               id        TEXT PRIMARY KEY,
                               name      TEXT    NOT NULL UNIQUE,
                               position  INTEGER NOT NULL,
                               connector TEXT    NOT NULL,
                               data      TEXT    NOT NULL
                           )`);
    }

    /**
     * Older databases used the typed-in connector ID as primary key. It becomes the connector's name, the
     * connector gets a UUID, and the vehicles' references are rewritten to it.
     */
    private async migrateConnectorIds(): Promise<void> {
        const columns = await this.db.all<{name: string}[]>('PRAGMA table_info(config_connectors)');
        if (columns.length === 0 || columns.some((c) => c.name === 'name')) {
            return;
        }
        await this.transaction(async () => {
            await this.db.run('ALTER TABLE config_connectors RENAME TO config_connectors_old');
            await this.createConnectorTable();
            const rows = await this.db.all<{id: string}[]>('SELECT id FROM config_connectors_old');
            for (const row of rows) {
                const id = randomUUID();
                await this.db.run(
                    `INSERT INTO config_connectors (id, name, position, connector, data)
                     SELECT ?, id, position, connector, data FROM config_connectors_old WHERE id = ?`,
                    id,
                    row.id,
                );
                await this.replaceConnectorReference(row.id, id);
            }
            await this.db.run('DROP TABLE config_connectors_old');
        });
    }

    /** Vehicles are addressed by ID in the API; older rows may not have one yet. */
    private async assignVehicleIds(): Promise<void> {
        const rows = await this.db.all<{key: number}[]>('SELECT key FROM config_vehicles WHERE entity_id IS NULL');
        for (const row of rows) {
            await this.db.run('UPDATE config_vehicles SET entity_id = ? WHERE key = ?', randomUUID(), row.key);
        }
    }

    async load(): Promise<ConfigType> {
        return {
            connectors: await this.listConnectors(),
            vehicles: await this.listVehicles(),
        };
    }

    // Connectors ---------------------------------------------------------------------------------

    async listConnectors(): Promise<ConnectorConfig[]> {
        const rows = await this.db.all<ConnectorRow[]>(
            `SELECT ${CONNECTOR_COLUMNS} FROM config_connectors ORDER BY position`,
        );
        return rows.map(toConnector);
    }

    async getConnector(id: string): Promise<ConnectorConfig | undefined> {
        const row = await this.db.get<ConnectorRow>(
            `SELECT ${CONNECTOR_COLUMNS} FROM config_connectors WHERE id = ?`,
            id,
        );
        return row && toConnector(row);
    }

    /** Appends a connector. Throws if the ID or name is already taken. */
    async createConnector(conn: ConnectorConfig): Promise<void> {
        await this.db.run(
            `INSERT INTO config_connectors (id, name, position, connector, data)
             VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM config_connectors), ?, ?)`,
            conn.id,
            conn.name,
            conn.connector,
            JSON.stringify(conn.data),
        );
    }

    /** Updates the connector with the given ID, keeping its position. Returns false if no such connector exists. */
    async updateConnector(id: string, conn: Omit<ConnectorConfig, 'id'>): Promise<boolean> {
        const result = await this.db.run(
            'UPDATE config_connectors SET name = ?, connector = ?, data = ? WHERE id = ?',
            conn.name,
            conn.connector,
            JSON.stringify(conn.data),
            id,
        );
        return !!result.changes;
    }

    /** Deletes a connector and removes it from all vehicles. Returns false if no such connector exists. */
    async deleteConnector(id: string): Promise<boolean> {
        return this.transaction(async () => {
            const result = await this.db.run('DELETE FROM config_connectors WHERE id = ?', id);
            if (!result.changes) {
                return false;
            }
            await this.replaceConnectorReference(id, null);
            return true;
        });
    }

    /** Rewrites a connector ID in every vehicle's connector list; `to = null` removes it. */
    private async replaceConnectorReference(from: string, to: string | null): Promise<void> {
        const rows = await this.db.all<{key: number; connectors: string}[]>(
            'SELECT key, connectors FROM config_vehicles',
        );
        for (const row of rows) {
            const connectors = JSON.parse(row.connectors) as string[];
            if (!connectors.includes(from)) {
                continue;
            }
            const updated =
                to == null ? connectors.filter((c) => c !== from) : connectors.map((c) => (c === from ? to : c));
            await this.db.run(
                'UPDATE config_vehicles SET connectors = ? WHERE key = ?',
                JSON.stringify(updated),
                row.key,
            );
        }
    }

    // Vehicles -----------------------------------------------------------------------------------

    async listVehicles(): Promise<VehicleConfig[]> {
        const rows = await this.db.all<VehicleRow[]>(
            `SELECT ${VEHICLE_COLUMNS} FROM config_vehicles ORDER BY position`,
        );
        return rows.map(toVehicle);
    }

    async getVehicleById(id: string): Promise<VehicleConfig | undefined> {
        const row = await this.db.get<VehicleRow>(
            `SELECT ${VEHICLE_COLUMNS} FROM config_vehicles WHERE entity_id = ?`,
            id,
        );
        return row && toVehicle(row);
    }

    /** Appends a vehicle. Throws if the name is already taken. */
    async createVehicle(vehicle: VehicleConfig): Promise<void> {
        await this.db.run(
            `INSERT INTO config_vehicles (position, name, enabled, entity_id, simulator, data, connectors)
             VALUES ((SELECT COALESCE(MAX(position), -1) + 1 FROM config_vehicles), ?, ?, ?, ?, ?, ?)`,
            vehicle.name,
            vehicle.enabled ? 1 : 0,
            vehicle.id,
            vehicle.simulator,
            JSON.stringify(vehicle.data),
            JSON.stringify(vehicle.connectors),
        );
    }

    /** Updates the vehicle with the given ID, keeping its position. Returns false if no such vehicle exists. */
    async updateVehicleById(id: string, vehicle: Omit<VehicleConfig, 'id'>): Promise<boolean> {
        const result = await this.db.run(
            `UPDATE config_vehicles
             SET name = ?, enabled = ?, simulator = ?, data = ?, connectors = ?
             WHERE entity_id = ?`,
            vehicle.name,
            vehicle.enabled ? 1 : 0,
            vehicle.simulator,
            JSON.stringify(vehicle.data),
            JSON.stringify(vehicle.connectors),
            id,
        );
        return !!result.changes;
    }

    /** Returns false if no such vehicle exists. */
    async deleteVehicleById(id: string): Promise<boolean> {
        const result = await this.db.run('DELETE FROM config_vehicles WHERE entity_id = ?', id);
        return !!result.changes;
    }

    private async transaction<T>(fn: () => Promise<T>): Promise<T> {
        await this.db.run('BEGIN');
        try {
            const result = await fn();
            await this.db.run('COMMIT');
            return result;
        } catch (e) {
            await this.db.run('ROLLBACK');
            throw e;
        }
    }
}
