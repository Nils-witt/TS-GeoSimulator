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

/** Waits at home, drives to a random emergency in the box, waits there and returns home (status 2 → 3 → 4 → 1 → 2). */
export class EmergencyDispatchSimulator extends MultiRouteSimulator<EmergencyDispatchSimulatorOptions> {
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
        this.running = true;
        this.loop(homeLocation).catch((error) => {
            ApplicationLogger.error(`Simulation failed: ${error}`, {service: this.constructor.name, id: this.getId()});
        });
    }

    private async loop(home: LatLonPosition): Promise<void> {
        this.setStatus(2);
        this.setPosition(home);

        while (this.running) {
            const waitTimeToDispatch = randomInt(10, 200) * 1000;
            this.log(
                `Waiting ${waitTimeToDispatch / 1000} seconds before next dispatch (till ${getFormattedDate(new Date(Date.now() + waitTimeToDispatch))}).`,
            );
            await this.sleep(waitTimeToDispatch);
            if (!this.running) {
                return;
            }

            const emergency = this.randomCoordinate();
            this.log(`Dispatching to location: ${emergency.latitude}, ${emergency.longitude}`);
            this.setStatus(3);
            await this.runLeg(this.getPosition() ?? home, emergency);
            if (!this.running) {
                return;
            }

            const waitTimeToHome = randomInt(5, 300) * 1000;
            this.setStatus(4);
            this.log(
                `Waiting ${waitTimeToHome / 1000} seconds before returning home (till ${getFormattedDate(new Date(Date.now() + waitTimeToHome))}).`,
            );
            await this.sleep(waitTimeToHome);
            if (!this.running) {
                return;
            }

            this.log('Returning to home location.');
            this.setStatus(1);
            await this.runLeg(this.getPosition() ?? emergency, home);
            if (!this.running) {
                return;
            }
            this.setPosition(home);
            this.setStatus(2);
            this.log('Arrived at home location.');
        }
    }

    private log(message: string): void {
        ApplicationLogger.info(message, {service: this.constructor.name, id: this.getId()});
    }
}
