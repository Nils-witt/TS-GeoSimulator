/*
 * GeoSimulator.ts
 * ---------------
 * Owns the running connectors and vehicles and wires them together.
 * Every vehicle is also attached to the LiveStateConnector, which feeds the web server.
 */

import {Database} from 'sqlite';
import {ConfigType, VehicleConfig} from './Types';
import {ApplicationLogger} from './utils/Logger';
import {Vehicle} from './entities/Vehicle';
import {AbstractConnector} from './connectors/AbstractConnector';
import {LiveStateConnector} from './connectors/LiveStateConnector';
import {createConnector} from './connectors/createConnector';
import {createSimulator} from './simulator/createSimulator';

const LOG_META = {service: 'GeoSimulator', id: 'Main'};

export class GeoSimulator {
    private vehicles = new Map<string, Vehicle>();
    private connectors = new Map<string, AbstractConnector>();
    private liveState: LiveStateConnector;

    constructor(db: Database) {
        this.liveState = new LiveStateConnector('live-state', db);
    }

    getLiveState(): LiveStateConnector {
        return this.liveState;
    }

    /**
     * Sets up all connectors and enabled vehicles of a stored config. A connector that cannot be set up is
     * skipped (and logged), so one unreachable endpoint does not prevent the rest from starting.
     */
    async load(config: ConfigType): Promise<void> {
        // Before any vehicle is attached: RouteSimulators already emit their route during setup.
        await this.liveState.setup();
        for (const connectorConfig of config.connectors) {
            try {
                this.addConnector(await createConnector(connectorConfig));
            } catch (e) {
                ApplicationLogger.error(`Connector "${connectorConfig.name}" could not be set up: ${e}`, LOG_META);
            }
        }
        for (const vehicleConfig of config.vehicles) {
            if (vehicleConfig.enabled) {
                await this.addVehicle(vehicleConfig);
            }
        }
    }

    addConnector(connector: AbstractConnector): void {
        this.connectors.set(connector.getId(), connector);
    }

    /**
     * Replaces the running connector with the same ID (if any) by `connector` and attaches the given running
     * vehicles to it.
     */
    replaceConnector(connector: AbstractConnector, vehicleIds: string[]): void {
        this.removeConnector(connector.getId());
        this.addConnector(connector);
        for (const id of vehicleIds) {
            const vehicle = this.vehicles.get(id);
            if (vehicle) {
                connector.attachEntity(vehicle);
            }
        }
    }

    /** Disconnects a connector and detaches it from all vehicles. Returns false if it is not running. */
    removeConnector(id: string): boolean {
        const connector = this.connectors.get(id);
        if (!connector) {
            return false;
        }
        connector.detachAll();
        connector.disconnect();
        this.connectors.delete(id);
        return true;
    }

    /** Creates a vehicle with its simulator and attaches it to its connectors, without starting it. */
    async addVehicle(vehicleConfig: VehicleConfig): Promise<void> {
        if (this.vehicles.has(vehicleConfig.id)) {
            ApplicationLogger.warn(`Vehicle with ID ${vehicleConfig.id} already exists. Skipping addition.`, LOG_META);
            return;
        }
        const simulator = createSimulator(vehicleConfig);
        if (!simulator) {
            ApplicationLogger.error(
                `Unknown simulator "${vehicleConfig.simulator}" for vehicle ${vehicleConfig.id}.`,
                LOG_META,
            );
            return;
        }

        const vehicle = new Vehicle(vehicleConfig.id, vehicleConfig.name, simulator);
        this.vehicles.set(vehicle.getId(), vehicle);
        this.liveState.attachEntity(vehicle);
        for (const connId of vehicleConfig.connectors) {
            this.connectors.get(connId)?.attachEntity(vehicle);
        }
        await vehicle.setup();
    }

    /** Adds a vehicle to the running simulation and starts it. */
    async launchVehicle(vehicleConfig: VehicleConfig): Promise<void> {
        await this.addVehicle(vehicleConfig);
        this.vehicles.get(vehicleConfig.id)?.start();
        this.liveState.notifyReloaded();
    }

    /** Stops a vehicle and detaches it from all connectors. Returns false if it is not running. */
    removeVehicle(id: string): boolean {
        const vehicle = this.vehicles.get(id);
        if (!vehicle) {
            return false;
        }
        vehicle.stop();
        for (const connector of this.connectors.values()) {
            connector.detachEntity(id);
        }
        this.liveState.detachEntity(id);
        this.vehicles.delete(id);
        this.liveState.notifyReloaded();
        return true;
    }

    /** Starts all loaded vehicles. */
    start(): void {
        ApplicationLogger.info('Starting GeoSimulator', LOG_META);
        for (const vehicle of this.vehicles.values()) {
            vehicle.start();
        }
        this.liveState.notifyReloaded();
    }

    stop(): void {
        for (const vehicle of this.vehicles.values()) {
            vehicle.stop();
        }
        for (const connector of this.connectors.values()) {
            connector.disconnect();
        }
        this.vehicles.clear();
        this.connectors.clear();
        this.liveState.detachAll();
        this.liveState.disconnect();
    }
}
