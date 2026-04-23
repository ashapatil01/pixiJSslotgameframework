import type { GameEventMap, GameEventName } from '../types';

type Handler<K extends GameEventName> = (payload: GameEventMap[K]) => void;

/**
 * It lets different parts of your app communicate without directly depending on each other.
 *
 * Instead of one module calling another directly, you:
 * emit an event → “something happened”
 * other parts of the app listen (on) for that event and react
 *
 * This implementation is strongly typed, so:
 * You can’t use invalid event names
 * You can’t pass the wrong payload shape
 */
export class EventBus {
    private readonly handlers = new Map<GameEventName, Set<Handler<GameEventName>>>();


    /** Subscribe to an event
     * Gets (or creates) a handler set for the event
     */
    on<K extends GameEventName>(event: K, handler: Handler<K>): () => void {
        let bucket = this.handlers.get(event);
        if (!bucket) {
            bucket = new Set();
            this.handlers.set(event, bucket);
        }
        bucket.add(handler as Handler<GameEventName>);
        return () => this.off(event, handler);
    }

    /**
     * Removes a handler from the event’s set
     */
    off<K extends GameEventName>(event: K, handler: Handler<K>): void {
        this.handlers.get(event)?.delete(handler as Handler<GameEventName>);
    }

    /**
     * Trigger an event
     */
    emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void {
        const bucket = this.handlers.get(event);
        if (!bucket) return;
        // Copy to avoid mutation-during-iteration if a handler unsubscribes.
        for (const h of [...bucket]) {
            try {
                (h as Handler<K>)(payload);
            } catch (err) {
                // Don't let one bad listener break the whole chain.
                console.error(`[EventBus] handler for "${String(event)}" threw:`, err);
            }
        }
    }

    /**
     * Remove everything
     * Wipes all event subscriptions
     */
    clear(): void {
        this.handlers.clear();
    }
}
