import { readFile } from 'node:fs/promises';

const fileUrl = new URL('../src/content/conversations.json', import.meta.url);

// Species and biomes are read from the source that defines them, the same way
// tools/validate-quests.mjs does. These used to be hand-copied lists here, and
// they had quietly fallen behind (no parrot, no tropical) — so the check was
// failing on perfectly good content.
async function sourceText(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}
function quotedIn(fragment) {
  return [...fragment.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}
const variationSource = await sourceText('../src/game/critterVariation.ts');
const speciesMatch = variationSource.match(/type\s+CritterSpecies\s*=([\s\S]*?);/);
const species = new Set(speciesMatch ? quotedIn(speciesMatch[1]) : []);
const biomeSource = await sourceText('../src/sim/catalogs/biomes.ts');
const biomeMatch = biomeSource.match(/BIOME_IDS\s*=\s*\[([\s\S]*?)\]/);
/** Generated answer families the engine understands (see conversationEngine.ts). */
const replyPools = new Set(['trait', 'place', 'self', 'tool', 'next']);
const personalities = new Set(['bold', 'curious', 'dramatic', 'gentle', 'mischievous', 'shy', 'sleepy']);
const friendshipLevels = new Set(['stranger', 'curious', 'friend', 'buddy', 'pet']);
const biomes = new Set(biomeMatch ? quotedIn(biomeMatch[1]) : []);
if (species.size === 0 || biomes.size === 0) {
  console.error('Could not read critter species or biome ids from source.');
  process.exit(1);
}
const errors = [];

let content;
try {
  content = JSON.parse(await readFile(fileUrl, 'utf8'));
} catch (error) {
  console.error(`Conversation JSON could not be read: ${error.message}`);
  process.exit(1);
}

function requireNonemptyArray(value, path) {
  if (!Array.isArray(value) || value.length === 0) errors.push(`${path} must be a non-empty list`);
}

function checkAllowedList(value, allowed, path) {
  if (value === undefined) return;
  requireNonemptyArray(value, path);
  for (const item of value ?? []) {
    if (!allowed.has(item)) errors.push(`${path} contains unknown value "${item}"`);
  }
}

function checkChoices(choices, path) {
  requireNonemptyArray(choices, path);
  const ids = new Set();
  for (const [index, choice] of (choices ?? []).entries()) {
    const choicePath = `${path}[${index}]`;
    if (!choice.id || !choice.label) errors.push(`${choicePath} needs id and label`);
    if (ids.has(choice.id)) errors.push(`${path} repeats choice id "${choice.id}"`);
    ids.add(choice.id);
    if (!choice.replyPool) requireNonemptyArray(choice.replies, `${choicePath}.replies`);
    if (choice.action !== undefined && choice.action !== 'pet') errors.push(`${choicePath}.action must be "pet"`);
    if (choice.replyPool !== undefined && !replyPools.has(choice.replyPool)) {
      errors.push(`${choicePath}.replyPool "${choice.replyPool}" is not one the engine knows`);
    }
    if (choice.questAction !== undefined && !['accept', 'decline', 'turn-in'].includes(choice.questAction)) {
      errors.push(`${choicePath}.questAction must be accept, decline, or turn-in`);
    }
    if (choice.journalKind !== undefined && typeof choice.journalKind !== 'string') {
      errors.push(`${choicePath}.journalKind must be a string`);
    }
    if (choice.replyMode !== undefined && !['cycle', 'random'].includes(choice.replyMode)) {
      errors.push(`${choicePath}.replyMode must be "cycle" or "random"`);
    }
    if (choice.followUps !== undefined) checkChoices(choice.followUps, `${choicePath}.followUps`);
  }
}

if (content.version !== 1) errors.push('version must currently be 1');
for (const key of species) {
  requireNonemptyArray(content.everyday?.greetings?.[key], `everyday.greetings.${key}`);
  requireNonemptyArray(content.everyday?.selfReplies?.[key], `everyday.selfReplies.${key}`);
}
for (const key of biomes) {
  requireNonemptyArray(content.everyday?.placeFacts?.[key], `everyday.placeFacts.${key}`);
}
for (const key of personalities) {
  requireNonemptyArray(content.everyday?.traitReplies?.[key], `everyday.traitReplies.${key}`);
}
checkChoices(content.everyday?.choices, 'everyday.choices');

// Continuations: the lines a critter uses to pick a thread back up on a later
// visit. Optional, but every list present must be usable.
if (content.continuations !== undefined) {
  if (typeof content.continuations !== 'object' || content.continuations === null || Array.isArray(content.continuations)) {
    errors.push('continuations must be an object of topic -> string list');
  } else {
    for (const [kind, lines] of Object.entries(content.continuations)) {
      requireNonemptyArray(lines, `continuations.${kind}`);
      if (!['materials', 'harvest', 'wayfinding', 'fun', 'place', 'self', 'trait', 'tool', 'next'].includes(kind)) {
        // Unknown keys are only a warning-worthy smell, but a typo would silently
        // make a whole topic unable to continue — so it is an error here.
        errors.push(`continuations.${kind} is not a topic kind the engine asks for`);
      }
    }
  }
}

const storyletIds = new Set();
for (const [index, storylet] of (content.storylets ?? []).entries()) {
  const path = `storylets[${index}]`;
  if (!storylet.id) errors.push(`${path} needs an id`);
  if (storyletIds.has(storylet.id)) errors.push(`storylet id "${storylet.id}" is duplicated`);
  storyletIds.add(storylet.id);
  requireNonemptyArray(storylet.opening, `${path}.opening`);
  checkChoices(storylet.choices, `${path}.choices`);
  checkAllowedList(storylet.species, species, `${path}.species`);
  checkAllowedList(storylet.personalities, personalities, `${path}.personalities`);
  checkAllowedList(storylet.friendshipLevels, friendshipLevels, `${path}.friendshipLevels`);
  checkAllowedList(storylet.biomes, biomes, `${path}.biomes`);
  if (storylet.minFriendship && !friendshipLevels.has(storylet.minFriendship)) errors.push(`${path}.minFriendship is unknown`);
  if (storylet.maxFriendship && !friendshipLevels.has(storylet.maxFriendship)) errors.push(`${path}.maxFriendship is unknown`);
}

if (errors.length > 0) {
  console.error(`Conversation content has ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Conversation content looks good: ${content.storylets.length} storylets.`);
