import {LatLonPosition, VehicleConfig} from '../Types';
import {AbstractSimulator} from './AbstractSimulator';
import {RouteSimulator} from './RouteSimulator';
import {RandomRouteSimulator} from './RandomRouteSimulator';
import {EmergencyDispatchSimulator} from './EmergencyDispatchSimulator';
import {LegOptions} from './MultiRouteSimulator';

const UPDATE_INTERVAL_MS = 2000;

type Data = VehicleConfig['data'];

const FACTORIES: Record<string, (data: Data, leg: LegOptions) => AbstractSimulator> = {
    RouteSimulator: (data, leg) =>
        new RouteSimulator({...leg, start: data['start'] as LatLonPosition, end: data['end'] as LatLonPosition}),
    RandomRouteSimulator: (data, leg) =>
        new RandomRouteSimulator({
            coord1: data['corner1'] as LatLonPosition,
            coord2: data['corner2'] as LatLonPosition,
            routeSimulatorOptions: leg,
        }),
    EmergencyDispatchSimulator: (data, leg) =>
        new EmergencyDispatchSimulator({
            coord1: data['corner1'] as LatLonPosition,
            coord2: data['corner2'] as LatLonPosition,
            routeSimulatorOptions: {...leg, homeLocation: data['homeLocation'] as LatLonPosition},
        }),
};

/** Creates the simulator for a vehicle config, or null if the simulator type is unknown. */
export function createSimulator(vehicleConfig: VehicleConfig): AbstractSimulator | null {
    const factory = FACTORIES[vehicleConfig.simulator];
    if (!factory) {
        return null;
    }
    const data = vehicleConfig.data;
    return factory(data, {
        speedMps: data['speed'] as number,
        updateIntervalMs: UPDATE_INTERVAL_MS,
        profile: (data['movementType'] as string) || 'driving',
    });
}
