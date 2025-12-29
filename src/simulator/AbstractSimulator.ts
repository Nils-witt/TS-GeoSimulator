import {EventListener, LatLonPosition} from '../Types';
import {UUID} from "crypto";
import {randomUUID} from "node:crypto";
import {SimulatorPositionUpdateEvent} from "../events/SimulatorPositionUpdateEvent";
import {SimulatorStatusEvent} from "../events/SimulatorStatusEvent";
import {SimulatorRouteEvent} from "../events/SimulatorRouteEvent";


export abstract class AbstractSimulator {

    private listeners = new Map<string, EventListener[]>();
    private position: LatLonPosition | null = null;
    private positionsHistory: Map<number, LatLonPosition | null> = new Map<number, LatLonPosition | null>();
    private id: UUID;
    private status = 6;

    private route: LatLonPosition[] = [];

    constructor(id: UUID = randomUUID()) {
        this.id = id;
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

    getRoute(): LatLonPosition[] {
        return this.route;
    }

    setRoute(route: LatLonPosition[]): void {
        this.route = route;
        this.emit(new SimulatorRouteEvent(route));
    }

    /**
     * Protected helper for subclasses to update the simulator position.
     * Automatically appends to history and emits a PositionUpdateEvent.
     */
    protected setPosition(position: LatLonPosition | null): void {
        this.position = position;
        const ts = Date.now();
        this.positionsHistory.set(ts, position);
        this.emit(new SimulatorPositionUpdateEvent(position));
    }

    protected setStatus(status: number): void {
        this.status = status;
        this.emit(new SimulatorStatusEvent(status));
    }

    public getStatus(): number {
        return this.status;
    }

    abstract start(): void;

    abstract stop(): void;

    abstract setup(): Promise<void>

    public getId(): UUID {
        return this.id;
    }
}