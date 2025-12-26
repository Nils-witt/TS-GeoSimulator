import {LatLonPosition} from "../Types";

export class PositionUpdateEvent extends Event {

    private position: LatLonPosition | null;

    constructor(position: LatLonPosition | null = null) {
        super("positionUpdate");
        this.position = position;
    }

    getPosition(): LatLonPosition | null {
        return this.position;
    }
}