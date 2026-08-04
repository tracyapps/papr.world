import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { setEngagedCritter, type Critter } from './critterBehavior';
import {
  beginCritterConversation,
  everydayConversation,
  resolveConversationChoice,
  type ConversationChoice,
  type ConversationScene,
} from './conversationEngine';
import { pickCritterAtScreen } from './critters';
import { addFriendshipPoints, getFriendshipLevel, getFriendshipPoints } from './friendship';
import { petCritter, showPetToast } from './petting';
import { camera } from '../render/context';
import { setToastStackRaised } from '../ui/hudLayout';

// A little more generous than literal arm's reach: tiny moving paper animals
// should be easy to greet from the edge of their nook.
const TALK_REACH = 5.2;
const SPECIES_LABELS: Record<Critter['species'], string> = {
  squirrel: 'paper squirrel',
  butterfly: 'paper butterfly',
  raccoon: 'paper raccoon',
  bunny: 'paper bunny',
  bird: 'paper bird',
  cat: 'paper cat',
  woodchuck: 'paper woodchuck',
};

let panel: HTMLElement | null = null;
let nameElement: HTMLElement | null = null;
let metaElement: HTMLElement | null = null;
let arcElement: HTMLElement | null = null;
let speechElement: HTMLElement | null = null;
let actionsElement: HTMLElement | null = null;
let activeCritter: Critter | null = null;
let activeScene: ConversationScene | null = null;
const talkedThisVisit = new Set<string>();

function refreshMeta() {
  if (!activeCritter || !metaElement) return;
  const level = getFriendshipLevel(activeCritter.id);
  const points = getFriendshipPoints(activeCritter.id);
  const personality = activeCritter.params.personality.join(' + ');
  metaElement.textContent = `${SPECIES_LABELS[activeCritter.species]} · ${personality} · ${level} · ${points}/100 friendship`;
}

function speak(line: string) {
  if (!activeCritter || !speechElement) return;
  speechElement.textContent = line;
  playCozySound(activeCritter.species === 'bird' || activeCritter.species === 'butterfly' ? 'chirp' : 'tap');
}

function refreshArc() {
  if (!arcElement) return;
  arcElement.textContent = activeScene?.storyArc ? `Story: ${activeScene.storyArc}` : '';
  arcElement.hidden = !activeScene?.storyArc;
}

function renderAfterStoryChoice() {
  if (!actionsElement) return;
  actionsElement.innerHTML = '';

  const keepTalking = document.createElement('button');
  keepTalking.type = 'button';
  keepTalking.textContent = 'Keep chatting';
  keepTalking.addEventListener('click', () => {
    if (!activeCritter) return;
    activeScene = everydayConversation(activeCritter);
    refreshArc();
    speak(activeScene.opening);
    renderChoices(activeScene);
  });

  const goodbye = document.createElement('button');
  goodbye.type = 'button';
  goodbye.textContent = 'See you soon';
  goodbye.addEventListener('click', closeCritterDialogue);
  actionsElement.append(keepTalking, goodbye);
}

function choose(choice: ConversationChoice) {
  if (!activeCritter || !activeScene) return;
  const result = resolveConversationChoice(activeCritter, activeScene, choice);
  if (result.action === 'pet') petCritter(activeCritter);
  refreshMeta();
  speak(result.reply);
  if (result.endsScene) renderAfterStoryChoice();
}

function renderChoices(scene: ConversationScene) {
  if (!actionsElement) return;
  actionsElement.innerHTML = '';
  for (const choice of scene.choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = choice.label;
    button.addEventListener('click', () => choose(choice));
    actionsElement.append(button);
  }
}

function openConversation(critter: Critter) {
  activeCritter = critter;
  if (nameElement) nameElement.textContent = critter.params.name;
  panel?.classList.add('is-open');
  panel?.setAttribute('aria-hidden', 'false');
  // Hold the critter's attention for as long as its speech bubble is open.
  setEngagedCritter(critter.id);
  // The dialogue card and the toast stack share the bottom-centre band.
  // Lift the toasts so petting or harvesting mid-conversation doesn't drop
  // a card on top of the critter's speech.
  setToastStackRaised(true);
  if (!talkedThisVisit.has(critter.id)) {
    addFriendshipPoints(critter.id, 2);
    talkedThisVisit.add(critter.id);
  }
  activeScene = beginCritterConversation(critter);
  refreshMeta();
  refreshArc();
  speak(activeScene.opening);
  renderChoices(activeScene);
}

export function closeCritterDialogue(): boolean {
  if (!panel?.classList.contains('is-open')) return false;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  setToastStackRaised(false);
  setEngagedCritter(null);
  activeCritter = null;
  activeScene = null;
  return true;
}

export function isCritterDialogueOpen() {
  return Boolean(panel?.classList.contains('is-open'));
}

export function initializeCritterDialogue() {
  panel = document.createElement('aside');
  panel.className = 'critter-dialogue';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="critter-dialogue-tape" aria-hidden="true"></div>
    <button class="critter-dialogue-close" type="button" aria-label="End conversation">×</button>
    <p class="critter-dialogue-kicker">A little conversation with</p>
    <h2 class="critter-dialogue-name"></h2>
    <p class="critter-dialogue-meta"></p>
    <p class="critter-dialogue-arc" hidden></p>
    <p class="critter-dialogue-speech"></p>
    <div class="critter-dialogue-actions"></div>
  `;
  document.body.append(panel);
  nameElement = panel.querySelector('.critter-dialogue-name');
  metaElement = panel.querySelector('.critter-dialogue-meta');
  arcElement = panel.querySelector('.critter-dialogue-arc');
  speechElement = panel.querySelector('.critter-dialogue-speech');
  actionsElement = panel.querySelector('.critter-dialogue-actions');
  panel.querySelector('.critter-dialogue-close')?.addEventListener('click', closeCritterDialogue);
}

export function tryStartCritterConversationAt(clientX: number, clientY: number): boolean {
  const critter = pickCritterAtScreen(clientX, clientY, camera);
  if (!critter) return false;
  if (critter.rig.group.position.distanceTo(avatar.position) > TALK_REACH) {
    showPetToast(`${critter.params.name} is over there — walk closer to talk`);
    return true;
  }
  openConversation(critter);
  return true;
}
