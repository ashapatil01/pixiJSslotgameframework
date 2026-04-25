import * as PIXI from 'pixi.js';
import type { SymbolDef, SymbolId } from '../types';

/**
 * This class is all about creating slot symbols efficiently in PixiJS by drawing them once and reusing them many times.
 *
 * Normally in PixiJS:
 * You create shapes (Graphics) + text (Text)
 * Add them to the screen
 *
 * But that’s expensive if repeated many times
 *
 * So instead:
 * Draw the symbol once
 * Convert it into a texture (image in GPU memory)
 * Reuse that texture for many sprites
 */

export class SymbolFactory {
  private readonly textures = new Map<SymbolId, PIXI.RenderTexture>();

  constructor(
    private readonly renderer: PIXI.IRenderer,
    private readonly size: number,
  ) {}

 
  build(defs: readonly SymbolDef[]): void {
    for (const def of defs) {
      if (this.textures.has(def.id)) continue;
      this.textures.set(def.id, this.bake(def));
    }
  }


  getTexture(id: SymbolId): PIXI.Texture {
    const tex = this.textures.get(id);
    if (!tex) throw new Error(`SymbolFactory: unknown symbol id "${id}"`);
    return tex;
  }


  createSprite(id: SymbolId): PIXI.Sprite {
    const sprite = new PIXI.Sprite(this.getTexture(id));
    sprite.anchor.set(0.5);
    return sprite;
  }


  destroy(): void {
    for (const tex of this.textures.values()) {
      tex.destroy(true);
    }
    this.textures.clear();
  }

  private bake(def: SymbolDef): PIXI.RenderTexture {
    const s = this.size;
    const container = new PIXI.Container();

    const bg = new PIXI.Graphics();
    const color = new PIXI.Color(def.color).toNumber();
    bg.beginFill(color, 1);
    bg.lineStyle({ width: 4, color: 0x000000, alpha: 0.25, alignment: 0 });
    bg.drawRoundedRect(0, 0, s, s, s * 0.14);
    bg.endFill();

    const gloss = new PIXI.Graphics();
    gloss.beginFill(0xffffff, 0.18);
    gloss.drawRoundedRect(s * 0.08, s * 0.08, s * 0.84, s * 0.28, s * 0.1);
    gloss.endFill();

    const label = new PIXI.Text(def.label, {
      fontFamily: 'Georgia, serif',
      fontSize: Math.round(s * (def.isScatter ? 0.62 : 0.52)),
      fontWeight: '900',
      fill: 0x101218,
      stroke: 0xffffff,
      strokeThickness: Math.max(2, s * 0.03),
      align: 'center',
    });
    label.anchor.set(0.5);
    label.position.set(s / 2, s / 2);

    container.addChild(bg, gloss, label);

    const rt = PIXI.RenderTexture.create({
      width: s,
      height: s,
      resolution: this.renderer.resolution,
    });
    this.renderer.render(container, { renderTexture: rt });

    container.destroy({ children: true });
    return rt;
  }
}
