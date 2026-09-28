/*
 * Events.ts
 * ---------
 * Events emitted by simulators and entities. `S` is the emitter: simulators emit e.g.
 * PositionUpdateEvent<AbstractSimulator>, a Vehicle re-emits it as PositionUpdateEvent<AbstractEntity> for the connectors.
 */

import type {AbstractEntity} from '../entities/AbstractEntity';
import {LatLonPosition, TimedLatLonPosition} from '../Types';

abstract class SourceEvent<S> extends Event {
    private source: S;

    protected constructor(type: string, source: S) {
        super(type);
        this.source = source;
    }

    getSource(): S {
        return this.source;
    }
}

export class PositionUpdateEvent<S = AbstractEntity> extends SourceEvent<S> {
    private position: LatLonPosition | TimedLatLonPosition | null;

    constructor(source: S, position: LatLonPosition | TimedLatLonPosition | null = null) {
        super('positionUpdate', source);
        this.position = position;
    }

    getPosition(): LatLonPosition | TimedLatLonPosition | null {
        return this.position;
    }
}

export class StatusEvent<S = AbstractEntity> extends SourceEvent<S> {
    private status: number;

    constructor(source: S, status: number) {
        super('statusUpdate', source);
        this.status = status;
    }

    getStatus(): number {
        return this.status;
    }
}

export class RouteEvent<S = AbstractEntity> extends SourceEvent<S> {
    private route: LatLonPosition[];

    constructor(source: S, route: LatLonPosition[]) {
        super('routeUpdate', source);
        this.route = route;
    }

    getRoute(): LatLonPosition[] {
        return this.route;
    }
}

export class RouteFinishedEvent extends Event {
    constructor() {
        super('routeFinished');
    }
}
