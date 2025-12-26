export type EventListener = (event: Event) => void;

export interface LatLonPosition {
    latitude: number;
    longitude: number;
}


export interface ConfigType {
    vehicles: {
        id: string;
        speed: number;
        movementType: string;
        start: LatLonPosition;
        end: LatLonPosition;
        connectors: string[]
    }[],
    connectors: {
        id: string;
        connector: string;
        data: Record<string, string | number | boolean>;
    }[]
}