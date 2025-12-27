import {AbstractEntity} from '../entities/AbstractEntity';


export abstract class AbstractConnector {

    private id: string;

    constructor(id: string) {
        this.id = id;
    }

    abstract connect(): void;

    abstract disconnect(): void;

    abstract setup(): Promise<void>;

    abstract attachEntity(entity: AbstractEntity): void;

    public getId(): string {
        return this.id;
    }
}