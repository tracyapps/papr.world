import { readFile } from 'node:fs/promises';

const fileUrl = new URL('../src/content/conversations.json', import.meta.url);
const species = new Set(['squirrel', 'butterfly', 'raccoon', 'bunny', 'bird', 'cat', 'woodchuck']);
const personalities = new Set(['bold', 'curious', 'dramatic', 'gentle', 'mischievous', 'shy', 'sleepy']);
const friendshipLevels = new Set(['stranger', 'curious', 'friend', 'buddy', 'pet']);
const biomes = new Set(['clearing', 'forest', 'meadow', 'dunes', 'scrapflats']);
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
