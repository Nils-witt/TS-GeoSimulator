import {AbstractConnector} from "./AbstractConnector";
import sqlite3 from 'sqlite3'
import {Database, open} from 'sqlite'
import {TimedLatLonPosition} from "../Types";
import {ApplicationLogger} from "../utils/Logger";
import {EntityPositionUpdateEvent} from "../events/EntityPositionUpdateEvent";

export class SqliteConnector extends AbstractConnector {
    private db: Database | null = null;
    private path: string;

    constructor(id: string, databaseFile: string) {
        super(id);
        this.path = databaseFile;
    }

    async onEntityPositionUpdate(event: EntityPositionUpdateEvent): Promise<void> {
        if (this.db && event.getEntity()) {
            const entity = event.getEntity();
            const position = event.getPosition();
            if (position) {
                let timestamp = Date.now();
                if (' timestamp' in position && position) {
                    timestamp = (position as TimedLatLonPosition).timestamp
                }
                await this.db.run(
                    'INSERT INTO positions (entity_id, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)',
                    entity.getId(),
                    position.latitude,
                    position.longitude,
                    timestamp
                );
            }
        }
    }


    connect(): void {
        /* Connection is handled in setup() */
    }

    disconnect(): void {
        if (this.db) {
            this.db.close();
            ApplicationLogger.info("Disconnected from SQLite database.", {
                service: this.constructor.name,
                id: this.getId()
            });
        }
    }

    async setup(): Promise<void> {

        this.db = await open({
            filename: this.path,
            driver: sqlite3.Database
        });
        ApplicationLogger.info("Connected to SQLite database.", {service: this.constructor.name, id: this.getId()});

        await this.db.run(`CREATE TABLE IF NOT EXISTS positions
                           (
                               id        INTEGER PRIMARY KEY AUTOINCREMENT,
                               entity_id TEXT    NOT NULL,
                               latitude  REAL    NULL,
                               longitude REAL    NULL,
                               timestamp INTEGER NOT NULL
                           )`);
        ApplicationLogger.info("SQLite database setup complete.", {service: this.constructor.name, id: this.getId()});
    }
}