import {randomInt} from 'node:crypto';
import {ApplicationLogger} from '../utils/Logger';
import {MultiRouteSimulator, MultiRouteSimulatorOptions} from './MultiRouteSimulator';

export type RandomRouteSimulatorOptions = MultiRouteSimulatorOptions;

/** Drives from one random point in the box to the next, with a short pause in between. */
export class RandomRouteSimulator extends MultiRouteSimulator<RandomRouteSimulatorOptions> {
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
            await this.runLeg(start, end);
            if (!this.running) {
                return;
            }
            start = this.getPosition() ?? end;

            const waitTillNewRoute = randomInt(1, 50) * 1000;
            ApplicationLogger.info(`Waiting ${waitTillNewRoute / 1000} seconds before starting new route.`, {
                service: this.constructor.name,
                id: this.getId(),
            });
            await this.sleep(waitTillNewRoute);
        }
    }
}
