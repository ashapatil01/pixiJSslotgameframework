import * as PIXI from 'pixi.js';
import gameConfigJson from './config/gameConfig.json';
import type { GameConfig, SpinResult } from './types';
import { EventBus } from './core/EventBus';
import { GameStateMachine } from './core/GameStateMachine';
import { SymbolFactory } from './core/SymbolFactory';
import { ReelEngine } from './reels/ReelEngine';
import { MockServer } from './net/MockServer';
import { FreeSpinsController } from './features/FreeSpinsController';
import { WinPresentation } from './features/WinPresentation';
import { HUD } from './hud/Hud';
import { buildSceneChrome } from './core/SceneChrome';

/**
 * Application bootstrap and composition root.
 * basically where everything is created, connected, and started.
 *
 * Container hierarchy:
 *
 *   app.stage
 *   └── scene               (Container, name="scene:GameContainer")
 *       ├── backgroundLayer (Container, name="scene:BackgroundLayer")
 *       │   └── chrome:reel-frame
 *       │       └── chrome:reel-frame:panel
 *       ├── gameplayLayer   (Container, name="scene:gameplay(ReelContainer)")
 *       │   └── reels       (Container, name="reels")
 *       │       └── reel × N
 *       │           ├── reel:mask
 *       │           └── reel:content
 *       │               └── reel:slot:i × stripLength
 *       ├── fxLayer         (Container, name="scene:WinLayer")
 *       │   └── fx:win
 *       │       └── fx:win:amount
 *       └── uiLayer         (Container, name="scene:HUDLayer(ui)")
 *           ├── chrome:title
 *           └── hud
 *               ├── hud:meters (balance / bet / win / freespins)
 *               └── hud:controls (bet-minus / bet-plus / spin)
 */
