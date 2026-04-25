# Onboarding & Junior-Dev Notes

Welcome. Read this before your first PR.

## Day-one checklist

1. Run `npm install && npm run dev`. Confirm the reels spin.
2. Open `src/config/gameConfig.json`. Change `reels.count` from `5` to `3`.
   Reload. Confirm three reels render correctly and wins still work.
3. Open the browser console and type `__slot.fsm.state`. Try `__slot.bus.emit('spin:request', {bet: 1})` — it will spin only when state is `IDLE`. That is **intentional**.
4. Read `ARCHITECTURE.md` end to end. It's ~5 minutes and will save you hours.

## How to add a feature without breaking things

The golden rule: **never reach into another module's internals.** Everything
talks via `EventBus` events defined in `src/types/index.ts → GameEventMap`.

### Walkthrough: "Add a Big Win popup for payouts ≥ 100× bet"

1. Add a new event to `GameEventMap`:
   ```ts
   'bigwin:start': { multiplier: number };
   'bigwin:done':  Record<string, never>;
   ```
2. Create `src/features/BigWin.ts`. Constructor takes the bus. In the
   constructor, `bus.on('state:changed', ...)` and when entering
   `WIN_PRESENTATION` with `totalWin/bet >= 100`, run your animation.
3. When your animation finishes, emit `bigwin:done`. If you want to block
   the FSM from leaving WIN_PRESENTATION until Big Win is over, have
   `WinPresentation` await a `bigwin:done` event before emitting `win:done`.
4. Instantiate `BigWin` in `main.ts`. Add its display object to `fxLayer`.
5. **Do not** modify the FSM unless you're adding a truly new *game* state.
   Big Win is presentation; it lives alongside `WinPresentation`.

## The one thing most likely to break: **reel snap alignment**

`Reel.beginSnap()` does two things at once:
1. Picks a landing offset by adding exactly `stripLength` pitch to the
   current scroll.
2. Rewrites the textures of the slot sprites that will occupy the visible
   window after landing.

If you change `stripLength`, `rows`, or the `scroll / pitch` math, those
two steps can desync and the player will see the snapped-to symbols in
the wrong row. **Symptom:** visible symbols after stop don't match
`SpinResult.stops`.

If you change this code, add a temporary log in `Reel.visibleSymbols`
and a matching one in `main.ts` after `reels:stopped`, and diff them
against `result.stops`. They must match exactly.

## Unintuitive decisions

- **`Free Spins is not an FSM state.** It's a separate controller. Trying
  to add a `FREE_SPINS` state would force every other module to learn
  about it. See `ARCHITECTURE.md §3`.
- **Balance is debited in `main.ts`, not in `HUD`.** HUD is a view —
  never a source of truth.
- **`WinPresentation` uses a `cancelToken`.** If the FSM bounces back to
  `IDLE` (e.g. from a scene change), any in-flight count-up is cancelled
  by incrementing the token. This is why you'll see `if (token !==
  this.cancelToken) return;` inside the loop.

