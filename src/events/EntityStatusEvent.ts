import {AbstractEntity} from "../entities/AbstractEntity";

export class EntityStatusEvent extends Event {

    private status: number;
    private entity: AbstractEntity;

    constructor(entity: AbstractEntity, status: number) {
        super('statusUpdate');
        this.status = status;
        this.entity = entity
    }

    getStatus(): number {
        return this.status;
    }

    getEntity(): AbstractEntity {
        return this.entity;
    }
}