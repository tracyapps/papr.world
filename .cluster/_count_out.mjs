// src/sim/catalogs/trinketVariants.ts
var WINDUP_SHAPES = [
  "windup-mouse",
  "windup-bird",
  "windup-fox",
  "windup-cat",
  "windup-bunny",
  "windup-frog",
  "windup-duck",
  "windup-bear",
  "windup-beetle",
  "windup-fish"
];
var M = "/assets/runtime/materials";
var PALETTES = [
  { name: "Rosewood", base: "#b45e67", accent: "#8a3b47", detail: "#f0c9cf" },
  { name: "Kraft", base: "#c1935f", accent: "#8a5f33", detail: "#f0dcb8", textureUrl: `${M}/construction-paper-brown-2.png` },
  { name: "Notebook", base: "#f4f1e8", accent: "#c2bdb0", detail: "#4f7ab8" },
  { name: "Cork", base: "#b1824f", accent: "#7a5531", detail: "#5c3f24", textureUrl: `${M}/cork-board.png` },
  { name: "Confetti", base: "#e0a0c0", accent: "#c07a9c", detail: "#f7e0ee" },
  { name: "Pond", base: "#6f8fbd", accent: "#41608a", detail: "#c7d7ec" },
  { name: "Moss", base: "#5b8849", accent: "#3d6330", detail: "#a8c98d" },
  { name: "Brass", base: "#c9903c", accent: "#8f6624", detail: "#f0d79a" },
  { name: "Terracotta", base: "#c1531f", accent: "#8a3a16", detail: "#f0d5a1" },
  { name: "Chalk", base: "#dfe3e8", accent: "#aab2bb", detail: "#f7f9fb" },
  { name: "Graphite", base: "#8d8781", accent: "#5b5550", detail: "#c9c2ba" },
  { name: "Sunbleach", base: "#e8d6a8", accent: "#c2ab74", detail: "#fbf1d8" },
  { name: "Argyle", base: "#c9c4bb", accent: "#8f8a84", detail: "#4f7a8a", textureUrl: `${M}/argyle-child-bluegreen.png` },
  { name: "Bubblegum", base: "#e58fb4", accent: "#bf5f8c", detail: "#fbdcea", textureUrl: `${M}/subtle-bubbles-pinkyellows.png` },
  { name: "Ribbon", base: "#d98cb1", accent: "#b0568a", detail: "#f6dcea", textureUrl: `${M}/ribbon-weave-pink.png` },
  { name: "Monstera", base: "#4f7f5a", accent: "#2f5a3c", detail: "#a8d0a0", textureUrl: `${M}/monstera-patch.png` },
  { name: "Camo", base: "#b9a878", accent: "#8a7a4f", detail: "#e6dcc0", textureUrl: `${M}/camouflage-blobs-desert.png` },
  { name: "Clementine", base: "#e08a3c", accent: "#b0621f", detail: "#f7d9a8", textureUrl: `${M}/wrapping-paper-orange-01.png` },
  { name: "Weave", base: "#d7a0a0", accent: "#b06060", detail: "#f7e0e0", textureUrl: `${M}/ribbon-weave-salmon.png` },
  { name: "Ring dot", base: "#8fb0c4", accent: "#5f8a9c", detail: "#dff0f4", textureUrl: `${M}/wrapping-paper-circles-01.png` },
  { name: "Aquasquare", base: "#5fa8b8", accent: "#3d7a8a", detail: "#dff0f4", textureUrl: `${M}/3d-squares-aqua.png` },
  { name: "Deep blue", base: "#3d5a94", accent: "#263c66", detail: "#a8c0e6", textureUrl: `${M}/curving-deeper-blues.png` },
  { name: "Rainbow", base: "#d879c5", accent: "#9c4f9a", detail: "#f2c9ee", textureUrl: `${M}/curving-deeper-rainbow.png` },
  { name: "Winterfrost", base: "#dff0f7", accent: "#a8cfe0", detail: "#ffffff", season: "winter" },
  { name: "Autumnash", base: "#d1663a", accent: "#9c4120", detail: "#f2c14e", season: "autumn" },
  { name: "Springbud", base: "#c98fb0", accent: "#9a6284", detail: "#e8cfe0", season: "spring" },
  { name: "Summerskip", base: "#9aa7a0", accent: "#6d7a73", detail: "#cdd7d2", season: "summer" }
];
var SHAPES = [
  { id: "pebble", label: "Pebble", families: ["natural", "found"], motions: ["still", "wobble"], parts: [[], ["glitter"], ["spots"]], tags: ["material:stone"], rarity: 1 },
  { id: "cube", label: "Block", families: ["found", "handmade"], motions: ["still", "wobble", "spin"], parts: [[], ["ribbon"], ["hat"]], tags: ["paper"], rarity: 1 },
  { id: "sphere", label: "Orb", families: ["curious", "natural"], motions: ["bob", "spin"], parts: [[], ["glitter"], ["stem"]], tags: ["keepsake"], rarity: 2 },
  { id: "ring", label: "Ring", families: ["found", "curious"], motions: ["spin", "wobble"], parts: [[], ["glitter"]], tags: ["metal"], rarity: 2 },
  { id: "cone", label: "Fold", families: ["handmade"], motions: ["bob", "still"], parts: [[], ["wings"], ["stem"]], tags: ["paper", "craft"], rarity: 1 },
  { id: "star", label: "Star", families: ["curious", "found"], motions: ["spin", "bob"], parts: [[], ["glitter", "hat"]], tags: ["metal"], rarity: 2 },
  { id: "heart", label: "Heart", families: ["story", "seasonal"], motions: ["bob", "sway"], parts: [[], ["ribbon"], ["stem"]], tags: ["keepsake"], rarity: 2 },
  { id: "leaf", label: "Leaf", families: ["natural", "seasonal"], motions: ["sway", "still"], parts: [["stem"], ["stem", "feather"], ["stem", "stripes"]], tags: ["plant"], rarity: 1 },
  { id: "shell", label: "Shell", families: ["natural"], motions: ["still"], parts: [[], ["glitter"], ["stripes"]], tags: ["shell"], rarity: 2 },
  { id: "key", label: "Key", families: ["curious", "found"], motions: ["still", "wobble"], parts: [["glitter"], ["glitter", "ribbon"]], tags: ["metal"], rarity: 2 },
  { id: "button", label: "Button", families: ["found", "story"], motions: ["spin", "still"], parts: [["spots"], ["spots", "glitter"]], tags: ["button"], rarity: 1 },
  { id: "grain", label: "Grain", families: ["natural"], motions: ["still"], parts: [["stripes"], ["glitter"]], tags: ["seed"], rarity: 1 },
  { id: "crystal", label: "Crystal", families: ["curious", "seasonal"], motions: ["spin", "still", "sway"], parts: [["glitter"], ["glitter", "stem"]], tags: ["glass"], rarity: 3 },
  { id: "spool", label: "Spool", families: ["handmade"], motions: ["sway", "spin"], parts: [["ribbon"], ["ribbon", "glitter"]], tags: ["craft", "thread"], rarity: 2 },
  { id: "bell", label: "Bell", families: ["handmade", "found"], motions: ["sway", "wobble"], parts: [["ribbon"], ["glitter"], ["hat"]], tags: ["sound"], rarity: 2 },
  { id: "acorn", label: "Acorn", families: ["natural", "story"], motions: ["still", "bob"], parts: [["stem"], ["stem", "spots"]], tags: ["material:wood"], rarity: 1 },
  { id: "pinwheel", label: "Pinwheel", families: ["handmade"], motions: ["spin"], parts: [["stem"], ["stem", "glitter"]], tags: ["toy", "craft"], rarity: 2 },
  { id: "thimble", label: "Thimble", families: ["found", "handmade"], motions: ["still", "wobble"], parts: [["spots"], ["spots", "glitter"]], tags: ["metal", "craft"], rarity: 2 }
];
var WINDUPS = [
  { id: "windup-mouse", label: "Wind-up Mouse", parts: ["ears", "tail", "eyes", "key"], tags: ["windup", "toy"], rarity: 1 },
  { id: "windup-bird", label: "Wind-up Bird", parts: ["beak", "eyes", "wings", "key"], tags: ["windup", "toy"], rarity: 2 },
  { id: "windup-fox", label: "Wind-up Fox", parts: ["ears", "tail", "eyes", "key"], tags: ["windup", "toy"], rarity: 3 },
  { id: "windup-cat", label: "Wind-up Cat", parts: ["ears", "tail", "eyes", "key"], tags: ["windup", "toy"], rarity: 3 },
  { id: "windup-bunny", label: "Wind-up Bunny", parts: ["ears", "eyes", "tail", "key"], tags: ["windup", "toy"], rarity: 2 },
  { id: "windup-frog", label: "Wind-up Frog", parts: ["eyes", "spots", "key"], tags: ["windup", "toy"], rarity: 2 },
  { id: "windup-duck", label: "Wind-up Duck", parts: ["beak", "eyes", "wings", "key"], tags: ["windup", "toy"], rarity: 2 },
  { id: "windup-bear", label: "Wind-up Bear", parts: ["ears", "eyes", "key"], tags: ["windup", "toy"], rarity: 3 },
  { id: "windup-beetle", label: "Wind-up Beetle", parts: ["antenna", "stripes", "key"], tags: ["windup", "toy"], rarity: 2 },
  { id: "windup-fish", label: "Wind-up Fish", parts: ["fin", "eyes", "stripes", "key"], tags: ["windup", "toy"], rarity: 2 }
];
function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function buildDef(shapeId, shapeLabel, shapeTagList, family, rarity, motion, parts, palette, paletteIndex) {
  const partSig = parts.length > 0 ? `-${parts.join("").slice(0, 10)}` : "";
  return {
    id: `gen-${slug(shapeId)}-${paletteIndex}${partSig}-${motion}`,
    label: `${palette.name} ${shapeLabel}`,
    description: `${shapeLabel} in ${palette.name.toLowerCase()} paper, ${motionPhrase(motion)}.`,
    family,
    shape: shapeId,
    motion,
    parts: [...parts],
    palette: { base: palette.base, accent: palette.accent, detail: palette.detail },
    textureUrl: palette.textureUrl ?? null,
    scale: 0.9 + (paletteIndex + shapeTagList.length) % 5 * 0.08,
    rarity,
    tags: [
      ...shapeTagList,
      ...palette.season ? [`seasonal:${palette.season}`] : [],
      ...WINDUP_SHAPES.includes(shapeId) ? ["windup"] : []
    ]
  };
}
function motionPhrase(motion) {
  switch (motion) {
    case "still":
      return "perfectly still";
    case "spin":
      return "turning slowly";
    case "bob":
      return "bobbing gently";
    case "wobble":
      return "rocking on its base";
    case "windup":
      return "wound up and ready to go";
    case "sway":
      return "swaying in a paper breeze";
    case "flip":
      return "flipping over now and then";
    case "orbit":
      return "drifting in a slow circle";
  }
}
var TRINKET_GENERATED_DEFS = (() => {
  const defs = [];
  for (const shape of SHAPES) {
    PALETTES.forEach((palette, paletteIndex) => {
      shape.motions.forEach((motion, motionIndex) => {
        const parts = shape.parts[(paletteIndex + motionIndex) % shape.parts.length];
        const family = shape.families[(paletteIndex + motionIndex) % shape.families.length];
        defs.push(buildDef(shape.id, shape.label, shape.tags, family, shape.rarity, motion, parts, palette, paletteIndex));
      });
    });
  }
  for (const windup of WINDUPS) {
    PALETTES.forEach((palette, paletteIndex) => {
      if (paletteIndex % 2 === 1) return;
      const family = palette.season ? "seasonal" : "handmade";
      defs.push(buildDef(windup.id, windup.label, windup.tags, family, windup.rarity, "windup", windup.parts, palette, paletteIndex));
    });
  }
  return defs;
})();

