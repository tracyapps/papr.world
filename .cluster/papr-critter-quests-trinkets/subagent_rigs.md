# Trinket 3D rigs — `src/game/trinketRigs.ts`

**Status:** done. `npx tsc --noEmit` reports **zero errors mentioning `trinketRigs.ts`** (50 pre-existing errors remain in unrelated in-flight files: `sim/game/quests.ts`, `sim/catalogs/quests.ts`, `sim/state.ts`, `game/conversationEngine.ts`, `game/conversationMemory.ts` — none touch this file).

## Exports (exactly as specified)

```ts
export function buildTrinketRig(def: TrinketDef, seed: number): THREE.Group;
export function animateTrinketRig(group: THREE.Group, def: TrinketDef, elapsed: number, delta: number): void;
```

Plus internal-only machinery (all module-private): `SHAPE_BUILDERS`, `EXTRA_SHAPE_BUILDERS`, `WINDUP_TRAITS`, decor/part helpers.

## What it does

- **One builder per shape**, dispatched through `SHAPE_BUILDERS: Record<TrinketShapeId, ShapeBuilder>` (exhaustively type-checked against the union). An unknown shape falls back to a pebble.
  - Covered (28 union shapes): `pebble, cube, sphere, ring, cone, star, heart, leaf, shell, key, button, grain, crystal, spool, bell, acorn, pinwheel, thimble` + all ten `windup-*`.
  - Also covers the runtime-only `'cylinder'` id (three authored defs cast it in: `scrap-bolt`, `bandit-shiny-spoon`, `woodchuck-pencil-stub`) via `EXTRA_SHAPE_BUILDERS`, kept separate so the union record stays exhaustive.
- **All ten wind-up animals** (`mouse, bird, fox, cat, bunny, frog, duck, bear, beetle, fish`) share one parameterised creature builder driven by `WINDUP_TRAITS`: chunky body + chest plate + pivoted head, then parts driven by `def.parts` (`ears`, `tail`, `eyes`, `wings`, `beak`, `fin`, `antenna`, `stripes`, `spots`). Every wind-up toy gets a **visible winding key** (`trinket-key`: axle + torus bow + crossed tabs) on the flank, and eyes are built for all animals (prominent when `eyes` is authored).
- **Generic decor** applied to every shape for `stem`, `feather`, `ribbon`, `hat`, `spots`, `stripes`, `glitter`, using a per-shape bounds frame (`top/radius/centerY`) reported by each builder; parts a shape already handles are marked "consumed" so nothing doubles up.
- **Materials:** `def.textureUrl` → `getResourceSurfaceMaterial(url, [1,1])`, cloned + tinted partway toward `palette.base` (cached by url+colour); otherwise `createColorMaterial(color, roughness)`. Palette `base/accent/detail` drive body/secondary/highlights; a fixed ink tone is used for eyes so they read on any palette.
- **Sizing:** built ~0.16–0.24 units tall with the base on local `y=0`, then `group.scale.setScalar(def.scale)`. All meshes go through `shadowed()`. `group.userData.restY = 0` + `group.userData.trinketId/motion/rig` are set for later code.
- **Determinism:** `createRng((hash(def.id) ^ seed) >>> 0)`; no `Math.random`.

## Animation

All motion is on an inner `trinket-pivot` (the returned group's own transform is never touched), reset to rest each frame so nothing drifts:

| motion | behaviour |
|---|---|
| `still` | imperceptible breathing (pivot `scale.y`) |
| `spin` | slow Y rotation |
| `bob` | vertical float |
| `wobble` | rocks on its base (pivot origin = base) |
| `sway` | lean side to side |
| `flip` | periodic eased full flip with a small lift |
| `orbit` | flyers circle in place with a gentle bank |
| `windup` | toy hop + slow inching yaw + wobble |

The winding key always turns (fast on `windup`, lazy otherwise); wings flap (stronger while walking), heads tip, tails wag, and eyes blink.

## Named tags / handles
`trinket-pivot, trinket-head, trinket-eyes, trinket-ears, trinket-tail, trinket-wings, trinket-fin, trinket-antenna, trinket-feet, trinket-key, trinket-key-spin, trinket-spots, trinket-stripes, trinket-glitter, trinket-hat, trinket-stem, trinket-ribbon, trinket-feather, trinket-star, trinket-key-shape`.

## Robustness
No `any` (userData is read through a typed cast), no external assets, missing/absent parts are skipped gracefully, `def.scale <= 0` falls back to 1.
