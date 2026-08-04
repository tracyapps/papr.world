# Visual Bug Log

Running visual notes for the paper clearing prototype. These are mostly deferred until there are more final-ish assets in the scene and a broader visual pass is worthwhile.

## Open

### VBL-001: Wall siding pattern restarts around window cutouts

- Status: Deferred
- Seen in: `/Users/tapps/Library/CloudStorage/Dropbox/Screenshots/Screenshot 2026-07-08 at 11.33.51 PM.png`
- Area: House wall/window cutouts
- Issue: The siding texture does not continue smoothly around the window. The wall is built from separate box pieces around a rectangular hole, so each piece gets its own UVs and the horizontal siding pattern restarts.
- Likely fix: Replace the wall strips with a single custom wall mesh with a rectangular hole and continuous UVs, or add shared world/object-space UV mapping for all wall pieces.
- Priority: Medium once house building pieces become editable/player-placeable.
- Notes: Window transparency itself is working much better now. This is primarily a texture continuity/art polish issue.

### VBL-002: House interior is visually empty through transparent windows

- Status: Deferred
- Seen in: close house/window views
- Area: Window transparency, house shell
- Issue: Transparent windows can show an empty or flat interior depending on camera angle.
- Likely fix: Add a simple interior backing plane, paper wall thickness, curtains, or a darkened inner paper layer behind placed windows.
- Priority: Low until house interiors are part of the prototype loop.
- Update 2026-07-14: Reverted the simple dark backing plates because they made the windows read blocked instead of transparent. Keep the holes open until there is a more authored interior treatment.

### VBL-003: Roof/wall connection still needs a refined construction pass

- Status: Improved
- Seen in: `output/playwright/house-terrain-alignment.png`
- Area: Roof, wall tops, overhang
- Issue: The roof is now folding upward correctly and no longer cuts down through the house, but the connection is still a prototype fit rather than a believable folded-paper assembly.
- Likely fix: Add ridge fold thickness, eave tabs, small paper overlap seams, and maybe separate roof edge strips.
- Priority: Medium when house assets/pieces are more settled.
- Update 2026-07-14: Added a ridge cap plus front/back eave strips and introduced the second shingle color on the rear roof face. This reads more assembled, but folded tabs/true thickness are still future work.

### VBL-004: Terrain patch edges look too clean

- Status: Deferred
- Seen in: `output/playwright/terrain-hill-materials.png`
- Area: Green hill, cork patch, orange wrapping-paper strip
- Issue: Terrain pieces read as paper surfaces, but the oval patch edges are mathematically clean. Handmade paper should often have cut, torn, folded, or uneven borders.
- Likely fix: Add noisy boundary vertices, use alpha cutout masks for patch edges, or create authored edge variants.
- Priority: Medium after terrain materials and ground-cover assets are expanded.

### VBL-005: Orange wrapping-paper strip has rectangular/smooth ends

- Status: Deferred
- Seen in: `output/playwright/terrain-hill-materials.png`
- Area: Terrain ribbon
- Issue: The orange strip follows the hill height, but its silhouette still feels like a rectangular plane rather than a cut piece of wrapping paper.
- Likely fix: Use a custom ribbon mesh with uneven cut ends, or render it from a transparent cutout texture.
- Priority: Low/medium once path/decoration materials are designed.

### VBL-006: Avatar foot contact is approximate on hills

- Status: Deferred
- Seen in: terrain movement prototype
- Area: Avatar/terrain
- Issue: The avatar follows sampled terrain height, but contact is visual only and may feel floaty while the Y position lerps.
- Likely fix: Separate visual smoothing from collision/contact height, then add a proper character controller when physics comes in.
- Priority: Medium before serious movement testing.

### VBL-007: Prop cutouts need a scale consistency pass

- Status: In progress
- Seen in: trees and window display props
- Area: Flat paper props
- Issue: New asset sizes/cropping are working, but the in-world heights are still hand-tuned. Trees, windows, and future props need a shared scale language.
- Likely fix: Add manifest metadata for intended world height/category, then consume those values instead of hardcoding per prop.
- Priority: Medium once more props exist.
- Update 2026-07-14: Re-aligned the display wall samples so windows, tape, and sticky note share the board rotation and use runtime aspect ratios. Scale is still hand-authored.

### VBL-008: Distant hills/mountains still read like edge props

- Status: Open
- Seen in: `output/playwright/depth-ui-closed.png`, `output/playwright/movable-hud-default.png`
- Area: Far background scenic layers
- Issue: The new hill and mountain SVGs compile and render, but placing them near the current world bounds can still feel like scenery taped to the edge of one cardboard sheet.
- Likely fix: Move distance scenery into a separate parallax/backdrop system with haze/fog and biome/page-driven backdrop hints. Treat these layers as non-interactive far scenery rather than page props.
- Priority: High for the next world-expansion pass.
- Update 2026-07-16: First scenic cutout pass added. Use it as proof that the assets work, not as the final distance solution.

## Watch List

- Semi-transparent assets such as tape should be tested against dark siding, light paper, and patterned paper.
- Repeating material assets should be checked on flat sheets, sloped planes, and curved/warped terrain.
- Generated runtime PNG dimensions should stay visible in the asset manifest so aspect-ratio bugs are easy to spot.
- Shadows should be reviewed after more props are added; current lighting is useful but not art-directed yet.
- HUD widget defaults should be checked on small screens after the draggable/resizable compass and minimap pass.
