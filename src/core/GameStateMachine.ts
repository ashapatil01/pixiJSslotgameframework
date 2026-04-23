import { GameState, type GameStateValue } from '../types';
import type { EventBus } from './EventBus';

/**
 * This is a finite state machine (FSM) that controls your game flow using the event bus instead of direct method calls. 
 * It acts like a traffic controller—deciding what’s allowed to happen next.
 *
 * Rules:
 *  - External code NEVER calls `reels.stop()` or similar directly. They emit
 *    an event on the bus, and this machine decides whether the transition is
 *    legal and emits `state:changed` accordingly.
 *  - Free Spins is NOT a state here. It is a parallel controller that just
 *    re-emits `spin:request` when appropriate. That keeps the core graph
 *    finite and predictable.
 */

/**
 * Idle → Spinning → Result → (WinPresentation OR Idle)
 * WinPresentation → Idle
 */
const TRANSITIONS: Readonly<Record<GameStateValue, readonly GameStateValue[]>> = {
    [GameState.Idle]: [GameState.Spinning],
    [GameState.Spinning]: [GameState.Result],
    [GameState.Result]: [GameState.WinPresentation, GameState.Idle],
    [GameState.WinPresentation]: [GameState.Idle],
};

export class GameStateMachine {
    private current: GameStateValue = GameState.Idle;

    constructor(private readonly bus: EventBus) {
        this.bus.on('spin:request', () => this.tryTransition(GameState.Spinning));
        this.bus.on('reels:stopped', () => this.tryTransition(GameState.Result));
        this.bus.on('spin:result', ({ result }) => {
            if (result.totalWin > 0 || result.awardedFreeSpins > 0) {
                this.tryTransition(GameState.WinPresentation);
            } else {
                this.tryTransition(GameState.Idle);
            }
        });
        this.bus.on('win:done', () => this.tryTransition(GameState.Idle));
    }

    get state(): GameStateValue {
        return this.current;
    }

    canTransition(to: GameStateValue): boolean {
        return TRANSITIONS[this.current].includes(to);
    }

    private tryTransition(to: GameStateValue): void {
        if (!this.canTransition(to)) {
            console.warn(`[FSM] Illegal transition: ${this.current} -> ${to}`);
            return;
        }
        const from = this.current;
        this.current = to;
        this.bus.emit('state:changed', { from, to });
    }
}
