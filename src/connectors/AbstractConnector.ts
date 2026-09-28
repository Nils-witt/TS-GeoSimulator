import {AbstractEntity} from '../entities/AbstractEntity';
import {UUID} from 'crypto';
import {PositionUpdateEvent, StatusEvent, RouteEvent} from '../events/Events';

export abstract class AbstractConnector {
    private id: string;
    private entities: Map<UUID, AbstractEntity> = new Map<UUID, AbstractEntity>();

    constructor(id: string) {
        this.id = id;
    }

    abstract connect(): void;

    abstract disconnect(): void;

    abstract setup(): Promise<void>;

    abstract onEntityPositionUpdate(event: PositionUpdateEvent): Promise<void>;

    abstract onEntityStatusUpdate(event: StatusEvent): Promise<void>;

    abstract onEntityRouteUpdate(event: RouteEvent): Promise<void>;

    attachEntity(entity: AbstractEntity): void {
        if (this.entities.has(entity.getId())) {
            return;
        }
        this.entities.set(entity.getId(), entity);

        // Entities cannot remove listeners, so events are dropped once the entity is detached.
        const attached = () => this.entities.get(entity.getId()) === entity;
        entity.on('positionUpdate', (event) => {
            if (attached()) this.onEntityPositionUpdate(event as PositionUpdateEvent);
        });
        entity.on('statusUpdate', (event) => {
            if (attached()) this.onEntityStatusUpdate(event as StatusEvent);
        });
        entity.on('routeUpdate', (event) => {
            if (attached()) this.onEntityRouteUpdate(event as RouteEvent);
        });
    }

    /**
     * Forgets one attached entity; its events are no longer forwarded to this connector.
     */
    detachEntity(id: string): void {
        this.entities.delete(id as UUID);
    }

    /**
     * Forgets all attached entities, e.g. before the simulations are rebuilt.
     * Their events are no longer forwarded; the old entities must still be stopped by the caller.
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
