import {AbstractEntity} from '../entities/AbstractEntity';
import {UUID} from 'crypto';
import {EntityPositionUpdateEvent} from '../events/EntityPositionUpdateEvent';
import {EntityStatusEvent} from '../events/EntityStatusEvent';
import {EntityRouteEvent} from '../events/EntityRouteEvent';

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

    abstract onEntityRouteUpdate(event: EntityRouteEvent): Promise<void>;

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
        entity.on('routeUpdate', (event) => {
            this.onEntityRouteUpdate(event as EntityRouteEvent);
        });
    }

    /**
     * Forgets all attached entities, e.g. before the simulations are rebuilt.
     * Listeners stay registered on the old entities, which must be stopped by the caller.
     */
    detachAll(): void {
        this.entities.clear();
    }

    public getId(): string {
        return this.id;
    }

    public lookUpEntityUUID(name: string): UUID | null {
        for (const [uuid, entity] of this.entities) {
            if (entity.getName() === name) {
                return uuid;
            }
        }
        return null;
    }
}