// src/sim/catalogs/trinkets.ts
var M2 = "/assets/runtime/materials";
var TRINKET_AUTHORED_DEFS = {
  "lucky-paperclip": {
    id: "lucky-paperclip",
    label: "Lucky Paperclip",
    description: "Bent a little out of shape from a very good day.",
    family: "found",
    shape: "ring",
    motion: "wobble",
    parts: ["glitter"],
    palette: { base: "#cfd6dd", accent: "#8f9aa6", detail: "#f4f6f8" },
    scale: 1,
    rarity: 1,
    tags: ["toy", "metal"]
  },
  "smooth-blue-stone": {
    id: "smooth-blue-stone",
    label: "Smooth Blue Pebble",
    description: "Worn round by the blue paper pond. Perfect for a pocket.",
    family: "natural",
    shape: "pebble",
    motion: "still",
    parts: [],
    palette: { base: "#6f8fbd", accent: "#41608a", detail: "#c7d7ec" },
    scale: 1,
    rarity: 1,
    tags: ["material:stone", "biome:clearing"]
  },
  "cork-acorn": {
    id: "cork-acorn",
    label: "Cork Acorn",
    description: "An acorn with a little cap that never quite fits.",
    family: "natural",
    shape: "acorn",
    motion: "still",
    parts: ["stem"],
    palette: { base: "#b1824f", accent: "#7a5531", detail: "#5c3f24" },
    textureUrl: `${M2}/cork-board.png`,
    scale: 1,
    rarity: 1,
    tags: ["material:wood", "biome:forest"]
  },
  "twisty-ribbon": {
    id: "twisty-ribbon",
    label: "Twisty Ribbon",
    description: "A curl of ribbon that refuses to lie flat.",
    family: "handmade",
    shape: "spool",
    motion: "sway",
    parts: ["ribbon"],
    palette: { base: "#d98cb1", accent: "#b0568a", detail: "#f6dcea" },
    scale: 1,
    rarity: 1,
    tags: ["toy", "craft"]
  },
  "brass-thimble": {
    id: "brass-thimble",
    label: "Brass Thimble",
    description: "Dimpled all over and slightly warm, as if recently worn.",
    family: "found",
    shape: "thimble",
    motion: "still",
    parts: ["spots"],
    palette: { base: "#c9903c", accent: "#8f6624", detail: "#f0d79a" },
    scale: 1,
    rarity: 2,
    tags: ["metal", "craft"]
  },
  "folded-paper-crane": {
    id: "folded-paper-crane",
    label: "Folded Paper Crane",
    description: "Somebody practiced this one a great many times.",
    family: "handmade",
    shape: "cone",
    motion: "bob",
    parts: ["wings", "beak"],
    palette: { base: "#f4f1e8", accent: "#c9c2b2", detail: "#cf4f38" },
    scale: 1.05,
    rarity: 2,
    tags: ["craft", "paper"]
  },
  "windup-mouse-grey": {
    id: "windup-mouse-grey",
    label: "Grey Wind-up Mouse",
    description: "Turns in a determined little circle until it runs down.",
    family: "handmade",
    shape: "windup-mouse",
    motion: "windup",
    parts: ["ears", "tail", "eyes", "key"],
    palette: { base: "#a9a29a", accent: "#7b746c", detail: "#2b2622" },
    scale: 1,
    rarity: 2,
    tags: ["toy", "windup"]
  },
  "windup-frog-green": {
    id: "windup-frog-green",
    label: "Green Wind-up Frog",
    description: "Hops once, thinks about it, hops once more.",
    family: "handmade",
    shape: "windup-frog",
    motion: "windup",
    parts: ["eyes", "key", "spots"],
    palette: { base: "#7fae5c", accent: "#5a8a3f", detail: "#2f3a22" },
    scale: 1,
    rarity: 2,
    tags: ["toy", "windup"]
  },
  "windup-duck-yellow": {
    id: "windup-duck-yellow",
    label: "Yellow Wind-up Duck",
    description: "Waddles in a tight, pleased circle.",
    family: "handmade",
    shape: "windup-duck",
    motion: "windup",
    parts: ["beak", "eyes", "key", "wings"],
    palette: { base: "#f0c14b", accent: "#d79b2b", detail: "#e08a2a" },
    scale: 1,
    rarity: 2,
    tags: ["toy", "windup"]
  },
  "windup-fox-rust": {
    id: "windup-fox-rust",
    label: "Rust Wind-up Fox",
    description: "Its key clicks twice, then it trots a perfect little arc.",
    family: "handmade",
    shape: "windup-fox",
    motion: "windup",
    parts: ["ears", "tail", "eyes", "key"],
    palette: { base: "#c1531f", accent: "#8a3a16", detail: "#f0d5a1" },
    scale: 1,
    rarity: 3,
    tags: ["toy", "windup", "biome:dunes"]
  },
  "glass-paperweight": {
    id: "glass-paperweight",
    label: "Glass Paperweight",
    description: "Something small and green is pressed inside it forever.",
    family: "curious",
    shape: "sphere",
    motion: "still",
    parts: ["stem", "glitter"],
    palette: { base: "#bcd8d6", accent: "#7fb0ad", detail: "#5b8849" },
    scale: 1.1,
    rarity: 3,
    tags: ["glass", "keepsake"]
  },
  "stamped-button": {
    id: "stamped-button",
    label: "Stamped Button",
    description: "A button with a tiny mountain pressed into it.",
    family: "found",
    shape: "button",
    motion: "spin",
    parts: ["spots"],
    palette: { base: "#cf4f38", accent: "#96311f", detail: "#f7d9c9" },
    scale: 1,
    rarity: 1,
    tags: ["toy", "button"]
  },
  "pinecone-curl": {
    id: "pinecone-curl",
    label: "Curled Pinecone",
    description: "Opens its little paper scales when nobody is looking.",
    family: "natural",
    shape: "cone",
    motion: "still",
    parts: ["stripes"],
    palette: { base: "#8a5a34", accent: "#5f3d22", detail: "#c1935f" },
    textureUrl: `${M2}/construction-paper-brown-3.png`,
    scale: 1.05,
    rarity: 1,
    tags: ["material:wood", "biome:forest"]
  },
  "sea-shell-spiral": {
    id: "sea-shell-spiral",
    label: "Spiral Shell",
    description: "Hold it up and the whole paper sky rushes past your ear.",
    family: "natural",
    shape: "shell",
    motion: "still",
    parts: [],
    palette: { base: "#f2e3d0", accent: "#d6b894", detail: "#b78f63" },
    scale: 1,
    rarity: 2,
    tags: ["shell", "biome:clearing"]
  },
  "tiny-brass-key": {
    id: "tiny-brass-key",
    label: "Tiny Brass Key",
    description: "It fits something. Nobody has found what.",
    family: "curious",
    shape: "key",
    motion: "still",
    parts: ["glitter"],
    palette: { base: "#c9903c", accent: "#8f6624", detail: "#f0d79a" },
    scale: 1,
    rarity: 2,
    tags: ["metal", "keepsake"]
  },
  "clover-print-token": {
    id: "clover-print-token",
    label: "Clover-print Token",
    description: "Four leaves, printed slightly off-centre, which is luckier.",
    family: "story",
    shape: "leaf",
    motion: "sway",
    parts: ["stem"],
    palette: { base: "#5b8849", accent: "#3d6330", detail: "#a8c98d" },
    scale: 1,
    rarity: 1,
    tags: ["plant", "biome:meadow"]
  },
  "matchbox-lantern": {
    id: "matchbox-lantern",
    label: "Matchbox Lantern",
    description: "A whole tiny room you can carry in one hand.",
    family: "handmade",
    shape: "cube",
    motion: "sway",
    parts: ["hat"],
    palette: { base: "#e3b25c", accent: "#b07f31", detail: "#fff3d0" },
    scale: 1,
    rarity: 2,
    tags: ["craft", "light"]
  },
  "ribbon-knot-bell": {
    id: "ribbon-knot-bell",
    label: "Ribbon-knot Bell",
    description: "A very small bell on a very proud bow.",
    family: "handmade",
    shape: "bell",
    motion: "sway",
    parts: ["ribbon", "glitter"],
    palette: { base: "#d9b23c", accent: "#8f6a1f", detail: "#f2d98a" },
    scale: 1,
    rarity: 2,
    tags: ["craft", "sound"]
  },
  "tideline-glass": {
    id: "tideline-glass",
    label: "Tideline Glass",
    description: "Sea-worn and soft-edged, the colour of shallow water.",
    family: "natural",
    shape: "pebble",
    motion: "still",
    parts: ["glitter"],
    palette: { base: "#9fc8c2", accent: "#6b9a94", detail: "#dff0ec" },
    scale: 1,
    rarity: 2,
    tags: ["glass", "biome:clearing"]
  },
  "snowdrop-resin": {
    id: "snowdrop-resin",
    label: "Snowdrop Resin",
    description: "A flower caught mid-fall and kept that way.",
    family: "seasonal",
    shape: "crystal",
    motion: "still",
    parts: ["stem", "glitter"],
    palette: { base: "#e8f0f4", accent: "#b7cbd6", detail: "#8fae9a" },
    scale: 1,
    rarity: 3,
    tags: ["seasonal:winter", "keepsake"]
  },
  "sunwarm-shard": {
    id: "sunwarm-shard",
    label: "Sun-warm Shard",
    description: "Still faintly warm from a whole day in the dunes.",
    family: "seasonal",
    shape: "crystal",
    motion: "spin",
    parts: ["glitter"],
    palette: { base: "#f0b548", accent: "#c07d1f", detail: "#fbe6b0" },
    scale: 1,
    rarity: 3,
    tags: ["seasonal:summer", "biome:dunes"]
  },
  "windmill-pinwheel": {
    id: "windmill-pinwheel",
    label: "Windmill Pinwheel",
    description: "Spins even when you are sure there is no wind.",
    family: "handmade",
    shape: "pinwheel",
    motion: "spin",
    parts: ["stem"],
    palette: { base: "#4f8fb8", accent: "#cf4f38", detail: "#f0b548" },
    scale: 1.05,
    rarity: 2,
    tags: ["toy", "craft"]
  },
  "scrap-bolt": {
    id: "scrap-bolt",
    label: "Scrap Bolt",
    description: "A fat bolt from somewhere that used to be a machine.",
    family: "found",
    shape: "cylinder",
    motion: "wobble",
    parts: ["stripes"],
    palette: { base: "#8d8781", accent: "#5b5550", detail: "#c9c2ba" },
    scale: 1,
    rarity: 2,
    tags: ["metal", "biome:scrapflats"]
  },
  "cogwheel-single": {
    id: "cogwheel-single",
    label: "Lone Cogwheel",
    description: "One tooth is bent, so it will never run true again.",
    family: "curious",
    shape: "ring",
    motion: "spin",
    parts: ["stripes"],
    palette: { base: "#a9905f", accent: "#7a6440", detail: "#d9c48f" },
    scale: 1,
    rarity: 2,
    tags: ["metal", "biome:scrapflats"]
  },
  "moon-button": {
    id: "moon-button",
    label: "Moon Button",
    description: "A pale button that Bandit swears was once on the moon.",
    family: "story",
    shape: "button",
    motion: "spin",
    parts: ["spots", "glitter"],
    palette: { base: "#e9e6f2", accent: "#b6b0cc", detail: "#8f89ad" },
    scale: 1,
    rarity: 3,
    tags: ["story", "night"]
  },
  "wrapped-sweet-paper": {
    id: "wrapped-sweet-paper",
    label: "Wrapped Sweet Paper",
    description: "The wrapper outlived the sweet. It was a good wrapper.",
    family: "found",
    shape: "cube",
    motion: "wobble",
    parts: ["ribbon"],
    palette: { base: "#d96a8e", accent: "#a84568", detail: "#f7d9e4" },
    scale: 0.95,
    rarity: 1,
    tags: ["paper", "candy"]
  },
  "beetle-shell": {
    id: "beetle-shell",
    label: "Beetle Shell",
    description: "A bright iridescent shell with nobody inside it.",
    family: "natural",
    shape: "windup-beetle",
    motion: "still",
    parts: ["antenna", "stripes"],
    palette: { base: "#4f7a5c", accent: "#2f5340", detail: "#9fc98d" },
    scale: 1,
    rarity: 2,
    tags: ["insect", "biome:meadow"]
  },
  "paper-boat": {
    id: "paper-boat",
    label: "Paper Boat",
    description: "Perfectly folded, and much too nice to actually float.",
    family: "handmade",
    shape: "cone",
    motion: "sway",
    parts: [],
    palette: { base: "#f4f1e8", accent: "#c2cbd6", detail: "#4f8fb8" },
    scale: 1.05,
    rarity: 1,
    tags: ["craft", "paper"]
  },
  "feather-quill": {
    id: "feather-quill",
    label: "Feather Quill",
    description: "A big blue feather, good for writing and better for tickling.",
    family: "found",
    shape: "leaf",
    motion: "sway",
    parts: ["feather", "stem"],
    palette: { base: "#5b7fbf", accent: "#3a5a94", detail: "#dbe6f7" },
    scale: 1.1,
    rarity: 1,
    tags: ["bird", "biome:clearing"]
  },
  "meerkat-sentry-pebble": {
    id: "meerkat-sentry-pebble",
    label: "Sentry Pebble",
    description: "A pebble the meerkats stand on to see things. It is retired.",
    family: "story",
    shape: "pebble",
    motion: "still",
    parts: [],
    palette: { base: "#c9a06a", accent: "#8f6f43", detail: "#ecd6ac" },
    scale: 0.95,
    rarity: 2,
    tags: ["biome:dunes", "story"]
  },
  "chisel-sawdust-jar": {
    id: "chisel-sawdust-jar",
    label: "Jar of Sawdust",
    description: "Chisel says it is confetti. Chisel is allowed this one.",
    family: "story",
    shape: "cube",
    motion: "still",
    parts: ["glitter", "hat"],
    palette: { base: "#e0c48f", accent: "#b99a5c", detail: "#f7ecd0" },
    scale: 1,
    rarity: 2,
    tags: ["story", "biome:forest"]
  },
  "pip-seed-pendant": {
    id: "pip-seed-pendant",
    label: "Pip\u2019s Seed Pendant",
    description: "A seed on a thread. Pip says it always finds the sun.",
    family: "story",
    shape: "acorn",
    motion: "sway",
    parts: ["stem", "ribbon"],
    palette: { base: "#a8763f", accent: "#7a5228", detail: "#f0d5a1" },
    scale: 1,
    rarity: 2,
    tags: ["story", "shop"]
  },
  "bandit-shiny-spoon": {
    id: "bandit-shiny-spoon",
    label: "Very Shiny Spoon",
    description: "It is the shiniest thing Bandit has ever not stolen.",
    family: "found",
    shape: "cylinder",
    motion: "wobble",
    parts: ["glitter"],
    palette: { base: "#d7dbe0", accent: "#a2a8b0", detail: "#f7f9fb" },
    scale: 1.05,
    rarity: 2,
    tags: ["metal", "story"]
  },
  "fox-ear-tuft": {
    id: "fox-ear-tuft",
    label: "Tuft of Fox Fur",
    description: "Soft, warm, and freely given at a rare high-friendship moment.",
    family: "story",
    shape: "leaf",
    motion: "sway",
    parts: ["feather"],
    palette: { base: "#e29a5a", accent: "#b8703a", detail: "#f7dcbb" },
    scale: 0.95,
    rarity: 3,
    tags: ["story", "biome:dunes"]
  },
  "winter-window-frost": {
    id: "winter-window-frost",
    label: "Frost Window Chip",
    description: "A pane of frost that somehow stayed cold.",
    family: "seasonal",
    shape: "crystal",
    motion: "spin",
    parts: ["glitter", "feather"],
    palette: { base: "#dff0f7", accent: "#a8cfe0", detail: "#ffffff" },
    scale: 1,
    rarity: 3,
    tags: ["seasonal:winter"]
  },
  "autumn-leaf-press": {
    id: "autumn-leaf-press",
    label: "Pressed Autumn Leaf",
    description: "Flattened flat between two pages and kept its colour.",
    family: "seasonal",
    shape: "leaf",
    motion: "still",
    parts: ["stem", "stripes"],
    palette: { base: "#d1663a", accent: "#9c4120", detail: "#f2c14e" },
    scale: 1,
    rarity: 2,
    tags: ["seasonal:autumn"]
  },
  "spring-bud-charm": {
    id: "spring-bud-charm",
    label: "Spring Bud Charm",
    description: "A bud that decided spring and stayed that way.",
    family: "seasonal",
    shape: "heart",
    motion: "bob",
    parts: ["stem"],
    palette: { base: "#c98fb0", accent: "#9a6284", detail: "#e8cfe0" },
    scale: 1,
    rarity: 2,
    tags: ["seasonal:spring"]
  },
  "summer-skip-stone": {
    id: "summer-skip-stone",
    label: "Summer Skipping Stone",
    description: "Flat, round, and responsible for four whole skips.",
    family: "natural",
    shape: "pebble",
    motion: "still",
    parts: [],
    palette: { base: "#9aa7a0", accent: "#6d7a73", detail: "#cdd7d2" },
    scale: 1,
    rarity: 1,
    tags: ["material:stone", "seasonal:summer"]
  },
  "toy-windup-bear": {
    id: "toy-windup-bear",
    label: "Wind-up Bear",
    description: "Stumps forward with enormous dignity.",
    family: "handmade",
    shape: "windup-bear",
    motion: "windup",
    parts: ["ears", "eyes", "key"],
    palette: { base: "#a3764a", accent: "#7a5531", detail: "#f0d5a1" },
    scale: 1.05,
    rarity: 3,
    tags: ["toy", "windup"]
  },
  "toy-windup-bunny": {
    id: "toy-windup-bunny",
    label: "Wind-up Bunny",
    description: "Hops in place, pleased with itself, forever.",
    family: "handmade",
    shape: "windup-bunny",
    motion: "windup",
    parts: ["ears", "eyes", "key", "tail"],
    palette: { base: "#e9e2d2", accent: "#c9bfa8", detail: "#e8b7c6" },
    scale: 1,
    rarity: 2,
    tags: ["toy", "windup"]
  },
  "toy-windup-cat": {
    id: "toy-windup-cat",
    label: "Wind-up Cat",
    description: "It walks the exact same proud twelve steps, always.",
    family: "handmade",
    shape: "windup-cat",
    motion: "windup",
    parts: ["ears", "tail", "eyes", "key"],
    palette: { base: "#332e2a", accent: "#211d1a", detail: "#d99aa6" },
    scale: 1,
    rarity: 3,
    tags: ["toy", "windup"]
  },
  "toy-windup-bird": {
    id: "toy-windup-bird",
    label: "Wind-up Bird",
    description: "Pecks three times, then applauds itself with its wings.",
    family: "handmade",
    shape: "windup-bird",
    motion: "windup",
    parts: ["beak", "eyes", "wings", "key"],
    palette: { base: "#4f8fb8", accent: "#376b8c", detail: "#f0b548" },
    scale: 1,
    rarity: 2,
    tags: ["toy", "windup"]
  },
  "toy-windup-fish": {
    id: "toy-windup-fish",
    label: "Wind-up Fish",
    description: "Wriggles along the ground, apparently convinced.",
    family: "handmade",
    shape: "windup-fish",
    motion: "windup",
    parts: ["fin", "eyes", "key", "stripes"],
    palette: { base: "#5fa8b8", accent: "#3d7a8a", detail: "#dff0f4" },
    scale: 1,
    rarity: 2,
    tags: ["toy", "windup", "water"]
  },
  "curious-pocket-watch": {
    id: "curious-pocket-watch",
    label: "Pocket Watch That Runs Backwards",
    description: "It keeps perfect time, just not this way round.",
    family: "curious",
    shape: "ring",
    motion: "spin",
    parts: ["glitter", "hat"],
    palette: { base: "#c9903c", accent: "#8f6624", detail: "#f4f1e8" },
    scale: 1,
    rarity: 3,
    tags: ["metal", "time"]
  },
  "hat-pin-star": {
    id: "hat-pin-star",
    label: "Star Hat Pin",
    description: "A star on a pin. Nobody knows whose hat it belonged to.",
    family: "found",
    shape: "star",
    motion: "spin",
    parts: ["glitter"],
    palette: { base: "#f0d548", accent: "#c09b1f", detail: "#fbeab0" },
    scale: 1,
    rarity: 2,
    tags: ["metal", "night"]
  },
  "seed-pod-rattle": {
    id: "seed-pod-rattle",
    label: "Seed-pod Rattle",
    description: "Shake it and it sounds like a very small rain.",
    family: "natural",
    shape: "sphere",
    motion: "bob",
    parts: ["stem", "spots"],
    palette: { base: "#b08a52", accent: "#82602f", detail: "#e3cfa4" },
    scale: 1,
    rarity: 2,
    tags: ["plant", "sound"]
  },
  "butterfly-wing-glass": {
    id: "butterfly-wing-glass",
    label: "Butterfly-wing Glass",
    description: "Not a real wing. It just remembers one very well.",
    family: "curious",
    shape: "crystal",
    motion: "orbit",
    parts: ["wings", "glitter"],
    palette: { base: "#d879c5", accent: "#9c4f9a", detail: "#f2c9ee" },
    scale: 1,
    rarity: 3,
    tags: ["glass", "insect"]
  },
  "woodchuck-pencil-stub": {
    id: "woodchuck-pencil-stub",
    label: "Pencil Stub",
    description: "Sharpened down to almost nothing by a very busy woodchuck.",
    family: "story",
    shape: "cylinder",
    motion: "wobble",
    parts: ["stripes"],
    palette: { base: "#f0b548", accent: "#c08a1f", detail: "#3a2c20" },
    scale: 1,
    rarity: 1,
    tags: ["story", "craft"]
  },
  "moss-terrarium": {
    id: "moss-terrarium",
    label: "Pocket Terrarium",
    description: "A whole damp little world under a paper dome.",
    family: "natural",
    shape: "sphere",
    motion: "still",
    parts: ["stem", "glitter", "spots"],
    palette: { base: "#8fb0c4", accent: "#5f8a9c", detail: "#5b8849" },
    scale: 1.1,
    rarity: 3,
    tags: ["glass", "plant"]
  }
};
var mergedCache = null;
function allTrinketDefs() {
  if (mergedCache) return mergedCache;
  const seen = /* @__PURE__ */ new Set();
  const merged = [];
  for (const def of [...Object.values(TRINKET_AUTHORED_DEFS), ...TRINKET_GENERATED_DEFS]) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    merged.push(def);
  }
  mergedCache = merged;
  return mergedCache;
}

