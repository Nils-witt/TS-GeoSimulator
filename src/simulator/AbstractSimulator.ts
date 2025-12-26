import {EventListener, LatLonPosition} from '../Types';
import {PositionUpdateEvent} from '../events/PositionUpdateEvent';


export abstract class AbstractSimulator {

    private listeners = new Map<string, EventListener[]>();
    private position: LatLonPosition | null = null;
    private positionsHistory: Map<number, LatLonPosition | null> = new Map<number, LatLonPosition | null>();

    constructor() {
        /* empty */
    }


    on(eventName: string, listener: EventListener): void {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName)!.push(listener);
    }

    emit(event: Event): void {
        const eventListeners = this.listeners.get(event.type);
        if (eventListeners) {
            for (const listener of eventListeners) {
                listener(event);
            }
        }
    }


    getPosition(): LatLonPosition | null {
        return this.position;
    }

    getPositionsHistory(): Map<number, LatLonPosition | null> {
        return this.positionsHistory;
    }

    /**
     * Protected helper for subclasses to update the simulator position.
     * Automatically appends to history and emits a PositionUpdateEvent.
     */
    protected setPosition(position: LatLonPosition | null): void {
        this.position = position;
        const ts = Date.now();
        this.positionsHistory.set(ts, position);
        this.emit(new PositionUpdateEvent(position));
    }

    abstract start(): void;

    abstract stop(): void;

    abstract setup(): Promise<void>
}