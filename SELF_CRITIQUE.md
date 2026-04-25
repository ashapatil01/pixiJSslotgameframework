# Self-Critique

The section I'm least happy with is the current implementation of **`Reel.beginSnap()`** in
`src/reels/Reel.ts`. is functional but mixes responsibilities and introduces scaling concerns. 
This section documents its behavior, limitations, and proposed improvements.


## What it does

At the moment a server result arrives, `beginSnap()` has to do two things
at once:

1. Pick a `targetScroll` that is exactly `stripLength * pitch` ahead of
   the current `scroll`, so the ease-out has room to land.
2. Rewrite the textures of the slot sprites that will occupy the visible
   window after the snap, so the final frame shows the server's result.

## Why I don't like it

- **It mixes concerns.** Animation scheduling and logical "what symbol is
  where" are solved in the same function. A future change that reshapes
  either — e.g. variable-height symbols, or a "tease" stop that bounces
  back one row — will touch both layers simultaneously. That's a smell.
- **It assumes `landingIndex = currentIndex + stripLength`.** The `+
  stripLength` is a magic number: it guarantees we won't visually skip
  past the landing row, but it also couples snap duration loosely to
  strip length. If someone bumps `stripLength` without thinking, the snap
  suddenly takes "more distance" to travel and looks different.
- **The booleans `spinning` / `snapping` are two state flags standing in
  for three phases.** A third phase like "anticipation hold" (a slight
  pause before the last reel lands when a win is imminent) won't fit
  cleanly; we'd end up with a third boolean and an implicit priority
  order.

## Proposed Improvements

1. Extract a `ReelSnapPlanner` that takes `(currentScroll, pitch,
   stripLength, targetStops)` and returns
   `{ targetScroll, slotTextureAssignments }`. Pure function, trivially
   unit-testable, no PIXI dependency.
2. Promote `spinning` / `snapping` into a small internal enum
   (`ReelPhase = Idle | Spinning | Snapping | Anticipating`) with a single
   `update(phase, deltaMS)` dispatch. Today those live as two booleans,
   which would not scale to a third case.
3. Move the stagger-stop scheduler off of `setTimeout` and onto the
   ticker, so tab throttling can't distort the timing band between the
   first and last reel landing.

## What I DID fix from the earlier pass

In the first commit I flagged that `Reel.beginSnap()` was allocating a
throwaway `Sprite` just to read its shared texture during a snap swap.
That is resolved: `SymbolFactory` now exposes a pure
`getTexture(id): PIXI.Texture` and the reel swaps `.texture` directly.


## Why I shipped the rest anyway

For a take-home that emphasizes *framework shape* over *feature depth*,
spending that hour on the snap internals would have come at the cost of
the pieces that actually demonstrate architectural thinking — the FSM,
the event bus, the config-driven layout, the free-spins-as-side-car
pattern, and the intentional container hierarchy. I'd rather show the
framework's *joints* are clean and flag this as tracked technical debt
than have a pristine `Reel` inside a framework that's less obviously
extensible.
