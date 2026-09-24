/*
 * Entity.ts
 * ---------
 * Base class for application entities that need event dispatching and record handling.
 * Exports: Entity base class and DBRecord type
 * Purpose: centralize common behavior used by derived entity classes.
 */

export type DBRecord = Record<string, string | number | boolean | null | object>;

export class Entity {

    private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};


    public on(event: string, listener: (...args: unknown[]) => void): void {
        // Implementation for adding an event listener
        if (!this.listeners[event]) {
            this.listeners[event] = [];

        }
        this.listeners[event].push(listener);
    }

    public off(event: string, listener: (...args: unknown[]) => void): void {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    }

    public notify(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners[event] || []) {
            listener(...args);
        }
    }

    public record(): DBRecord {
        return {};
    }

    public of(data: DBRecord): Entity {
        throw new Error(`Method not implemented. Must be overridden in subclass. ${Object.entries(data).length}`);
    }
}