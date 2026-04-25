# Architecture

This document explains **why** the code looks the way it does. Read this
before touching anything important.

## 1. Composition root

`src/main.ts` is the single place where modules are instantiated and wired
together. Nothing else constructs services. This matters because:

- Dependency direction is one-way (downward). No module reaches "up" to
  reconfigure another.
- Replacing `MockServer` with a real client is a one change in `main.ts`.
- Tests can spin up an alternative composition root without touching module
  internals.

## 2. Stage tree (intentional, exhaustive, named)

Every container and meaningful display object has a `.name`. This is what
the code actually builds — not aspirational.

```
app.stage
└── scene                         (Container,  name="scene:GameContainer")
    ├── scene:bg                  (Container)  ← backgroundLayer
    │   └── chrome:reel-frame     (Container)
    │       └── chrome:reel-frame:panel  (Graphics)
    │
    ├── scene:gameplay            (Container)  ← gameplayLayer
    │   └── reels                 (Container)  ← ReelEngine.view
    │       └── reel              (Container)  ← Reel.view  × N
    │           ├── reel:mask     (Graphics, assigned as content.mask, sibling in tree)
    │           └── reel:content  (Container, holds every slot)
    │               └── reel:slot:i (Sprite)   × stripLength
    │
    ├── scene:fx                  (Container)  ← fxLayer
    │   └── fx:win                (Container)  ← WinPresentation.view
    │       └── fx:win:amount     (Text) 
    │
    └── scene:ui                  (Container)  ← uiLayer
        ├── chrome:title          (Text)
        └── hud                   (Container)  ← HUD.view
            ├── hud:meters        (Container)
            │   ├── hud:meter:balance     (Container → label + value)
            │   ├── hud:meter:bet         (Container → label + value)
            │   ├── hud:meter:win         (Container → label + value)
            │   └── hud:meter:freespins   (Container → label + value)
            └── hud:controls      (Container)
                ├── hud:btn:bet-minus     (Container: Graphics+Text)
                ├── hud:btn:bet-plus      (Container: Graphics+Text)
                └── hud:btn:spin          (Container: Graphics+Text "label")
```

### Why this shape?

- **Z-order is implicit but deterministic.** Layers are added in the order
  `bg → gameplay → fx → ui`. We never use `zIndex` — ordering is a side
  effect of `addChild` sequence, which is easier to reason about in a small
  team.
- **Each layer has a single responsibility.** Background art never knows
  about the FSM; FX never knows about buttons; UI never knows about reel
  physics. Moving a display object between layers is the *only* thing you
  need to do to reorder concerns.
- **`scene` is a real container, not the stage.** This lets us scale the
  whole game uniformly later (e.g. for a proper canvas-agnostic fit) and
  plug in global filters (bloom, grayscale "paused" mode) by filtering one
  node instead of the stage.
- **Reel has its own `content` sub-container.** The mask is a sibling; the
  sprites live inside `content` which is what gets masked. This is the
  canonical PIXI masking pattern and avoids the classic "mask also clips
  its own children" confusion.
- **HUD has `meters` and `controls` sub-containers.** Each group can be
  positioned, hidden, or filtered as a unit — e.g. greying out the controls
  without affecting the meters during WIN_PRESENTATION is one line.

## 3. Data flow (event-driven, not call-driven)

All inter-module communication goes through a typed `EventBus`. The FSM is
the only module allowed to *decide* what state the game is in; every other
module *reacts* to `state:changed`.

```
User click
   │  bus.emit('spin:request', {bet})
   ▼
GameStateMachine  ──►  state:changed (IDLE→SPINNING)
   │
   ▼
main.ts handler: debits balance, calls reels.startSpin(),
                 awaits server.spin() + min-spin-time in parallel.
   │
   ▼
ReelEngine.applyResult(result) ──► per-reel stagger stop
   │
   ▼
All reels snapped ──► bus.emit('reels:stopped', {result})
   │
   ▼
main.ts relays ──► bus.emit('spin:result', {result})
   │
   ▼
GameStateMachine branches:
   - totalWin > 0 or awardedFreeSpins > 0  ──► WIN_PRESENTATION
   - else                                   ──► IDLE
   │
   ▼
WinPresentation.present() runs async, emits 'win:done'
   │
   ▼
GameStateMachine ──► IDLE (FreeSpinsController may auto-emit spin:request)
```

