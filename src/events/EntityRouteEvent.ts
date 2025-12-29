import {AbstractEntity} from "../entities/AbstractEntity";
import {LatLonPosition} from "../Types";

export class EntityRouteEvent extends Event {

    private entity: AbstractEntity;
    private route: LatLonPosition[];

    constructor(entity: AbstractEntity, route: LatLonPosition[]) {
        super('routeUpdate');
        this.entity = entity
        this.route = route;
    }

    getRoute(): LatLonPosition[] {
        return this.route;
    }

    getEntity(): AbstractEntity {
        return this.entity;
    }
}