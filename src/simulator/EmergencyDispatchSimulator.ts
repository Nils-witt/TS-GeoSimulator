import {randomInt} from 'node:crypto';
import {LatLonPosition} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {getFormattedDate} from '../utils/Helpers';
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

/** Waits at home, drives to a random emergency in the box, waits there and returns home (status 2 → 3 → 4 → 1 → 2). */
export class EmergencyDispatchSimulator extends MultiRouteSimulator<EmergencyDispatchSimulatorOptions> {
    private home: LatLonPosition | null = null;
    private emergency: LatLonPosition | null = null;
    private dispatches = 0;
    private lastResponseMs: number | null = null;

    start(): void {
        ApplicationLogger.info('Starting simulation.', {service: this.constructor.name, id: this.getId()});

        const homeLocation = this.options.routeSimulatorOptions.homeLocation;
        if (!homeLocation) {
            ApplicationLogger.error('No home location defined in options.routeSimulatorOptions.homeLocation', {
                service: this.constructor.name,
                id: this.getId(),
            });
            return;
        }
        this.home = homeLocation;
        this.running = true;
        this.loop(homeLocation).catch((error) => {
            ApplicationLogger.error(`Simulation failed: ${error}`, {service: this.constructor.name, id: this.getId()});
        });
    }

    private async loop(home: LatLonPosition): Promise<void> {
        this.setStatus(2);
        this.setPosition(home);

        while (this.running) {
            this.emergency = null;
            const waitAtStationMs = randomInt(...WAIT_AT_STATION_SECONDS) * 1000;
            this.log(
                `Waiting ${waitAtStationMs / 1000} seconds before next dispatch (till ${getFormattedDate(new Date(Date.now() + waitAtStationMs))}).`,
            );
            this.describe('Waiting at station', Date.now() + waitAtStationMs);
            await this.sleep(waitAtStationMs);
            if (!this.running) {
                return;
            }

            const emergency = this.randomCoordinate();
            this.emergency = emergency;
            this.dispatches++;
            this.log(`Dispatching to location: ${emergency.latitude}, ${emergency.longitude}`);
            this.setStatus(3);
            const dispatchedAt = Date.now();
            this.describe('Responding (calculating route)', null);
            await this.runLeg(this.getPosition() ?? home, emergency, (arrivalAt) =>
                this.describe('Responding to emergency', arrivalAt),
            );
            if (!this.running) {
                return;
            }
            this.lastResponseMs = Date.now() - dispatchedAt;

            const timeOnSceneMs = randomInt(...TIME_ON_SCENE_SECONDS) * 1000;
            this.setStatus(4);
            this.log(
                `Waiting ${timeOnSceneMs / 1000} seconds before returning home (till ${getFormattedDate(new Date(Date.now() + timeOnSceneMs))}).`,
            );
            this.describe('On scene', Date.now() + timeOnSceneMs);
            await this.sleep(timeOnSceneMs);
            if (!this.running) {
                return;
            }

            this.log('Returning to home location.');
            this.setStatus(1);
            this.describe('Returning to station (calculating route)', null);
            await this.runLeg(this.getPosition() ?? emergency, home, (arrivalAt) =>
                this.describe('Returning to station', arrivalAt),
            );
            if (!this.running) {
                return;
            }
            this.setPosition(home);
            this.setStatus(2);
            this.log('Arrived at home location.');
        }
    }

    private describe(phase: string, phaseEndsAt: number | null): void {
        const places: Record<string, LatLonPosition> = {};
        if (this.emergency) places['Emergency'] = this.emergency;
        if (this.home) places['Home station'] = this.home;
        const stats: Record<string, string | number> = {
            Dispatches: this.dispatches,
            'Wait at station': fmtRange(WAIT_AT_STATION_SECONDS),
            'Time on scene': fmtRange(TIME_ON_SCENE_SECONDS),
        };
        if (this.lastResponseMs != null) {
            stats['Last response time'] = `${Math.round(this.lastResponseMs / 1000)} s`;
        }
        this.setDetails({phase, phaseStartedAt: Date.now(), phaseEndsAt, places, stats});
    }

    private log(message: string): void {
        ApplicationLogger.info(message, {service: this.constructor.name, id: this.getId()});
    }
}