### Why this shape?

1. **The FSM has no knowledge of reels, HUD, or network.** That makes it
   trivially unit-testable: feed it events, assert state transitions.
2. **The Reel/Engine has no knowledge of the FSM.** It exposes physical
   actions (`startSpin`, `applyResult`) and broadcasts when the physics
   finishes. The FSM can be reimplemented without touching reels.
3. **Free spins does not add a state.** It is a parallel controller that
   piggy-backs on the existing `IDLE` transition to re-emit `spin:request`.
   This keeps the core FSM graph finite and predictable forever.

## 4. State machine

```
        spin:request
IDLE ───────────────────► SPINNING
  ▲                          │
  │ (no win / no scatters)   │ reels:stopped
  │                          ▼
  └──────────── RESULT ◄──── (branch)
            spin:result │
          (win or fs>0) │
                        ▼
                  WIN_PRESENTATION
                        │ win:done
                        ▼
                      IDLE
```

Illegal transitions are **rejected with a console warn** in dev. Production
builds should raise this to a telemetry event.

## 5. Reel physics

- Each reel contains a fixed number of Sprite slots (stripLength).
- No new sprites are created during spins — all slots are reused.
- A scroll value (in pixels) drives vertical movement.
- Slot positions are recalculated using modulo wrapping: Offscreen symbols reappear at the top (recycling technique).
- Stopping uses ease-out cubic interpolation: Smooth deceleration from current position → target position.
- During stop: Final visible symbols are forced by swapping textures (from result).
- Animation is frame-rate independent: Uses deltaMS from ticker (no fixed 60 FPS assumptions).

## 6. Textures

- All symbols are baked **once** on boot in `SymbolFactory.build()`, via
  `renderer.render(container, { renderTexture })`.
- Sprites hold references to those shared `RenderTexture` instances. To
  change a visible symbol during a snap, we swap `.texture` — never recreate
  Sprites.

## 7. Configuration

`src/config/gameConfig.json` is imported directly (Vite's JSON loader gives
us typed data at build-time). To add a reel, change `reels.count`. To add a
symbol, append to `symbols` and reference its id in `payLines`. **No code
changes.** The only compile-time coupling is the `GameConfig` type — which
is intentionally a blueprint of the JSON.

### PIXI.Assets

Even though this demo bakes symbols at runtime and has no external art, we
still register a bundle (`game:core`) through `PIXI.Assets.addBundle` and
await `loadBundle`. This is on purpose: it shows the shape of production
wiring where atlases, fonts, and spine skeletons get declared up-front and
loaded by key — never ad-hoc `Assets.load(url)` calls scattered across
modules.

## 8. Network boundary

`MockServer.spin()` returns `Promise<SpinResult>`. `SpinResult` is fully
typed — no `any` anywhere in the pipeline. Replacing the mock with a real
HTTP/WebSocket client is a drop-in. **Game timing is not coupled to network
speed:** `main.ts` awaits `Promise.all([server.spin(), sleep(minSpinMs)])`.

## 9. Tradeoffs 

1. **`setTimeout` for stagger stops.** Simple and works, but tab-throttling
   can stretch it. Acceptable for a slot UX; for leaderboard-sensitive games
   I'd move this onto the ticker too.
2. **Financial state lives in `main.ts`.** Fine for a framework; a real
   product wants a proper `WalletService` with ledger semantics so refunds
   and free-spin bookkeeping survive reconnects.
3. **Mock RNG is in the client.** Correct for a take-home; a real product
   has server-authoritative RNG and treats the client purely as a replay.
4. **Z-order is positional, not explicit.** If the layer count grows,
   switching to `sortableChildren + zIndex` becomes worth it.

## 10. Extending this framework

| You want to… | You change… |
|---|---|
| Add a new symbol | `gameConfig.json` → `symbols[]` |
| Add a payline | `gameConfig.json` → `payLines[]` |
| Re-skin a symbol | `SymbolFactory.bake()` |
| Change the state graph | `GameStateMachine.TRANSITIONS` + emit new events |
| Wire a real server | Replace `MockServer` in `main.ts` |
| Add Big Win FX | New module whose `view` is a `Container`, added to `scene:fx` |
| Disable controls but keep meters lit | Set `hud:controls.alpha = 0.3`, done |
