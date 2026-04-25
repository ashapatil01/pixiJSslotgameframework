import * as PIXI from 'pixi.js';
import type { GameConfig } from '../types';

/**
 * Builds the static "chrome" of the scene: the title banner and the reel-well
 * panel behind the reels. Extracted from main.ts so the composition root
 * only wires containers together — it doesn't author them.
 *
 * Container hierarchy:
 *   SceneChrome.title (Text, name="chrome:title")
 *   SceneChrome.reelFrame (Container, name="chrome:reel-frame")
 *     └── panel (Graphics, name="chrome:reel-frame:panel")
 */
export interface SceneChrome {
    readonly title: PIXI.Text;
    readonly reelFrame: PIXI.Container;
}

export function buildSceneChrome(config: GameConfig): SceneChrome {
    /**
     * Title banner: a simple PIXI.Text with some styling. 
     * It's anchored at the top center of the stage and positioned with some margin from the top.
     */
    const title = new PIXI.Text('PIXI SLOT FRAMEWORK', {
        fontFamily: 'Georgia, serif',
        fontSize: 34,
        fontWeight: '900',
        fill: 0xffffff,
        stroke: 0x4dd0ff,
        strokeThickness: 2,
        letterSpacing: 3,
    });
    title.name = 'chrome:title';
    title.anchor.set(0.5, 0);
    title.position.set(config.stage.width / 2, 50);

    /**
     * Reel frame: a container that holds the panel behind the reels.
     */
    const reelFrame = new PIXI.Container();
    reelFrame.name = 'chrome:reel-frame';

    const panel = new PIXI.Graphics();
    panel.name = 'chrome:reel-frame:panel';
    const pw = config.reels.count * (config.reels.symbolSize + config.reels.gap) + 40;
    const ph = config.reels.rows * (config.reels.symbolSize + config.reels.gap) + 40;
    panel.beginFill(0x151925);
    panel.lineStyle({ width: 2, color: 0x4dd0ff, alpha: 0.25 });
    panel.drawRoundedRect(0, 0, pw, ph, 18);
    panel.endFill();
    panel.position.set((config.stage.width - pw) / 2, 120);
    reelFrame.addChild(panel);

    return { title, reelFrame };
}
