import {UUID} from 'crypto';
import {LatLonPosition, TimedLatLonPosition} from '../Types';
import {Emitter} from '../utils/Emitter';
import {DEFAULT_POSITION} from '../utils/Geo';
import {PositionUpdateEvent} from '../events/Events';

export abstract class AbstractEntity extends Emitter {
    protected id: UUID;
    protected createdAt: Date;
    protected updatedAt: Date;
    protected position: LatLonPosition | TimedLatLonPosition | null = DEFAULT_POSITION;
    private name: string;

    constructor(id: UUID, name: string) {
        super();
        this.id = id;
        this.name = name;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }

    abstract getInfo(): string;

    abstract start(): void;

    abstract stop(): void;

    abstract setup(): Promise<void>;

    setPosition(position: LatLonPosition | TimedLatLonPosition | null): void {
        this.position = position;
        this.emit(new PositionUpdateEvent(this, position));
    }

    getPosition(): LatLonPosition | null {
        return this.position;
    }

    getId(): UUID {
        return this.id;
    }

    getName(): string {
        return this.name;
    }
}
