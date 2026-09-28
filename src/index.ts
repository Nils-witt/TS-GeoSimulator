import * as fs from 'node:fs';
import * as path from 'node:path';
import sqlite3 from 'sqlite3';
import {Database, open} from 'sqlite';
import {ConfigType, EventListener, LatLonPosition} from './Types';
import {setInterval} from 'node:timers';
import {ApplicationLogger} from './utils/Logger';
import {Vehicle} from './entities/Vehicle';
import {UUID} from 'crypto';
import {AbstractConnector} from './connectors/AbstractConnector';
import {WebSocketConnector} from './connectors/WebSocketConnector';
import {config} from 'dotenv';
import {RouteSimulator} from './simulator/RouteSimulator';
import {AbstractSimulator} from './simulator/AbstractSimulator';
import {RandomRouteSimulator} from './simulator/RandomRouteSimulator';
import {SqliteConnector} from './connectors/SqliteConnector';
import {EmergencyDispatchSimulator} from './simulator/EmergencyDispatchSimulator';
import {ApiConnector} from './connectors/ApiConnector';
import {Unit} from './entities/Unit';
import {randomUUID} from 'node:crypto';
import {WebUIConnector} from './connectors/WebUIConnector';
import {ConfigStore, validateConfig} from './config/ConfigStore';

config();

class GeoSimulator {
    // Format: Map<EventName, Array<ListenerFunction>>
    private listeners = new Map<string, EventListener[]>();
    private config: ConfigType | null = null;

    private vehicles = new Map<string, Vehicle>();
    private connectors = new Map<string, AbstractConnector>();
    private webUI: WebUIConnector | null = null;
    private db: Database | null = null;
    private configStore: ConfigStore | null = null;
    private reloading: Promise<void> | null = null;

    constructor() {
        // Initialization code here
    }

    async openDatabase(): Promise<void> {
        const dbPath = process.env.DB_PATH || './data/geosimulator.sqlite';
        fs.mkdirSync(path.dirname(dbPath), {recursive: true});
        this.db = await open({filename: dbPath, driver: sqlite3.Database});
        this.configStore = new ConfigStore(this.db);
        await this.configStore.setup();
        ApplicationLogger.info(`Using database ${dbPath}`, {service: this.constructor.name, id: 'Main'});
    }

    /**
     * Imports a legacy config.json into the database, if the database has no config yet.
     */
    async importLegacyConfig(): Promise<void> {
        const configPath = process.env.CONFIG_PATH || './data/config.json';
        if (!(await this.configStore!.isEmpty()) || !fs.existsSync(configPath)) {
            return;
        }
        const legacy = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ConfigType;
        for (const vehicle of legacy.vehicles ?? []) {
            // Older configs kept speed and movement type next to the simulator data.
            vehicle.data = {
                ...vehicle.data,
                speed: (vehicle.data?.['speed'] as number) ?? vehicle.speed ?? 10,
                movementType: (vehicle.data?.['movementType'] as string) ?? vehicle.movementType ?? 'driving',
            };
            delete vehicle.speed;
            delete vehicle.movementType;
        }
        for (const error of validateConfig(legacy)) {
            ApplicationLogger.warn(`Imported config: ${error}`, {service: this.constructor.name, id: 'Main'});
        }
        await this.configStore!.save(legacy);
        ApplicationLogger.info(`Imported ${configPath} into the database. It is no longer read.`, {
            service: this.constructor.name,
            id: 'Main',
        });
    }

    async loadConfig() {
        this.config = await this.configStore!.load();
    }

