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
function buildDef(shapeId, shapeLabel, shapeTagList, family, rarity, motion, parts2, palette, paletteIndex) {
  const partSig = parts2.length > 0 ? `-${parts2.join("").slice(0, 10)}` : "";
  return {
    id: `gen-${slug(shapeId)}-${paletteIndex}${partSig}-${motion}`,
    label: `${palette.name} ${shapeLabel}`,
    description: `${shapeLabel} in ${palette.name.toLowerCase()} paper, ${motionPhrase(motion)}.`,
    family,
    shape: shapeId,
    motion,
    parts: [...parts2],
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
  const defs2 = [];
  for (const shape of SHAPES) {
    PALETTES.forEach((palette, paletteIndex) => {
      shape.motions.forEach((motion, motionIndex) => {
        const parts2 = shape.parts[(paletteIndex + motionIndex) % shape.parts.length];
        const family = shape.families[(paletteIndex + motionIndex) % shape.families.length];
        defs2.push(buildDef(shape.id, shape.label, shape.tags, family, shape.rarity, motion, parts2, palette, paletteIndex));
      });
    });
  }
  for (const windup of WINDUPS) {
    PALETTES.forEach((palette, paletteIndex) => {
      if (paletteIndex % 2 === 1) return;
      const family = palette.season ? "seasonal" : "handmade";
      defs2.push(buildDef(windup.id, windup.label, windup.tags, family, windup.rarity, "windup", windup.parts, palette, paletteIndex));
    });
  }
  return defs2;
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

// .cluster/_verify_tmp.ts
var defs = allTrinketDefs();
var shapes = new Set(defs.map((d) => d.shape));
var motions = new Set(defs.map((d) => d.motion));
var parts = new Set(defs.flatMap((d) => d.parts));
console.log("shapeValues", shapes.size, [...shapes].join(","));
console.log("motionValues", motions.size, [...motions].join(","));
console.log("partValues", parts.size, [...parts].join(","));
console.log("generatedHasCylinder", TRINKET_GENERATED_DEFS.some((d) => d.shape === "cylinder"));
console.log("authoredHasCylinder", Object.values(TRINKET_AUTHORED_DEFS).some((d) => d.shape === "cylinder"));
