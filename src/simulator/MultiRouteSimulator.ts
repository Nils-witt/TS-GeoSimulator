import {AbstractSimulator} from './AbstractSimulator';
import {LatLonPosition} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {RouteSimulator, RouteSimulatorOptions} from './RouteSimulator';
import {randomPositionInBox} from '../utils/Geo';
import {PositionUpdateEvent, RouteEvent} from '../events/Events';

export type LegOptions = Omit<RouteSimulatorOptions, 'start' | 'end'>;

export interface MultiRouteSimulatorOptions {
    coord1?: LatLonPosition;
    coord2?: LatLonPosition;
    routeSimulatorOptions: LegOptions;
}

/**
 * Base for simulators that drive a sequence of routes ("legs") inside a bounding box.
 * Each leg is a RouteSimulator whose position and route are forwarded as this simulator's own.
 */
export abstract class MultiRouteSimulator<O extends MultiRouteSimulatorOptions> extends AbstractSimulator {
    protected options: O;
    protected currentLeg: RouteSimulator | undefined;
    protected running = false;

    constructor(options: O) {
        super();
        this.options = options;
    }

    async setup(): Promise<void> {
        ApplicationLogger.info('Ready to start', {service: this.constructor.name, id: this.getId()});
    }

    stop(): void {
        this.running = false;
        this.currentLeg?.stop();
    }

    protected randomCoordinate(): LatLonPosition {
        return randomPositionInBox(this.options.coord1, this.options.coord2);
    }

    /** Fetches the route of a new leg and forwards its updates. Returns null if the simulator was stopped meanwhile. */
    protected async prepareLeg(start: LatLonPosition, end: LatLonPosition): Promise<RouteSimulator | null> {
        const leg = new RouteSimulator({...this.options.routeSimulatorOptions, start, end});
        leg.on('positionUpdate', (event) => {
            this.setPosition((event as PositionUpdateEvent<AbstractSimulator>).getPosition());
        });
        leg.on('routeUpdate', (event) => {
            this.setRoute((event as RouteEvent<AbstractSimulator>).getRoute());
        });
        this.currentLeg = leg;
        await leg.setup();
        return this.running ? leg : null;
    }

    /**
     * Drives a leg from start to end. Resolves once it finished, or immediately if the simulator was stopped
     * or there is no route to drive (identical points or the route could not be fetched).
     */
    protected async runLeg(start: LatLonPosition, end: LatLonPosition): Promise<void> {
        const leg = await this.prepareLeg(start, end);
        if (!leg) {
            return;
        }
        if (leg.getRoute().length < 2) {
            leg.start();
            return;
        }
        return new Promise<void>((resolve) => {
            leg.on('routeFinished', () => resolve());
            leg.start();
        });
    }

    protected sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
