import * as PIXI from 'pixi.js';
import type { EventBus } from '../core/EventBus';
import type { SymbolFactory } from '../core/SymbolFactory';
import type { GameConfig, SpinResult } from '../types';
import { Reel } from './reel';

/**
 * Owns every Reel and orchestrates spin start/stop.
 *
 * Container hierarchy:
 *   ReelEngine.view (Container, name="reels")
 *     ├── reel[0]   (Container, name="reel")
 *     ├── reel[1]   ...
 *     └── reel[n]
 */
export class ReelEngine {
  readonly view: PIXI.Container;
  private readonly reels: Reel[] = [];

  constructor(
    private readonly config: GameConfig,
    factory: SymbolFactory,
    private readonly bus: EventBus,
  ) {
    this.view = new PIXI.Container();
    this.view.name = 'reels';

    const r = config.reels;
    for (let i = 0; i < r.count; i += 1) {
      const reel = new Reel(r, config.symbols, factory);
      reel.view.x = i * (r.symbolSize + r.gap);
      this.reels.push(reel);
      this.view.addChild(reel.view);
    }
  }

  startSpin(): void {
    for (const reel of this.reels) reel.clearTints();
    for (const reel of this.reels) reel.startSpin();
    this.bus.emit('spin:started', { bet: 0 });
  }

  applyResult(result: SpinResult): void {
    const stagger = this.config.reels.stopStaggerMs;
    let remaining = this.reels.length;
    this.reels.forEach((reel, i) => {
      const stops = result.stops[i]!;
      setTimeout(() => {
        reel.stopAt(stops, () => {
          remaining -= 1;
          if (remaining === 0) {
            this.bus.emit('reels:stopped', { result });
          }
        });
      }, i * stagger);
    });
  }

  update(deltaMS: number): void {
    for (const reel of this.reels) reel.update(deltaMS);
  }

  highlightWins(result: SpinResult, tint = 0xffe066): void {
    for (const win of result.wins) {
      for (const [reelIdx, rowIdx] of win.positions) {
        this.reels[reelIdx]?.tintVisibleRow(rowIdx, tint);
      }
    }
  }

  clearHighlights(): void {
    for (const reel of this.reels) reel.clearTints();
  }
}
