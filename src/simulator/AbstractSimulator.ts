import {LatLonPosition, Motion, SimulatedPosition, SimulatorCommand, SimulatorDetails} from '../Types';
import {UUID} from 'crypto';
import {randomUUID} from 'node:crypto';
import {Emitter} from '../utils/Emitter';
import {DetailsEvent, PositionUpdateEvent, StatusEvent, RouteEvent} from '../events/Events';

/** A control command that is valid but cannot be applied in the simulator's current state. */
export class ControlError extends Error {}

const STATIONARY: Motion = {speed: 0, course: null};

export abstract class AbstractSimulator extends Emitter {
    private position: SimulatedPosition | null = null;
    private id: UUID;
    private status = 6;

    private route: LatLonPosition[] = [];
    private details: SimulatorDetails | null = null;

    constructor(id: UUID = randomUUID()) {
        super();
        this.id = id;
    }

    getPosition(): SimulatedPosition | null {
        return this.position;
    }

    getRoute(): LatLonPosition[] {
        return this.route;
    }

    setRoute(route: LatLonPosition[]): void {
        this.route = route;
        this.emit(new RouteEvent(this, route));
    }

    /**
     * Protected helper for subclasses to update the simulator position and emit a PositionUpdateEvent.
     * Without `motion` the vehicle is standing still.
     */
    protected setPosition(position: LatLonPosition | null, motion: Motion = STATIONARY): void {
        this.position = position && {latitude: position.latitude, longitude: position.longitude, ...motion};
        this.emit(new PositionUpdateEvent(this, this.position));
    }

    protected setStatus(status: number): void {
        this.status = status;
        this.emit(new StatusEvent(this, status));
    }

    public getStatus(): number {
        return this.status;
    }

    public getDetails(): SimulatorDetails | null {
        return this.details;
    }

    /** Applies a command from the web UI. Throws a ControlError if it cannot be applied. */
    public control(_command: SimulatorCommand): void {
        throw new ControlError(`${this.constructor.name} cannot be controlled.`);
    }

    protected setDetails(details: SimulatorDetails): void {
        this.details = details;
        this.emit(new DetailsEvent(this, details));
    }

    abstract start(): void;

    abstract stop(): void;

    abstract setup(): Promise<void>;

    public getId(): UUID {
        return this.id;
    }
}
