// Validates `src/sim/catalogs/questCatalog.expansion.ts` against the real
// catalogs, without a TypeScript toolchain.
//
// The quest catalog is TypeScript, so rather than importing it we read the
// catalog files as text and lift the ids out with small, targeted regexes
// (each object in those files declares `id: '<kebab>'`, `key: '<kebab>'`, or a
// union of quoted literals). Then we parse the expansion quests out of their
// own file and check that every referenced id, tier, friendship level, and
// trinket family is real.
//
// Run: `node tools/validate-quests.mjs`. Exits non-zero with a readable list
// of problems, or prints a one-line success with the quest count.

import { readFile } from 'node:fs/promises';

const src = (path) => new URL(`../src/${path}`, import.meta.url);

const FILES = {
  resources: src('sim/catalogs/resources.ts'),
  seeds: src('sim/catalogs/seeds.ts'),
  tools: src('sim/catalogs/tools.ts'),
  recipes: src('sim/catalogs/recipes.ts'),
  biomes: src('sim/catalogs/biomes.ts'),
  trees: src('sim/catalogs/trees.ts'),
  techTree: src('sim/catalogs/techTree.ts'),
  buildPieces: src('world/buildPieces.ts'),
  critterVariation: src('game/critterVariation.ts'),
  friendship: src('game/friendship.ts'),
  critters: src('game/critters.ts'),
  trinkets: src('sim/catalogs/trinkets.ts'),
  quests: src('sim/catalogs/quests.ts'),
  expansion: src('sim/catalogs/questCatalog.expansion.ts'),
};

const errors = [];

function fail(message) {
  errors.push(message);
}

async function readText(file) {
  return readFile(file, 'utf8');
}

/** The text between a start marker and the next end marker after it. */
function section(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) return '';
  const from = start + startMarker.length;
  const end = text.indexOf(endMarker, from);
  return end < 0 ? text.slice(from) : text.slice(from, end);
}

/** Every `id: '<kebab>'` inside a catalog object body. */
function idsIn(text) {
  return new Set([...text.matchAll(/id:\s*'([a-z0-9-]+)'/g)].map((match) => match[1]));
}

/** Every `key: '<kebab>'` inside a catalog object body (build pieces). */
function keysIn(text) {
  return new Set([...text.matchAll(/key:\s*'([a-z0-9-]+)'/g)].map((match) => match[1]));
}

/** Quoted literals inside a captured union/array fragment. */
function quoted(fragment) {
  return [...fragment.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/** Quoted values of a `type X = 'a' | 'b' | ...;` alias. */
function unionValues(text, alias) {
  const match = text.match(new RegExp(`type\\s+${alias}\\s*=([\\s\\S]*?);`));
  return match ? quoted(match[1]) : [];
}

async function buildCatalog() {
  const text = Object.fromEntries(
    await Promise.all(Object.entries(FILES).map(async ([key, file]) => [key, await readText(file)])),
  );

  const resourceIds = idsIn(section(text.resources, 'RESOURCE_CORE_DEFS = {', '} as const satisfies'));
  const seedIds = idsIn(section(text.seeds, 'SEED_DEFS = {', '} as const satisfies'));
  const toolIds = idsIn(section(text.tools, 'TOOL_DEFS = {', '} as const satisfies'));
  const toolFamilies = idsIn(section(text.tools, 'TOOL_FAMILIES = {', '} as const satisfies'));
  const recipeIds = idsIn(section(text.recipes, 'RECIPE_DEFS = {', '} as const satisfies'));
  const techNodes = idsIn(section(text.techTree, 'TECH_DEFS = {', '} as const satisfies'));
  const buildPieces = keysIn(section(text.buildPieces, 'BUILD_PIECE_DEFS = {', '} as const satisfies'));

  const biomeIds = new Set(quoted(text.biomes.match(/BIOME_IDS\s*=\s*\[([^\]]*)\]/)?.[1] ?? ''));
  const treeSpecies = new Set(unionValues(text.trees, 'TreeSpecies'));
  const species = new Set(unionValues(text.critterVariation, 'CritterSpecies'));
  const traits = new Set(unionValues(text.critterVariation, 'PersonalityTrait'));
  const friendshipLevels = new Set(unionValues(text.friendship, 'FriendshipLevel'));
  const trinketFamilies = new Set(unionValues(text.trinkets, 'TrinketFamilyId'));

  const authoredCritterIds = new Set(
    [...text.critters.matchAll(/spawnCritter\(\s*[^,]+,\s*'([^']+)'/g)].map((match) => match[1]),
  );
  const recipeItemIds = new Set(
    [...text.recipes.matchAll(/itemId:\s*'([a-z0-9-]+)'/g)].map((match) => match[1]),
  );

  return {
    text,
    resourceIds, seedIds, toolIds, toolFamilies, recipeIds, techNodes, buildPieces,
    biomeIds, treeSpecies, species, traits, friendshipLevels, trinketFamilies,
    authoredCritterIds, recipeItemIds,
  };
}

const TIERS = new Set(['favor', 'errand', 'odyssey']);
const OBJECTIVE_KINDS = new Set([
  'collect', 'craft', 'refine', 'craftTool', 'learnTech', 'plant', 'harvest',
  'visitBiome', 'visitPage', 'dig', 'trim', 'talk', 'place', 'deliver',
]);
const DIG_LAYERS = new Set(['1', '2', '3']);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Split the expansion array literal into one text block per quest object. */
function questBlocks(expansionText) {
  const arrayStart = expansionText.indexOf('QUEST_EXPANSION_DEFS: QuestDef[] = [');
  const bodyStart = arrayStart < 0 ? 0 : expansionText.indexOf('[', arrayStart) + 1;
  const bodyEnd = expansionText.lastIndexOf('];');
  const body = expansionText.slice(bodyStart, bodyEnd < 0 ? undefined : bodyEnd);

  const lines = body.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trimEnd() !== '  {') continue;
    let end = index + 1;
    while (end < lines.length && lines[end].trimEnd() !== '  },') end += 1;
    blocks.push(lines.slice(index, end + 1).join('\n'));
    index = end;
  }
  return blocks;
}

