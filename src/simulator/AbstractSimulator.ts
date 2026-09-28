import {LatLonPosition} from '../Types';
import {UUID} from 'crypto';
import {randomUUID} from 'node:crypto';
import {Emitter} from '../utils/Emitter';
import {PositionUpdateEvent, StatusEvent, RouteEvent} from '../events/Events';

export abstract class AbstractSimulator extends Emitter {
    private position: LatLonPosition | null = null;
    private id: UUID;
    private status = 6;

    private route: LatLonPosition[] = [];

    constructor(id: UUID = randomUUID()) {
        super();
        this.id = id;
    }

    getPosition(): LatLonPosition | null {
        return this.position;
    }

    getRoute(): LatLonPosition[] {
        return this.route;
    }

    setRoute(route: LatLonPosition[]): void {
        this.route = route;
        this.emit(new RouteEvent(this, route));
    }

    /** Protected helper for subclasses to update the simulator position and emit a PositionUpdateEvent. */
    protected setPosition(position: LatLonPosition | null): void {
        this.position = position;
        this.emit(new PositionUpdateEvent(this, position));
    }

    protected setStatus(status: number): void {
        this.status = status;
        this.emit(new StatusEvent(this, status));
    }

    public getStatus(): number {
        return this.status;
    }

    abstract start(): void;

    abstract stop(): void;

    abstract setup(): Promise<void>;

    public getId(): UUID {
        return this.id;
    }
}
