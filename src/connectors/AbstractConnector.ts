import {AbstractEntity} from '../entities/AbstractEntity';


export abstract class AbstractConnector {
    abstract connect(): void;

    abstract disconnect(): void;

    abstract setup(): Promise<void>;

    abstract attachEntity(entity: AbstractEntity): void;
}