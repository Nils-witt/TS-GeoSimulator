import {UUID} from 'crypto';
import {AbstractEntity} from './AbstractEntity';
import {RouteSimulator} from '../simulator/RouteSimulator';
import {PositionUpdateEvent} from '../events/PositionUpdateEvent';
import {ApplicationLogger} from '../utils/Logger';

export class Vehicle extends AbstractEntity {

    private movementType: string;

    constructor(id: UUID, movementType = 'driving') {
        super(id);
        this.movementType = movementType;
    }

    getInfo(): string {
        return `Vehicle ID: ${this.id}, Created At: ${this.createdAt.toISOString()}, Updated At: ${this.updatedAt.toISOString()}`;
    }

    start(): void {
        ApplicationLogger.info(`Vehicle ID: ${this.id} started simulation.`, {service: this.constructor.name});

        const simulator = new RouteSimulator({latitude: 50.7373889, longitude: 7.0981944},
            {latitude: 50.748444, longitude: 7.090717},
            {speedMps: 15, updateIntervalMs: 2000, profile: this.movementType} // 15 m/s ~ 54 km/h
        );

        simulator.on('positionUpdate', (event) => {
            this.setPosition((event as PositionUpdateEvent).getPosition());
        });
        simulator.start();
    }

    stop(): void {
        console.log(`Vehicle ${this.id} stopped.`);
    }

}