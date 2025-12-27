import {UUID} from 'crypto';
import {AbstractEntity} from './AbstractEntity';
import {PositionUpdateEvent} from '../events/PositionUpdateEvent';
import {ApplicationLogger} from '../utils/Logger';
import {AbstractSimulator} from "../simulator/AbstractSimulator";

export class Vehicle extends AbstractEntity {

    private simulator: AbstractSimulator | null = null;

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
            this.setPosition((event as PositionUpdateEvent).getPosition());
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

}