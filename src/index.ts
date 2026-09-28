/*
 * index.ts
 * --------
 * Entry point: opens the database, starts the simulations and serves the Express app and the WebSocket.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import sqlite3 from 'sqlite3';
import {open} from 'sqlite';
import {config} from 'dotenv';
import {GeoSimulator} from './GeoSimulator';
import {createApp} from './server/app';
import {attachWebSocket} from './server/websocket';
import {ApplicationLogger} from './utils/Logger';
import {ConfigStore} from './config/ConfigStore';

config();

async function main() {
    const dbPath = process.env.DB_PATH || './data/geosimulator.sqlite';
    // WEBUI_* are the names used before the app became an Express server.
    const host = process.env.HOST || process.env.WEBUI_HOST || '127.0.0.1';
    const port = parseInt(process.env.PORT || process.env.WEBUI_PORT || '8080');

    fs.mkdirSync(path.dirname(dbPath), {recursive: true});
    const db = await open({filename: dbPath, driver: sqlite3.Database});
    ApplicationLogger.info(`Using database ${dbPath}`, {service: 'Main', id: 'Main'});

    const configStore = new ConfigStore(db);
    await configStore.setup();

    const simulator = new GeoSimulator(db);
    await simulator.load(await configStore.load());

    const server = createApp(simulator, configStore).listen(port, host, (error?: Error) => {
        if (error) {
            ApplicationLogger.error(`Could not start server: ${error}`, {service: 'Main', id: 'Main'});
            process.exit(1);
        }
        ApplicationLogger.info(`Server listening on http://${host}:${port}/`, {service: 'Main', id: 'Main'});
    });
    const wss = attachWebSocket(server, simulator.getLiveState());
    simulator.start();

    const shutdown = (signal: string) => {
        ApplicationLogger.info(`Received ${signal}, shutting down.`, {service: 'Main', id: 'Main'});
        simulator.stop();
        for (const client of wss.clients) {
            client.terminate();
        }
        wss.close();
        server.closeAllConnections();
        server.close(() => {
            db.close().finally(() => process.exit(0));
        });
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
    ApplicationLogger.error(`Startup failed: ${e}`, {service: 'Main', id: 'Main'});
    process.exit(1);
});
