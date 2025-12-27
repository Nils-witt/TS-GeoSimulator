export type EventListener = (event: Event) => void;

export interface LatLonPosition {
    latitude: number;
    longitude: number;
}


export interface ConfigType {
    vehicles: {
        enabled: boolean;
        id: string;
        speed: number;
        movementType: string;
        simulator: string,
        data: Record<string, string | number | boolean | LatLonPosition>;
        connectors: string[]
    }[],
    connectors: {
        id: string;
        connector: string;
        data: Record<string, string | number | boolean>;
    }[]
}