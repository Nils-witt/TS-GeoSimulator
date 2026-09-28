import {randomInt} from 'node:crypto';
import {LatLonPosition} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {MultiRouteSimulator, MultiRouteSimulatorOptions} from './MultiRouteSimulator';

export type RandomRouteSimulatorOptions = MultiRouteSimulatorOptions;

// Pause between two routes, in seconds.
const PAUSE_SECONDS: [number, number] = [1, 50];

/** Drives from one random point in the box to the next, with a short pause in between. */
export class RandomRouteSimulator extends MultiRouteSimulator<RandomRouteSimulatorOptions> {
    private routesDriven = 0;

    start(): void {
        ApplicationLogger.info('Starting simulation.', {service: this.constructor.name, id: this.getId()});
        this.running = true;
        this.loop().catch((error) => {
            ApplicationLogger.error(`Simulation failed: ${error}`, {service: this.constructor.name, id: this.getId()});
        });
    }

    private async loop(): Promise<void> {
        let start = this.randomCoordinate();
        while (this.running) {
            const end = this.randomCoordinate();
            ApplicationLogger.info(
                `Starting new route. From ${start.latitude} ${start.longitude} to ${end.latitude} ${end.longitude}`,
                {service: this.constructor.name, id: this.getId()},
            );
            this.describe('Calculating route', null, end);
            await this.runLeg(start, end, (arrivalAt) => this.describe('Driving', arrivalAt, end));
            if (!this.running) {
                return;
            }
            this.routesDriven++;
            start = this.getPosition() ?? end;

            const pauseMs = randomInt(PAUSE_SECONDS[0], PAUSE_SECONDS[1]) * 1000;
            ApplicationLogger.info(`Waiting ${pauseMs / 1000} seconds before starting new route.`, {
                service: this.constructor.name,
                id: this.getId(),
            });
            this.describe('Pausing', Date.now() + pauseMs, null);
            await this.sleep(pauseMs);
        }
    }

    private describe(phase: string, phaseEndsAt: number | null, destination: LatLonPosition | null): void {
        this.setDetails({
            phase,
            phaseStartedAt: Date.now(),
            phaseEndsAt,
            places: destination ? {Destination: destination} : {},
            stats: {
                'Routes driven': this.routesDriven,
                Pause: `${PAUSE_SECONDS[0]}–${PAUSE_SECONDS[1]} s`,
            },
        });
    }
}