// src/sim/catalogs/biomes.ts
var BIOME_IDS = ["clearing", "forest", "meadow", "dunes", "scrapflats"];

// src/sim/catalogs/recipes.ts
var RECIPE_DEFS = {
  "flimsy-shovel": {
    id: "flimsy-shovel",
    name: "Flimsy Shovel",
    planName: "Plan: one optimistic folded scoop",
    planSource: "starter",
    description: "Opens shallow soil layers without pretending to be indestructible.",
    status: "ready",
    durationSeconds: 6,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: "family", family: "sticks", quantity: 4 },
      { kind: "family", family: "fiber", quantity: 3 },
      { kind: "family", family: "stones", quantity: 2 }
    ],
    output: { kind: "tool", toolId: "flimsy-shovel", label: "Flimsy Shovel" }
  },
  "okayish-shovel": {
    id: "okayish-shovel",
    name: "Okayish Shovel",
    planName: "Plan: a scoop with a folded spine",
    planSource: "knowledge-tree",
    description: "Reaches the compact layer under a bed you have already opened.",
    status: "ready",
    durationSeconds: 10,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: "family", family: "sticks", quantity: 5 },
      { kind: "family", family: "cardboard", quantity: 4 },
      { kind: "exact", resource: "graphite-cardstone", quantity: 2 }
    ],
    output: { kind: "tool", toolId: "okayish-shovel", label: "Okayish Shovel" }
  },
  "heavy-duty-shovel": {
    id: "heavy-duty-shovel",
    name: "Heavy-duty Shovel",
    planName: "Plan: layered board and a bound handle",
    planSource: "knowledge-tree",
    description: "Opens deep seams where the local geology has one to give.",
    status: "ready",
    durationSeconds: 16,
    minimumMakerLevel: 3,
    ingredients: [
      { kind: "family", family: "cardboard", quantity: 6 },
      { kind: "exact", resource: "graphite-cardstone", quantity: 4 },
      { kind: "family", family: "stones", quantity: 4 },
      { kind: "family", family: "fiber", quantity: 3 }
    ],
    output: { kind: "tool", toolId: "heavy-duty-shovel", label: "Heavy-duty Shovel" }
  },
  "creased-hoe": {
    id: "creased-hoe",
    name: "Basic Garden Hoe",
    planName: "Plan: one well-creased garden blade",
    planSource: "starter",
    description: "Sows seeds, lifts plants back out, and rakes soil into an open hole.",
    status: "ready",
    durationSeconds: 7,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: "family", family: "sticks", quantity: 3 },
      { kind: "family", family: "cardboard", quantity: 2 },
      { kind: "family", family: "fiber", quantity: 2 }
    ],
    output: { kind: "tool", toolId: "creased-hoe", label: "Basic Garden Hoe" }
  },
  "kids-scissors": {
    id: "kids-scissors",
    name: "Kid's Scissors",
    planName: "Plan: round-tipped snippers",
    planSource: "starter",
    description: "Trims renewable shoots and soft growth without hurting the tree.",
    status: "ready",
    durationSeconds: 6,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: "family", family: "sticks", quantity: 2 },
      { kind: "family", family: "stones", quantity: 3 },
      { kind: "family", family: "fiber", quantity: 2 }
    ],
    output: { kind: "tool", toolId: "kids-scissors", label: "Kid's Scissors" }
  },
  "sturdy-scissors": {
    id: "sturdy-scissors",
    name: "Sturdy Scissors",
    planName: "Plan: shears with a serious hinge",
    planSource: "knowledge-tree",
    description: "Collects bark curls and structural branches from grown trees.",
    status: "ready",
    durationSeconds: 11,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: "family", family: "sticks", quantity: 4 },
      { kind: "exact", resource: "graphite-cardstone", quantity: 3 },
      { kind: "family", family: "cardboard", quantity: 3 }
    ],
    output: { kind: "tool", toolId: "sturdy-scissors", label: "Sturdy Scissors" }
  },
  "squeaky-hammer": {
    id: "squeaky-hammer",
    name: "Squeaky Hammer",
    planName: "Plan: a hammer with a very confident squeak",
    planSource: "starter",
    description: "Places the small build pieces you already know how to assemble.",
    status: "ready",
    durationSeconds: 6,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: "family", family: "sticks", quantity: 3 },
      { kind: "family", family: "cardboard", quantity: 2 },
      { kind: "family", family: "fiber", quantity: 2 }
    ],
    output: { kind: "tool", toolId: "squeaky-hammer", label: "Squeaky Hammer" }
  },
  "basic-mallet": {
    id: "basic-mallet",
    name: "Basic Mallet",
    planName: "Plan: a broad head for stubborn folds",
    planSource: "knowledge-tree",
    description: "A steadier mallet for the next scale of paper construction.",
    status: "ready",
    durationSeconds: 10,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: "family", family: "sticks", quantity: 5 },
      { kind: "family", family: "cardboard", quantity: 4 },
      { kind: "family", family: "fiber", quantity: 3 }
    ],
    output: { kind: "tool", toolId: "basic-mallet", label: "Basic Mallet" }
  },
  "standard-hammer": {
    id: "standard-hammer",
    name: "Standard Hammer",
    planName: "Plan: a proper head, claw, and bound handle",
    planSource: "knowledge-tree",
    description: "The current top rung for careful assembly and future disassembly work.",
    status: "ready",
    durationSeconds: 16,
    minimumMakerLevel: 3,
    ingredients: [
      { kind: "family", family: "sticks", quantity: 6 },
      { kind: "family", family: "cardboard", quantity: 6 },
      { kind: "exact", resource: "graphite-cardstone", quantity: 3 },
      { kind: "family", family: "fiber", quantity: 4 }
    ],
    output: { kind: "tool", toolId: "standard-hammer", label: "Standard Hammer" }
  },
  // --- Refined materials ----------------------------------------------------
  // Output is a resource, not a tool or item — see the `resource` variant of
  // `RecipeOutput` above. First entry in what should grow into its own
  // multi-step-materials tier (twigs + bark curls -> lumber; more later).
  "bound-lumber": {
    id: "bound-lumber",
    name: "Bound Lumber",
    planName: "Plan: twigs and bark, bound and squared",
    planSource: "starter",
    description: "Twigs and bark curls, bundled and pressed flat into a sturdier building material.",
    status: "ready",
    durationSeconds: 8,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: "exact", resource: "kraft-twigs", quantity: 4 },
      { kind: "exact", resource: "redwood-bark-curls", quantity: 2 }
    ],
    output: { kind: "resource", resource: "bound-lumber", quantity: 2, label: "Bound Lumber" }
  },
  // --- Not playable yet ----------------------------------------------------
  // Kept for their costs and artwork; hidden everywhere by `status`.
  // `folding-hook` was deleted outright — nobody could say what it did, and a
  // recipe nobody can describe is not settled work worth keeping.
  "tape-tapper": {
    id: "tape-tapper",
    name: "Tape Tapper",
    planName: "Plan: sticky percussion wand",
    planSource: "knowledge-tree",
    description: "Pokes, stamps, and convinces stubborn tabs to behave.",
    // Waiting on tape existing as a material and a `stamp` interaction.
    status: "planned",
    durationSeconds: 6.5,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: "family", family: "cardboard", quantity: 2 },
      { kind: "family", family: "fiber", quantity: 2 }
    ],
    output: { kind: "item", itemId: "tape-tapper", label: "Tape Tapper" }
  },
  "crease-scout": {
    id: "crease-scout",
    name: "Crease Scout",
    planName: "Plan: folded finder",
    planSource: "knowledge-tree",
    description: "Sniffs out promising seams in the paper terrain.",
    // Nothing surfaces seams yet, so this would sit inert in the scrapbook.
    // Same reasoning as the scissors before trimming landed: it comes back
    // on when it has something to find.
    status: "planned",
    durationSeconds: 9,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: "family", family: "cardboard", quantity: 2 },
      { kind: "family", family: "fiber", quantity: 2 },
      { kind: "family", family: "stones", quantity: 3 }
    ],
    output: { kind: "item", itemId: "crease-scout", label: "Crease Scout" }
  }
};
function isRecipeAvailable(recipeId) {
  return RECIPE_DEFS[recipeId]?.status === "ready";
}
var STARTER_PLAN_IDS = Object.keys(RECIPE_DEFS).filter((recipeId) => isRecipeAvailable(recipeId) && RECIPE_DEFS[recipeId].planSource === "starter");

// src/sim/catalogs/materials.ts
var MATERIAL_TAGS = {
  wood: { id: "wood", label: "Wood", meaning: "Woody pieces a recipe can treat interchangeably." },
  "species-wood": { id: "species-wood", label: "Species wood", meaning: "Wood from one named tree, where the species is the point." },
  "soft-fiber": { id: "soft-fiber", label: "Soft fiber", meaning: "Short, pulpable, stuffable plant matter." },
  "long-fiber": { id: "long-fiber", label: "Long fiber", meaning: "Strands long enough to spin, bind, or weave." },
  stone: { id: "stone", label: "Stone", meaning: "Geological pieces for aggregate, masonry, and grinding." },
  clay: { id: "clay", label: "Clay", meaning: "Plastic earth that holds a shape and can be fired." },
  soil: { id: "soil", label: "Soil", meaning: "Loose earth for landscaping, filling, and growing." },
  board: { id: "board", label: "Board", meaning: "Flat layered stock \u2014 the ancestor of every panel." },
  seed: { id: "seed", label: "Seed", meaning: "Plantable; belongs to the garden loop, not the workshop." },
  food: { id: "food", label: "Food", meaning: "Grown and picked; eaten or given, not built with." }
};
var MATERIAL_TAG_IDS = Object.keys(MATERIAL_TAGS);

// src/sim/catalogs/resources.ts
var RESOURCE_CORE_DEFS = {
  "kraft-twigs": { id: "kraft-twigs", label: "Kraft-paper twigs", shortLabel: "Kraft twigs", category: "sticks", iconKey: "resource.kraft-twigs", processStage: 0, structuralClass: 1, tags: ["wood"] },
  "ribbonwood-sticks": { id: "ribbonwood-sticks", label: "Ribbonwood sticks", shortLabel: "Ribbonwood", category: "sticks", iconKey: "resource.ribbonwood-sticks", processStage: 0, structuralClass: 1, tags: ["wood", "species-wood"] },
  // The first material with no loose pile anywhere in the world: bark curls
  // only come off a living redwood, and only to heavier shears. That is what
  // makes the tier-2 scissors worth making rather than a bigger number.
  "redwood-bark-curls": { id: "redwood-bark-curls", label: "Redwood bark curls", shortLabel: "Bark curls", category: "sticks", iconKey: "resource.redwood-bark-curls", processStage: 0, structuralClass: 1, tags: ["wood", "species-wood", "long-fiber"] },
  "palm-clippings": { id: "palm-clippings", label: "Palm clippings", shortLabel: "Palm clippings", category: "sticks", iconKey: "resource.palm-clippings", processStage: 0, structuralClass: 1, tags: ["wood", "species-wood"] },
  "palm-fiber": { id: "palm-fiber", label: "Palm fiber", shortLabel: "Palm fiber", category: "fiber", iconKey: "resource.palm-fiber", processStage: 0, structuralClass: 0, tags: ["soft-fiber", "long-fiber"] },
  "mossy-paper-fiber": { id: "mossy-paper-fiber", label: "Mossy paper fiber", shortLabel: "Paper fiber", category: "fiber", iconKey: "resource.mossy-paper-fiber", processStage: 0, structuralClass: 0, tags: ["soft-fiber"] },
  "confetti-stones": { id: "confetti-stones", label: "Confetti stones", shortLabel: "Confetti stone", category: "stones", iconKey: "resource.confetti-stones", processStage: 0, structuralClass: 1, tags: ["stone"] },
  "graphite-cardstone": { id: "graphite-cardstone", label: "Graphite cardstone", shortLabel: "Cardstone", category: "stones", iconKey: "resource.graphite-cardstone", processStage: 0, structuralClass: 1, tags: ["stone"] },
  "bluefold-pebbles": { id: "bluefold-pebbles", label: "Bluefold pebbles", shortLabel: "Bluefolds", category: "stones", iconKey: "resource.bluefold-pebbles", processStage: 0, structuralClass: 1, tags: ["stone"] },
  "terracotta-pebbles": { id: "terracotta-pebbles", label: "Terracotta pebbles", shortLabel: "Terracottas", category: "stones", iconKey: "resource.terracotta-pebbles", processStage: 0, structuralClass: 1, tags: ["stone"] },
  "sunbaked-cardboard": { id: "sunbaked-cardboard", label: "Sunbaked cardboard", shortLabel: "Sunbaked card", category: "cardboard", iconKey: "resource.sunbaked-cardboard", processStage: 0, structuralClass: 1, tags: ["board"] },
  "ochre-paperclay": { id: "ochre-paperclay", label: "Ochre paperclay", shortLabel: "Ochre clay", category: "soil", iconKey: "resource.ochre-paperclay", processStage: 0, structuralClass: 1, tags: ["clay", "soil"] },
  "carbon-soil": { id: "carbon-soil", label: "Carbon soil", shortLabel: "Carbon soil", category: "soil", iconKey: "resource.carbon-soil", processStage: 0, structuralClass: 0, tags: ["soil"] },
  "carbon-copy-shale": { id: "carbon-copy-shale", label: "Carbon-copy shale", shortLabel: "Copy shale", category: "stones", iconKey: "resource.carbon-copy-shale", processStage: 0, structuralClass: 1, tags: ["stone"] },
  "buttonbloom-seeds": { id: "buttonbloom-seeds", label: "Buttonbloom seeds", shortLabel: "Buttonbloom seeds", category: "seeds", iconKey: "resource.buttonbloom-seeds", processStage: 0, structuralClass: 0, tags: ["seed"] },
  "mend-me-seeds": { id: "mend-me-seeds", label: "Mend-me seeds", shortLabel: "Mend-me seeds", category: "seeds", iconKey: "resource.mend-me-seeds", processStage: 0, structuralClass: 0, tags: ["seed"] },
  "raspberry-bush-seeds": { id: "raspberry-bush-seeds", label: "Raspberry bush seeds", shortLabel: "Raspberry seeds", category: "seeds", iconKey: "resource.raspberry-bush-seeds", processStage: 0, structuralClass: 0, tags: ["seed"] },
  "crinkle-carrot-seeds": { id: "crinkle-carrot-seeds", label: "Crinkle-carrot seeds", shortLabel: "Carrot seeds", category: "seeds", iconKey: "resource.crinkle-carrot-seeds", processStage: 0, structuralClass: 0, tags: ["seed"] },
  "ribbon-corn-seeds": { id: "ribbon-corn-seeds", label: "Ribbon-corn seeds", shortLabel: "Corn seeds", category: "seeds", iconKey: "resource.ribbon-corn-seeds", processStage: 0, structuralClass: 0, tags: ["seed"] },
  "folded-cabbage-seeds": { id: "folded-cabbage-seeds", label: "Folded-cabbage seeds", shortLabel: "Cabbage seeds", category: "seeds", iconKey: "resource.folded-cabbage-seeds", processStage: 0, structuralClass: 0, tags: ["seed"] },
  "paper-tomato-seeds": { id: "paper-tomato-seeds", label: "Paper-tomato seeds", shortLabel: "Tomato seeds", category: "seeds", iconKey: "resource.paper-tomato-seeds", processStage: 0, structuralClass: 0, tags: ["seed"] },
  "raspberries": { id: "raspberries", label: "Paper raspberries", shortLabel: "Raspberries", category: "food", iconKey: "resource.raspberries", processStage: 0, structuralClass: 0, tags: ["food"] },
  "crinkle-carrots": { id: "crinkle-carrots", label: "Crinkle carrots", shortLabel: "Crinkle carrots", category: "food", iconKey: "resource.crinkle-carrots", processStage: 0, structuralClass: 0, tags: ["food"] },
  "ribbon-corn": { id: "ribbon-corn", label: "Ribbon corn", shortLabel: "Ribbon corn", category: "food", iconKey: "resource.ribbon-corn", processStage: 0, structuralClass: 0, tags: ["food"] },
  "folded-cabbage": { id: "folded-cabbage", label: "Folded cabbage", shortLabel: "Folded cabbage", category: "food", iconKey: "resource.folded-cabbage", processStage: 0, structuralClass: 0, tags: ["food"] },
  "paper-tomato": { id: "paper-tomato", label: "Paper tomatoes", shortLabel: "Paper tomatoes", category: "food", iconKey: "resource.paper-tomato", processStage: 0, structuralClass: 0, tags: ["food"] },
  // Crafted at the Thing Maker, never found loose in the world — see
  // recipes.ts's 'resource'-kind RecipeOutput. First refined material.
  "bound-lumber": { id: "bound-lumber", label: "Bound lumber", shortLabel: "Bound lumber", category: "refined", iconKey: "resource.bound-lumber", processStage: 1, structuralClass: 2, tags: ["wood", "board"] }
};
function hasMaterialTag(resource, tag) {
  return RESOURCE_CORE_DEFS[resource].tags.includes(tag);
}
var RESOURCE_IDS = Object.keys(RESOURCE_CORE_DEFS);
var RESOURCES_BY_TAG = Object.fromEntries(
  MATERIAL_TAG_IDS.map((tag) => [tag, RESOURCE_IDS.filter((id) => hasMaterialTag(id, tag))])
);

