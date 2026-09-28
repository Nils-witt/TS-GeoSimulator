import {UUID} from 'crypto';
import {AbstractEntity} from './AbstractEntity';
import {ApplicationLogger} from '../utils/Logger';
import {AbstractSimulator} from '../simulator/AbstractSimulator';
import {LatLonPosition, SimulatorDetails} from '../Types';
import {DetailsEvent, PositionUpdateEvent, StatusEvent, RouteEvent} from '../events/Events';

export class Vehicle extends AbstractEntity {
    private simulator: AbstractSimulator;
    private status = 6;

    constructor(id: UUID, name: string, simulator: AbstractSimulator) {
        super(id, name);
        this.simulator = simulator;
        this.simulator.on('positionUpdate', (event) => {
            this.setPosition((event as PositionUpdateEvent<AbstractSimulator>).getPosition());
        });
        this.simulator.on('statusUpdate', (event) => {
            this.setStatus((event as StatusEvent<AbstractSimulator>).getStatus());
        });
        this.simulator.on('detailsUpdate', (event) => {
            this.emit(new DetailsEvent(this, (event as DetailsEvent<AbstractSimulator>).getDetails()));
        });
        this.simulator.on('routeUpdate', (event) => {
            this.emit(new RouteEvent(this, (event as RouteEvent<AbstractSimulator>).getRoute()));
            ApplicationLogger.info(`Vehicle ID: ${this.id} route updated.`, {
                service: this.constructor.name,
                id: this.getId(),
            });
        });
    }

    getInfo(): string {
        return `Vehicle ID: ${this.id}, Created At: ${this.createdAt.toISOString()}, Updated At: ${this.updatedAt.toISOString()}`;
    }

    /** Prepares the simulator (e.g. fetches its route). Attach connectors first to receive the route. */
    async setup(): Promise<void> {
        await this.simulator.setup();
        ApplicationLogger.info(`Vehicle ID: ${this.id} setup completed.`, {
            service: this.constructor.name,
            id: this.getId(),
        });
    }

    start(): void {
        ApplicationLogger.info(`Vehicle ID: ${this.id} started simulation.`, {
            service: this.constructor.name,
            id: this.getId(),
        });
        this.simulator.start();
    }

    stop(): void {
        ApplicationLogger.info(`Vehicle ID: ${this.id} stopped simulation.`, {
            service: this.constructor.name,
            id: this.getId(),
        });
        this.simulator.stop();
    }

    public getStatus(): number {
        return this.status;
    }

    public setStatus(status: number): void {
        ApplicationLogger.info(`Vehicle ID: ${this.id} status: ${status}`, {
            service: this.constructor.name,
            id: this.getId(),
        });
        this.status = status;
        this.emit(new StatusEvent(this, status));
    }

    public getSimulatorName(): string {
        return this.simulator.constructor.name;
    }

    public getDetails(): SimulatorDetails | null {
        return this.simulator.getDetails();
    }

    public getRoute(): LatLonPosition[] {
        return this.simulator.getRoute();
    }
}
