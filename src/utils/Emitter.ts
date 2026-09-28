import {EventListener} from '../Types';

/** Minimal synchronous event dispatcher keyed by `Event.type`. */
export class Emitter {
    private listeners = new Map<string, EventListener[]>();

    on(eventName: string, listener: EventListener): void {
        const list = this.listeners.get(eventName);
        if (list) {
            list.push(listener);
        } else {
            this.listeners.set(eventName, [listener]);
        }
    }

    emit(event: Event): void {
        for (const listener of this.listeners.get(event.type) ?? []) {
            listener(event);
        }
    }
}
