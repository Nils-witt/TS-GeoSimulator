import {LatLonPosition, TimedLatLonPosition} from '../Types';

export class SimulatorPositionUpdateEvent extends Event {

    private position: LatLonPosition | TimedLatLonPosition | null;

    constructor(position: LatLonPosition | TimedLatLonPosition | null = null) {
        super('positionUpdate');
        this.position = position;
    }

    getPosition(): LatLonPosition | TimedLatLonPosition | null {
        return this.position;
    }
}