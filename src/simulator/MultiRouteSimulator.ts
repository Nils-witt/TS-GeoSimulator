import {AbstractSimulator, ControlError} from './AbstractSimulator';
import {LatLonPosition, SimulatorAction, SimulatorCommand} from '../Types';
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

interface Wait {
    resolve: () => void;
    timer: NodeJS.Timeout | null;
    endsAt: number;
    // Only up to date while paused.
    remainingMs: number;
    paused: boolean;
}

/**
 * Base for simulators that drive a sequence of routes ("legs") inside a bounding box, with waits in between.
 * Each leg is a RouteSimulator whose position and route are forwarded as this simulator's own.
 * Waits can be skipped, extended and paused, and the next destination can be set through control().
 */
export abstract class MultiRouteSimulator<O extends MultiRouteSimulatorOptions> extends AbstractSimulator {
    protected options: O;
    protected currentLeg: RouteSimulator | undefined;
    protected running = false;

    private phase = {name: 'Idle', startedAt: Date.now(), endsAt: null as number | null};
    private wait: Wait | null = null;
    private finishLeg: (() => void) | null = null;
    private nextDestination: LatLonPosition | null = null;

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
        // Let a pending wait or leg return, so the simulation loop ends.
        this.endWait();
        this.finishLeg?.();
    }

    /** Places and stats of the subclass, shown with the current phase. */
    protected abstract describePlaces(): Record<string, LatLonPosition>;

    protected abstract describeStats(): Record<string, string | number>;

    override control(command: SimulatorCommand): void {
        if (command.action === 'setNextDestination') {
            this.nextDestination = command.position;
            this.log(`Next destination set to ${command.position ? JSON.stringify(command.position) : 'random'}.`);
            this.publishDetails();
            return;
        }
        const wait = this.wait;
        if (!wait) {
            throw new ControlError('The vehicle is not waiting right now.');
        }
        switch (command.action) {
            case 'skipWait':
                this.log('Wait skipped.');
                this.endWait();
                return;
            case 'extendWait':
                this.log(`Wait extended by ${command.seconds} seconds.`);
                if (wait.paused) {
                    wait.remainingMs += command.seconds * 1000;
                } else {
                    wait.remainingMs = wait.endsAt - Date.now() + command.seconds * 1000;
                    this.armWait(wait);
                }
                break;
            case 'pauseWait':
                if (wait.paused) return;
                this.log('Wait paused.');
                clearTimeout(wait.timer!);
                wait.timer = null;
                wait.remainingMs = Math.max(0, wait.endsAt - Date.now());
                wait.paused = true;
                break;
            case 'resumeWait':
                if (!wait.paused) return;
                this.log('Wait resumed.');
                wait.paused = false;
                this.armWait(wait);
                break;
        }
        this.publishDetails();
    }

    protected setPhase(name: string, endsAt: number | null = null): void {
        this.phase = {name, startedAt: Date.now(), endsAt};
        this.publishDetails();
    }

    protected publishDetails(): void {
        const places = this.describePlaces();
        if (this.nextDestination) {
            places['Next destination'] = this.nextDestination;
        }
        const wait = this.wait;
        const controls: SimulatorAction[] = ['setNextDestination'];
        if (wait) {
            controls.push('skipWait', 'extendWait', wait.paused ? 'resumeWait' : 'pauseWait');
        }
        this.setDetails({
            phase: this.phase.name,
            phaseStartedAt: this.phase.startedAt,
            phaseEndsAt: wait ? (wait.paused ? null : wait.endsAt) : this.phase.endsAt,
            places,
            stats: this.describeStats(),
            paused: wait?.paused ?? false,
            remainingMs: wait?.paused ? wait.remainingMs : null,
            controls,
        });
    }

    /** Waits `ms` in the phase `name`. The wait can be skipped, extended and paused through control(). */
    protected waitPhase(name: string, ms: number): Promise<void> {
        return new Promise((resolve) => {
            const wait: Wait = {resolve, timer: null, endsAt: 0, remainingMs: ms, paused: false};
            this.wait = wait;
            this.armWait(wait);
            this.setPhase(name, wait.endsAt);
        });
    }

    private armWait(wait: Wait): void {
        if (wait.timer) clearTimeout(wait.timer);
        wait.endsAt = Date.now() + wait.remainingMs;
        wait.timer = setTimeout(() => this.endWait(), wait.remainingMs);
    }

    private endWait(): void {
        const wait = this.wait;
        if (!wait) return;
        if (wait.timer) clearTimeout(wait.timer);
        this.wait = null;
        wait.resolve();
    }

    /** The destination set through control(), or a random one in the box. */
    protected takeNextDestination(): LatLonPosition {
        const destination = this.nextDestination ?? randomPositionInBox(this.options.coord1, this.options.coord2);
        this.nextDestination = null;
        return destination;
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
     * Drives a leg from start to end in the phase `phaseName`. Resolves once it finished, or immediately if the
     * simulator was stopped or there is no route to drive (identical points or the route could not be fetched).
     */
    protected async runLeg(start: LatLonPosition, end: LatLonPosition, phaseName: string): Promise<void> {
        this.setPhase(`${phaseName} (calculating route)`);
        const leg = await this.prepareLeg(start, end);
        if (!leg) {
            return;
        }
        if (leg.getRoute().length < 2) {
            leg.start();
            return;
        }
        this.setPhase(phaseName, Date.now() + leg.estimateRemainingMs());
        return new Promise<void>((resolve) => {
            this.finishLeg = resolve;
            leg.on('routeFinished', () => resolve());
            leg.start();
        }).finally(() => {
            this.finishLeg = null;
        });
    }

    protected log(message: string): void {
        ApplicationLogger.info(message, {service: this.constructor.name, id: this.getId()});
    }

    protected logError(message: string): void {
        ApplicationLogger.error(message, {service: this.constructor.name, id: this.getId()});
    }
}
