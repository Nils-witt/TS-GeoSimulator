import {type DBRecord, Entity} from './Entity';

export interface IUnit {
    id?: string;
    name: string;
}

export class Unit extends Entity {
    private id: string | null;
    private name: string;

    constructor(data: IUnit) {
        super();
        this.id = data.id || null;
        this.name = data.name;
    }

    public static of(data: DBRecord): Unit {
        return new Unit({
            id: data.id ? (data.id as string) : undefined,
            name: data.name as string,
        });
    }

    record(): DBRecord {
        const record: DBRecord = {};
        record['id'] = this.id;
        return {
            id: this.id,
            name: this.name,
        };
    }

    public getId(): string | null {
        return this.id;
    }

    public getName(): string {
        return this.name;
    }

    public setName(name: string): void {
        this.name = name;
    }
}