// src/sim/catalogs/seeds.ts
var SEED_DEFS = {
  "buttonbloom-seeds": {
    id: "buttonbloom-seeds",
    name: "Buttonbloom Seeds",
    effect: "garden",
    description: "Folds into a cheerful button-shaped garden flower.",
    // Cumulative seconds to *enter* sprout, bud, and bloom. Tuned so this
    // starter flower matures during a play session without being immediate.
    stageSeconds: [45, 150, 300],
    // Wants elbow room — leaves a visible gap between blooms.
    spacing: 0.85,
    visual: "flower",
    harvest: { resource: "buttonbloom-seeds", quantity: 1, mode: "repeat", repeatSeconds: 300 }
  },
  "raspberry-bush-seeds": {
    id: "raspberry-bush-seeds",
    name: "Raspberry Bush Seeds",
    effect: "garden",
    description: "Grows into a leafy bush strung with paper raspberries.",
    stageSeconds: [90, 420, 1200],
    spacing: 0.9,
    visual: "bush",
    accent: "#c73e52",
    harvest: { resource: "raspberries", quantity: 3, mode: "repeat", repeatSeconds: 600 }
  },
  "crinkle-carrot-seeds": {
    id: "crinkle-carrot-seeds",
    name: "Crinkle-carrot Seeds",
    effect: "garden",
    description: "Rows of frilly green tops over hidden orange paper roots.",
    stageSeconds: [60, 240, 720],
    spacing: 0.55,
    visual: "row",
    accent: "#e07b3a",
    harvest: { resource: "crinkle-carrots", quantity: 3, mode: "whole" }
  },
  "ribbon-corn-seeds": {
    id: "ribbon-corn-seeds",
    name: "Ribbon-corn Seeds",
    effect: "garden",
    description: "Tall stalks that unfurl into golden ribbon cobs.",
    stageSeconds: [120, 600, 1800],
    spacing: 0.95,
    visual: "stalk",
    accent: "#e3bd45",
    harvest: { resource: "ribbon-corn", quantity: 3, mode: "whole" }
  },
  "folded-cabbage-seeds": {
    id: "folded-cabbage-seeds",
    name: "Folded-cabbage Seeds",
    effect: "garden",
    description: "Tight ruffled heads of pale green folded paper.",
    stageSeconds: [90, 360, 1080],
    spacing: 0.8,
    visual: "head",
    accent: "#7fa06a",
    harvest: { resource: "folded-cabbage", quantity: 2, mode: "whole" }
  },
  "paper-tomato-seeds": {
    id: "paper-tomato-seeds",
    name: "Paper-tomato Seeds",
    effect: "garden",
    description: "A bushy vine strung with ripe red paper fruit.",
    stageSeconds: [90, 480, 1500],
    spacing: 0.85,
    visual: "vine",
    accent: "#d14a35",
    harvest: { resource: "paper-tomato", quantity: 4, mode: "repeat", repeatSeconds: 720 }
  },
  "mend-me-seeds": {
    id: "mend-me-seeds",
    name: "Mend-me Seeds",
    effect: "mending",
    description: "Stitches an empty paper-soil bed back into the surrounding sheet.",
    // Mending uses its own `mendsAt` timer and never blooms; these stages
    // only drive the little tuft's visual growth while it works.
    stageSeconds: [30, 100, 240],
    // Groundcover: meant to be sown edge to edge to close a patch of ground.
    spacing: 0.3,
    visual: "mending"
  }
};

// src/sim/catalogs/shops.ts
var SEED_STORE = {
  id: "seed-store",
  name: "Pip\u2019s Seed & Garden",
  shopkeeper: "Pip",
  sells: Object.keys(SEED_DEFS),
  buys: Object.keys(RESOURCE_CORE_DEFS)
};

// src/sim/catalogs/trees.ts
var MAX_TREE_GROWTH = 100;
var TREE_REGROWTH_PER_SECOND = MAX_TREE_GROWTH / 300;

// src/sim/catalogs/obtaining.ts
var SCATTERED_IN = {
  "kraft-twigs": ["clearing", "forest", "meadow"],
  "ribbonwood-sticks": ["forest", "scrapflats"],
  "mossy-paper-fiber": ["clearing", "forest", "meadow"],
  "confetti-stones": ["meadow", "scrapflats"],
  "graphite-cardstone": ["forest", "scrapflats"],
  // Desert stone got its own identity rather than sharing meadow's aqua
  // pebbles — a material should visually remember where it came from.
  "bluefold-pebbles": ["meadow"],
  "terracotta-pebbles": ["dunes"],
  "sunbaked-cardboard": ["dunes", "scrapflats"],
  // Seed packets lie about near the kind of ground they want to grow in —
  // the farm finds the player almost as often as the player finds the farm.
  "raspberry-bush-seeds": ["clearing", "meadow"],
  "crinkle-carrot-seeds": ["clearing", "meadow"],
  "ribbon-corn-seeds": ["meadow", "scrapflats"],
  "folded-cabbage-seeds": ["clearing", "forest"],
  "paper-tomato-seeds": ["meadow", "dunes"]
};
var BIOME_SCATTER = Object.fromEntries(
  BIOME_IDS.map((biome) => [
    biome,
    Object.keys(RESOURCE_CORE_DEFS).filter((resource) => SCATTERED_IN[resource]?.includes(biome))
  ])
);

