import * as PIXI from 'pixi.js';
import type { ReelsConfig, ReelStop, SymbolDef, SymbolId } from '../types';
import type { SymbolFactory } from '../core/SymbolFactory';

/**
 * This is a single slot reel implementation built with PixiJS. 
 * It handles spinning, stopping, and reusing sprites efficiently (no constant creation/destruction).
 * 
 * You have a fixed number of sprite slots
 * You move them vertically (scroll)
 * When a symbol goes off-screen → reuse it at the top with a new texture
 *
 * Container hierarchy:
 *   Reel.view (Container, name="reel")
 *     ├── mask      (Graphics, NOT a display child — assigned via view.mask)
 *     └── content   (Container, name="reel:content") — holds every slot sprite
 *
 * Physical model:
 *   - We keep `stripLength` sprite "slots" in a vertical column INSIDE `content`.
 *   - As the reel spins we advance a `scroll` offset in pixels.
 *   - When a slot drops below the visible window, it is RECYCLED to the top
 *     (position adjusted + texture re-assigned). No sprites are created
 *     per spin — only textures are swapped.
 *
 * Timing model (frame-rate independent):
 *   - `deltaMS` from PIXI.Ticker drives both spin velocity and snap easing.
 */
export class Reel {
  readonly view: PIXI.Container;                 //The root container you add to the stage
  private readonly content: PIXI.Container;      //Holds all symbol sprites, This is what actually “scrolls”
  private readonly slots: PIXI.Sprite[] = [];    //Each sprite = one symbol position
  private readonly slotSymbols: SymbolId[] = []; //Keeps symbol IDs aligned with sprites

  private readonly slotPitch: number;           //Distance between each slot (symbol height + gap)
  private readonly visibleRows: number;         // How many rows are visible at once (from config)

  private scroll = 0;                            // Current scroll position (in pixels)  ie how far we’ve moved
  private velocity = 0;                          // Current scroll velocity (in pixels/ms) ie speed

  private spinning = false;                       // Is the reel currently spinning?
  private snapStart = 0;                          // Start time of the snap (in ms)
  private snapFrom = 0;                           // Scroll position at the start of the snap
  private snapTo = 0;                             // Target scroll position at the end of the snap
  private snapDurationMs = 0;                     // Duration of the snap (in ms)
  private snapping = false;                        // Is the reel currently snapping?
  private onStopped: (() => void) | null = null;   // Callback when the reel stops

  private pendingStops: ReelStop | null = null;   // The target stop we're aiming for on the next snap. Set by `stopAt()`. (Stores which symbols should land)

  constructor(
    private readonly cfg: ReelsConfig,
    private readonly symbols: readonly SymbolDef[],
    private readonly factory: SymbolFactory,
  ) {
    this.slotPitch = cfg.symbolSize + cfg.gap;
    this.visibleRows = cfg.rows;

    this.view = new PIXI.Container();
    this.view.name = 'reel';

    // Mask to the visible window so recycled slots above/below don't show.
    // mask - It hides everything outside a rectangle
    const maskGfx = new PIXI.Graphics();
    maskGfx.name = 'reel:mask';
    maskGfx.beginFill(0xffffff);
    maskGfx.drawRect(0, 0, cfg.symbolSize, this.slotPitch * this.visibleRows - cfg.gap);
    maskGfx.endFill();

    this.content = new PIXI.Container();
    this.content.name = 'reel:content';

    // Add the mask as a sibling of content (common PIXI pattern) and bind it.
    this.view.addChild(maskGfx, this.content);
    this.content.mask = maskGfx;

    // Build slots inside `content` — enough to cover the visible area + buffer.
    for (let i = 0; i < cfg.stripLength; i += 1) {
      const id = this.randomSymbolId();
      const sprite = factory.createSprite(id);
      sprite.name = `reel:slot:${i}`;
      sprite.position.set(cfg.symbolSize / 2, 0);
      this.slots.push(sprite);
      this.slotSymbols.push(id);
      this.content.addChild(sprite);
    }
    this.layout();
  }

  startSpin(): void {
    this.spinning = true;
    this.snapping = false;
    this.velocity = this.slotPitch * 0.035;
  }

  stopAt(target: ReelStop, done: () => void): void {
    this.pendingStops = target;
    this.onStopped = done;
    this.beginSnap();
  }

  update(deltaMS: number): void {
    if (this.snapping) {
      const t = Math.min(1, (performance.now() - this.snapStart) / this.snapDurationMs);
      const eased = 1 - Math.pow(1 - t, 3);                     // Cubic ease-out for a smooth deceleration curve
      this.scroll = this.snapFrom + (this.snapTo - this.snapFrom) * eased;
      this.layout();
      if (t >= 1) {
        this.snapping = false;
        this.spinning = false;
        this.velocity = 0;
        const cb = this.onStopped;
        this.onStopped = null;
        cb?.();
      }
      return;
    }
    if (this.spinning) {
      this.scroll += this.velocity * deltaMS;
      this.layout();
    }
  }

  private beginSnap(): void {
    if (!this.pendingStops) return;

    const pitch = this.slotPitch;
    const currentIndex = Math.floor(this.scroll / pitch);
    const landingIndex = currentIndex + this.cfg.stripLength;
    const targetScroll = landingIndex * pitch;

    const stripLen = this.cfg.stripLength;
    for (let row = 0; row < this.visibleRows; row += 1) {
      const virtualIndex = landingIndex + row;
      const slotIdx = ((virtualIndex % stripLen) + stripLen) % stripLen;
      const id = this.pendingStops[row]!;
      this.slotSymbols[slotIdx] = id;
      this.slots[slotIdx]!.texture = this.factory.getTexture(id);
    }
    for (let i = 0; i < stripLen; i += 1) {
      const isLanding = ((i - (landingIndex % stripLen) + stripLen) % stripLen) < this.visibleRows;
      if (!isLanding) {
        const id = this.randomSymbolId();
        this.slotSymbols[i] = id;
        this.slots[i]!.texture = this.factory.getTexture(id);
      }
    }

    this.snapFrom = this.scroll;
    this.snapTo = targetScroll;
    this.snapDurationMs = this.cfg.decelerationMs;
    this.snapStart = performance.now();
    this.snapping = true;
  }

  private layout(): void {
    const pitch = this.slotPitch;
    const stripLen = this.cfg.stripLength;
    const totalHeight = pitch * stripLen;
    for (let i = 0; i < stripLen; i += 1) {
      let y = i * pitch - (this.scroll % totalHeight);
      if (y < -pitch) y += totalHeight;
      if (y >= totalHeight - pitch) y -= totalHeight;
      this.slots[i]!.y = y + this.cfg.symbolSize / 2;
    }
  }

  private randomSymbolId(): SymbolId {
        const nonScatter = this.symbols.filter((s) => !s.isScatter);
        return nonScatter[Math.floor(Math.random() * nonScatter.length)]!.id;
  }

  tintVisibleRow(row: number, tint: number): void {
    const sorted = this.slots
      .map((s, i) => ({ sprite: s, y: s.y, id: this.slotSymbols[i]! }))
      .sort((a, b) => a.y - b.y);
    const visible = sorted.filter(
      (o) => o.y >= 0 && o.y <= this.slotPitch * this.visibleRows,
    );
    const target = visible[row];
    if (target) target.sprite.tint = tint;
  }

  clearTints(): void {
    for (const s of this.slots) s.tint = 0xffffff;
  }
}
