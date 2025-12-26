export type EventListener = (event: Event) => void;

export type LatLonPosition = {
    latitude: number;
    longitude: number;
};


export type ConfigType = {
    vehicles: {
        id: string;
        speed: number;
        start: LatLonPosition;
        end: LatLonPosition;
        connectors: string[]
    }[],
    connectors: {
        id: string;
        connector: string;
        data: { [key: string]: any; }
    }[]
}