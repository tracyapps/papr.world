import * as THREE from 'three';
import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { critterReachDistance, setEngagedCritter, type Critter } from './critterBehavior';
import {
  beginCritterConversation,
  everydayConversation,
  resolveConversationChoice,
  type ConversationChoice,
  type ConversationScene,
} from './conversationEngine';
import { pickCritterAtScreen } from './critters';
import { activeQuestDefFor, questProgress } from './quests';
import { addFriendshipPoints, getFriendshipLevel, getFriendshipPoints } from './friendship';
import { petCritter, showPetToast } from './petting';
import { setMillPanelOpen } from './millCounter';
import { camera } from '../render/context';
import { easeShift, framingShift, type Box } from './dialogueFraming';
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
  meerkat: 'paper meerkat',
  fox: 'paper fox',
  parrot: 'paper parrot',
  toucan: 'paper toucan',
  sloth: 'paper sloth',
  monkey: 'paper monkey',
};

let panel: HTMLElement | null = null;
let nameElement: HTMLElement | null = null;
let metaElement: HTMLElement | null = null;
let arcElement: HTMLElement | null = null;
let speechElement: HTMLElement | null = null;
let speakerElement: HTMLElement | null = null;
let questionPromptElement: HTMLElement | null = null;
let actionsElement: HTMLElement | null = null;
let activeCritter: Critter | null = null;
let activeScene: ConversationScene | null = null;
const talkedThisVisit = new Set<string>();

function refreshMeta() {
  if (!activeCritter || !metaElement) return;
  const level = getFriendshipLevel(activeCritter.id);
  const points = getFriendshipPoints(activeCritter.id);
  const personality = activeCritter.params.personality.join(' + ');
  const base = `${SPECIES_LABELS[activeCritter.species]} · ${personality} · ${level} · ${points}/100 friendship`;
  // A favour in flight is worth showing on its own line, so a player who
  // forgot which critter asked for what does not have to reopen the thread.
  const favour = activeQuestDefFor(activeCritter.id);
  const progress = favour ? questProgress(activeCritter.id) : null;
  metaElement.textContent = favour && progress
    ? `${base} · favour: ${favour.quest.title} (${progress.done}/${progress.total})`
    : base;
}

function keepToastsClearOfDialogue() {
  if (!panel?.classList.contains('is-open')) return;
  requestAnimationFrame(() => {
    if (!panel?.classList.contains('is-open')) return;
    setToastStackRaised(true, panel.getBoundingClientRect().height + 40);
  });
}

function speak(line: string, isAnswer = false) {
  if (!activeCritter || !speechElement) return;
  speechElement.textContent = line;
  panel?.classList.toggle('has-answer', isAnswer);
  if (questionPromptElement) {
    questionPromptElement.textContent = isAnswer ? 'Ask something else' : 'What would you like to ask?';
  }
  keepToastsClearOfDialogue();
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
  // A finished favour earns a trinket. Make that land as a moment, not a
  // silent state change: a chime and a line, the same as a finished craft.
  if (choice.questAction === 'turn-in') {
    playCozySound('chime');
    showPetToast('A trinket for your collection — see the scrapbook');
  } else if (choice.questAction === 'accept') {
    playCozySound('tap');
  }
  refreshMeta();
  speak(result.reply, true);
  if (result.action === 'open-mill') {
    // Hand over to the counter: the conversation closes and the refining
    // board opens where the seed shop and Thing Maker panels live.
    closeCritterDialogue();
    setMillPanelOpen(true, 'counter');
    return;
  }
  if (result.action === 'goodbye') {
    // Let the farewell be read (and announced) before the card closes. If a
    // new conversation starts in the meantime, leave that one alone.
    if (actionsElement) actionsElement.innerHTML = '';
    const leaving = activeCritter;
    window.setTimeout(() => {
      if (activeCritter === leaving) closeCritterDialogue();
    }, 1400);
    return;
  }
  if (result.nextScene) {
    activeScene = result.nextScene;
    refreshArc();
    renderChoices(activeScene);
  } else if (result.endsScene) {
    renderAfterStoryChoice();
  }
}

function renderChoices(scene: ConversationScene) {
  if (!actionsElement) return;
  // Never leave the card without a way forward.
  if (scene.choices.length === 0) {
    renderAfterStoryChoice();
    return;
  }
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
  if (speakerElement) speakerElement.textContent = critter.params.name;
  panel?.classList.add('is-open');
  panel?.setAttribute('aria-hidden', 'false');
  // Hold the critter's attention for as long as its speech bubble is open.
  setEngagedCritter(critter.id);
  // The dialogue card and the toast stack share the bottom-centre band.
  // Lift the toasts so petting or harvesting mid-conversation doesn't drop
  // a card on top of the critter's speech.
  if (!talkedThisVisit.has(critter.id)) {
    addFriendshipPoints(critter.id, 2);
    talkedThisVisit.add(critter.id);
  }
  activeScene = beginCritterConversation(critter);
  refreshMeta();
  refreshArc();
  speak(activeScene.opening);
  renderChoices(activeScene);
  keepToastsClearOfDialogue();
}

