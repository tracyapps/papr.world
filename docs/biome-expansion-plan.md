# Biome expansion: living world pass

Status: implementation begun 2026-09-19.

## Built in the first pass

- Six continuous-field biomes: swamp, wetland, rocky highlands, savanna,
  badlands, and bamboo forest.
- Biome ground papers plus the newly supplied trees, bamboo, shrubs, flowers,
  grasses, fungi, moss, and rock formations.
- Every new living tree and low plant participates in the renewable trim and
  time-derived regrowth system. Rock formations now use the separate `mine`
  action and their own time-derived reformation records.
- A regional surface material and three-layer dig table for every new biome.
- Procedural ponds and occasional lakes in wet country. They use the same
  registered-water system as the river and appear on the treasure map.
- Six additional plantable crops: lotus, marsh reed, sunpaper, bamboo shoots,
  alpine herbs, and prickly pears.
- Three new multi-step builds (garden arbor, picnic table, footbridge) and a
  second playable gardening lesson/tool rung.

## Wildlife rollout

Wildlife lands biome by biome so each species arrives with a rig, locomotion,
water/canopy behavior, conversation vocabulary, and tests—not just a spawn
name. Planned homes:

| Biome | Signature wildlife | Behavior dependency |
| --- | --- | --- |
| Swamp | frogs, turtles, dragonflies | amphibious hopping, swimming, hovering |
| Wetland | ducks, frogs, turtles, dragonflies | swim-to-shore transitions and flocking |
| Rocky highlands | llamas | slope-aware herd movement |
| Savanna | armadillos | curling flourish and burrow pauses |
| Badlands | armadillos | heat-rest and burrow behavior |
| Bamboo forest | pandas | bamboo browsing and heavy quadruped rig |
| Tropical / forest edge | ocelots | stalking, climbing, and shy-cat behavior |

Recommended order: frogs + ducks (prove amphibious movement), armadillos +
llamas (prove new ground silhouettes), pandas (bamboo browsing), turtles
(persistent slow swimmer), dragonflies (water-biased flight), then ocelots
(climb/stalk behavior shared with later predators).

## Next system slices

1. **Built:** surface `mine` against the rock formation registry. The Tin
   Snips Pick works all generated rock artwork, drops biome-specific stone,
   and each formation reforms in six real-world minutes. Cave walls remain a
   later, stronger-tool target.
2. **Built (2026-09-20):** shallow-water planting for lotus and reeds. They
   root in shallow water without a dug bed; deep water, crossings, and other
   footprints still block. Ordinary and planter beds keep working.
3. **Built (2026-09-20):** build plans are recipe knowledge granted by three
   ready tree nodes (garden structures, outdoor furniture, simple crossings).
   Deeper placement waits on ready nodes being allowed to depend on concept
   nodes, or on those concept nodes becoming ready. Hammer-tier gates stay.
4. Add larger structures only after partial assemblies gain visible in-world
   scaffolds; the current multi-step jobs persist progress but show the final
   model only when complete.