async function bootstrap(): Promise<void> {
  const config = gameConfigJson as unknown as GameConfig;

  /**
   * PIXI Application is the root of everything. It creates the canvas, starts the game loop, 
   * and holds the root stage container. We configure it with our desired width, height, background color, and resolution.
   */
  const app = new PIXI.Application({
    width: config.stage.width,
    height: config.stage.height,
    backgroundColor: PIXI.utils.string2hex(config.stage.backgroundColor),
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  // Expose PIXI Application to Chrome DevTools for inspection
  (window as unknown as { __PIXI_APP__?: PIXI.Application }).__PIXI_APP__ = app;

  document.getElementById('app')!.appendChild(app.view as HTMLCanvasElement);

  // v7 PIXI.Assets bundle declaration.
  PIXI.Assets.addBundle('game:core', {});
  await PIXI.Assets.loadBundle('game:core');

  // ---- Core services ----
  const bus = new EventBus();
  const fsm = new GameStateMachine(bus);

  // ---- Symbol baking (Graphics + Text -> RenderTexture) ----
  const factory = new SymbolFactory(app.renderer, config.reels.symbolSize);
  factory.build(config.symbols);

  // ---- Stage tree: build from the top down, one layer at a time. ----
  const scene = new PIXI.Container();
  scene.name = 'scene:GameContainer';
  app.stage.addChild(scene);

  /**
   * We have 4 layers: background, gameplay, fx, and UI. Each is a Container with a descriptive name for easy debugging.
   */
  const backgroundLayer = new PIXI.Container();
  backgroundLayer.name = 'scene:BackgroundLayer';

  const gameplayLayer = new PIXI.Container();
  gameplayLayer.name = 'scene:gameplay(ReelContainer)';

  const fxLayer = new PIXI.Container();
  fxLayer.name = 'scene:WinLayer';

  const uiLayer = new PIXI.Container();
  uiLayer.name = 'scene:HUDLayer(ui)';

  // Order of addChild determines render order (lowest = behind).
  scene.addChild(backgroundLayer, gameplayLayer, fxLayer, uiLayer);

  /**
   * The "chrome" of the scene: the title banner and the reel-well panel behind the reels.
   * Static chrome (panel + title).
   */
  const chrome = buildSceneChrome(config);
  backgroundLayer.addChild(chrome.reelFrame);
  uiLayer.addChild(chrome.title);

 /**
  * ReelEngine: owns the reels, their spin/stop logic, and exposes a simple API to start a spin and apply results.
  */
  const reels = new ReelEngine(config, factory, bus);
  const pw = config.reels.count * (config.reels.symbolSize + config.reels.gap);
  reels.view.position.set(
    (config.stage.width - pw) / 2 + config.reels.gap / 2,
    140,
  );
  gameplayLayer.addChild(reels.view);

/**
 * WinPresentation: handles the presentation of win animations and effects.
 */
  const winFX = new WinPresentation(bus, reels);
  const ph = config.reels.rows * (config.reels.symbolSize + config.reels.gap);
  winFX.setLocalPosition(config.stage.width / 2, 140 + ph / 2 - 20);
  fxLayer.addChild(winFX.view);

 /**
  * HUD: shows the player's balance, current bet, last win, and free spins. Also contains controls to adjust bet and start spins.
  */
  const hud = new HUD(bus, config.bet, config.balance.initial);
  hud.view.position.set(60, config.stage.height - 110);
  uiLayer.addChild(hud.view);

/**
 * FreeSpinsController: manages the logic of awarding free spins when the player hits enough scatters, and tracks remaining free spins and their multiplier.
 */
  const freeSpins = new FreeSpinsController(config.freeSpins, bus, () => hud.getBet());

/**
 * MockServer: simulates the backend spin server. It generates deterministic spin results based on the bet and some randomness, allowing us to develop the game without a real backend.
 */
  const server = new MockServer(config);

  // ---- Financial state (composition-root-owned, NOT in HUD) ----
  let balance = config.balance.initial;
  let lastWin = 0;
  let pendingResult: SpinResult | null = null;

  /**
   * Helper to refresh the HUD with the latest financial state. Called after any change to balance, bet, last win, or free spins.
   */
  const refreshHud = (): void => {
    bus.emit('hud:update', {
      balance,
      bet: hud.getBet(),
      lastWin,
      freeSpinsLeft: freeSpins.remainingSpins,
    });
  };

/**
 * Event handlers: connect the dots between user actions, game logic, and state changes. 
 * The bus decouples everything so that, for example, the ReelEngine doesn't need to know about the server or the FSM.
 */
  bus.on('spin:request', async ({ bet }) => {
    if (!freeSpins.isActive) {
      if (balance < bet) {
        console.warn('Insufficient balance');
        return;
      }
      balance -= bet;
    }
    refreshHud();
    reels.startSpin();

    const [result] = await Promise.all([
      server.spin(bet),
      new Promise((r) => setTimeout(r, config.reels.spinDurationMs)),
    ]);
    pendingResult = result;
    reels.applyResult(result);
  });

  bus.on('reels:stopped', ({ result }) => {
    bus.emit('spin:result', { result });
  });

  bus.on('state:changed', async ({ to }) => {
    if (to === 'WIN_PRESENTATION' && pendingResult) {
      const mult = freeSpins.winMultiplier;
      const payout = pendingResult.totalWin * mult;
      balance += payout;
      lastWin = payout;
      refreshHud();
      await winFX.present(pendingResult, mult);
      pendingResult = null;
    }
    if (to === 'IDLE') {
      pendingResult = null;
      refreshHud();
    }
  });

/**
 * Game loop: we add an update function to the PIXI ticker that updates the reels every frame. 
 * The delta is converted to milliseconds and passed to the ReelEngine, which updates the position of each reel and handles the spinning animation.
 */
  app.ticker.add((delta) => {
    const deltaMS = (delta * 1000) / 60;
    reels.update(deltaMS);
  });

/**
 * Responsive scaling: we want the game to scale to fit the available space while maintaining aspect ratio.
 */
  const fit = (): void => {
    const el = document.getElementById('app')!;
    const scale = Math.min(
      el.clientWidth / config.stage.width,
      el.clientHeight / config.stage.height,
    );
    const c = app.view as HTMLCanvasElement;
    c.style.width = `${config.stage.width * scale}px`;
    c.style.height = `${config.stage.height * scale}px`;
  };
  window.addEventListener('resize', fit);
  fit();
  refreshHud();

  // Console-debug hook. Type `__slot.printTree()` to walk the hierarchy.
  (window as unknown as { __slot: unknown }).__slot = {
    app,
    bus,
    fsm,
    reels,
    scene,
    config,
    printTree: () => printTree(app.stage),
  };
}

/**
 * Prints the display hierarchy of a PIXI container.
 * @param node The root node to print.
 * @param depth The current depth in the hierarchy.
 */
function printTree(node: PIXI.DisplayObject, depth = 0): void {
  const name = (node as PIXI.Container).name ?? node.constructor.name;
  console.log(`${'  '.repeat(depth)}${name} (${node.constructor.name})`);
  const c = node as PIXI.Container;
  if (c.children) for (const child of c.children) printTree(child, depth + 1);
}

void bootstrap();
