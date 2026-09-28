/*
 * validation.ts
 * -------------
 * Validates untrusted connector/vehicle configs (e.g. request bodies) and lists the known types.
 * Every validator returns a list of human-readable problems; an empty list means the input is valid.
 */

import {LatLonPosition} from '../Types';

export const CONNECTOR_TYPES: Record<string, string[]> = {
    ApiConnector: ['url', 'token'],
    WebSocketConnector: ['url', 'token'],
    SqliteConnector: ['databasePath'],
};

export const SIMULATOR_TYPES: Record<string, string[]> = {
    RouteSimulator: ['start', 'end'],
    RandomRouteSimulator: ['corner1', 'corner2'],
    EmergencyDispatchSimulator: ['corner1', 'corner2', 'homeLocation'],
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isPosition(value: unknown): value is LatLonPosition {
    return (
        isObject(value) &&
        typeof value.latitude === 'number' &&
        typeof value.longitude === 'number' &&
        Math.abs(value.latitude) <= 90 &&
        Math.abs(value.longitude) <= 180
    );
}

/**
 * Checks a single untrusted connector config (name, type and data).
 * ID and name uniqueness are left to the caller. Returns a list of problems prefixed with `where`.
 */
export function validateConnector(conn: unknown, where = 'Connector'): string[] {
    if (!isObject(conn)) {
        return [`${where}: must be an object.`];
    }
    const errors: string[] = [];
    if (typeof conn.name !== 'string' || conn.name.trim() === '') {
        errors.push(`${where}: name is required.`);
    }
    const fields = typeof conn.connector === 'string' ? CONNECTOR_TYPES[conn.connector] : undefined;
    if (!fields) {
        errors.push(`${where}: unknown connector type "${String(conn.connector)}".`);
        return errors;
    }
    if (!isObject(conn.data)) {
        errors.push(`${where}: data must be an object.`);
        return errors;
    }
    for (const field of fields) {
        if (typeof conn.data[field] !== 'string' || conn.data[field] === '') {
            errors.push(`${where}: "${field}" is required.`);
        }
    }
    return errors;
}

/**
 * Checks a single untrusted vehicle config against the existing connector IDs.
 * Name uniqueness is left to the caller. Returns a list of problems prefixed with `where`.
 */
export function validateVehicle(vehicle: unknown, connectorIds: Set<string>, where = 'Vehicle'): string[] {
    if (!isObject(vehicle)) {
        return [`${where}: must be an object.`];
    }
    const errors: string[] = [];
    if (typeof vehicle.name !== 'string' || vehicle.name.trim() === '') {
        errors.push(`${where}: name is required.`);
    }
    if (typeof vehicle.enabled !== 'boolean') {
        errors.push(`${where}: "enabled" must be true or false.`);
    }
    if (vehicle.id != null && typeof vehicle.id !== 'string') {
        errors.push(`${where}: ID must be a string.`);
    }
    if (!Array.isArray(vehicle.connectors) || vehicle.connectors.some((c) => typeof c !== 'string')) {
        errors.push(`${where}: connectors must be a list of connector IDs.`);
    } else {
        for (const connId of vehicle.connectors as string[]) {
            if (!connectorIds.has(connId)) {
                errors.push(`${where}: connector "${connId}" does not exist.`);
            }
        }
    }
    const fields = typeof vehicle.simulator === 'string' ? SIMULATOR_TYPES[vehicle.simulator] : undefined;
    if (!fields) {
        errors.push(`${where}: unknown simulator "${String(vehicle.simulator)}".`);
        return errors;
    }
    if (!isObject(vehicle.data)) {
        errors.push(`${where}: data must be an object.`);
        return errors;
    }
    if (typeof vehicle.data.speed !== 'number' || !(vehicle.data.speed > 0)) {
        errors.push(`${where}: speed must be a positive number.`);
    }
    for (const field of fields) {
        if (!isPosition(vehicle.data[field])) {
            errors.push(`${where}: "${field}" must be a valid latitude/longitude.`);
        }
    }
    return errors;
}