// src/sim/catalogs/techTree.ts
var TECH_DEFS = {
  // --- Caring for the Land -------------------------------------------------
  "digging-1": {
    id: "digging-1",
    name: "Digging 1",
    summary: "Break open shallow paper soil for the first time.",
    branch: "caring-for-the-land",
    requires: [],
    readiness: "ready",
    learningHours: 1,
    tasks: [{ kind: "make", recipeId: "flimsy-shovel", quantity: 1, weight: 1 }],
    grants: ["flimsy-shovel"]
  },
  "digging-2": {
    id: "digging-2",
    name: "Digging 2",
    summary: "Reach the compact layer under ground you have already opened.",
    branch: "caring-for-the-land",
    requires: ["digging-1"],
    readiness: "ready",
    learningHours: 6,
    tasks: [
      { kind: "own-tool", toolId: "flimsy-shovel", weight: 1 },
      { kind: "make", recipeId: "flimsy-shovel", quantity: 1, weight: 1 }
    ],
    grants: ["okayish-shovel"]
  },
  "digging-3": {
    id: "digging-3",
    name: "Digging 3",
    summary: "Open deep seams where the local geology has one to give.",
    branch: "caring-for-the-land",
    requires: ["digging-2"],
    readiness: "ready",
    learningHours: 18,
    tasks: [
      { kind: "own-tool", toolId: "okayish-shovel", weight: 1 },
      { kind: "make", recipeId: "okayish-shovel", quantity: 2, weight: 2 }
    ],
    grants: ["heavy-duty-shovel"]
  },
  "gardening-1": {
    id: "gardening-1",
    name: "Gardening 1",
    summary: "Sow, lift, and rake soil back into an open bed.",
    branch: "caring-for-the-land",
    requires: [],
    readiness: "ready",
    learningHours: 1,
    tasks: [{ kind: "make", recipeId: "creased-hoe", quantity: 1, weight: 1 }],
    grants: ["creased-hoe"]
  },
  "gardening-2": {
    id: "gardening-2",
    name: "Gardening 2",
    summary: "Tend growing plants and learn which crops return for another harvest.",
    branch: "caring-for-the-land",
    requires: ["gardening-1"],
    readiness: "concept",
    previewGrants: ["Tending bonuses", "Repeat harvests"]
  },
  "soil-mechanics": {
    id: "soil-mechanics",
    name: "Soil Mechanics",
    summary: "Reading what's actually under a bed before you plant it.",
    branch: "caring-for-the-land",
    requires: ["gardening-2", "digging-2"],
    readiness: "concept",
    previewGrants: ["Soil condition notes", "Bed suitability"]
  },
  "seeds-planting": {
    id: "seeds-planting",
    name: "Seeds & Planting",
    summary: "Read crop timing, spacing, and expected yield before a seed goes into the ground.",
    branch: "caring-for-the-land",
    requires: ["soil-mechanics"],
    readiness: "concept",
    previewGrants: ["Growth-time notes", "Harvest-yield notes"]
  },
  "growing-food": {
    id: "growing-food",
    name: "Growing Food",
    summary: "Harvest carrots, corn, cabbage, tomatoes, and berries into the food scrapbook.",
    branch: "caring-for-the-land",
    requires: ["seeds-planting"],
    readiness: "concept",
    previewGrants: ["Food harvests", "Whole-crop gathering"]
  },
  "organic-gardening": {
    id: "organic-gardening",
    name: "Organic Gardening",
    summary: "Companion planting and natural pest control \u2014 no shortcuts.",
    branch: "caring-for-the-land",
    requires: ["growing-food"],
    readiness: "concept",
    previewGrants: ["Companion planting", "Natural pest control"]
  },
  "advanced-gardening": {
    id: "advanced-gardening",
    name: "Advanced Gardening",
    summary: "The top of the garden-bed ladder, before a field ever enters it.",
    branch: "caring-for-the-land",
    requires: ["organic-gardening"],
    readiness: "concept",
    previewGrants: ["Garden-bed planning", "Improved tending"]
  },
  "basic-farming-techniques": {
    id: "basic-farming-techniques",
    name: "Basic Farming Techniques",
    summary: "Lay out repeatable crop rows and work more than one garden bed as a field.",
    branch: "caring-for-the-land",
    requires: ["advanced-gardening"],
    readiness: "concept",
    previewGrants: ["Crop rows", "Field plots"]
  },
  "irrigation-systems": {
    id: "irrigation-systems",
    name: "Irrigation Systems",
    summary: "Getting water to a bed without carrying it there by hand.",
    branch: "caring-for-the-land",
    requires: ["basic-farming-techniques"],
    readiness: "concept",
    previewGrants: ["Water routing", "Irrigated plots"]
  },
  "harvesting-tech": {
    id: "harvesting-tech",
    name: "Harvesting Tech",
    summary: "Gather ripe rows efficiently and move a larger harvest into storage.",
    branch: "caring-for-the-land",
    requires: ["basic-farming-techniques"],
    readiness: "concept",
    previewGrants: ["Harvest tools", "Bulk gathering"]
  },
  "farming-equipment-automation": {
    id: "farming-equipment-automation",
    name: "Farming Equipment & Automation",
    summary: "Machines that do the walking for you.",
    branch: "caring-for-the-land",
    requires: ["irrigation-systems", "harvesting-tech"],
    readiness: "concept",
    // Harvesting by hand always works — this is what pays off once a farm
    // outgrows one pair of hands, not a wall it puts up before then.
    previewGrants: ["A tractor", "Faster harvesting on a big farm"]
  },
  "advanced-farming": {
    id: "advanced-farming",
    name: "Advanced Farming",
    summary: "Field-scale growing, tuned and efficient.",
    branch: "caring-for-the-land",
    requires: ["farming-equipment-automation"],
    readiness: "concept",
    previewGrants: ["Field-scale yields", "Crop rotation"]
  },
  "animal-husbandry": {
    id: "animal-husbandry",
    name: "Animal Husbandry",
    summary: "The land's other kind of tending.",
    branch: "caring-for-the-land",
    requires: ["advanced-farming"],
    readiness: "concept"
  },
  // --- Building & Construction: woodworking sub-thread ----------------------
  "trimming-1": {
    id: "trimming-1",
    name: "Tree Trimming Basics",
    summary: "Cut soft new growth without harming the tree it came from.",
    branch: "building-construction",
    requires: [],
    readiness: "ready",
    learningHours: 1,
    tasks: [{ kind: "make", recipeId: "kids-scissors", quantity: 1, weight: 1 }],
    grants: ["kids-scissors"]
  },
  "trimming-2": {
    id: "trimming-2",
    name: "Advanced Tree Trimming",
    summary: "Take bark curls and structural branches \u2014 the only shears a redwood respects.",
    branch: "building-construction",
    requires: ["trimming-1"],
    readiness: "ready",
    learningHours: 8,
    tasks: [
      { kind: "own-tool", toolId: "kids-scissors", weight: 1 },
      { kind: "make", recipeId: "kids-scissors", quantity: 1, weight: 1 }
    ],
    grants: ["sturdy-scissors"]
  },
  "building-1": {
    id: "building-1",
    name: "Building 1",
    summary: "Place the first small pieces that make the clearing feel like yours.",
    branch: "building-construction",
    requires: [],
    readiness: "ready",
    learningHours: 1,
    tasks: [{ kind: "make", recipeId: "squeaky-hammer", quantity: 1, weight: 1 }],
    grants: ["squeaky-hammer"]
  },
  "building-2": {
    id: "building-2",
    name: "Building 2",
    summary: "Make stronger joins with a broad, steady mallet.",
    branch: "building-construction",
    requires: ["building-1"],
    readiness: "ready",
    learningHours: 7,
    tasks: [
      { kind: "own-tool", toolId: "squeaky-hammer", weight: 1 },
      { kind: "make", recipeId: "squeaky-hammer", quantity: 1, weight: 1 }
    ],
    grants: ["basic-mallet"]
  },
  "building-3": {
    id: "building-3",
    name: "Building 3",
    summary: "Fit and unfit careful assemblies with a proper claw hammer.",
    branch: "building-construction",
    requires: ["building-2"],
    readiness: "ready",
    learningHours: 20,
    tasks: [
      { kind: "own-tool", toolId: "basic-mallet", weight: 1 },
      { kind: "make", recipeId: "basic-mallet", quantity: 2, weight: 2 }
    ],
    grants: ["standard-hammer"]
  },
  "lumber-types": {
    id: "lumber-types",
    name: "Lumber Types",
    summary: "Which wood is which, and what each is actually good for.",
    branch: "building-construction",
    requires: ["trimming-2"],
    readiness: "concept",
    previewGrants: ["New build materials", "Material-quality notes"]
  },
  "woodworking-safety": {
    id: "woodworking-safety",
    name: "Woodworking Safety",
    summary: "The boring lesson that comes before every sharp tool after this one.",
    branch: "building-construction",
    requires: ["lumber-types"],
    readiness: "concept"
  },
  "basic-woodworking": {
    id: "basic-woodworking",
    name: "Basic Woodworking",
    summary: "Cutting, joining, and shaping \u2014 the fundamentals.",
    branch: "building-construction",
    requires: ["woodworking-safety"],
    readiness: "concept",
    previewGrants: ["New build pieces", "Basic joinery"]
  },
  "advanced-woodworking": {
    id: "advanced-woodworking",
    name: "Advanced Woodworking",
    summary: "Joinery and finishing work worth showing off.",
    branch: "building-construction",
    requires: ["basic-woodworking"],
    readiness: "concept"
  },
  // --- Materials & Refinement --------------------------------------------
  "materials-refinement-1": {
    id: "materials-refinement-1",
    name: "Materials & Refinement 1",
    summary: "Turning a raw find into something worth building with.",
    branch: "materials",
    requires: ["lumber-types"],
    readiness: "concept",
    // The natural home for build-piece materials as an unlockable set,
    // rather than every swatch being open from the very first hammer.
    previewGrants: ["Refined build materials", "New material swatches"]
  },
  "materials-refinement-2": {
    id: "materials-refinement-2",
    name: "Materials & Refinement 2",
    summary: "Finer processing, and more of what it started as.",
    branch: "materials",
    requires: ["materials-refinement-1"],
    readiness: "concept",
    previewGrants: ["Finer material grades", "Better yield per raw find"]
  },
  "advanced-rare-materials": {
    id: "advanced-rare-materials",
    name: "Advanced & Rare Materials",
    summary: "The stuff that only turns up once you know what to look for.",
    branch: "materials",
    requires: ["materials-refinement-2"],
    readiness: "concept",
    previewGrants: ["Rare material finds", "Exclusive material swatches"]
  },
  // --- Building & Construction: tinkering sub-thread ------------------------
  "building-tinkering-basics": {
    id: "building-tinkering-basics",
    name: "Building & Tinkering",
    summary: "Taking things apart, and getting them back together better.",
    branch: "building-construction",
    requires: ["materials-refinement-1"],
    readiness: "concept",
    previewGrants: ["Salvage & disassembly", "Tinkering plans"]
  },
  "fixing-improvements": {
    id: "fixing-improvements",
    name: "Fixing & Improvements",
    summary: "Repairs that leave a thing better than you found it.",
    branch: "building-construction",
    requires: ["building-tinkering-basics"],
    readiness: "concept",
    previewGrants: ["Repair actions", "Upgrade options"]
  },
  "small-furniture-building": {
    id: "small-furniture-building",
    name: "Small Furniture Building",
    summary: "Stools, shelves, and the first things you build to keep.",
    branch: "building-construction",
    requires: ["fixing-improvements"],
    readiness: "concept",
    previewGrants: ["New small furniture designs", "Stool & shelving plans"]
  },
  "large-furniture-building": {
    id: "large-furniture-building",
    name: "Large Furniture Building",
    summary: "Bigger joins, bigger pieces, bigger mistakes if you rush it.",
    branch: "building-construction",
    requires: ["small-furniture-building"],
    readiness: "concept",
    previewGrants: ["Tables & wardrobes", "Large furniture plans"]
  },
  "painting-and-staining": {
    id: "painting-and-staining",
    name: "Painting & Staining",
    summary: 'The finish that turns "built" into "yours".',
    branch: "building-construction",
    requires: ["large-furniture-building"],
    readiness: "concept",
    // The natural home for a real `designId` on a placed piece — the seam
    // PlacedPiece already carries, unused, for exactly this.
    previewGrants: ["Paint & stain finishes", "New surface designs"]
  },
  // --- Building & Construction: structures sub-thread -----------------------
  "intro-to-structures": {
    id: "intro-to-structures",
    name: "Intro to Structures",
    summary: "The jump from furniture to something you can walk inside.",
    branch: "building-construction",
    requires: ["large-furniture-building"],
    readiness: "concept",
    previewGrants: ["Walls & simple structures", "Roofed spaces"]
  },
  "structural-analysis": {
    id: "structural-analysis",
    name: "Structural Analysis",
    summary: "Why a structure stands, in terms you can plan around.",
    branch: "building-construction",
    requires: ["intro-to-structures"],
    readiness: "concept",
    previewGrants: ["Structural stability notes", "Bigger structure plans"]
  },
  "foundation-design": {
    id: "foundation-design",
    name: "Foundation Design",
    summary: "Everything above ground depends on this being right.",
    branch: "building-construction",
    requires: ["structural-analysis"],
    readiness: "concept"
  },
  "structural-dynamics": {
    id: "structural-dynamics",
    name: "Structural Dynamics",
    summary: "How a structure behaves under load, not just at rest.",
    branch: "building-construction",
    requires: ["foundation-design"],
    readiness: "concept"
  },
  "advanced-structures": {
    id: "advanced-structures",
    name: "Advanced Structures",
    summary: "Bigger builds, and the confidence to attempt them.",
    branch: "building-construction",
    requires: ["structural-dynamics"],
    readiness: "concept"
  },
  "blueprint-making": {
    id: "blueprint-making",
    name: "Blueprint Making",
    summary: "Planning a whole build before the first cut.",
    branch: "building-construction",
    requires: ["advanced-structures"],
    readiness: "concept"
  },
  "auto-cad": {
    id: "auto-cad",
    name: "Auto CAD",
    summary: "Letting the drawing do some of the thinking for you.",
    branch: "building-construction",
    requires: ["blueprint-making"],
    readiness: "concept"
  },
  // --- Interior Design -------------------------------------------------------
  "interior-design-concepts": {
    id: "interior-design-concepts",
    name: "Interior Design Concepts",
    summary: "Making a finished room feel like somewhere to be.",
    branch: "interior-design",
    requires: ["painting-and-staining"],
    readiness: "concept"
  },
  "color-theory-basics": {
    id: "color-theory-basics",
    name: "Color Theory Basics",
    summary: "Why some rooms feel calm and others feel like a mistake.",
    branch: "interior-design",
    requires: ["interior-design-concepts"],
    readiness: "concept"
  },
  "balance-and-flow": {
    id: "balance-and-flow",
    name: "Balance & Flow",
    summary: "Arranging a room so it moves the way you'd walk through it.",
    branch: "interior-design",
    requires: ["color-theory-basics"],
    readiness: "concept"
  },
  "interior-lighting": {
    id: "interior-lighting",
    name: "Interior Lighting",
    summary: "The difference between a lit room and a warm one.",
    branch: "interior-design",
    requires: ["balance-and-flow"],
    readiness: "concept"
  },
  "creating-spaces": {
    id: "creating-spaces",
    name: "Creating Spaces",
    summary: "Turning one big room into several small, right ones.",
    branch: "interior-design",
    requires: ["interior-lighting"],
    readiness: "concept"
  },
  "organization-techniques": {
    id: "organization-techniques",
    name: "Organization Techniques",
    summary: "A place for everything, and a reason it lives there.",
    branch: "interior-design",
    requires: ["creating-spaces"],
    readiness: "concept"
  },
  "elevating-space-with-decoration": {
    id: "elevating-space-with-decoration",
    name: "Elevating Space with Decoration",
    summary: "The last ten percent that makes a room feel finished.",
    branch: "interior-design",
    requires: ["organization-techniques"],
    readiness: "concept"
  },
  // --- Fine Arts & Textiles: fiber sub-thread -------------------------------
  "intro-to-fibers": {
    id: "intro-to-fibers",
    name: "Intro to Fibers",
    summary: "What thread and cloth actually are, before you make either.",
    branch: "fine-arts-textiles",
    requires: [],
    readiness: "concept"
  },
  sewing: {
    id: "sewing",
    name: "Sewing",
    summary: "Joining fabric on purpose, and keeping it joined.",
    branch: "fine-arts-textiles",
    requires: ["intro-to-fibers"],
    readiness: "concept"
  },
  weaving: {
    id: "weaving",
    name: "Weaving",
    summary: "Making the cloth, not just working with it.",
    branch: "fine-arts-textiles",
    requires: ["intro-to-fibers"],
    readiness: "concept"
  },
  mending: {
    id: "mending",
    name: "Mending",
    summary: "A visible patch instead of a thrown-out shirt.",
    branch: "fine-arts-textiles",
    requires: ["sewing"],
    readiness: "concept"
  },
  "clothing-from-patterns": {
    id: "clothing-from-patterns",
    name: "Clothing from Patterns",
    summary: "Following someone else's good idea, precisely.",
    branch: "fine-arts-textiles",
    requires: ["sewing"],
    readiness: "concept"
  },
  "clothing-pattern-creation": {
    id: "clothing-pattern-creation",
    name: "Clothing Pattern Creation",
    summary: "Drafting your own good idea for someone else to follow.",
    branch: "fine-arts-textiles",
    requires: ["clothing-from-patterns"],
    readiness: "concept"
  },
  // --- Cooking -----------------------------------------------------------
  "cooking-basics": {
    id: "cooking-basics",
    name: "Cooking Basics",
    summary: "You cook what you grow \u2014 the first step past raw ingredients.",
    branch: "cooking",
    requires: ["growing-food"],
    readiness: "concept"
  },
  "knife-skills": {
    id: "knife-skills",
    name: "Knife Skills",
    summary: "Everything after this goes faster and safer because of it.",
    branch: "cooking",
    requires: ["cooking-basics"],
    readiness: "concept"
  },
  "food-prep-and-care": {
    id: "food-prep-and-care",
    name: "Food Prep & Care",
    summary: "Keeping ingredients good, from harvest to the pan.",
    branch: "cooking",
    requires: ["knife-skills"],
    readiness: "concept"
  },
  "spices-and-flavor": {
    id: "spices-and-flavor",
    name: "Spices & Flavor",
    summary: "The difference between fed and delighted.",
    branch: "cooking",
    requires: ["food-prep-and-care"],
    readiness: "concept"
  },
  grilling: {
    id: "grilling",
    name: "Grilling",
    summary: "Cooking over open flame, on purpose this time.",
    branch: "cooking",
    requires: ["spices-and-flavor"],
    readiness: "concept"
  },
  "advanced-cooking": {
    id: "advanced-cooking",
    name: "Advanced Cooking",
    summary: "Technique that used to be a recipe becomes a habit.",
    branch: "cooking",
    requires: ["grilling"],
    readiness: "concept"
  },
  "cooking-for-others": {
    id: "cooking-for-others",
    name: "Cooking for Others",
    summary: "The same meal, timed and plated for more than one person.",
    branch: "cooking",
    requires: ["advanced-cooking"],
    readiness: "concept"
  },
  "advanced-cooking-at-scale": {
    id: "advanced-cooking-at-scale",
    name: "Advanced Cooking at Scale",
    summary: "Feeding a crowd needs a field, not a garden bed.",
    branch: "cooking",
    requires: ["cooking-for-others", "farming-equipment-automation"],
    readiness: "concept"
  },
  // --- Fine Arts & Textiles: art sub-thread ---------------------------------
  "art-and-design-basics": {
    id: "art-and-design-basics",
    name: "Art & Design Basics",
    summary: "Looking closely, on purpose, before making anything.",
    branch: "fine-arts-textiles",
    requires: [],
    readiness: "concept"
  },
  "painting-and-drawing-1": {
    id: "painting-and-drawing-1",
    name: "Painting & Drawing 1",
    summary: "Getting what you see onto paper, roughly.",
    branch: "fine-arts-textiles",
    requires: ["art-and-design-basics"],
    readiness: "concept"
  },
  "painting-and-drawing-2": {
    id: "painting-and-drawing-2",
    name: "Painting & Drawing 2",
    summary: "Getting what you see onto paper, on purpose.",
    branch: "fine-arts-textiles",
    requires: ["painting-and-drawing-1"],
    readiness: "concept"
  },
  "advanced-art-concepts": {
    id: "advanced-art-concepts",
    name: "Advanced Art Concepts",
    summary: "A style of your own, not just a steadier hand.",
    branch: "fine-arts-textiles",
    requires: ["painting-and-drawing-2"],
    readiness: "concept"
  },
  // --- Transportation --------------------------------------------------------
  "transportation-basics": {
    id: "transportation-basics",
    name: "Transportation Basics",
    summary: "Wheels, axles, and why they want real materials under them.",
    branch: "transportation",
    requires: ["materials-refinement-2"],
    readiness: "concept"
  },
  "personal-transport": {
    id: "personal-transport",
    name: "Personal Transport",
    summary: "Faster than walking, still under your own power.",
    branch: "transportation",
    requires: ["transportation-basics"],
    readiness: "concept"
  },
  "small-engines": {
    id: "small-engines",
    name: "Small Engines",
    summary: "The first machine that moves you instead of the other way round.",
    branch: "transportation",
    requires: ["personal-transport", "advanced-rare-materials"],
    readiness: "concept"
  },
  automotive: {
    id: "automotive",
    name: "Automotive",
    summary: "A vehicle that has to hold together at real speed.",
    branch: "transportation",
    requires: ["small-engines", "advanced-structures"],
    readiness: "concept"
  },
  "rocket-science": {
    id: "rocket-science",
    name: "Rocket Science",
    summary: "The joke tech that isn't really a joke once it's this close.",
    branch: "transportation",
    requires: ["automotive", "auto-cad"],
    readiness: "concept"
  }
};
var TECH_NODE_ORDER = Object.keys(TECH_DEFS);

