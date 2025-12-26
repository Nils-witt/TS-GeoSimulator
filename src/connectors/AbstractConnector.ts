import {AbstractEntity} from "../entities/AbstractEntity";


export abstract class AbstractConnector {
    abstract connect(): Promise<void>;

    abstract disconnect(): Promise<void>;

    abstract attachEntity(entity: AbstractEntity): void;
}