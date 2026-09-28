/** A unit as known to the go-unit-management API (see ApiConnector). */
export interface IUnit {
    id?: string;
    name: string;
}

export class Unit {
    private id: string | null;
    private name: string;

    constructor(data: IUnit) {
        this.id = data.id || null;
        this.name = data.name;
    }

    public static of(data: IUnit): Unit {
        return new Unit(data);
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
