import {AbstractSimulator} from './AbstractSimulator';
import {LatLonPosition} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {getFormattedDate} from '../utils/Helpers';
import {bearingBetween, haversineDistance, offsetPosition} from '../utils/Geo';
import {RouteFinishedEvent} from '../events/Events';

export interface RouteSimulatorOptions {
    serverUrl?: string; // e.g. https://router.project-osrm.org/route/v1
    profile?: string; // e.g. driving, walking, cycling
    speedMps?: number; // meters per second
    updateIntervalMs?: number;
    maxRetries?: number;
    fetchTimeoutMs?: number;
    start: LatLonPosition;
    end: LatLonPosition;
    loop?: boolean;
}

export interface OSRMResponse {
    routes: {
        geometry: {
            coordinates: number[][];
        };
        duration: number;
        distance: number;
    }[];
    waypoints: {
        location: number[];
        name: string;
    }[];
}

export class RouteSimulator extends AbstractSimulator {
    private startPos: LatLonPosition;
    private endPos: LatLonPosition;
    private options: Required<RouteSimulatorOptions>;
    private timer: NodeJS.Timeout | null = null;
    private currentIndex = 0;
    private distanceIntoSegment = 0; // meters travelled from route[currentIndex] towards the next point

    constructor(options: RouteSimulatorOptions) {
        super();
        this.startPos = options.start;
        this.endPos = options.end;
        this.options = {
            serverUrl: options.serverUrl ?? 'https://router.project-osrm.org/route/v1',
            profile: options.profile ?? 'driving',
            speedMps: options.speedMps ?? 10,
            updateIntervalMs: options.updateIntervalMs ?? 1000,
            maxRetries: options.maxRetries ?? 3,
            fetchTimeoutMs: options.fetchTimeoutMs ?? 10000,
            start: options.start,
            end: options.end,
            loop: options.loop ?? false,
        };
    }

    async setup(): Promise<void> {
        if (this.startPos.latitude === this.endPos.latitude && this.startPos.longitude === this.endPos.longitude) {
            this.setPosition(this.startPos);
            return;
        }

        await this.fetchRoute();

        if (!this.getRoute() || this.getRoute().length === 0) {
            // emit error event via base class
            ApplicationLogger.error('Failed to fetch route, cannot start simulation.', {
                service: this.constructor.name,
                id: this.getId(),
            });
            this.emit(new Event('error'));
            return;
        }
        ApplicationLogger.info('Route fetched successfully.', {
            service: this.constructor.name,
            data: {routeLength: this.getRoute().length},
            id: this.getId(),
        });
    }

