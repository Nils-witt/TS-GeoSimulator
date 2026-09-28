import {randomInt} from 'node:crypto';
import {LatLonPosition} from '../Types';
import {LegOptions, MultiRouteSimulator} from './MultiRouteSimulator';

export interface EmergencyDispatchSimulatorOptions {
    coord1?: LatLonPosition;
    coord2?: LatLonPosition;
    routeSimulatorOptions: LegOptions & {homeLocation?: LatLonPosition};
}

// Random waiting times, in seconds.
const WAIT_AT_STATION_SECONDS: [number, number] = [10, 200];
const TIME_ON_SCENE_SECONDS: [number, number] = [5, 300];

const fmtRange = ([min, max]: [number, number]) => `${min}–${max} s`;

/**
 * Waits at home, drives to an emergency in the box, waits there and returns home (status 2 → 3 → 4 → 1 → 2).
 * The emergency is random unless a next destination was set.
 */
export class EmergencyDispatchSimulator extends MultiRouteSimulator<EmergencyDispatchSimulatorOptions> {
    private home: LatLonPosition | null = null;
    private emergency: LatLonPosition | null = null;
    private dispatches = 0;
    private lastResponseMs: number | null = null;

    start(): void {
        this.log('Starting simulation.');
        const homeLocation = this.options.routeSimulatorOptions.homeLocation;
        if (!homeLocation) {
            this.logError('No home location defined in options.routeSimulatorOptions.homeLocation');
            return;
        }
        this.home = homeLocation;
        this.running = true;
        this.loop(homeLocation).catch((error) => this.logError(`Simulation failed: ${error}`));
    }

    private async loop(home: LatLonPosition): Promise<void> {
        this.setStatus(2);
        this.setPosition(home);

        while (this.running) {
            this.emergency = null;
            await this.waitPhase('Waiting at station', randomInt(...WAIT_AT_STATION_SECONDS) * 1000);
            if (!this.running) {
                return;
            }

            const emergency = this.takeNextDestination();
            this.emergency = emergency;
            this.dispatches++;
            this.log(`Dispatching to location: ${emergency.latitude}, ${emergency.longitude}`);
            this.setStatus(3);
            const dispatchedAt = Date.now();
            await this.runLeg(this.getPosition() ?? home, emergency, 'Responding to emergency');
            if (!this.running) {
                return;
            }
            this.lastResponseMs = Date.now() - dispatchedAt;

            this.setStatus(4);
            await this.waitPhase('On scene', randomInt(...TIME_ON_SCENE_SECONDS) * 1000);
            if (!this.running) {
                return;
            }

            this.log('Returning to home location.');
            this.setStatus(1);
            await this.runLeg(this.getPosition() ?? emergency, home, 'Returning to station');
            if (!this.running) {
                return;
            }
            this.setPosition(home);
            this.setStatus(2);
            this.log('Arrived at home location.');
        }
    }

    protected describePlaces(): Record<string, LatLonPosition> {
        const places: Record<string, LatLonPosition> = {};
        if (this.emergency) places['Emergency'] = this.emergency;
        if (this.home) places['Home station'] = this.home;
        return places;
    }

    protected describeStats(): Record<string, string | number> {
        const stats: Record<string, string | number> = {
            Dispatches: this.dispatches,
            'Wait at station': fmtRange(WAIT_AT_STATION_SECONDS),
            'Time on scene': fmtRange(TIME_ON_SCENE_SECONDS),
        };
        if (this.lastResponseMs != null) {
            stats['Last response time'] = `${Math.round(this.lastResponseMs / 1000)} s`;
        }
        return stats;
    }
}