function fieldString(block, field) {
  const match = block.match(new RegExp(`^\\s*${field}:\\s*'([^']+)',`, 'm'));
  return match ? match[1] : null;
}

/** Non-empty array-of-strings field, or null when absent. */
function fieldStrings(block, field) {
  const match = block.match(new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return null;
  return [...match[1].matchAll(/'[^']*'/g)].map((entry) => entry[0].slice(1, -1));
}

function numericField(block, field) {
  const match = block.match(new RegExp(`${field}:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

/** The `{ ... }` bodies inside the quest's `objectives` array. */
function objectiveBodies(block) {
  const arrayMatch = block.match(/objectives:\s*\[([\s\S]*?)\]/);
  if (!arrayMatch) return null;
  return [...arrayMatch[1].matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]);
}

function objField(body, field) {
  const match = body.match(new RegExp(`${field}:\\s*'([^']+)'`));
  return match ? match[1] : null;
}

function validateObjective(body, path, catalog) {
  const kind = objField(body, 'kind');
  if (!kind || !OBJECTIVE_KINDS.has(kind)) {
    fail(`${path}: unknown objective kind "${kind}"`);
    return null;
  }
  const check = (field, allowed, label) => {
    const value = objField(body, field);
    if (value === null) fail(`${path}: ${kind} is missing ${field}`);
    else if (!allowed.has(value)) fail(`${path}: ${kind} ${field} "${value}" is not a known ${label}`);
  };

  switch (kind) {
    case 'collect':
    case 'harvest': {
      check('resource', catalog.resourceIds, 'resource');
      const quantity = numericField(body, 'quantity');
      if (quantity === null || quantity < 1) fail(`${path}: ${kind} needs a positive quantity`);
      break;
    }
    case 'craft': check('recipeId', catalog.recipeIds, 'recipe'); break;
    case 'refine': check('resource', catalog.resourceIds, 'resource'); break;
    case 'craftTool': {
      check('family', catalog.toolFamilies, 'tool family');
      const tier = numericField(body, 'tier');
      if (tier !== null && ![1, 2, 3].includes(tier)) fail(`${path}: craftTool tier must be 1, 2, or 3`);
      break;
    }
    case 'learnTech': check('nodeId', catalog.techNodes, 'technology node'); break;
    case 'plant': check('seedId', catalog.seedIds, 'seed'); break;
    case 'visitBiome': check('biome', catalog.biomeIds, 'biome'); break;
    case 'visitPage': {
      const pageId = objField(body, 'pageId');
      if (!pageId || !/^-?\d+,-?\d+$/.test(pageId)) fail(`${path}: visitPage pageId "${pageId}" is not an "x,z" page id`);
      break;
    }
    case 'dig': {
      // `layer` is a numeric literal (1 | 2 | 3), not a quoted id.
      const layer = numericField(body, 'layer');
      if (layer === null || !DIG_LAYERS.has(String(layer))) fail(`${path}: dig layer must be 1, 2, or 3`);
      break;
    }
    case 'trim': check('species', catalog.treeSpecies, 'tree species'); break;
    case 'talk': {
      // Authored critter ids ('0,0#squirrel') are the real target; species names
      // are tolerated because the authored base catalog addresses a species.
      const critterId = objField(body, 'critterId');
      if (critterId === null) fail(`${path}: talk is missing critterId`);
      else if (!catalog.authoredCritterIds.has(critterId) && !catalog.species.has(critterId)) {
        fail(`${path}: talk critterId "${critterId}" is not an authored critter id or species`);
      }
      break;
    }
    case 'place': check('templateKey', catalog.buildPieces, 'build piece'); break;
    case 'deliver': {
      const itemId = objField(body, 'itemId');
      const plantItem = itemId?.match(/^plant:(.+)$/);
      const ok = itemId !== null && (
        catalog.recipeItemIds.has(itemId)
        || (plantItem !== null && catalog.seedIds.has(plantItem[1]))
      );
      if (!ok) fail(`${path}: deliver itemId "${itemId}" is not a craftable item or a lifted plant`);
      break;
    }
    default: break;
  }
  return kind;
}

async function main() {
  const catalog = await buildCatalog();
  const blocks = questBlocks(catalog.text.expansion);

  if (blocks.length === 0) fail('no quests found in questCatalog.expansion.ts');

  const baseQuestIds = new Set(
    [...catalog.text.quests.matchAll(/^\s{4}id:\s*'([a-z0-9-]+)',/gm)].map((match) => match[1]),
  );
  const expansionIds = new Set();
  const tierCounts = {};
  const kindCounts = {};

  for (const [index, block] of blocks.entries()) {
    const id = fieldString(block, 'id');
    const path = id ? `quest "${id}"` : `quest #${index + 1}`;

    if (!id) { fail(`${path}: missing a string id`); continue; }
    if (!KEBAB.test(id)) fail(`${path}: id must be lowercase-kebab`);
    if (expansionIds.has(id) || baseQuestIds.has(id)) fail(`${path}: id "${id}" is duplicated`);
    expansionIds.add(id);

    for (const field of ['title', 'summary', 'acceptLabel']) {
      const value = fieldString(block, field);
      if (!value || !value.trim()) fail(`${path}: ${field} must be a non-empty string`);
    }
    for (const field of ['opening', 'acceptReply', 'progressOpening', 'turnInOpening', 'turnInReply']) {
      const list = fieldStrings(block, field);
      if (!list || list.length === 0) fail(`${path}: ${field} must be a non-empty list`);
      else if (list.some((line) => !line.trim())) fail(`${path}: ${field} contains an empty line`);
    }

    const tier = fieldString(block, 'tier');
    if (!tier || !TIERS.has(tier)) fail(`${path}: tier "${tier}" must be favor, errand, or odyssey`);
    else tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;

    const minFriendship = fieldString(block, 'minFriendship');
    if (!minFriendship || !catalog.friendshipLevels.has(minFriendship)) {
      fail(`${path}: minFriendship "${minFriendship}" is not one of ${[...catalog.friendshipLevels].join(', ')}`);
    }

    const reward = block.match(/reward:\s*\{([^}]*)\}/)?.[1];
    if (reward === undefined) {
      fail(`${path}: missing a reward object`);
    } else {
      const family = reward.match(/trinketFamily:\s*'([a-z]+)'/)?.[1];
      if (!family || !catalog.trinketFamilies.has(family)) {
        fail(`${path}: reward trinketFamily "${family}" is not one of ${[...catalog.trinketFamilies].join(', ')}`);
      }
      const friendship = Number(reward.match(/friendship:\s*(\d+)/)?.[1]);
      if (!Number.isInteger(friendship) || friendship < 5 || friendship > 18) {
        fail(`${path}: reward friendship "${friendship}" must be an integer 5..18`);
      }
    }

    const objectives = objectiveBodies(block);
    if (!objectives || objectives.length === 0) {
      fail(`${path}: objectives must be a non-empty list`);
    } else {
      for (const [objectiveIndex, body] of objectives.entries()) {
        const kind = validateObjective(body, `${path} objective ${objectiveIndex + 1}`, catalog);
        if (kind) kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
      }
    }

    for (const [field, allowed, label] of [
      ['giverSpecies', catalog.species, 'critter species'],
      ['giverPersonalities', catalog.traits, 'personality trait'],
      ['giverCritterIds', catalog.authoredCritterIds, 'authored critter id'],
      ['biomes', catalog.biomeIds, 'biome'],
    ]) {
      const list = fieldStrings(block, field);
      if (list === null) continue; // optional
      if (list.length === 0) fail(`${path}: ${field} is present but empty`);
      for (const value of list) {
        if (!allowed.has(value)) fail(`${path}: ${field} contains unknown ${label} "${value}"`);
      }
    }

    const requires = fieldStrings(block, 'requiresQuests');
    if (requires) {
      for (const value of requires) {
        if (!expansionIds.has(value) && !baseQuestIds.has(value)) {
          fail(`${path}: requiresQuests references unknown quest "${value}"`);
        }
      }
    }
  }

  const allIds = new Set([...baseQuestIds, ...expansionIds]);
  if (expansionIds.size < 20) {
    fail(`expansion should hold at least 20 quests, found ${expansionIds.size}`);
  }

  if (errors.length > 0) {
    console.error(`Quest expansion has ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }

  const tiers = ['favor', 'errand', 'odyssey'].map((tier) => `${tier} ${tierCounts[tier] ?? 0}`).join(', ');
  const kinds = Object.entries(kindCounts).sort().map(([kind, count]) => `${kind} ${count}`).join(', ');
  console.log(`Quest expansion looks good: ${blocks.length} quests (${tiers}).`);
  console.log(`Objective kinds: ${kinds}.`);
  console.log(`Merged with the authored set: ${allIds.size} total quests.`);
}

await main();
