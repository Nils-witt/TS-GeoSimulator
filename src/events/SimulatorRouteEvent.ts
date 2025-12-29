import {LatLonPosition} from "../Types";

export class SimulatorRouteEvent extends Event {

    private route: LatLonPosition[];

    constructor(route: LatLonPosition[]) {
        super('routeUpdate');
        this.route = route;
    }

    getRoute(): LatLonPosition[] {
        return this.route;
    }
}