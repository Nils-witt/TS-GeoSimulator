import {AbstractSimulator} from "./AbstractSimulator";
import {LatLonPosition} from "../Types";
import {ApplicationLogger} from "../utils/Logger";

export type RouteSimulatorOptions = {
    serverUrl?: string; // e.g. https://router.project-osrm.org/route/v1
    profile?: string; // e.g. driving, walking, cycling
    speedMps?: number; // meters per second
    updateIntervalMs?: number;
    maxRetries?: number;
    fetchTimeoutMs?: number;
};

export class RouteSimulator extends AbstractSimulator {
    private startPos: LatLonPosition;
    private endPos: LatLonPosition;
    private options: Required<RouteSimulatorOptions>;
    private route: LatLonPosition[] = [];
    private timer: NodeJS.Timeout | null = null;
    private currentIndex = 0;
    private remainingDistanceInSegment = 0; // meters

    constructor(start: LatLonPosition, end: LatLonPosition, options: RouteSimulatorOptions = {}) {
        super();
        this.startPos = start;
        this.endPos = end;
        this.options = {
            serverUrl: options.serverUrl ?? "https://router.project-osrm.org/route/v1",
            profile: options.profile ?? "driving",
            speedMps: options.speedMps ?? 10,
            updateIntervalMs: options.updateIntervalMs ?? 1000,
            maxRetries: options.maxRetries ?? 3,
            fetchTimeoutMs: options.fetchTimeoutMs ?? 10000,
        };
    }

    async start(): Promise<void> {
        // short-circuit identical points
        if (this.startPos.latitude === this.endPos.latitude && this.startPos.longitude === this.endPos.longitude) {
            this.setPosition(this.startPos);
            return;
        }
        ApplicationLogger.info('Preparing to start', {service: this.constructor.name});

        await this.fetchRoute();

        if (!this.route || this.route.length === 0) {
            // emit error event via base class
            this.emit(new Event("error"));
            return;
        }

        this.currentIndex = 0;
        this.remainingDistanceInSegment = 0;
        // initialize position to the first point
        this.setPosition(this.route[0]);

        ApplicationLogger.info('Starting simulation.', {service: this.constructor.name});

        this.timer = setInterval(() => this.tick(), this.options.updateIntervalMs);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer as any);
            this.timer = null;
        }
    }

    private async fetchRoute(): Promise<void> {
        const url = `${this.options.serverUrl}/${this.options.profile}/${this.startPos.longitude},${this.startPos.latitude};${this.endPos.longitude},${this.endPos.latitude}?overview=full&geometries=geojson`;

        let attempt = 0;
        let lastErr: any = null;
        while (attempt <= this.options.maxRetries) {
            attempt++;
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.options.fetchTimeoutMs);

                const resp = await fetch(url, {signal: controller.signal});
                clearTimeout(timeout);

                if (!resp.ok) {
                    lastErr = new Error(`Routing server returned ${resp.status}`);
                    // handle 429 with potential Retry-After header
                    if (resp.status === 429) {
                        const ra = resp.headers.get("Retry-After");
                        const wait = ra ? parseInt(ra) * 1000 : 500 * attempt;
                        await new Promise((r) => setTimeout(r, wait));
                        continue;
                    }
                    // otherwise retry with backoff
                    await new Promise((r) => setTimeout(r, 200 * attempt));
                    continue;
                }

                const json = await resp.json();
                if (!json || !json.routes || json.routes.length === 0) {
                    lastErr = new Error("No route returned");
                    break;
                }

                const coords: number[][] = json.routes[0].geometry.coordinates;
                this.route = coords.map((c: number[]) => ({latitude: c[1], longitude: c[0]}));
                return;
            } catch (e: any) {
                lastErr = e;
                // on abort or network error, backoff then retry
                await new Promise((r) => setTimeout(r, 200 * attempt));
                continue;
            }
        }

        ApplicationLogger.error("Failed to fetch route:", {service: this.constructor.name, err: lastErr});
        this.route = [];
    }

    private tick(): void {
        if (!this.route || this.currentIndex >= this.route.length - 1) {
            ApplicationLogger.info("Route completed stopping simulator.", {service: this.constructor.name});
            this.stop();
            return;
        }

        const from = this.route[this.currentIndex];
        const to = this.route[this.currentIndex + 1];
        const segmentDist = haversineDistance(from, to);

        const step = this.options.speedMps * (this.options.updateIntervalMs / 1000);

        if (this.remainingDistanceInSegment <= 0) {
            this.remainingDistanceInSegment = segmentDist;
        }

        if (step >= this.remainingDistanceInSegment) {
            // move to next waypoint
            this.currentIndex++;
            this.setPosition(this.route[this.currentIndex]);
            this.remainingDistanceInSegment = 0;
            // if reached end
            if (this.currentIndex >= this.route.length - 1) {
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

