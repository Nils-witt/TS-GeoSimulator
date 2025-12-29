import {AbstractSimulator} from './AbstractSimulator';
import {LatLonPosition} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {RouteFinishedEvent} from "../events/RouteFinishedEvent";
import {getFormattedDate} from "../utils/Helpers";

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
    private remainingDistanceInSegment = 0; // meters

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
            loop: options.loop ?? false
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
            ApplicationLogger.error('Failed to fetch route, cannot start simulation.', {service: this.constructor.name, id: this.getId()});
            this.emit(new Event('error'));
            return;
        }
        ApplicationLogger.info('Route fetched successfully.', {
            service: this.constructor.name,
            data: {routeLength: this.getRoute().length},
            id: this.getId()
        });
    }

    start(): void {
        if (this.startPos.latitude === this.endPos.latitude && this.startPos.longitude === this.endPos.longitude) {
            this.setPosition(this.startPos);
            return;
        }

        this.currentIndex = 0;
        this.remainingDistanceInSegment = 0;
        this.setPosition(this.getRoute()[0]);

        ApplicationLogger.info('Starting simulation.', {service: this.constructor.name, id: this.getId()});

        this.timer = setInterval(() => this.tick(), this.options.updateIntervalMs);
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
                    ApplicationLogger.warn(`Failed to fetch route (status: ${resp.status}). Attempt ${attempt} of ${this.options.maxRetries}.`, {service: this.constructor.name, id: this.getId()});
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

                const json = await resp.json() as OSRMResponse;
                if (!json || !json.routes || json.routes.length === 0) {
                    ApplicationLogger.error('No routes found in response.', {service: this.constructor.name, id: this.getId()});
                    break;
                }
                ApplicationLogger.info(`New Route from ${json.waypoints[0].location} (${json.waypoints[0].name}) to ${json.waypoints[1].location} (${json.waypoints[1].name}) with distance ${json.routes[0].distance} meters and duration ${json.routes[0].duration} seconds.`, {service: this.constructor.name, id: this.getId()});
                const etaSeconds = json.routes[0].duration;
                const eta = new Date(Date.now() + etaSeconds * 1000);
                ApplicationLogger.info(`Estimated Time of Arrival: ${getFormattedDate(eta)} (${(etaSeconds / 60).toFixed(1)} Minutes)`, {service: this.constructor.name, id: this.getId()});
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

    private tick(): void {
        if (!this.getRoute() || this.currentIndex >= this.getRoute().length - 1) {
            this.stop();
            return;
        }

        const from = this.getRoute()[this.currentIndex];
        const to = this.getRoute()[this.currentIndex + 1];
        const segmentDist = haversineDistance(from, to);

        const step = this.options.speedMps * (this.options.updateIntervalMs / 1000);

        if (this.remainingDistanceInSegment <= 0) {
            this.remainingDistanceInSegment = segmentDist;
        }

        if (step >= this.remainingDistanceInSegment) {
            // move to next waypoint
            this.currentIndex++;
            this.setPosition(this.getRoute()[this.currentIndex]);
            this.remainingDistanceInSegment = 0;
            // if reached end
            if (this.currentIndex >= this.getRoute().length - 1) {
                if (this.options.loop ) {
                    ApplicationLogger.info('Looping route simulation back to start.', {service: this.constructor.name, id: this.getId()});
                    this.currentIndex = 0;
                    this.setPosition(this.getRoute()[0]);
                    return;
                }
                ApplicationLogger.info('Route simulation finished.', {service: this.constructor.name, id: this.getId()});
                this.emit(new RouteFinishedEvent())
                this.stop();
            }
            return;
        }

        // interpolate along bearing
        const bearing = bearingBetween(from, to);
        const newPos = offsetPosition(from.latitude, from.longitude, step, bearing);
        this.remainingDistanceInSegment -= step;
        this.setPosition(newPos);
    }
}

// --- Helper functions ---

function toRad(d: number) {
    return (d * Math.PI) / 180;
}

function toDeg(r: number) {
    return (r * 180) / Math.PI;
}

function haversineDistance(a: LatLonPosition, b: LatLonPosition): number {
    const R = 6371000; // meters
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
}

function bearingBetween(a: LatLonPosition, b: LatLonPosition): number {
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function offsetPosition(latDeg: number, lonDeg: number, distanceMeters: number, bearingDeg: number, earthRadiusMeters = 6371000): LatLonPosition {
    const lat1 = toRad(latDeg);
    const lon1 = toRad(lonDeg);
    const bearing = toRad(bearingDeg);
    const angularDist = distanceMeters / earthRadiusMeters;

    const sinLat2 = Math.sin(lat1) * Math.cos(angularDist) + Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing);
    const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));

    const y = Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1);
    const x = Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2);
    let lon2 = lon1 + Math.atan2(y, x);
    lon2 = ((lon2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;

    return {latitude: toDeg(lat2), longitude: toDeg(lon2)};
}

