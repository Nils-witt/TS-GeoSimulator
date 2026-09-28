import {randomInt} from 'node:crypto';
import {LatLonPosition} from '../Types';
import {MultiRouteSimulator, MultiRouteSimulatorOptions} from './MultiRouteSimulator';

export type RandomRouteSimulatorOptions = MultiRouteSimulatorOptions;

// Pause between two routes, in seconds.
const PAUSE_SECONDS: [number, number] = [1, 50];

/** Drives from one random point in the box to the next, with a short pause in between. */
export class RandomRouteSimulator extends MultiRouteSimulator<RandomRouteSimulatorOptions> {
    private destination: LatLonPosition | null = null;
    private routesDriven = 0;

    start(): void {
        this.log('Starting simulation.');
        this.running = true;
        this.loop().catch((error) => this.logError(`Simulation failed: ${error}`));
    }

    private async loop(): Promise<void> {
        let start = this.randomCoordinate();
        while (this.running) {
            const end = this.takeNextDestination();
            this.destination = end;
            this.log(
                `Starting new route. From ${start.latitude} ${start.longitude} to ${end.latitude} ${end.longitude}`,
            );
            await this.runLeg(start, end, 'Driving');
            if (!this.running) {
                return;
            }
            this.routesDriven++;
            this.destination = null;
            start = this.getPosition() ?? end;

            const pauseMs = randomInt(...PAUSE_SECONDS) * 1000;
            this.log(`Waiting ${pauseMs / 1000} seconds before starting new route.`);
            await this.waitPhase('Pausing', pauseMs);
        }
    }

    protected describePlaces(): Record<string, LatLonPosition> {
        return this.destination ? {Destination: this.destination} : {};
    }

    protected describeStats(): Record<string, string | number> {
        return {'Routes driven': this.routesDriven, Pause: `${PAUSE_SECONDS[0]}–${PAUSE_SECONDS[1]} s`};
    }
}
