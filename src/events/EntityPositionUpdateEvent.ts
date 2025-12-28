import {LatLonPosition, TimedLatLonPosition} from '../Types';
import {AbstractEntity} from "../entities/AbstractEntity";

export class EntityPositionUpdateEvent extends Event {

    private position: LatLonPosition | TimedLatLonPosition | null;
    private entity: AbstractEntity;

    constructor(entity: AbstractEntity, position: LatLonPosition | TimedLatLonPosition | null = null) {
        super('positionUpdate');
        this.position = position;
        this.entity = entity
    }

    getPosition(): LatLonPosition | TimedLatLonPosition | null {
        return this.position;
    }

    getEntity(): AbstractEntity {
        return this.entity;
    }
}