// src/sim/catalogs/questCatalog.expansion.ts
var QUEST_EXPANSION_DEFS = [
  // --- Favor: a single, small, warm step ------------------------------------
  {
    id: "favor-meadow-fiber",
    title: "Soft Stuffing",
    summary: "Gather mossy paper fiber for a nest lining.",
    tier: "favor",
    giverSpecies: ["bunny", "bird", "butterfly", "squirrel"],
    minFriendship: "curious",
    objectives: [{ kind: "collect", resource: "mossy-paper-fiber", quantity: 3 }],
    reward: { trinketFamily: "natural", trinketTag: "plant", friendship: 6 },
    opening: [
      "\u201CThe nest is lumpy in a way I have decided to care about,\u201D {{name}} sighs. \u201CThree tufts of mossy fiber and it would be a palace.\u201D"
    ],
    acceptLabel: "I\u2019ll gather some",
    acceptReply: ["\u201CIt grows in the soft green places. You will feel it before you see it.\u201D"],
    declineLabel: "Another time",
    declineReply: ["\u201CThe lump will keep. It always does.\u201D"],
    progressOpening: ["\u201CAny fiber yet? The lump is still there. Judging me.\u201D"],
    turnInOpening: ["\u201COh, that is lovely and soft.\u201D {{name}} tucks it in. \u201CHere \u2014 I found this and it made me think of you.\u201D"],
    turnInReply: ["{{name}} presses a small treasure into your palm."]
  },
  {
    id: "favor-bluefold-pond",
    title: "Pebbles by the Pond",
    summary: "Collect bluefold pebbles from the meadow.",
    tier: "favor",
    giverSpecies: ["raccoon", "cat", "bird"],
    minFriendship: "curious",
    objectives: [{ kind: "collect", resource: "bluefold-pebbles", quantity: 2 }],
    reward: { trinketFamily: "natural", trinketTag: "material:stone", friendship: 6 },
    opening: [
      "\u201CBluefold pebbles,\u201D {{name}} says dreamily. \u201CThey only lie about in the meadow. Two of them and I will consider my day complete.\u201D"
    ],
    acceptLabel: "I\u2019ll look",
    acceptReply: ["\u201CSoft blue, folded over like a letter. You cannot miss them once you notice them.\u201D"],
    declineLabel: "Not now",
    declineReply: ["\u201CThey are very good at waiting, pebbles.\u201D"],
    progressOpening: ["\u201CBluefolds? They look like tiny folded letters.\u201D"],
    turnInOpening: ["\u201CYes, exactly these.\u201D {{name}} rolls them between their paws. \u201CTake this in trade. It is shinier than a pebble, I promise.\u201D"],
    turnInReply: ["{{name}} hands over a shiny little thing."]
  },
  {
    id: "favor-dark-earth",
    title: "Pocketful of Dusk",
    summary: "Bring a little carbon soil back from under the trees.",
    tier: "favor",
    giverSpecies: ["woodchuck", "raccoon", "bunny"],
    giverPersonalities: ["curious", "gentle"],
    minFriendship: "curious",
    objectives: [{ kind: "collect", resource: "carbon-soil", quantity: 2 }],
    reward: { trinketFamily: "natural", trinketTag: "biome:forest", friendship: 6 },
    opening: [
      "\u201CYou have the look of someone who has not dug in the woods yet,\u201D {{name}} says. \u201CTwo scoops of the dark soil under the pines and I will call you a proper forager.\u201D"
    ],
    acceptLabel: "I\u2019ll dig some up",
    acceptReply: ["\u201CTake a shovel to the forest floor. The dark stuff hides just under the surface.\u201D"],
    declineLabel: "Not today",
    declineReply: ["\u201CNo hurry. The forest keeps its dark in the same place.\u201D"],
    progressOpening: ["\u201CAny dark soil yet? It looks like night that fell down and stayed.\u201D"],
    turnInOpening: ["{{name}} rubs the soil between two fingers. \u201CPerfect. Here \u2014 I dug this up a while ago and never found the right person for it.\u201D"],
    turnInReply: ["{{name}} presses a small earthy keepsake into your hand."]
  },
  {
    id: "favor-pink-shavings",
    title: "Pink Shavings",
    summary: "Gather ribbonwood sticks for a woodchuck\u2019s workbench.",
    tier: "favor",
    giverSpecies: ["woodchuck", "squirrel", "cat"],
    minFriendship: "curious",
    objectives: [{ kind: "collect", resource: "ribbonwood-sticks", quantity: 3 }],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 6 },
    opening: [
      "\u201CRibbonwood,\u201D {{name}} says, sniffing the air as if it were a smell. \u201CThe pinkish sticks. Three of them and my bench stops wobbling.\u201D"
    ],
    acceptLabel: "I\u2019ll find them",
    acceptReply: ["\u201CForest floor and scrap flats both. They lie about looking important.\u201D"],
    declineLabel: "Another time",
    declineReply: ["\u201CThe wobble is patient. So am I, mostly.\u201D"],
    progressOpening: ["\u201CThree pinkish sticks. Then the bench and I have words.\u201D"],
    turnInOpening: ["\u201CLook at the grain on those.\u201D {{name}} sets them in a neat row. \u201CTake this in trade. I made it, so keep your expectations low and your gratitude high.\u201D"],
    turnInReply: ["{{name}} hands over a small handmade thing."]
  },
  {
    id: "favor-just-one-scoop",
    title: "Just One Scoop",
    summary: "Open the top layer of soil with a shovel.",
    tier: "favor",
    giverSpecies: ["raccoon", "woodchuck", "fox"],
    giverPersonalities: ["bold", "curious"],
    minFriendship: "curious",
    objectives: [{ kind: "dig", layer: 1 }],
    reward: { trinketFamily: "curious", trinketTag: "metal", friendship: 7 },
    opening: [
      "\u201CEverything good starts with one honest scoop of ground,\u201D {{name}} says, tapping the paper with a foot. \u201CMake yourself a shovel and take one. Just one.\u201D"
    ],
    acceptLabel: "I\u2019ll dig in",
    acceptReply: ["\u201CThe flimsy one will do. It only has to be brave for a moment.\u201D"],
    declineLabel: "Maybe later",
    declineReply: ["\u201CThe ground is not going anywhere. Rude of it, honestly.\u201D"],
    progressOpening: ["\u201CHave you opened the top layer yet? It makes a very satisfying sound.\u201D"],
    turnInOpening: ["\u201CThere. You did a real thing to the real world.\u201D {{name}} looks genuinely proud. \u201CHere, for the first hole.\u201D"],
    turnInReply: ["{{name}} gives you a curious little find."]
  },
  {
    id: "favor-berry-beginnings",
    title: "Berry Beginnings",
    summary: "Plant a raspberry bush from a seed packet.",
    tier: "favor",
    giverSpecies: ["bunny", "butterfly", "bird"],
    giverPersonalities: ["gentle", "curious"],
    minFriendship: "curious",
    objectives: [{ kind: "plant", seedId: "raspberry-bush-seeds" }],
    reward: { trinketFamily: "natural", trinketTag: "plant", friendship: 7 },
    opening: [
      "\u201CRaspberries are mostly patience with a little joy on top,\u201D {{name}} says. \u201CSow one bush. I want to watch it decide to be a bush.\u201D"
    ],
    acceptLabel: "I\u2019ll plant one",
    acceptReply: ["\u201CDig a bed first, then tuck it in. The packet turns up in the clearing and the meadow.\u201D"],
    declineLabel: "Not right now",
    declineReply: ["\u201CSeeds wait better than anyone. It is their whole talent.\u201D"],
    progressOpening: ["\u201CIs the raspberry bush in the ground yet? I keep checking on it from here.\u201D"],
    turnInOpening: ["\u201CYou planted it!\u201D {{name}} does a small hop. \u201CIn a while there will be berries and I will be insufferable about them. Take this now, before I am.\u201D"],
    turnInReply: ["{{name}} hands over a small green keepsake."]
  },
  {
    id: "favor-a-neat-pine",
    title: "A Neat Little Pine",
    summary: "Trim a pine tree and tidy its shaggy branches.",
    tier: "favor",
    giverSpecies: ["bird", "squirrel", "woodchuck"],
    minFriendship: "curious",
    objectives: [{ kind: "trim", species: "pine" }],
    reward: { trinketFamily: "natural", trinketTag: "material:wood", friendship: 7 },
    opening: [
      "\u201CThat pine by the path is getting positively shaggy,\u201D {{name}} says. \u201CA little trim would do it a world of good. Trees enjoy a haircut as much as anyone.\u201D"
    ],
    acceptLabel: "I\u2019ll tidy it",
    acceptReply: ["\u201CKid\u2019s scissors are plenty. A pine is a forgiving thing to practise on.\u201D"],
    declineLabel: "Not now",
    declineReply: ["\u201CIt will keep being shaggy. That is what pines do best.\u201D"],
    progressOpening: ["\u201CDid you get to the pine? I have been imagining it tidier.\u201D"],
    turnInOpening: ["\u201CMuch better.\u201D {{name}} studies the tree with an expert squint. \u201CYou have a good eye for a haircut. Here, for your trouble.\u201D"],
    turnInReply: ["{{name}} gives you a tidy little keepsake."]
  },
  {
    id: "favor-under-the-green",
    title: "Under the Green",
    summary: "Walk into the forest and stand a while under the trees.",
    tier: "favor",
    giverSpecies: ["butterfly", "fox", "bunny", "cat"],
    minFriendship: "curious",
    objectives: [{ kind: "visitBiome", biome: "forest" }],
    reward: { trinketFamily: "seasonal", trinketTag: "biome:forest", friendship: 6 },
    opening: [
      "\u201CSome people have never stood under a proper canopy,\u201D {{name}} says. \u201CGo into the forest. Just once. Stand still and let it be tall at you.\u201D"
    ],
    acceptLabel: "I\u2019ll go stand there",
    acceptReply: ["\u201CFollow the paper until the light goes green. You will not miss it.\u201D"],
    declineLabel: "Later",
    declineReply: ["\u201CThe forest is very good at waiting. It has practice.\u201D"],
    progressOpening: ["\u201CBeen under the trees yet? The quiet there is a different quiet.\u201D"],
    turnInOpening: ["\u201CYou went.\u201D {{name}} nods slowly. \u201CGood. Green does something to a person. Here is a small thing for going.\u201D"],
    turnInReply: ["{{name}} hands over a leaf-warm token."]
  },
  {
    id: "favor-a-root-worth-it",
    title: "A Root Worth Digging",
    summary: "Harvest a couple of crinkle carrots from your garden.",
    tier: "favor",
    giverSpecies: ["bunny", "woodchuck", "bird", "fox"],
    minFriendship: "curious",
    objectives: [{ kind: "harvest", resource: "crinkle-carrots", quantity: 2 }],
    reward: { trinketFamily: "natural", trinketTag: "plant", friendship: 7 },
    opening: [
      "\u201CCarrots are the best argument for digging that anyone ever made,\u201D {{name}} says. \u201CGrow a row and bring me two. Frilly tops, hidden prizes underneath.\u201D"
    ],
    acceptLabel: "I\u2019ll bring carrots",
    acceptReply: ["\u201CSow crinkle-carrot seeds, wait them out, then pull. The packet is in the clearing and the meadow.\u201D"],
    declineLabel: "Another time",
    declineReply: ["\u201CCarrots keep. In the ground, especially.\u201D"],
    progressOpening: ["\u201CAny carrots come up? I can practically taste the tops.\u201D"],
    turnInOpening: ["\u201COh, look at the crinkle on those.\u201D {{name}} is delighted by a vegetable. \u201CYou are a gardener now. Take this, gardener.\u201D"],
    turnInReply: ["{{name}} gives you something in honour of the harvest."]
  },
  {
    id: "favor-this-way-is-friendly",
    title: "This Way Is Friendly",
    summary: "Lay down a path plank so the way reads as walked.",
    tier: "favor",
    giverSpecies: ["raccoon", "cat", "bunny"],
    giverPersonalities: ["bold", "mischievous"],
    minFriendship: "curious",
    objectives: [{ kind: "place", templateKey: "path-plank" }],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 6 },
    opening: [
      "\u201CA path is just a rumour that someone already walked here,\u201D {{name}} says. \u201CPut down one plank. Two if you are feeling generous. Then the next person knows the way.\u201D"
    ],
    acceptLabel: "I\u2019ll lay one down",
    acceptReply: ["\u201CAnywhere it makes sense to walk. A hammer helps. Confidence helps more.\u201D"],
    declineLabel: "Not just now",
    declineReply: ["\u201CThe grass will keep pretending to be a path. Poorly.\u201D"],
    progressOpening: ["\u201CAny planks down yet? The world could use one obvious hint.\u201D"],
    turnInOpening: ["\u201CI took the path. It was very legible.\u201D {{name}} looks pleased with the world. \u201CHere. A little something from a grateful traveller.\u201D"],
    turnInReply: ["{{name}} presses a small keepsake into your hand."]
  },
  // --- Errand: two steps, a friendly nudge ----------------------------------
  {
    id: "errand-cardboard-stack",
    title: "A Stack of Card",
    summary: "Bring sunbaked cardboard back from the dry places.",
    tier: "errand",
    giverSpecies: ["woodchuck", "raccoon"],
    giverPersonalities: ["curious", "bold"],
    minFriendship: "friend",
    objectives: [{ kind: "collect", resource: "sunbaked-cardboard", quantity: 3 }],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 8 },
    opening: [
      "\u201CYou have been out in the dry country,\u201D {{name}} observes. \u201CGood. Cardboard sunbakes out there into something worth building with. Three sheets and I will show you.\u201D"
    ],
    acceptLabel: "I\u2019ll bring it back",
    acceptReply: ["\u201CDunes and flats. Bring a good grip \u2014 it is heavier than it looks.\u201D"],
    declineLabel: "Later",
    declineReply: ["\u201CCard keeps. Mostly.\u201D"],
    progressOpening: ["\u201CThree sheets of sunbaked card. Then we build.\u201D"],
    turnInOpening: ["\u201CExcellent stock.\u201D {{name}} sets it aside with real care. \u201CHere is something from my own shelf.\u201D"],
    turnInReply: ["{{name}} gives you a well-made keepsake."]
  },
  {
    id: "errand-first-bench",
    title: "Somewhere to Sit",
    summary: "Place a paper bench out in the world.",
    tier: "errand",
    giverSpecies: ["woodchuck", "raccoon", "cat", "fox"],
    minFriendship: "friend",
    objectives: [{ kind: "place", templateKey: "paper-bench" }],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 9 },
    opening: [
      "\u201CA world with no benches is a world that expects you to keep moving,\u201D {{name}} says darkly. \u201CBuild one. Put it anywhere. Prove them wrong.\u201D"
    ],
    acceptLabel: "I\u2019ll build a bench",
    acceptReply: ["\u201CIt wants a hammer and a few materials. Anywhere with a view will do.\u201D"],
    declineLabel: "Can\u2019t right now",
    declineReply: ["\u201CThe world will keep expecting things of you. So be it.\u201D"],
    progressOpening: ["\u201CBench? Out there? Somewhere?\u201D"],
    turnInOpening: ["\u201CI saw it. I sat on it. It was extremely good.\u201D {{name}} hands you a reward with a flourish."],
    turnInReply: ["{{name}} gives you a trinket to commemorate the bench."]
  },
  {
    id: "errand-clay-and-cardstone",
    title: "Clay and Cardstone",
    summary: "Bring ochre clay and graphite cardstone to a builder.",
    tier: "errand",
    giverSpecies: ["woodchuck", "raccoon", "meerkat"],
    minFriendship: "friend",
    objectives: [
      { kind: "collect", resource: "ochre-paperclay", quantity: 2 },
      { kind: "collect", resource: "graphite-cardstone", quantity: 1 }
    ],
    reward: { trinketFamily: "found", trinketTag: "metal", friendship: 9 },
    opening: [
      "{{name}} has laid out two empty dishes, which is either very organised or very pointed. \u201CClay for the shape. Cardstone for the spine. Bring me some of each and I will show you a proper join.\u201D"
    ],
    acceptLabel: "Clay and cardstone, got it",
    acceptReply: ["\u201CClay comes up anywhere you dig. Cardstone hides deeper, or lies loose in the forest and the scrap.\u201D"],
    declineLabel: "Later",
    declineReply: ["\u201CThe dishes will sit empty. They are used to it.\u201D"],
    progressOpening: ["\u201CTwo dishes, remember. Clay here, cardstone there.\u201D"],
    turnInOpening: ["\u201CGood stock. Now watch what two ordinary sorts of rock become in the right hands.\u201D {{name}} hands you the result with due ceremony."],
    turnInReply: ["{{name}} gives you something well-made in return."]
  },
  {
    id: "errand-cabbage-twice-over",
    title: "Cabbage, Twice Over",
    summary: "Sow folded-cabbage and bring back two heads.",
    tier: "errand",
    giverSpecies: ["bunny", "woodchuck", "bird"],
    minFriendship: "friend",
    objectives: [
      { kind: "plant", seedId: "folded-cabbage-seeds" },
      { kind: "harvest", resource: "folded-cabbage", quantity: 2 }
    ],
    reward: { trinketFamily: "natural", trinketTag: "plant", friendship: 9 },
    opening: [
      "\u201CCabbage is the most patient vegetable,\u201D {{name}} says. \u201CYou put it in the ground, you forget about it, and months later it is enormous and slightly smug. Sow some. Bring me two heads.\u201D"
    ],
    acceptLabel: "I\u2019ll grow cabbage",
    acceptReply: ["\u201CSeed packets turn up in the clearing and the forest. Dig the bed, tuck them in, and let them get on with it.\u201D"],
    declineLabel: "Not today",
    declineReply: ["\u201CCabbage does not need you today. It never has, really.\u201D"],
    progressOpening: ["\u201CHow is the cabbage? Enormous yet? Smug yet?\u201D"],
    turnInOpening: ["\u201CLook at the folds on these.\u201D {{name}} weighs a head in each paw, satisfied. \u201CYou grew a whole vegetable. Here is a reward with some weight to it.\u201D"],
    turnInReply: ["{{name}} gives you a solid little keepsake."]
  },
  {
    id: "errand-the-layer-underneath",
    title: "The Layer Underneath",
    summary: "Learn to reach the compact layer, then dig down to it.",
    tier: "errand",
    giverSpecies: ["woodchuck", "raccoon", "fox", "meerkat"],
    giverPersonalities: ["curious", "bold"],
    minFriendship: "friend",
    objectives: [
      { kind: "learnTech", nodeId: "digging-2" },
      { kind: "dig", layer: 2 }
    ],
    reward: { trinketFamily: "curious", trinketTag: "metal", friendship: 10 },
    opening: [
      "\u201CThe surface is just the lid,\u201D {{name}} says. \u201CUnder it there is a compact layer, pressed flat and full of better things. Learn the trick of reaching it, then go down a second time.\u201D"
    ],
    acceptLabel: "I\u2019ll dig deeper",
    acceptReply: ["\u201CThe Professor keeps the plan. Learn it, make the next shovel up, and there you are.\u201D"],
    declineLabel: "Another day",
    declineReply: ["\u201CIt has been under there a long while. It is not impatient.\u201D"],
    progressOpening: ["\u201CHave you been past the first layer yet? That is where it gets interesting.\u201D"],
    turnInOpening: ["\u201CYou went down.\u201D {{name}} actually looks impressed. \u201CThe compact layer keeps its treasures close. So do I \u2014 here.\u201D"],
    turnInReply: ["{{name}} hands over a curious keepsake."]
  },
  {
    id: "errand-twig-and-bench",
    title: "Twigs into a Bench",
    summary: "Gather kraft twigs, then set a paper bench down in the world.",
    tier: "errand",
    giverSpecies: ["woodchuck", "raccoon", "cat"],
    giverPersonalities: ["curious", "dramatic"],
    minFriendship: "friend",
    exclusivityGroup: "somewhere-to-sit",
    objectives: [
      { kind: "collect", resource: "kraft-twigs", quantity: 3 },
      { kind: "place", templateKey: "paper-bench" }
    ],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 9 },
    opening: [
      "\u201CTwigs are just benches that have not been told what to do yet,\u201D {{name}} says. \u201CBring me three good ones \u2014 no, better: bring me the bench. Gather the twigs, then build it and set it down somewhere.\u201D"
    ],
    acceptLabel: "I\u2019ll bring it, then build it",
    acceptReply: ["\u201CTwigs lie loose in the clearing, the forest, and the meadow. After that, a hammer and a bit of nerve.\u201D"],
    declineLabel: "Can\u2019t right now",
    declineReply: ["\u201CThe twigs will keep being twigs. That is the one thing they are reliable about.\u201D"],
    progressOpening: ["\u201CTwigs gathered? Bench placed? Either is a step.\u201D"],
    turnInOpening: ["\u201CI found it. I sat on it. It held.\u201D {{name}} sounds faintly amazed. \u201CHere, since you clearly build real things now.\u201D"],
    turnInReply: ["{{name}} gives you a well-made reward."]
  },
  {
    id: "errand-fiber-and-sand",
    title: "Fiber from the Sand",
    summary: "Collect palm fiber and stand out in the dunes.",
    tier: "errand",
    giverSpecies: ["meerkat", "fox", "bird"],
    minFriendship: "friend",
    biomes: ["dunes"],
    objectives: [
      { kind: "collect", resource: "palm-fiber", quantity: 2 },
      { kind: "visitBiome", biome: "dunes" }
    ],
    reward: { trinketFamily: "seasonal", trinketTag: "biome:dunes", friendship: 9 },
    opening: [
      "\u201COut in the sand there are palms that will hand you a soft gray fiber if you ask politely,\u201D {{name}} says. \u201CBring me a little, and see the dunes while you are there.\u201D"
    ],
    acceptLabel: "I\u2019ll go out to the sand",
    acceptReply: ["\u201CScissors take the fiber off a palm. Mind the sun, and mind the sentries \u2014 they mean well.\u201D"],
    declineLabel: "Too far, for now",
    declineReply: ["\u201CThe sand is a long walk. It understands about long walks.\u201D"],
    progressOpening: ["\u201CAny palm fiber yet? Have you stood out on the sand?\u201D"],
    turnInOpening: ["\u201CSoft as anything.\u201D {{name}} turns the fiber over. \u201CAnd you took the walk. Here \u2014 something from out where the paper runs out.\u201D"],
    turnInReply: ["{{name}} gives you a sun-warm keepsake."]
  },
  // --- Odyssey: multi-step, high friendship, carries something --------------
  {
    id: "odyssey-learn-something",
    title: "Meet the Professor",
    summary: "Learn a new plan at the knowledge tree.",
    tier: "odyssey",
    giverSpecies: ["squirrel", "raccoon", "fox", "cat", "meerkat"],
    minFriendship: "buddy",
    objectives: [{ kind: "place", templateKey: "paper-lamp" }],
    reward: { trinketFamily: "curious", friendship: 15 },
    opening: [
      "\u201CYou cannot keep making the same four things forever,\u201D {{name}} says, not unkindly. \u201CGo and learn something. Then come back and show me a paper lamp, so I know it took.\u201D"
    ],
    acceptLabel: "I\u2019ll learn something new",
    acceptReply: ["\u201CThe Professor will set you up. Patience or doing \u2014 either works. Bring back a lamp.\u201D"],
    declineLabel: "Not yet",
    declineReply: ["\u201CLearning keeps too. But it keeps better if you use it.\u201D"],
    progressOpening: ["\u201CA paper lamp, once you have learned how. I will be right here.\u201D"],
    turnInOpening: ["\u201CA lamp! You learned a whole thing.\u201D {{name}} turns it over, delighted. \u201CHere. For the shelf of someone who is becoming someone.\u201D"],
    turnInReply: ["{{name}} gives you a curious trinket in celebration."]
  },
  {
    id: "odyssey-message-to-chisel",
    title: "Message for the Mill",
    summary: "Carry word from a neighbor to the woodchuck at the mill.",
    tier: "odyssey",
    giverSpecies: ["raccoon", "fox", "cat", "meerkat", "bird"],
    minFriendship: "pet",
    objectives: [{ kind: "talk", critterId: "-2,0#woodchuck" }],
    reward: { trinketFamily: "story", friendship: 16 },
    opening: [
      "{{name}} looks around, then lowers their voice. \u201CThe woodchuck at the mill \u2014 tell them the offcut was worth it. They will know exactly what I mean. That is all. Just that.\u201D"
    ],
    acceptLabel: "I\u2019ll tell them",
    acceptReply: ["\u201CThank you. The mill is one page over; the big saw gives it away.\u201D"],
    declineLabel: "Not right now",
    declineReply: ["\u201CIt has waited a while already. It can wait a little more.\u201D"],
    progressOpening: ["\u201CHave you been to the mill yet? The woodchuck is hard to miss.\u201D"],
    turnInOpening: ["\u201CYou told them.\u201D {{name}} exhales. \u201CGood. Here \u2014 this is the kind of thing you give to someone who carries messages properly.\u201D"],
    turnInReply: ["{{name}} hands over a trinket with real weight to it."]
  },
  {
    id: "odyssey-curls-and-lumber",
    title: "Curls and Lumber",
    summary: "Make heavier shears, cut bark curls from a redwood, and bind it all into lumber.",
    tier: "odyssey",
    giverSpecies: ["woodchuck", "raccoon", "fox"],
    minFriendship: "buddy",
    objectives: [
      { kind: "craftTool", family: "scissors", tier: 2 },
      { kind: "collect", resource: "redwood-bark-curls", quantity: 2 },
      { kind: "craft", recipeId: "bound-lumber" }
    ],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 14 },
    opening: [
      "\u201CLumber is a promise you make to twigs,\u201D {{name}} says. \u201CBut first you need curls, and a redwood laughs off kid\u2019s scissors. Make the heavier shears. Cut the curls. Bind it into something flat and square.\u201D",
      "\u201CThere is no shortcut to good lumber. That is rather the point of it.\u201D"
    ],
    acceptLabel: "Curls, then lumber",
    acceptReply: ["\u201CSturdy shears come from the tree of knowledge \u2014 make the kids\u2019 pair first, then the heavier ones. The rest is just work.\u201D"],
    declineLabel: "Not the whole job",
    declineReply: ["\u201CGood lumber is not a someday thing. Fair enough.\u201D"],
    progressOpening: ["\u201CHeavy shears? Curls? Lumber? Where has it got to?\u201D"],
    turnInOpening: ["\u201CA square, flat, honest length of lumber.\u201D {{name}} holds it to the light. \u201CYou have gone from a person who gathers to a person who makes. Here \u2014 for the shelf of a maker.\u201D"],
    turnInReply: ["{{name}} hands you something clearly meant for a maker."]
  },
  {
    id: "odyssey-word-across-the-paper",
    title: "Word Across the Paper",
    summary: "Carry a greeting to Chisel at the mill and Pip at the seed store.",
    tier: "odyssey",
    giverSpecies: ["squirrel", "raccoon", "bird", "meerkat"],
    minFriendship: "pet",
    objectives: [
      { kind: "visitPage", pageId: "-2,0" },
      { kind: "talk", critterId: "-2,0#woodchuck" },
      { kind: "talk", critterId: "1,0#pip" }
    ],
    reward: { trinketFamily: "story", friendship: 16 },
    opening: [
      "{{name}} has been quiet for a while, which for them is almost a speech. \u201CTwo friends of mine are far apart and never hear from each other. Would you carry a greeting to both? Just that we are still thinking of them.\u201D",
      "\u201CIt is not a big thing. It is just the kind of thing that keeps the world stitched.\u201D"
    ],
    acceptLabel: "I\u2019ll carry your wishes",
    acceptReply: ["\u201CChisel keeps the mill, two pages over. Pip keeps the seed store, the other way. Tell them both hello from me.\u201D"],
    declineLabel: "Too much walking",
    declineReply: ["\u201CTwo pages is a lot. I understand; it has kept this long.\u201D"],
    progressOpening: ["\u201CHave you reached either of them yet? The mill, or the seed store?\u201D"],
    turnInOpening: ["\u201CYou saw them both.\u201D {{name}} is quiet a moment, then not. \u201CThey remember me. Good. Here \u2014 this is for someone who carries words kindly.\u201D"],
    turnInReply: ["{{name}} gives you a trinket that plainly matters to them."]
  },
  {
    id: "odyssey-sow-the-sand",
    title: "Something Growing in the Sand",
    summary: "Reach the dunes, cut a little palm, and grow a tomato where nothing grows.",
    tier: "odyssey",
    giverSpecies: ["meerkat", "fox", "raccoon"],
    minFriendship: "buddy",
    biomes: ["dunes"],
    objectives: [
      { kind: "visitBiome", biome: "dunes" },
      { kind: "trim", species: "palm" },
      { kind: "plant", seedId: "paper-tomato-seeds" }
    ],
    reward: { trinketFamily: "seasonal", trinketTag: "biome:dunes", friendship: 15 },
    opening: [
      "\u201CEveryone says nothing grows out here,\u201D {{name}} says, with a glance at the horizon. \u201CI would very much like you to be rude about that. Take a clipping off a palm, then grow a tomato in the sand and prove them tedious.\u201D"
    ],
    acceptLabel: "I\u2019ll grow one in the sand",
    acceptReply: ["\u201CPalms are out in the dunes; nothing else woody grows there. Tomato packets turn up in the meadow and the sand both.\u201D"],
    declineLabel: "The sand wins this time",
    declineReply: ["\u201CThe sand usually does. But not always.\u201D"],
    progressOpening: ["\u201CPalm clipped? Tomato planted? Even one of those is a good day.\u201D"],
    turnInOpening: ["\u201CYou put something green in the sand.\u201D {{name}} does not look at the horizon at all. \u201CThat is a real thing. Take this \u2014 it has been waiting for someone who would.\u201D"],
    turnInReply: ["{{name}} hands you a sun-worn keepsake."]
  },
  {
    id: "odyssey-the-travelling-plant",
    title: "A Plant for the Mill",
    summary: "Lift a growing buttonbloom and carry it to Chisel at the mill.",
    tier: "odyssey",
    giverSpecies: ["bunny", "squirrel", "raccoon", "butterfly"],
    giverPersonalities: ["gentle", "curious"],
    minFriendship: "buddy",
    objectives: [
      { kind: "deliver", itemId: "plant:buttonbloom-seeds" },
      { kind: "talk", critterId: "-2,0#woodchuck" }
    ],
    reward: { trinketFamily: "story", trinketTag: "plant", friendship: 14 },
    opening: [
      "\u201CChisel spends all day at the mill and never sees anything green,\u201D {{name}} says. \u201CGrow a Buttonbloom, lift it carefully, and carry it over. A living plant is a better gift than a finished one.\u201D"
    ],
    acceptLabel: "I\u2019ll grow one and bring it",
    acceptReply: ["\u201CPlant a Buttonbloom and let it root, then lift it with your hoe. It will travel fine. Chisel is two pages over, at the big saw.\u201D"],
    declineLabel: "Not this time",
    declineReply: ["\u201CIt is the sort of errand that should be chosen, not asked twice.\u201D"],
    progressOpening: ["\u201CIs there a little plant in your pockets yet? Chisel has no idea it is coming.\u201D"],
    turnInOpening: ["\u201CYou carried a whole living thing across the paper.\u201D {{name}} is quietly delighted. \u201CChisel will not stop talking about it. Here \u2014 for the plant-bearer.\u201D"],
    turnInReply: ["{{name}} gives you a keepsake that smells faintly of soil."]
  }
];