// ---- Keeping the animal in view ---------------------------------------------------
//
// The card is docked at the bottom. If the animal is behind it, the camera's view
// slides up (a screen-space shift, not a camera move) until the animal is in the
// clear band above the card; it eases back when the conversation ends.

/** Below the HUD button row along the top of the screen. */
const CLEAR_TOP = 84;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const framingBox = new THREE.Box3();
const framingCorner = new THREE.Vector3();
let viewShift = 0;

/** The animal's box on screen right now, or null when it is behind the camera. */
function animalScreenBox(critter: Critter): Box | null {
  framingBox.setFromObject(critter.rig.group);
  if (framingBox.isEmpty()) return null;
  const box: Box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (let index = 0; index < 8; index++) {
    framingCorner.set(
      index & 1 ? framingBox.max.x : framingBox.min.x,
      index & 2 ? framingBox.max.y : framingBox.min.y,
      index & 4 ? framingBox.max.z : framingBox.min.z,
    ).project(camera);
    if (framingCorner.z > 1) return null;
    const x = ((framingCorner.x + 1) / 2) * window.innerWidth;
    const y = ((1 - framingCorner.y) / 2) * window.innerHeight;
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  }
  return box;
}

function applyViewShift(pixels: number) {
  if (pixels <= 0) {
    camera.clearViewOffset();
    return;
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.setViewOffset(width, height, 0, pixels, width, height);
}

/** Where the shift should be right now, from the animal's place on screen. */
function targetViewShift(): number {
  if (!activeCritter || !panel?.classList.contains('is-open')) return 0;
  const measured = animalScreenBox(activeCritter);
  if (!measured) return 0;
  // Measured under the current shift; undo it to compare like with like.
  const animal: Box = {
    left: measured.left,
    right: measured.right,
    top: measured.top + viewShift,
    bottom: measured.bottom + viewShift,
  };
  const rect = panel.getBoundingClientRect();
  return framingShift({
    animal,
    card: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    viewportHeight: window.innerHeight,
    clearTop: CLEAR_TOP,
  });
}

/** Once a frame, after the camera has been placed and before it draws. */
export function updateCritterDialogueFraming(deltaSeconds: number) {
  if (viewShift === 0 && !activeCritter) return;
  camera.updateMatrixWorld();
  const next = easeShift(viewShift, targetViewShift(), deltaSeconds, reducedMotion);
  if (next === viewShift) return;
  viewShift = next;
  applyViewShift(viewShift);
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
    <header class="critter-dialogue-heading">
      <p class="critter-dialogue-kicker">A little conversation with</p>
      <h2 class="critter-dialogue-name"></h2>
      <p class="critter-dialogue-meta"></p>
      <p class="critter-dialogue-arc" hidden></p>
    </header>
    <div class="critter-dialogue-exchange">
      <section class="critter-dialogue-reply" aria-live="polite" aria-atomic="true">
        <p class="critter-dialogue-reply-label"><span class="critter-dialogue-speaker"></span> says</p>
        <p class="critter-dialogue-speech"></p>
      </section>
      <section class="critter-dialogue-questions" aria-label="Conversation choices">
        <p class="critter-dialogue-question-prompt">What would you like to ask?</p>
        <div class="critter-dialogue-actions"></div>
      </section>
    </div>
  `;
  document.body.append(panel);
  nameElement = panel.querySelector('.critter-dialogue-name');
  metaElement = panel.querySelector('.critter-dialogue-meta');
  arcElement = panel.querySelector('.critter-dialogue-arc');
  speechElement = panel.querySelector('.critter-dialogue-speech');
  speakerElement = panel.querySelector('.critter-dialogue-speaker');
  questionPromptElement = panel.querySelector('.critter-dialogue-question-prompt');
  actionsElement = panel.querySelector('.critter-dialogue-actions');
  panel.querySelector('.critter-dialogue-close')?.addEventListener('click', closeCritterDialogue);
}

export function tryStartCritterConversationAt(clientX: number, clientY: number): boolean {
  const critter = pickCritterAtScreen(clientX, clientY, camera);
  if (!critter) return false;
  // Ground distance when it is up a tree — you can talk to a sloth overhead.
  if (critterReachDistance(critter, avatar.position) > TALK_REACH) {
    showPetToast(`${critter.params.name} is over there — walk closer to talk`);
    return true;
  }
  openConversation(critter);
  return true;
}
