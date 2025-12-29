import {AbstractSimulator} from './AbstractSimulator';
import {LatLonPosition} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {RouteSimulator} from "./RouteSimulator";
import {randomInt} from "node:crypto";
import {SimulatorPositionUpdateEvent} from "../events/SimulatorPositionUpdateEvent";
import {getFormattedDate} from "../utils/Helpers";

export interface EmergencyDispatchSimulatorOptions {
    coord1?: LatLonPosition;
    coord2?: LatLonPosition;
    routeSimulatorOptions: {
        serverUrl?: string; // e.g. https://router.project-osrm.org/route/v1
        profile?: string; // e.g. driving, walking, cycling
        speedMps?: number; // meters per second
        updateIntervalMs?: number;
        maxRetries?: number;
        fetchTimeoutMs?: number;
        homeLocation?: LatLonPosition;
    }
}

export class EmergencyDispatchSimulator extends AbstractSimulator {
    private options: EmergencyDispatchSimulatorOptions;
    private currentRouteSimulator: RouteSimulator | undefined;
    constructor(options: EmergencyDispatchSimulatorOptions) {
        super();
        this.options = options;
    }

    async setup(): Promise<void> {
        ApplicationLogger.info('Ready to start', {service: this.constructor.name, id: this.getId()});
    }


    generateRandomCoordinate(): LatLonPosition {
        const latMin = Math.min(this.options.coord1?.latitude || 50.7373889, this.options.coord2?.latitude || 50.7373889);
        const latMax = Math.max(this.options.coord1?.latitude || 50.7373889, this.options.coord2?.latitude || 50.7373889);
        const lonMin = Math.min(this.options.coord1?.longitude || 7.0981944, this.options.coord2?.longitude || 7.0981944);
        const lonMax = Math.max(this.options.coord1?.longitude || 7.0981944, this.options.coord2?.longitude || 7.0981944);

        const latitude = Math.random() * (latMax - latMin) + latMin;
        const longitude = Math.random() * (lonMax - lonMin) + lonMin;

        return {latitude, longitude};
    }

    async runDispatchRoute(): Promise<void> {

        const end = this.generateRandomCoordinate();
        ApplicationLogger.info(
            `Dispatching to location: ${end.latitude}, ${end.longitude}`, {service: this.constructor.name, id: this.getId()}
        )
        ApplicationLogger.info("Current position: " + JSON.stringify(this.getPosition()), {service: this.constructor.name, id: this.getId()});
        const new_route = new RouteSimulator({
            ...this.options.routeSimulatorOptions,
            start: this.getPosition()!,
            end,
        });
        await new_route.setup();
        new_route.on('positionUpdate', (event) => {
            this.setPosition((event as SimulatorPositionUpdateEvent).getPosition());
        });
        this.currentRouteSimulator = new_route;

        return new Promise<void>((resolve, reject) => {
            new_route.on('routeFinished', () => {
                resolve();
            });
            new_route.on('error', (event) => {
                reject((event as ErrorEvent).message);
            });
            new_route.start();
        });
    }
    async runHomeRoute(): Promise<void> {
        ApplicationLogger.info("Returning home to location: " + JSON.stringify(this.options.routeSimulatorOptions.homeLocation), {service: this.constructor.name, id: this.getId()});
        ApplicationLogger.info("Current position: " + JSON.stringify(this.getPosition()), {service: this.constructor.name, id: this.getId()});
        const new_route = new RouteSimulator({
            ...this.options.routeSimulatorOptions,
            start: this.getPosition()!,
            end: this.options.routeSimulatorOptions.homeLocation!,
        });
        await new_route.setup();
        new_route.on('positionUpdate', (event) => {
            this.setPosition((event as SimulatorPositionUpdateEvent).getPosition());
        });
        this.currentRouteSimulator = new_route;

        return new Promise<void>((resolve, reject) => {
            new_route.on('routeFinished', () => {
                resolve();
            });
            new_route.on('error', (event) => {
                reject((event as ErrorEvent).message);
            });
            new_route.start();
        });
    }

    start(): void {
        ApplicationLogger.info('Starting simulation.', {service: this.constructor.name, id: this.getId()});

        const homeLocation = this.options.routeSimulatorOptions.homeLocation;
        if (homeLocation) {
            ApplicationLogger.info(`Setting initial position to home location: ${homeLocation.latitude}, ${homeLocation.longitude}`, {service: this.constructor.name, id: this.getId()}
            )
        } else {
            ApplicationLogger.error("No home location defined in options.routeSimulatorOptions.homeLocation", {
                service: this.constructor.name,
                id: this.getId()
            });
            return
        }
        this.setStatus(2)
        this.setPosition(homeLocation);

        (async () => {
            while(true) {
                const waitTimeToDispatch = randomInt(10, 200) * 1000;
                ApplicationLogger.info(`Waiting for ${waitTimeToDispatch/1000} seconds before next dispatch.(rill ${getFormattedDate(new Date(Date.now() + waitTimeToDispatch))})`, {service: this.constructor.name, id: this.getId()});
                await new Promise(resolve => setTimeout(resolve, waitTimeToDispatch));

                ApplicationLogger.info('Dispatching to new emergency location.', {service: this.constructor.name, id: this.getId()});
                this.setStatus(3)
                await this.runDispatchRoute();
                const waitTimeToHome = randomInt(5, 300) * 1000;
                this.setStatus(4)
                ApplicationLogger.info(`Waiting for ${waitTimeToHome/1000}(till ${getFormattedDate(new Date(Date.now() + waitTimeToHome))}) seconds before returning home.`, {service: this.constructor.name, id: this.getId()});
                await new Promise(resolve => setTimeout(resolve, waitTimeToHome));
                ApplicationLogger.info('Returning to home location.', {service: this.constructor.name, id: this.getId()});
                this.setStatus(1)
                await this.runHomeRoute();
                this.setPosition(homeLocation);
                this.setStatus(2)
                ApplicationLogger.info('Arrived at home location.', {service: this.constructor.name, id: this.getId()});

            }
        })();

    }

    stop(): void {
        this.currentRouteSimulator?.stop();
    }

}