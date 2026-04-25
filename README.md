# Pixi Slot Framework

A production-minded slot game **foundation** built with PixiJS v7 + TypeScript
(strict) + Vite. This is a framework, not a finished game — it ships the core
systems a team needs to build real slot titles on top of.

## Quick start

```bash
npm install
npm run dev
```

Then open the URL printed by Vite (default: http://localhost:5173).

Additional scripts:

- `npm run build` — type-check and produce a production bundle in `dist/`.
- `npm run typecheck` — run `tsc --noEmit` only.
- `npm run preview` — serve the production build.

**Node 18+ is required.**

## What's inside

| System | Path | Purpose |
|---|---|---|
| Config | `src/config/gameConfig.json` | Single source of truth. Change reels 3↔5, symbols, paylines, bet limits, free-spin rules here — no code edits. |
| Types | `src/types/index.ts` | Strict public contracts (`GameConfig`, `SpinResult`, `WinLine`, event map). |
| Event Bus | `src/core/EventBus.ts` | Tiny typed pub/sub. The only way modules talk. |
| State Machine | `src/core/GameStateMachine.ts` | `IDLE → SPINNING → RESULT → WIN_PRESENTATION → IDLE`. Event-driven, rejects illegal transitions. |
| Symbol Factory | `src/core/SymbolFactory.ts` | Bakes `Graphics + Text` → `RenderTexture` once; Sprites reuse those textures. |
| Reel | `src/reels/reel.ts` | Recycling strip (no per-spin allocations), `Ticker.delta`-driven motion, ease-out snap. |
| Reel Engine | `src/reels/ReelEngine.ts` | Owns all reels, stagger-stops, emits `reels:stopped`. |
| Free Spins | `src/features/FreeSpinsController.ts` | Extends behavior without adding an FSM state. |
| Win Presentation | `src/features/WinPresentation.ts` | Async-safe count-up + symbol highlights; always resolves. |
| HUD | `src/hud/HUD.ts` | Balance / Bet / Win / Free Spins, spin button gated by FSM. |
| Mock Server | `src/net/MockServer.ts` | Fully typed `SpinResult` generator, drop-in replaceable. |
| Bootstrap | `src/main.ts` | Composition root — wires everything. |

## Where to read next

- **`ARCHITECTURE.md`** — stage tree, state machine diagram, design decisions, tradeoffs.
- **`ONBOARDING.md`** — notes for junior devs: how to extend, what's fragile, onboarding checklist.
- **`SELF_CRITIQUE.md`** — the one section of this code I'm not happy with, and why.

## Try it

- Change `reels.count` in `src/config/gameConfig.json` from `5` to `3` and reload — no code changes needed.
- Land three `★` scatters to trigger 8 free spins at 2× multiplier.
- Open the browser console: `window.__slot` exposes `bus`, `fsm`, `reels` for poking.