    async setUpSimulations() {
        if (!this.config) {
            ApplicationLogger.error('Configuration not loaded. Cannot set up simulations.', {
                service: this.constructor.name,
                id: 'Main',
            });
            return;
        }
        // Set up simulations based on this.config
        ApplicationLogger.info('Setting up simulations based on configuration.', {
            service: this.constructor.name,
            id: 'Main',
        });

        for (const conn of this.config.connectors) {
            ApplicationLogger.info(`Configuring connector: ${conn.connector} at ${conn.id}`, {
                service: this.constructor.name,
                id: 'Main',
            });
            // Here you would set up the actual connector instances
            if (conn.connector === 'WebSocketConnector') {
                const connector = new WebSocketConnector(
                    conn.data['url'] as string,
                    conn.data['token'] as string,
                    true,
                    conn.id,
                );
                this.connectors.set(conn.id, connector);
                await connector.setup();
                ApplicationLogger.info(`WebSocketConnector configured with data: ${JSON.stringify(conn.data)}`, {
                    service: this.constructor.name,
                    id: 'Main',
                });
            } else if (conn.connector === 'SqliteConnector') {
                const sqliteConnector = new SqliteConnector(conn.id, conn.data['databasePath'] as string);
                this.connectors.set(conn.id, sqliteConnector);
                await sqliteConnector.setup();
                ApplicationLogger.info(`SqliteConnector configured.`, {service: this.constructor.name, id: 'Main'});
            } else if (conn.connector === 'ApiConnector') {
                const apiConnector = new ApiConnector(conn.data['url'] as string, conn.data['token'] as string);
                this.connectors.set(conn.id, apiConnector);
                await apiConnector.setup();
                console.log(await apiConnector.loadAllUnits());
                ApplicationLogger.info(`SqliteConnector configured.`, {service: this.constructor.name, id: 'Main'});
            } else {
                ApplicationLogger.warn(`Unknown connector type: ${conn.connector}`, {
                    service: this.constructor.name,
                    id: 'Main',
                });
            }
        }

        for (const vehicle of this.config.vehicles) {
            ApplicationLogger.info(`Setting up simulation for vehicle: ${vehicle.name}`, {
                service: this.constructor.name,
                id: 'Main',
            });
            if (!vehicle.enabled) {
                continue;
            }
            if (!vehicle.id) {
                ApplicationLogger.info('Vehicle ID not set, obtaining from api.', {
                    service: this.constructor.name,
                    id: 'Main',
                });
                for (const connector of this.connectors.values()) {
                    const id = connector.lookUpEntityUUID(vehicle.name);
                    if (id) {
                        vehicle.id = id;
                        ApplicationLogger.info(`Found vehicle ID ${id} for vehicle name: ${vehicle.name}`, {
                            service: this.constructor.name,
                            id: 'Main',
                        });
                        break;
                    }
                }
                if (vehicle.id == null) {
                    ApplicationLogger.error(`Could not find vehicle ID for vehicle name: ${vehicle.name}`, {
                        service: this.constructor.name,
                        id: 'Main',
                    });
                    for (const connector of this.connectors.values()) {
                        if (connector instanceof ApiConnector) {
                            const newUnit = await connector.saveUnit(new Unit({name: vehicle.name}));
                            console.log('BWE', newUnit);
                            if (newUnit) {
                                vehicle.id = newUnit.getId() as string;
                                ApplicationLogger.info(
                                    `Created new vehicle with ID ${vehicle.id} for vehicle name: ${vehicle.name}`,
                                    {
                                        service: this.constructor.name,
                                        id: 'Main',
                                    },
                                );
                                break;
                            }
                        }
                    }
                }
                if (vehicle.id == null) {
                    vehicle.id = randomUUID();
                    ApplicationLogger.info(`Generated vehicle ID ${vehicle.id} for vehicle name: ${vehicle.name}`, {
                        service: this.constructor.name,
                        id: 'Main',
                    });
                }
                await this.configStore?.setVehicleId(vehicle.name, vehicle.id);
            }
            if (!vehicle.name) {
                continue;
            }
            const simVehicle = new Vehicle(vehicle.id as UUID, vehicle.name);
            let simulatorInstance: AbstractSimulator | null = null;

            if (vehicle.simulator === 'RouteSimulator') {
                const data = vehicle.data as Record<string, string | number | boolean | LatLonPosition>;

                simulatorInstance = new RouteSimulator({
                    start: data['start'] as LatLonPosition,
                    end: data['end'] as LatLonPosition,
                    speedMps: data['speed'] as number,
                    updateIntervalMs: 2000,
                    profile: (data['movementType'] as string) || 'driving',
                });
            } else if (vehicle.simulator === 'RandomRouteSimulator') {
                const data = vehicle.data as Record<string, string | number | boolean | LatLonPosition>;
                simulatorInstance = new RandomRouteSimulator({
                    coord1: data['corner1'] as LatLonPosition,
                    coord2: data['corner2'] as LatLonPosition,
                    routeSimulatorOptions: {
                        speedMps: data['speed'] as number,
                        updateIntervalMs: 2000,
                        profile: (data['movementType'] as string) || 'driving',
                    },
                });
            } else if (vehicle.simulator === 'EmergencyDispatchSimulator') {
                const data = vehicle.data as Record<string, string | number | boolean | LatLonPosition>;
                simulatorInstance = new EmergencyDispatchSimulator({
                    coord1: data['corner1'] as LatLonPosition,
                    coord2: data['corner2'] as LatLonPosition,
                    routeSimulatorOptions: {
                        homeLocation: data['homeLocation'] as LatLonPosition,
                        speedMps: data['speed'] as number,
                        updateIntervalMs: 2000,
                        profile: (data['movementType'] as string) || 'driving',
                    },
                });
            }

            if (simulatorInstance == null) {
                ApplicationLogger.error(`Simulator instance could not be created. Vehicle ID: ${vehicle.id}`, {
                    service: this.constructor.name,
                    id: 'Main',
                });
                continue;
            }
            await simVehicle.setup(simulatorInstance);
            this.vehicles.set(vehicle.id as UUID, simVehicle);

            // The web UI shows every vehicle, independent of its configured connectors
            this.webUI?.attachEntity(simVehicle);

            // Attach connectors to vehicle
            for (const connId of vehicle.connectors) {
                const connector = this.connectors.get(connId);
                if (connector) {
                    connector.attachEntity(simVehicle);
                    ApplicationLogger.info(`Attached connector ${connId} to vehicle ${vehicle.id}`, {
                        service: this.constructor.name,
                        id: 'Main',
                    });
                } else {
                    ApplicationLogger.warn(`Connector ${connId} not found for vehicle ${vehicle.id}`, {
                        service: this.constructor.name,
                        id: 'Main',
                    });
                }
            }
        }
    }

