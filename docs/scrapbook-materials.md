# Scrapbook Materials Catalog

The scrapbook groups resources by practical material family. A family shows one
large total first, then expands into its local varieties. For example, 100 total
sticks might contain 30 Cork Sticks, 13 Bubbletree Sticks, and 57 other twigs.

## Icon Contract

Every category and resource has a stable `iconKey` in `src/world/resources.ts`.
Artwork can change without changing inventory saves or harvest nodes.

Suggested source artwork locations:

```text
assets/source/UI/scrapbook/categories/sticks.svg
assets/source/UI/scrapbook/categories/stones.svg
assets/source/UI/scrapbook/resources/kraft-twigs.svg
assets/source/UI/scrapbook/resources/ribbonwood-sticks.svg
```

Icons should be transparent cutouts, legible at roughly 28–40 CSS pixels, and
include a slightly irregular silhouette. Avoid baking quantity text into them.
Until final icons exist, the scrapbook renders patterned color swatches using the
resource's world-map color.

## Live Catalog

### Sticks & Twigs

- Kraft-paper twigs — `resource.kraft-twigs`
- Ribbonwood sticks — `resource.ribbonwood-sticks`

### Stones & Pebbles

- Bluefold pebbles — `resource.bluefold-pebbles`
- Confetti stones — `resource.confetti-stones`
- Graphite cardstone — `resource.graphite-cardstone`
- Carbon-copy shale — `resource.carbon-copy-shale`

### Fibers & Foliage

- Mossy paper fiber — `resource.mossy-paper-fiber`

### Cardboard & Board

- Sunbaked cardboard — `resource.sunbaked-cardboard`

### Paper Soil & Clay

- Ochre paperclay — `resource.ochre-paperclay`
- Carbon soil — `resource.carbon-soil`

### Seeds & Starts

- Buttonbloom seeds — `resource.buttonbloom-seeds`
- Mend-me seeds — `resource.mend-me-seeds`

## Candidate Varieties

These names are a working art-and-world list, not yet obtainable items. Promote a
name into `RESOURCE_DEFS` when its landscape and harvestable artwork are ready.

### Trees

- Cork Sticks
- Bubbletree Sticks
- Plaidpine Splinters
- Crinkleleaf Stems
- Tinselneedle Twigs
- Newspaper Birch Curls
- Washi Willow Switches
- Candystripe Kindling

### Stone

- Carbon-copy Shale
- Tissue Geodes
- Foil Flint
- Newsprint Slate
- Marblewrap Pebbles
- Graph-paper Gravel
- Chalkfold Chips

### Fiber and Plant Matter

- Tissue Moss
- Crepegrass Fiber
- Vellum Reeds
- Confetti Fluff
- Feltleaf Fuzz
- Dandelion Dots
- Ribbonroot Strands

### Card and Soil

- Corrugated Bark
- Cerealboard Flakes
- Honeycomb Card
- Ochre Paperclay
- Carbon Soil
- Rose Card Dust

Likely future top-level families include Seeds & Petals, Dyes & Inks, and Found
Oddments. Add a family only when it has at least two meaningful varieties; that
keeps the scrapbook from becoming a wall of one-item folders.
