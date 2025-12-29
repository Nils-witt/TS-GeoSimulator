import {UUID} from 'crypto';
import {AbstractEntity} from './AbstractEntity';
import {ApplicationLogger} from '../utils/Logger';
import {AbstractSimulator} from "../simulator/AbstractSimulator";
import {SimulatorPositionUpdateEvent} from "../events/SimulatorPositionUpdateEvent";
import {EntityStatusEvent} from "../events/EntityStatusEvent";
import {SimulatorStatusEvent} from "../events/SimulatorStatusEvent";

export class Vehicle extends AbstractEntity {

    private simulator: AbstractSimulator | null = null;
    private status = 6;

    constructor(id: UUID) {
        super(id);
    }

    getInfo(): string {
        return `Vehicle ID: ${this.id}, Created At: ${this.createdAt.toISOString()}, Updated At: ${this.updatedAt.toISOString()}`;
    }

    async setup(simulator: AbstractSimulator): Promise<void> {
        this.simulator = simulator;
        await this.simulator.setup();
        this.simulator.on('positionUpdate', (event) => {
            this.setPosition((event as SimulatorPositionUpdateEvent).getPosition());
        });
        this.simulator.on('statusUpdate', (event) => {
            this.setStatus((event as SimulatorStatusEvent).getStatus());
        });
    }

    start(): void {
        ApplicationLogger.info(`Vehicle ID: ${this.id} started simulation.`, {service: this.constructor.name, id: this.getId()});
        if (this.simulator) {
            this.simulator.start();
        }
    }

    stop(): void {
        ApplicationLogger.info("Vehicle ID: ${this.id} stopped simulation.", {service: this.constructor.name, id: this.getId()});
        if (this.simulator) {
            this.simulator.stop();
        }
    }


    public getStatus(): number {
        return this.status;
    }

    public setStatus(status: number): void {
        ApplicationLogger.info(`Vehicle ID: ${this.id} status: ${status}`, {service: this.constructor.name, id: this.getId()});
        this.emit(new EntityStatusEvent(this, status));
        this.status = status;
    }

}