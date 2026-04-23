import * as PIXI from 'pixi.js';
import type { EventBus } from '../core/EventBus';
import type { ReelEngine } from '../reels/ReelEngine';
import type { SpinResult } from '../types';

/**
 * Win presentation.
 * 
 * This class is responsible for showing the win animation + amount after a spin finishes.
 *
 * Container hierarchy:
 *   WinPresentation.view (Container, name="fx:win")
 *     └── winText (Text, name="fx:win:amount")
 *
 * Requirements:
 *  - Async-safe: uses timers but always resolves `win:done` exactly once.
 *  - Does not block the FSM: when presentation finishes, we emit `win:done`
 *    and the FSM transitions back to IDLE.
 */
export class WinPresentation {
  readonly view: PIXI.Container;
  private readonly winText: PIXI.Text;
  private cancelToken = 0;

  constructor(
    private readonly bus: EventBus,
    private readonly reels: ReelEngine,
  ) {
    this.view = new PIXI.Container();
    this.view.name = 'fx:win';

    this.winText = new PIXI.Text('', {
      fontFamily: 'Georgia, serif',
      fontSize: 48,
      fontWeight: '900',
      fill: 0xffe066,
      stroke: 0x000000,
      strokeThickness: 6,
    });
    this.winText.name = 'fx:win:amount';
    this.winText.anchor.set(0.5);
    this.winText.visible = false;
    this.view.addChild(this.winText);

    this.bus.on('state:changed', ({ to }) => {
      if (to === 'IDLE') {
        this.cancel();
        this.reels.clearHighlights();
        this.winText.visible = false;
      }
    });
  }

  /** Anchor the text within this container. Caller still positions `view`. */
  setLocalPosition(x: number, y: number): void {
    this.winText.position.set(x, y);
  }

  async present(result: SpinResult, multiplier: number): Promise<void> {
    this.cancelToken += 1;
    const token = this.cancelToken;

    const effectiveWin = result.totalWin * multiplier;
    this.reels.highlightWins(result);

    if (effectiveWin > 0) {
      this.winText.visible = true;
      const steps = 20;
      for (let i = 1; i <= steps; i += 1) {
        if (token !== this.cancelToken) return;
        const shown = Math.round((effectiveWin * i) / steps);
        this.winText.text = `WIN ${shown}`;
        await wait(30);
      }
      await wait(600);
    }
    if (token !== this.cancelToken) return;

    this.reels.clearHighlights();
    this.winText.visible = false;
    this.bus.emit('win:done', { totalWin: effectiveWin });
  }

  private cancel(): void {
    this.cancelToken += 1;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
