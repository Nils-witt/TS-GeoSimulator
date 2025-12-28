import {AbstractSimulator} from './AbstractSimulator';
import {LatLonPosition} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {RouteSimulator} from "./RouteSimulator";
import {randomInt} from "node:crypto";
import {SimulatorPositionUpdateEvent} from "../events/SimulatorPositionUpdateEvent";

export interface RandomRouteSimulatorOptions {
    coord1?: LatLonPosition;
    coord2?: LatLonPosition;
    routeSimulatorOptions: {
        serverUrl?: string; // e.g. https://router.project-osrm.org/route/v1
        profile?: string; // e.g. driving, walking, cycling
        speedMps?: number; // meters per second
        updateIntervalMs?: number;
        maxRetries?: number;
        fetchTimeoutMs?: number;
    }
}
export class RandomRouteSimulator extends AbstractSimulator {
    private options: RandomRouteSimulatorOptions;
    private currentRouteSimulator: RouteSimulator | undefined;

    constructor(options: RandomRouteSimulatorOptions) {
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

    runNewRoute(): void {
        let start = this.generateRandomCoordinate();
        if(this.currentRouteSimulator != null && this.currentRouteSimulator.getPosition() != null) {
            start = this.currentRouteSimulator.getPosition() as LatLonPosition;
        }
        const end = this.generateRandomCoordinate();

        const new_route = new RouteSimulator({
            ...this.options.routeSimulatorOptions,
            start,
            end,
        });
        new_route.on('positionUpdate', (event) => {
            this.setPosition((event as SimulatorPositionUpdateEvent).getPosition());
        });
        new_route.on('routeFinished', () => {
            ApplicationLogger.info('Route Finished successfully.', {service: this.constructor.name, id: this.getId()});
            const waitTillNewRoute = randomInt(1,50) * 1000;
            ApplicationLogger.info(`Waiting ${waitTillNewRoute/1000} seconds before starting new route.`, {service: this.constructor.name, id: this.getId()});
            setTimeout(() => {
                this.runNewRoute();
            }, waitTillNewRoute);
        })
        this.currentRouteSimulator = new_route;
        new_route.setup().then(() => {
            new_route.start();
            ApplicationLogger.info(`Starting new route. From ${start.latitude} ${start.longitude} to ${end.latitude} ${end.longitude}`, {service: this.constructor.name, id: this.getId()});
        }).catch((error) => {
            ApplicationLogger.error(`Error during setup of new route: ${error}`, {service: this.constructor.name, id: this.getId()});
        });
    }

    start(): void {
        ApplicationLogger.info('Starting simulation.', {service: this.constructor.name, id: this.getId()});
        this.runNewRoute();
    }

    stop(): void {
        this.currentRouteSimulator?.stop();
    }

}