    async startSimulations() {
        await this.loadConfig();
        await this.setUpSimulations();

        for (const vehicle of this.vehicles.values()) {
            vehicle.start();
        }
    }

    stopSimulations() {
        for (const vehicle of this.vehicles.values()) {
            vehicle.stop();
        }
        for (const connector of this.connectors.values()) {
            connector.disconnect();
        }
        this.vehicles.clear();
        this.connectors.clear();
        this.webUI?.detachAll();
    }

    /**
     * Rebuilds all connectors and vehicles from the stored config. Concurrent calls share one reload.
     */
    reload(): Promise<void> {
        if (!this.reloading) {
            ApplicationLogger.info('Reloading simulations from stored config.', {
                service: this.constructor.name,
                id: 'Main',
            });
            this.stopSimulations();
            this.reloading = this.startSimulations().finally(() => {
                this.reloading = null;
            });
        }
        return this.reloading;
    }

    async start() {
        ApplicationLogger.info('Starting GeoSimulator', {service: this.constructor.name, id: 'Main'});
        await this.openDatabase();
        await this.importLegacyConfig();

        if (process.env.WEBUI_ENABLED !== 'false') {
            this.webUI = new WebUIConnector(
                'webui',
                this.db!,
                this.configStore!,
                () => this.reload(),
                parseInt(process.env.WEBUI_PORT || '8080'),
                process.env.WEBUI_HOST || '127.0.0.1',
            );
            await this.webUI.setup();
        }

        try {
            await this.startSimulations();
        } catch (e) {
            // Keep running, so that the config can be fixed in the web UI.
            ApplicationLogger.error(`Could not start simulations: ${e}`, {service: this.constructor.name, id: 'Main'});
        }
        this.webUI?.notifyReloaded();
    }

    on(eventName: string, listener: EventListener) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName)!.push(listener);
    }

    emit(event: Event) {
        const eventListeners = this.listeners.get(event.type);
        if (eventListeners) {
            for (const listener of eventListeners) {
                listener(event);
            }
        }
    }
}

if (require.main === module) {
    const simulator = new GeoSimulator();
    simulator.start();
    setInterval(() => {
        /* emtpy */
    }, 10000); // Keep the Node.js event loop alive
}
