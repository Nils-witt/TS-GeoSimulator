import {UUID} from 'crypto';
import {EventListener, LatLonPosition} from '../Types';
import {PositionUpdateEvent} from '../events/PositionUpdateEvent';

export function offsetPosition(
    latLon: LatLonPosition,
    distanceMeters: number,
    bearingDeg: number,
    earthRadiusMeters = 6371000
): LatLonPosition {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;

    const lat1 = toRad(latLon.latitude);
    const lon1 = toRad(latLon.longitude);
    const bearing = toRad(bearingDeg);
    const angularDist = distanceMeters / earthRadiusMeters;

    const sinLat2 = Math.sin(lat1) * Math.cos(angularDist) + Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing);
    const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));

    const y = Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1);
    const x = Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2);
    let lon2 = lon1 + Math.atan2(y, x);

    // normalize lon to \(-180, 180]\)
    lon2 = ((lon2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;

    return {latitude: toDeg(lat2), longitude: toDeg(lon2)};
}


export abstract class AbstractEntity {
    protected id: UUID;
    protected createdAt: Date;
    protected updatedAt: Date;
    protected position: LatLonPosition | null = {latitude: 50.7373889, longitude: 7.0981944};

    private listeners = new Map<string, EventListener[]>();

    constructor(id: UUID) {
        this.id = id;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }

    on(event: string, listener: EventListener): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener);
    }

    emit(event: Event): void {
        const eventListeners = this.listeners.get(event.type);
        if (eventListeners) {
            for (const listener of eventListeners) {
                listener(event);
            }
        }
    }

    abstract getInfo(): string;

    abstract start(): void;

    abstract stop(): void;

    setPosition(position: LatLonPosition | null): void {
        this.position = position;
        this.emit(new PositionUpdateEvent(position));
    }

    getPosition(): LatLonPosition | null {
        return this.position;
    }

    getId(): UUID {
        return this.id;
    }

}