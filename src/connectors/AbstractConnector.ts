import {AbstractEntity} from '../entities/AbstractEntity';
import {UUID} from "crypto";
import {EntityPositionUpdateEvent} from "../events/EntityPositionUpdateEvent";
import {EntityStatusEvent} from "../events/EntityStatusEvent";


export abstract class AbstractConnector {

    private id: string;
    private entities: Map<UUID, AbstractEntity> = new Map<UUID, AbstractEntity>();

    constructor(id: string) {
        this.id = id;
    }

    abstract connect(): void;

    abstract disconnect(): void;

    abstract setup(): Promise<void>;

    abstract onEntityPositionUpdate(event: EntityPositionUpdateEvent): Promise<void>;
    abstract onEntityStatusUpdate(event: EntityStatusEvent): Promise<void>;

    attachEntity(entity: AbstractEntity): void {
        if (this.entities.has(entity.getId())) {
            return;
        }
        this.entities.set(entity.getId(), entity);

        entity.on('positionUpdate', (event) => {
            this.onEntityPositionUpdate(event as EntityPositionUpdateEvent);
        });
        entity.on('statusUpdate', (event) => {
            this.onEntityStatusUpdate(event as EntityStatusEvent);
        });

    };

    public getId(): string {
        return this.id;
    }
}