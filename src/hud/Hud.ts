import * as PIXI from 'pixi.js';
import type { EventBus } from '../core/EventBus';
import type { BetConfig } from '../types';

/**
 * HUD.
 * Heads-Up Display.
 * 
 * the UI layer that shows balance, bet, win, free spins, and buttons like Spin / + / -.
 *
 * Container hierarchy:
 *   HUD.view (Container, name="hud")
 *     ├── meters (Container, name="hud:meters")
 *     │    ├── hud:meter:balance
 *     │    ├── hud:meter:bet
 *     │    ├── hud:meter:win
 *     │    └── hud:meter:freespins
 *     └── controls (Container, name="hud:controls")
 *          ├── hud:btn:bet-minus
 *          ├── hud:btn:bet-plus
 *          └── hud:btn:spin
 *
 * Pure presentation of state emitted by the rest of the system. It never
 * mutates game state directly — it only requests changes via the bus.
 */
export class HUD {
    readonly view: PIXI.Container;

    private readonly meters: PIXI.Container;
    private readonly controls: PIXI.Container;

    private readonly balanceText: PIXI.Text;
    private readonly betText: PIXI.Text;
    private readonly winText: PIXI.Text;
    private readonly freeText: PIXI.Text;

    private readonly spinButton: PIXI.Container;
    private readonly spinLabel: PIXI.Text;
    private readonly betMinus: PIXI.Container;
    private readonly betPlus: PIXI.Container;

    private canSpin = true;
    private bet: number;
    private readonly betCfg: BetConfig;

    constructor(
        private readonly bus: EventBus,
        betCfg: BetConfig,
        initialBalance: number,
    ) {
        this.betCfg = betCfg;
        this.bet = betCfg.default;

        this.view = new PIXI.Container();
        this.view.name = 'hud';

        this.meters = new PIXI.Container();
        this.meters.name = 'hud:meters';

        this.controls = new PIXI.Container();
        this.controls.name = 'hud:controls';

        this.view.addChild(this.meters, this.controls);

        const labelStyle = new PIXI.TextStyle({
            fontFamily: 'Georgia, serif',
            fontSize: 20,
            fill: 0xbfc4cf,
            fontWeight: '600',
        });
        const valueStyle = new PIXI.TextStyle({
            fontFamily: 'Georgia, serif',
            fontSize: 28,
            fill: 0xffffff,
            fontWeight: '900',
        });

        const makeMeter = (key: string, label: string, x: number): PIXI.Text => {
            const g = new PIXI.Container();
            g.name = `hud:meter:${key}`;
            const l = new PIXI.Text(label, labelStyle);
            const v = new PIXI.Text('0', valueStyle);
            v.y = 22;
            g.addChild(l, v);
            g.x = x;
            this.meters.addChild(g);
            return v;
        };

        this.balanceText = makeMeter('balance', 'BALANCE', 0);
        this.betText = makeMeter('bet', 'BET', 220);
        this.winText = makeMeter('win', 'WIN', 380);
        this.freeText = makeMeter('freespins', 'FREE SPINS', 540);

        this.betMinus = makeCircleButton('-', 32, () => this.changeBet(-this.betCfg.step));
        this.betMinus.name = 'hud:btn:bet-minus';
        this.betMinus.position.set(190, 24);

        this.betPlus = makeCircleButton('+', 32, () => this.changeBet(this.betCfg.step));
        this.betPlus.name = 'hud:btn:bet-plus';
        this.betPlus.position.set(340, 24);

        this.spinButton = makePillButton('SPIN', 180, 64, () => {
            if (!this.canSpin) return;
            this.bus.emit('spin:request', { bet: this.bet });
        });
        this.spinButton.name = 'hud:btn:spin';
        this.spinButton.position.set(760, 0);
        this.spinLabel = this.spinButton.getChildByName('label') as PIXI.Text;

        this.controls.addChild(this.betMinus, this.betPlus, this.spinButton);

        this.update({ balance: initialBalance, bet: this.bet, lastWin: 0, freeSpinsLeft: 0 });

        this.bus.on('state:changed', ({ to }) => {
            this.setCanSpin(to === 'IDLE');
        });
        this.bus.on('hud:update', (p) => this.update(p));
        this.bus.on('freespins:awarded', ({ multiplier }) => {
            this.spinLabel.text = `FREE x${multiplier}`;
        });
        this.bus.on('freespins:ended', () => {
            this.spinLabel.text = 'SPIN';
        });
    }

    getBet(): number {
        return this.bet;
    }

    private changeBet(delta: number): void {
        if (!this.canSpin) return;
        const next = Math.max(this.betCfg.min, Math.min(this.betCfg.max, this.bet + delta));
        this.bet = next;
        this.betText.text = String(next);
    }

    private setCanSpin(v: boolean): void {
        this.canSpin = v;
        this.spinButton.alpha = v ? 1 : 0.45;
        this.spinButton.eventMode = v ? 'static' : 'none';
        this.betMinus.alpha = v ? 1 : 0.45;
        this.betPlus.alpha = v ? 1 : 0.45;
        this.betMinus.eventMode = v ? 'static' : 'none';
        this.betPlus.eventMode = v ? 'static' : 'none';
    }

    private update(p: { balance: number; bet: number; lastWin: number; freeSpinsLeft: number }): void {
        this.balanceText.text = String(p.balance);
        this.betText.text = String(p.bet);
        this.winText.text = String(p.lastWin);
        this.freeText.text = String(p.freeSpinsLeft);
    }
}

function makePillButton(
    label: string,
    w: number,
    h: number,
    onClick: () => void,
): PIXI.Container {
    const c = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(0xffb84d);
    bg.drawRoundedRect(0, 0, w, h, h / 2);
    bg.endFill();
    const txt = new PIXI.Text(label, {
        fontFamily: 'Georgia, serif',
        fontSize: 26,
        fontWeight: '900',
        fill: 0x101218,
    });
    txt.name = 'label';
    txt.anchor.set(0.5);
    txt.position.set(w / 2, h / 2);
    c.addChild(bg, txt);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointerdown', onClick);
    c.on('pointerover', () => (bg.tint = 0xffffff));
    c.on('pointerout', () => (bg.tint = 0xdddddd));
    bg.tint = 0xdddddd;
    return c;
}

function makeCircleButton(
    label: string,
    h: number,
    onClick: () => void,
): PIXI.Container {
    const c = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(0x23283a);
    bg.lineStyle({ width: 2, color: 0x4dd0ff, alpha: 0.5 });
    bg.drawCircle(0, 0, h / 2);
    bg.endFill();
    const txt = new PIXI.Text(label, {
        fontFamily: 'Georgia, serif',
        fontSize: 22,
        fontWeight: '900',
        fill: 0x4dd0ff,
    });
    txt.anchor.set(0.5);
    c.addChild(bg, txt);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointerdown', onClick);
    return c;
}
