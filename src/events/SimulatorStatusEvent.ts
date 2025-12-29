export class SimulatorStatusEvent extends Event {

    private status: number;

    constructor(status: number) {
        super('statusUpdate');
        this.status = status;
    }

    getStatus(): number {
        return this.status;
    }
}