// src/sim/catalogs/quests.ts
var AUTHORED_QUESTS = [
  {
    id: "favor-first-shiny",
    title: "Something Shiny",
    summary: "Bring a few confetti stones to a critter who collects them.",
    tier: "favor",
    giverSpecies: ["raccoon", "bird", "fox", "meerkat"],
    minFriendship: "curious",
    objectives: [{ kind: "collect", resource: "confetti-stones", quantity: 3 }],
    reward: { trinketFamily: "found", friendship: 6 },
    opening: [
      "{{name}} looks at you, then at your pockets, then back at you. \u201CSo. Hypothetically. If you happened to find three confetti stones, I would be extremely normal about it.\u201D"
    ],
    acceptLabel: "I\u2019ll find some",
    acceptReply: ["\u201CExcellent. No rush. I will simply be here, being normal.\u201D"],
    declineLabel: "Maybe later",
    declineReply: ["\u201CUnderstood. I will be normal about that too.\u201D"],
    progressOpening: ["\u201CConfetti stones. Three of them. I am being so normal right now.\u201D"],
    turnInOpening: ["{{name}} turns the stones over and over, delighted. \u201CThese are perfect. Here \u2014 I have been saving this for someone who deserved it.\u201D"],
    turnInReply: ["{{name}} tucks a small something into your hand. \u201CA collector should collect.\u201D"]
  },
  {
    id: "favor-loose-twigs",
    title: "A Bundle of Twigs",
    summary: "Gather kraft twigs for a critter patching a nest.",
    tier: "favor",
    giverSpecies: ["squirrel", "bird", "bunny", "woodchuck"],
    minFriendship: "curious",
    objectives: [{ kind: "collect", resource: "kraft-twigs", quantity: 4 }],
    reward: { trinketFamily: "natural", friendship: 6 },
    opening: [
      "\u201CMy nest has a corner that sighs when the wind goes by,\u201D {{name}} admits. \u201CFour good kraft twigs would fix it right up.\u201D"
    ],
    acceptLabel: "I can gather those",
    acceptReply: ["\u201CYou are a hero and I will say so to everyone.\u201D"],
    declineLabel: "Not right now",
    declineReply: ["\u201CThat is fair. The corner will keep sighing.\u201D"],
    progressOpening: ["\u201CAny twigs yet? The corner is sighing as we speak.\u201D"],
    turnInOpening: ["{{name}} presses the twigs into the nest corner. \u201COh, that is so much better. Here, take this. I have had it forever and it deserves a better shelf than mine.\u201D"],
    turnInReply: ["{{name}} hands over a keepsake, looking pleased."]
  },
  {
    id: "favor-first-flower",
    title: "A First Bloom",
    summary: "Plant and grow a Buttonbloom, then bring back what it makes.",
    tier: "favor",
    giverSpecies: ["bunny", "butterfly"],
    giverPersonalities: ["gentle", "curious"],
    minFriendship: "curious",
    biomes: ["clearing", "meadow", "forest"],
    objectives: [{ kind: "plant", seedId: "buttonbloom-seeds" }],
    reward: { trinketFamily: "natural", trinketTag: "plant", friendship: 7 },
    opening: [
      "\u201CHave you put anything in the ground yet?\u201D {{name}} asks, entirely without judgement. \u201CEven one Buttonbloom changes how a clearing feels.\u201D"
    ],
    acceptLabel: "I\u2019ll plant one",
    acceptReply: ["\u201CFind a soft spot, dig a little, and give it time. I believe in you and in it.\u201D"],
    declineLabel: "Not today",
    declineReply: ["\u201CWhenever you like. The soil is patient.\u201D"],
    progressOpening: ["\u201CIs your Buttonbloom in the ground? I have been thinking about it.\u201D"],
    turnInOpening: ["\u201CYou did it!\u201D {{name}} hops in a small, genuine circle. \u201CI found this on the ground this morning and thought of you immediately.\u201D"],
    turnInReply: ["{{name}} presents a little found thing with great ceremony."]
  },
  {
    id: "errand-second-scissors",
    title: "Sharper Shears",
    summary: "Make a pair of Sturdy Scissors so you can gather bark curls.",
    tier: "errand",
    giverSpecies: ["woodchuck", "squirrel", "raccoon"],
    minFriendship: "friend",
    biomes: ["forest"],
    objectives: [{ kind: "craftTool", family: "scissors", tier: 2 }],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 9 },
    opening: [
      "{{name}} sizes up your hands. \u201CKids\u2019 scissors are lovely. They are also full of opinions about redwood. Make yourself something with a proper hinge and the forest opens up.\u201D"
    ],
    acceptLabel: "I\u2019ll make better scissors",
    acceptReply: ["\u201CThat\u2019s the spirit. The plan is in the tree, if you haven\u2019t met it. Mind your fingers.\u201D"],
    declineLabel: "Another time",
    declineReply: ["\u201CThe redwoods will still be there. Rude, but there.\u201D"],
    progressOpening: ["\u201CHow are the shears coming along? A fold here, a stone there.\u201D"],
    turnInOpening: ["\u201CNow THAT is a hinge,\u201D {{name}} says. \u201CTry the redwoods. They give up their curls to shears like those.\u201D"],
    turnInReply: ["{{name}} gives you something small and beautifully made."]
  },
  {
    id: "errand-desert-walk",
    title: "The Far Sand",
    summary: "Walk out to the dunes and see what lives there.",
    tier: "errand",
    giverSpecies: ["fox", "meerkat", "bird", "cat"],
    minFriendship: "friend",
    objectives: [{ kind: "visitBiome", biome: "dunes" }],
    reward: { trinketFamily: "seasonal", trinketTag: "biome:dunes", friendship: 8 },
    opening: [
      "\u201CYou have the walk of someone who has not seen the dunes yet,\u201D {{name}} says. \u201COne page of sand, and every dune keeps its own little sentry.\u201D"
    ],
    acceptLabel: "I\u2019ll go see",
    acceptReply: ["\u201CFollow the paper east until it turns to sand. Say hello to whoever is standing tallest.\u201D"],
    declineLabel: "Not yet",
    declineReply: ["\u201CIt is a long walk. It will wait.\u201D"],
    progressOpening: ["\u201CSand yet? You will know it when your feet stop making that nice sound.\u201D"],
    turnInOpening: ["\u201CYou went! Look at you, all sandy.\u201D {{name}} digs in a pocket. \u201CI keep this for travellers who make it back.\u201D"],
    turnInReply: ["{{name}} hands over a small warm keepsake."]
  },
  {
    id: "errand-new-row",
    title: "Something You Have Never Grown",
    summary: "Plant a seed you have not grown before.",
    tier: "errand",
    giverSpecies: ["bunny", "squirrel", "butterfly"],
    giverPersonalities: ["curious", "gentle", "dramatic"],
    minFriendship: "friend",
    objectives: [{ kind: "plant", seedId: "crinkle-carrot-seeds" }],
    reward: { trinketFamily: "natural", trinketTag: "plant", friendship: 8 },
    opening: [
      "\u201CA garden that only grows one thing is really just a very loyal garden,\u201D {{name}} says. \u201CTry a crinkle carrot. They are absurd and wonderful.\u201D"
    ],
    acceptLabel: "I\u2019ll try carrots",
    acceptReply: ["\u201CDig a bed, tuck them in, and wait. The tops are the best part, arguably.\u201D"],
    declineLabel: "Maybe later",
    declineReply: ["\u201CThe packets keep. Seeds are patient like that.\u201D"],
    progressOpening: ["\u201CAre the carrots in yet? I want to hear about the tops.\u201D"],
    turnInOpening: ["\u201CCarrots!\u201D {{name}} is beside themselves. \u201CYou are a proper gardener now. Here is a badge. Well \u2014 here is a thing. It is badge-shaped if you squint.\u201D"],
    turnInReply: ["{{name}} presses a small gardening keepsake into your hand."]
  },
  {
    id: "errand-second-shovel",
    title: "Down One Layer",
    summary: "Reach the compact layer under a bed you already dug.",
    tier: "errand",
    giverSpecies: ["woodchuck", "raccoon", "fox"],
    minFriendship: "friend",
    objectives: [{ kind: "dig", layer: 2 }],
    reward: { trinketFamily: "curious", trinketTag: "metal", friendship: 9 },
    opening: [
      "\u201CThe first scoop only gets you the easy layer,\u201D {{name}} says, tapping the ground with one foot. \u201CThere is a better one underneath, and it wants a braver shovel.\u201D"
    ],
    acceptLabel: "I\u2019ll dig deeper",
    acceptReply: ["\u201CMake the next shovel up, then put it to work. The good stuff sits lower.\u201D"],
    declineLabel: "Not now",
    declineReply: ["\u201CIt has waited a long time. It can wait a bit more.\u201D"],
    progressOpening: ["\u201CBeen down past the first layer yet? That is where the interesting smells are.\u201D"],
    turnInOpening: ["\u201CI can smell the deeper layer on you,\u201D {{name}} says approvingly. \u201CTake this. It came up from somewhere, once.\u201D"],
    turnInReply: ["{{name}} hands over a curious little object."]
  },
  {
    id: "errand-trim-redwood",
    title: "Curls from a Living Redwood",
    summary: "Trim a redwood and bring back the bark curls.",
    tier: "errand",
    giverSpecies: ["squirrel", "woodchuck", "bird"],
    minFriendship: "friend",
    biomes: ["forest"],
    objectives: [{ kind: "collect", resource: "redwood-bark-curls", quantity: 2 }],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 10 },
    opening: [
      "\u201CA redwood will not hand over its curls to just anyone,\u201D {{name}} says. \u201CYou need the sturdy shears and a steady hand. Bring me two curls and I will show you what they are for.\u201D"
    ],
    acceptLabel: "I\u2019ll trim a redwood",
    acceptReply: ["\u201CCareful, and gentle. It takes new growth without minding, done right.\u201D"],
    declineLabel: "Another time",
    declineReply: ["\u201CThe redwoods are not going anywhere. Trees are like that.\u201D"],
    progressOpening: ["\u201CTwo curls, when you can. The good pinkish ones.\u201D"],
    turnInOpening: ["\u201CBeautiful.\u201D {{name}} turns the curls to the light. \u201CThese bind together into proper lumber. Keep them \u2014 and take this besides.\u201D"],
    turnInReply: ["{{name}} gives you a trinket made of something older than the forest."]
  },
  {
    id: "errand-mend-the-ground",
    title: "Mend a Patch of Ground",
    summary: "Plant a Mend-me seed in a bed you have dug out.",
    tier: "errand",
    giverSpecies: ["bunny", "butterfly"],
    giverPersonalities: ["gentle", "curious"],
    minFriendship: "friend",
    objectives: [{ kind: "plant", seedId: "mend-me-seeds" }],
    reward: { trinketFamily: "story", trinketTag: "plant", friendship: 10 },
    opening: [
      "\u201CSome critters can\u2019t make their own beds,\u201D {{name}} says, quieter than usual. \u201CIf you dig a hole you are done with, tuck a Mend-me seed in it. The paper will stitch itself shut.\u201D"
    ],
    acceptLabel: "I\u2019ll mend one",
    acceptReply: ["\u201CThank you. You have to dig the bed first, then sow it. It is the giving-back kind of seed.\u201D"],
    declineLabel: "Not today",
    declineReply: ["\u201CI understand. It is the kind of thing that should be a choice.\u201D"],
    progressOpening: ["\u201CDid you find a patch to mend? There is no hurry on it.\u201D"],
    turnInOpening: ["\u201CYou healed a bit of the world,\u201D {{name}} says, as if that were just a normal thing a person does. \u201CHere. You should keep this.\u201D"],
    turnInReply: ["{{name}} gives you something they have clearly kept for a long time."]
  },
  {
    id: "odyssey-word-to-the-sentry",
    title: "A Word for the Sentry",
    summary: "Carry a message from a friend to a meerkat out in the dunes.",
    tier: "odyssey",
    giverSpecies: ["squirrel", "raccoon", "bird", "bunny", "cat"],
    minFriendship: "buddy",
    requiresQuests: ["errand-desert-walk"],
    objectives: [
      { kind: "talk", critterId: "meerkat" }
    ],
    reward: { trinketFamily: "story", friendship: 14 },
    opening: [
      "{{name}} has been turning something over in their paws. \u201CThere is a sentry out past the dunes I have not seen in a long while. If you are going that way\u2026 would you tell them I remember the standing-up trick?\u201D",
      "\u201CIt is a small message. It only matters to the two of us.\u201D"
    ],
    acceptLabel: "I\u2019ll carry the message",
    acceptReply: ["\u201CThank you. Find a meerkat out in the sand and pass it along. They will know.\u201D"],
    declineLabel: "I can\u2019t right now",
    declineReply: ["\u201CNo matter. It has kept this long.\u201D"],
    progressOpening: ["\u201CHave you seen a meerkat yet? Tallish. Extremely serious posture.\u201D"],
    turnInOpening: ["\u201CYou told them.\u201D {{name}} goes very still for a moment. \u201CThey remembered. Good. Here \u2014 this goes to whoever carries word between places.\u201D"],
    turnInReply: ["{{name}} gives you a trinket that clearly means something to them."]
  },
  {
    id: "odyssey-lumber-run",
    title: "Lumber for a Neighbor",
    summary: "Refine bound lumber and set a paper bench down in the world.",
    tier: "odyssey",
    giverSpecies: ["woodchuck", "raccoon", "fox"],
    minFriendship: "buddy",
    objectives: [
      { kind: "craft", recipeId: "bound-lumber" },
      { kind: "place", templateKey: "paper-bench" }
    ],
    reward: { trinketFamily: "handmade", trinketTag: "craft", friendship: 14 },
    opening: [
      "\u201CA neighbor with nowhere to sit is a sad thing,\u201D {{name}} declares. \u201CBind some twigs and bark into lumber, then build a bench and put it somewhere. Anywhere. It just has to exist.\u201D"
    ],
    acceptLabel: "Consider it built",
    acceptReply: ["\u201CYou will need the maker and a hammer. Bound lumber is twigs and curls, pressed flat.\u201D"],
    declineLabel: "Later",
    declineReply: ["\u201CBenches are for later, sometimes. I respect that.\u201D"],
    progressOpening: ["\u201CLumber made? Bench down? I have been picturing it.\u201D"],
    turnInOpening: ["\u201CThere it is! A bench. In the world. Thank you.\u201D {{name}} slips you something in return. \u201CMade it myself, which will be obvious.\u201D"],
    turnInReply: ["{{name}} hands over a trinket with obvious pride."]
  },
  {
    id: "odyssey-palm-and-shell",
    title: "Palm, Shell, and a Long Walk",
    summary: "Gather palm fiber and a shell, then plant something new in the sand.",
    tier: "odyssey",
    giverSpecies: ["meerkat", "fox", "raccoon"],
    minFriendship: "buddy",
    biomes: ["dunes"],
    objectives: [
      { kind: "collect", resource: "palm-fiber", quantity: 2 },
      { kind: "plant", seedId: "paper-tomato-seeds" }
    ],
    reward: { trinketFamily: "seasonal", trinketTag: "biome:dunes", friendship: 15 },
    opening: [
      "\u201CNothing grows easy out here,\u201D {{name}} says, scanning the horizon out of habit. \u201CBut someone grew tomatoes in the sand once. Palm fiber in one pocket, and a tomato bed in the other \u2014 that is a life I could believe in.\u201D"
    ],
    acceptLabel: "I\u2019ll try the sand",
    acceptReply: ["\u201CPalm clippings come off the palms with scissors. The seeds turn up in dunes and meadows both. Good luck.\u201D"],
    declineLabel: "Too far for me",
    declineReply: ["\u201CFair. The sand is not everyone\u2019s paper.\u201D"],
    progressOpening: ["\u201CFiber? Tomato bed? Even one of the two is a start.\u201D"],
    turnInOpening: ["\u201CYou actually did it.\u201D For once, {{name}} does not look at the horizon. \u201CTake this. It has been waiting for someone who would.\u201D"],
    turnInReply: ["{{name}} gives you a shell-smooth keepsake."]
  },
  {
    id: "odyssey-scrap-for-the-mill",
    title: "Scrap for the Mill",
    summary: "Bring sunbaked cardboard and a cardstone to a woodchuck\u2019s project.",
    tier: "odyssey",
    giverSpecies: ["woodchuck", "raccoon"],
    minFriendship: "buddy",
    objectives: [
      { kind: "collect", resource: "sunbaked-cardboard", quantity: 4 },
      { kind: "collect", resource: "graphite-cardstone", quantity: 2 }
    ],
    reward: { trinketFamily: "found", trinketTag: "metal", friendship: 13 },
    opening: [
      "\u201CThe mill is dreaming again,\u201D {{name}} says. \u201CFour sheets of sunbaked card and a couple of cardstones, and I could make the dream into a thing with corners.\u201D"
    ],
    acceptLabel: "I\u2019ll fetch it",
    acceptReply: ["\u201CCard cardboard turns up in the dunes and the flats. Cardstone hides in the forest and the scrap. Bring a shovel.\u201D"],
    declineLabel: "Another day",
    declineReply: ["\u201CDreams of the mill are extremely patient.\u201D"],
    progressOpening: ["\u201CCard, cardstone. Two piles, one dream.\u201D"],
    turnInOpening: ["\u201CCorners! I made corners!\u201D {{name}} is radiant. \u201CYou are the reason. Take this \u2014 it fell out of the mill years ago and I never knew what to do with it.\u201D"],
    turnInReply: ["{{name}} hands over an odd little found thing."]
  },
  {
    id: "odyssey-three-biomes",
    title: "Three Kinds of Ground",
    summary: "Stand in three different biomes: the clearing, the forest, and the dunes.",
    tier: "odyssey",
    giverSpecies: ["bird", "fox", "cat", "butterfly"],
    minFriendship: "buddy",
    objectives: [
      { kind: "visitBiome", biome: "forest" },
      { kind: "visitBiome", biome: "dunes" },
      { kind: "visitBiome", biome: "meadow" }
    ],
    reward: { trinketFamily: "curious", friendship: 16 },
    opening: [
      "\u201CHome is one page,\u201D {{name}} says, \u201Cbut the world is several. Forest, meadow, dunes \u2014 walk all three and come back. I want to know what the paper smells like in each.\u201D"
    ],
    acceptLabel: "I\u2019ll walk it",
    acceptReply: ["\u201CFollow the seams. Each one changes all at once, like a page turning. Which, of course, it is.\u201D"],
    declineLabel: "Maybe someday",
    declineReply: ["\u201CWalking is never a waste. Do it when you want to.\u201D"],
    progressOpening: ["\u201CWhich grounds have you stood on so far? Forest? Meadow? Sand?\u201D"],
    turnInOpening: ["\u201CAll three.\u201D {{name}} listens to your description with eyes closed. \u201CGood. You brought the whole world back with you. Here is something for a traveller\u2019s shelf.\u201D"],
    turnInReply: ["{{name}} gives you a well-travelled trinket."]
  },
  {
    id: "favor-stone-for-a-sling",
    title: "Terracotta Pebbles",
    summary: "Bring terracotta pebbles back from the dunes.",
    tier: "favor",
    giverSpecies: ["meerkat", "fox", "raccoon"],
    minFriendship: "curious",
    biomes: ["dunes", "scrapflats", "forest", "meadow", "clearing"],
    objectives: [{ kind: "collect", resource: "terracotta-pebbles", quantity: 3 }],
    reward: { trinketFamily: "natural", friendship: 6 },
    opening: [
      "\u201CThe warm orange pebbles \u2014 terracotta, they call them \u2014 only turn up out in the sand,\u201D {{name}} says. \u201CThree would make a very satisfying little pile.\u201D"
    ],
    acceptLabel: "I\u2019ll look in the sand",
    acceptReply: ["\u201CMind the sun. And the meerkats. They are friendly, just extremely tall about it.\u201D"],
    declineLabel: "Not now",
    declineReply: ["\u201CNo hurry. Pebbles hold.\u201D"],
    progressOpening: ["\u201CAny orange pebbles yet? They stack so nicely.\u201D"],
    turnInOpening: ["\u201CYes! These are the right ones.\u201D {{name}} stacks them once, admires them, and hands you a small reward."],
    turnInReply: ["{{name}} gives you a keepsake in thanks."]
  },
  {
    id: "errand-sawdust-and-rosin",
    title: "Mill Supplies",
    summary: "Bring ribbonwood sticks to the woodchuck at the mill.",
    tier: "favor",
    giverSpecies: ["woodchuck", "squirrel"],
    giverCritterIds: ["-2,0#woodchuck"],
    minFriendship: "curious",
    objectives: [{ kind: "collect", resource: "ribbonwood-sticks", quantity: 3 }],
    reward: { trinketFamily: "story", trinketTag: "story", friendship: 7 },
    opening: [
      "\u201CRibbonwood! The pinkish ones. They sand up beautiful,\u201D {{name}} says, already reaching for a plane. \u201CThree sticks and I will show you what the mill can really do.\u201D"
    ],
    acceptLabel: "I\u2019ll bring ribbonwood",
    acceptReply: ["\u201CLook under the trees. The forest floor is generous with them.\u201D"],
    declineLabel: "Later",
    declineReply: ["\u201CThe mill runs on patience as much as ribbonwood.\u201D"],
    progressOpening: ["\u201CSticks? The pinkish ones?\u201D"],
    turnInOpening: ["\u201CPerfect grain.\u201D {{name}} runs a thumb along one. \u201CHere \u2014 a mill scrap that turned out too nice to melt down.\u201D"],
    turnInReply: ["{{name}} gives you a piece of mill-craft."]
  }
];
function mergeQuests() {
  const seen = /* @__PURE__ */ new Set();
  const merged = [];
  for (const quest of [...AUTHORED_QUESTS, ...QUEST_EXPANSION_DEFS]) {
    if (seen.has(quest.id)) continue;
    seen.add(quest.id);
    merged.push(quest);
  }
  return merged;
}
var questCache = null;
function allQuestDefs() {
  questCache ??= mergeQuests();
  return questCache;
}

// .cluster/_count_tmp.ts
console.log("authoredTrinkets", Object.keys(TRINKET_AUTHORED_DEFS).length);
console.log("generatedTrinkets", TRINKET_GENERATED_DEFS.length);
console.log("totalTrinkets", allTrinketDefs().length);
console.log("totalQuests", allQuestDefs().length);
console.log("expansionQuests", QUEST_EXPANSION_DEFS.length);
var fams = {};
for (const d of allTrinketDefs()) fams[d.family] = (fams[d.family] || 0) + 1;
console.log("trinketsByFamily", JSON.stringify(fams));
var tiers = {};
for (const q of allQuestDefs()) tiers[q.tier] = (tiers[q.tier] || 0) + 1;
console.log("questsByTier", JSON.stringify(tiers));
console.log("uniqueTrinketIds", new Set(allTrinketDefs().map((d) => d.id)).size);
if (allQuestDefs()) {
}