    start(): void {
        if (this.startPos.latitude === this.endPos.latitude && this.startPos.longitude === this.endPos.longitude) {
            this.setPosition(this.startPos);
            return;
        }

        if (this.getRoute().length === 0) {
            // The route could not be fetched; setup() already logged it.
            return;
        }
        this.currentIndex = 0;
        this.distanceIntoSegment = 0;
        this.setPosition(this.getRoute()[0]);

        ApplicationLogger.info('Starting simulation.', {service: this.constructor.name, id: this.getId()});

        this.timer = setInterval(() => this.tick(), this.options.updateIntervalMs);
        this.describe('Driving', Date.now() + this.estimateRemainingMs());
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async fetchRoute(): Promise<void> {
        const url = `${this.options.serverUrl}/${this.options.profile}/${this.startPos.longitude},${this.startPos.latitude};${this.endPos.longitude},${this.endPos.latitude}?overview=full&geometries=geojson`;

        let attempt = 0;
        while (attempt <= this.options.maxRetries) {
            attempt++;
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.options.fetchTimeoutMs);

                const resp = await fetch(url, {signal: controller.signal});
                clearTimeout(timeout);

                if (!resp.ok) {
                    ApplicationLogger.warn(
                        `Failed to fetch route (status: ${resp.status}). Attempt ${attempt} of ${this.options.maxRetries}.`,
                        {service: this.constructor.name, id: this.getId()},
                    );
                    // handle 429 with potential Retry-After header
                    if (resp.status === 429) {
                        const ra = resp.headers.get('Retry-After');
                        const wait = ra ? parseInt(ra) * 1000 : 500 * attempt;
                        await new Promise((r) => setTimeout(r, wait));
                        continue;
                    }
                    // otherwise retry with backoff
                    await new Promise((r) => setTimeout(r, 200 * attempt));
                    continue;
                }

                const json = (await resp.json()) as OSRMResponse;
                if (!json || !json.routes || json.routes.length === 0) {
                    ApplicationLogger.error('No routes found in response.', {
                        service: this.constructor.name,
                        id: this.getId(),
                    });
                    break;
                }
                ApplicationLogger.info(
                    `New Route from ${json.waypoints[0].location} (${json.waypoints[0].name}) to ${json.waypoints[1].location} (${json.waypoints[1].name}) with distance ${json.routes[0].distance} meters and duration ${json.routes[0].duration} seconds.`,
                    {service: this.constructor.name, id: this.getId()},
                );
                const etaSeconds = json.routes[0].duration;
                const eta = new Date(Date.now() + etaSeconds * 1000);
                ApplicationLogger.info(
                    `Estimated Time of Arrival: ${getFormattedDate(eta)} (${(etaSeconds / 60).toFixed(1)} Minutes)`,
                    {service: this.constructor.name, id: this.getId()},
                );
                const coords: number[][] = json.routes[0].geometry.coordinates;
                this.setRoute(coords.map((c: number[]) => ({latitude: c[1], longitude: c[0]})));
                return;
            } catch {
                ApplicationLogger.error('Failed to fetch route:', {service: this.constructor.name, id: this.getId()});

                // on abort or network error, backoff then retry
                await new Promise((r) => setTimeout(r, 200 * attempt));
                continue;
            }
        }

        this.setRoute([]);
    }

    /** Simulated driving time for the remaining route. */
    estimateRemainingMs(): number {
        const route = this.getRoute();
        let distance = -this.distanceIntoSegment;
        for (let i = this.currentIndex; i < route.length - 1; i++) {
            distance += haversineDistance(route[i], route[i + 1]);
        }
        const ticks = Math.ceil(Math.max(0, distance) / this.stepMeters());
        return ticks * this.options.updateIntervalMs;
    }

    private stepMeters(): number {
        return this.options.speedMps * (this.options.updateIntervalMs / 1000);
    }

    private describe(phase: string, phaseEndsAt: number | null): void {
        this.setDetails({
            phase,
            phaseStartedAt: Date.now(),
            phaseEndsAt,
            places: {Destination: this.endPos},
            stats: {Speed: `${Math.round(this.options.speedMps * 3.6)} km/h`},
            paused: false,
            remainingMs: null,
            controls: [],
        });
    }

    /** Moves `speed × interval` meters along the route, passing as many route points as needed. */
    private tick(): void {
        const route = this.getRoute();
        if (this.currentIndex >= route.length - 1) {
            this.stop();
            return;
        }

        let budget = this.stepMeters();
        while (this.currentIndex < route.length - 1) {
            const from = route[this.currentIndex];
            const to = route[this.currentIndex + 1];
            const left = haversineDistance(from, to) - this.distanceIntoSegment;
            if (budget < left) {
                this.distanceIntoSegment += budget;
                this.setPosition(offsetPosition(from, this.distanceIntoSegment, bearingBetween(from, to)));
                return;
            }
            budget -= left;
            this.currentIndex++;
            this.distanceIntoSegment = 0;
        }

        // Reached the end of the route.
        this.setPosition(route[route.length - 1]);
        if (this.options.loop) {
            ApplicationLogger.info('Looping route simulation back to start.', {
                service: this.constructor.name,
                id: this.getId(),
            });
            this.currentIndex = 0;
            this.setPosition(route[0]);
            return;
        }
        ApplicationLogger.info('Route simulation finished.', {service: this.constructor.name, id: this.getId()});
        this.describe('Arrived', null);
        this.emit(new RouteFinishedEvent());
        this.stop();
    }
}
