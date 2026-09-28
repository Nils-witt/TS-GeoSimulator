/*
 * Geo.ts
 * ------
 * Spherical geometry helpers on WGS84 lat/lon positions (degrees, meters).
 */

import {LatLonPosition} from '../Types';

const EARTH_RADIUS_METERS = 6371000;

// Used when no position is configured.
export const DEFAULT_POSITION: LatLonPosition = {latitude: 50.7373889, longitude: 7.0981944};

function toRad(d: number): number {
    return (d * Math.PI) / 180;
}

function toDeg(r: number): number {
    return (r * 180) / Math.PI;
}

export function haversineDistance(a: LatLonPosition, b: LatLonPosition): number {
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Initial bearing from `a` to `b` in degrees [0, 360). */
export function bearingBetween(a: LatLonPosition, b: LatLonPosition): number {
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The position `distanceMeters` away from `from` in direction `bearingDeg`. */
export function offsetPosition(from: LatLonPosition, distanceMeters: number, bearingDeg: number): LatLonPosition {
    const lat1 = toRad(from.latitude);
    const lon1 = toRad(from.longitude);
    const bearing = toRad(bearingDeg);
    const angularDist = distanceMeters / EARTH_RADIUS_METERS;

    const sinLat2 = Math.sin(lat1) * Math.cos(angularDist) + Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing);
    const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));

    const y = Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1);
    const x = Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2);
    // normalize lon to (-180, 180]
    const lon2 = ((lon1 + Math.atan2(y, x) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;

    return {latitude: toDeg(lat2), longitude: toDeg(lon2)};
}

/** A uniformly random position in the box spanned by two corners; a missing corner falls back to DEFAULT_POSITION. */
export function randomPositionInBox(corner1?: LatLonPosition, corner2?: LatLonPosition): LatLonPosition {
    const a = corner1 ?? DEFAULT_POSITION;
    const b = corner2 ?? DEFAULT_POSITION;
    const latMin = Math.min(a.latitude, b.latitude);
    const latMax = Math.max(a.latitude, b.latitude);
    const lonMin = Math.min(a.longitude, b.longitude);
    const lonMax = Math.max(a.longitude, b.longitude);
    return {
        latitude: Math.random() * (latMax - latMin) + latMin,
        longitude: Math.random() * (lonMax - lonMin) + lonMin,
    };
}
