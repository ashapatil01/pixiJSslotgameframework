import type { EventBus } from '../core/EventBus';
import type { FreeSpinsConfig } from '../types';

/**
 * Free Spins controller.
 *
 * This is a *parallel* feature — it does NOT add a state to the core FSM.
 * Instead it:
 *   1. Listens for spin results with scatter triggers and increments its
 *      internal counter.
 *   2. When Idle is reached and counter > 0, auto-emits `spin:request`.
 *   3. Emits `freespins:consumed` / `freespins:ended` for the HUD.
 *
 * This is the requested "extend without modifying core states" pattern.
 */
export class FreeSpinsController {
  private remaining = 0;
  private multiplier = 1;    // Win multiplier during free spins
  /** The bet locked in at the moment free spins were awarded. */
  private lockedBet = 0;  // This ensures that free spins always use the same bet, even if the player changes it mid-session.

  constructor(
    private readonly cfg: FreeSpinsConfig,
    private readonly bus: EventBus,
    private readonly getCurrentBet: () => number,
  ) {
    this.bus.on('spin:result', ({ result }) => {
      if (result.awardedFreeSpins > 0) {
        if (this.remaining === 0) this.lockedBet = this.getCurrentBet();
        this.remaining += result.awardedFreeSpins;
        this.multiplier = this.cfg.multiplier;
        this.bus.emit('freespins:awarded', {
          count: result.awardedFreeSpins,
          multiplier: this.multiplier,
        });
      }
    });

    this.bus.on('state:changed', ({ to }) => {
      if (to !== 'IDLE') return;
      if (this.remaining <= 0) return;
      this.remaining -= 1;
      this.bus.emit('freespins:consumed', { remaining: this.remaining });
      // Queue next spin on the next tick so UI has a chance to repaint.
      setTimeout(() => {
        this.bus.emit('spin:request', { bet: this.lockedBet });
      }, 250);
      if (this.remaining === 0) {
        // After last consumed spin completes, end the session.
        this.bus.emit('freespins:ended', {});
      }
    });
  }

  get isActive(): boolean {
    return this.remaining > 0;
  }

  get remainingSpins(): number {
    return this.remaining;
  }

  get winMultiplier(): number {
    return this.isActive ? this.multiplier : 1;
  }
}
