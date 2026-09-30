/*
 * SpeedProfile.ts
 * ---------------
 * Dynamic speed along a route: the vehicle accelerates from standstill, follows the road speeds up to its maximum
 * speed, slows down for corners and brakes in time for slower sections and the end of the route.
 */

import {LatLonPosition} from '../Types';
import {bearingBetween, haversineDistance} from '../utils/Geo';

/** Driving characteristics of a movement type. Accelerations in m/s², speeds in m/s. */
export interface Dynamics {
    acceleration: number;
    deceleration: number;
    // Sideways acceleration tolerated in corners; limits the cornering speed.
    lateralAcceleration: number;
    // Slowest speed in a corner, so sharp turns do not bring the vehicle to a halt.
    minCornerSpeed: number;
}

const DRIVING: Dynamics = {acceleration: 2.5, deceleration: 3.5, lateralAcceleration: 3, minCornerSpeed: 2};
const CYCLING: Dynamics = {acceleration: 1, deceleration: 2, lateralAcceleration: 2, minCornerSpeed: 2};
const WALKING: Dynamics = {acceleration: 0.8, deceleration: 1.5, lateralAcceleration: 1.5, minCornerSpeed: 0.8};

const DYNAMICS: Record<string, Dynamics> = {
    driving: DRIVING,
    car: DRIVING,
    cycling: CYCLING,
    bike: CYCLING,
    walking: WALKING,
    foot: WALKING,
};

/** Dynamics of an OSRM profile; unknown profiles drive like cars. */
export function dynamicsFor(profile: string): Dynamics {
    return DYNAMICS[profile] ?? DRIVING;
}

// Simulation time step within one update interval, in seconds.
const STEP_SECONDS = 0.1;
// Lowest speed while approaching a stop, so the vehicle reaches it in finite time.
const CRAWL_SPEED = 0.5;
// Corners between shorter segments are ignored (duplicate or nearly identical route points).
const MIN_CORNER_SEGMENT_METERS = 0.5;

/** Where a vehicle is on the route and how fast it is going. */
export interface Progress {
    // Index of the route point the current segment starts at.
    index: number;
    // Meters travelled from route[index] towards the next point.
    offset: number;
    // Meters per second.
    speed: number;
}

export class SpeedProfile {
    readonly lengths: number[];
    private readonly segmentLimits: number[];
    // Highest speed when passing route[i] that still allows braking for everything ahead.
    private readonly pointLimits: number[];

    /**
     * @param roadSpeeds Typical speed per segment (m/s) as reported by the router; missing or invalid values fall
     *                   back to `maxSpeed`.
     */
    constructor(
        route: LatLonPosition[],
        private readonly maxSpeed: number,
        private readonly dynamics: Dynamics,
        roadSpeeds: number[] = [],
    ) {
        const segments = Math.max(0, route.length - 1);
        this.lengths = [];
        this.segmentLimits = [];
        for (let i = 0; i < segments; i++) {
            this.lengths.push(haversineDistance(route[i], route[i + 1]));
            const road = roadSpeeds[i];
            this.segmentLimits.push(Number.isFinite(road) && road > 0 ? Math.min(maxSpeed, road) : maxSpeed);
        }

        // Standing still at both ends; otherwise no faster than the adjacent segments and the corner allow.
        this.pointLimits = [0];
        for (let i = 1; i < segments; i++) {
            const limit = Math.min(this.segmentLimits[i - 1], this.segmentLimits[i]);
            this.pointLimits.push(Math.min(limit, this.cornerSpeed(route, i)));
        }
        this.pointLimits.push(0);

        // Backward pass: slow down in time for every slower point ahead.
        for (let i = segments - 1; i >= 0; i--) {
            const reachable = Math.sqrt(this.pointLimits[i + 1] ** 2 + 2 * dynamics.deceleration * this.lengths[i]);
            this.pointLimits[i] = Math.min(this.pointLimits[i], reachable);
        }
    }

    isFinished(progress: Progress): boolean {
        return progress.index >= this.lengths.length;
    }

    /** Moves `seconds` along the route, accelerating and braking as needed. */
    advance(progress: Progress, seconds: number): Progress {
        let {index, offset, speed} = progress;
        let left = seconds;
        while (left > 1e-9 && index < this.lengths.length) {
            const dt = Math.min(STEP_SECONDS, left);
            left -= dt;
            speed = Math.min(speed + this.dynamics.acceleration * dt, this.limitAt(index, offset));
            let distance = speed * dt;
            while (distance > 0 && index < this.lengths.length) {
                const rest = this.lengths[index] - offset;
                if (distance < rest) {
                    offset += distance;
                    distance = 0;
                } else {
                    distance -= rest;
                    index++;
                    offset = 0;
                }
            }
        }
        if (index >= this.lengths.length) {
            return {index: this.lengths.length, offset: 0, speed: 0};
        }
        return {index, offset, speed};
    }

    /** Seconds needed to drive the rest of the route, in steps of `stepSeconds`. */
    remainingSeconds(progress: Progress, stepSeconds: number): number {
        let seconds = 0;
        let current = progress;
        while (!this.isFinished(current)) {
            current = this.advance(current, stepSeconds);
            seconds += stepSeconds;
        }
        return seconds;
    }

    /** Highest allowed speed at `offset` meters into segment `index`, including braking for the next point. */
    private limitAt(index: number, offset: number): number {
        const toNext = Math.max(0, this.lengths[index] - offset);
        const braking = Math.sqrt(this.pointLimits[index + 1] ** 2 + 2 * this.dynamics.deceleration * toNext);
        return Math.max(CRAWL_SPEED, Math.min(this.segmentLimits[index], braking));
    }

    /**
     * Speed for the turn at route[i]. The corner is approximated by the largest arc that fits into half of the
     * shorter adjacent segment.
     */
    private cornerSpeed(route: LatLonPosition[], i: number): number {
        const shorter = Math.min(this.lengths[i - 1], this.lengths[i]);
        if (shorter < MIN_CORNER_SEGMENT_METERS) {
            return this.maxSpeed;
        }
        const turn = Math.abs(
            ((bearingBetween(route[i], route[i + 1]) - bearingBetween(route[i - 1], route[i]) + 540) % 360) - 180,
        );
        if (turn < 1) {
            return this.maxSpeed;
        }
        const radius = shorter / 2 / Math.tan((turn * Math.PI) / 360);
        const speed = Math.sqrt(this.dynamics.lateralAcceleration * radius);
        return Math.max(this.dynamics.minCornerSpeed, Math.min(this.maxSpeed, speed));
    }
}
