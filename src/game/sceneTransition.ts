import { scene as surfaceScene } from '../render/context';
import { dispatchGameCommand } from '../sim/commands';
import { homePlaceOf } from '../sim/scene';
import { getGameState } from '../sim/state';
import { setSceneGround } from '../world/activeScene';
import {
  describeArrival,
  homeInteriorLayout,
  interiorName,
  nearInteriorExit,
} from '../world/homeInterior';
import { homeDoorstep } from '../world/homeSite';
import { getNeighborHome, neighborDoorstep, type NeighborHome } from '../world/neighborHomes';
import type { DwellingPartId } from '../sim/catalogs/dwellings';
import { HOME_INTERIOR_SCENE } from '../world/scenes';
import { avatar, moveAvatarToScene, placeAvatarAt } from './avatar';
import { snapCamera } from './camera';
import {
  announceLeftHome,
  announceOwnHome,
  guestsAvailable,
  setGuestHandlers,
  subscribeGuests,
} from './guests';
import { setInteractionsIndoors } from './interactionRouter';
import { interiorGround, interiorScene, refreshInterior } from './interiorScene';
import { showPetToast } from './petting';

/**
 * Stepping through the home's door, and back out (design in
 * `docs/scenes-and-interiors.md`).
 *
 * The sim decides whether you may cross and saves which scene you are in
 * (`sim/scene.ts`); this module makes the world follow: it hands the avatar to
 * the room's own scene, installs the room's floor and walls as the ground, and
 * tells the interaction router that surface things are out of reach. Leaving
 * does the reverse and always puts you at the doorstep, never a fixed spot.
 *
 * Accessibility: every crossing is announced in words (the toast is a polite
 * live region), respects reduced motion (a cut, not a fade), and Leave is a
 * real button that is visible the whole time you are inside.
 */

let indoors = false;
/** The neighbor's home you are inside, when you are visiting; null in your own. */
let visiting: { accountId: string; name: string; parts: DwellingPartId[] } | null = null;
let transitioning = false;
let closePanels: () => void = () => {};
let leaveButton: HTMLButtonElement | null = null;
let fade: HTMLElement | null = null;

const FADE_MS = 170;

export function isIndoors() {
  return indoors;
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** The finished parts of the home you are in (or about to enter): yours, or the one you are visiting. */
function parts(): readonly DwellingPartId[] {
  return visiting ? visiting.parts : getGameState().world.dwelling.parts;
}

/** Whether you are inside somebody else's home (as opposed to your own). */
export function isVisiting() {
  return visiting !== null;
}

/** Whose home you are visiting, for words on screen. */
export function visitedHomeName(): string | null {
  return visiting?.name ?? null;
}

/** The account whose home you are visiting. */
export function visitedHomeOwner(): string | null {
  return visiting?.accountId ?? null;
}

/**
 * Where friends on the surface count you as standing: the door of the home you
 * are in. Only used when the room does not know you are inside (a guest in
 * their own tent); otherwise the room hears where you really are.
 */
export function outsideDoorstep(): { x: number; z: number } {
  const home = visiting ? getNeighborHome(visiting.accountId) : null;
  return home ? neighborDoorstep(home) : homeDoorstep(homePlaceOf(getGameState()));
}

/** Whether the player stands near the way out (only meaningful indoors). */
export function isNearInteriorExit(position: { x: number; z: number }) {
  return indoors && nearInteriorExit(homeInteriorLayout(parts()), position.x, position.z);
}

function syncLeaveButton() {
  if (!leaveButton) return;
  leaveButton.hidden = !indoors;
  leaveButton.textContent = visiting
    ? `Leave ${visiting.name}'s ${interiorName(parts())}`
    : `Leave the ${interiorName(parts())}`;
}

function enterInterior() {
  const layout = homeInteriorLayout(parts());
  refreshInterior(parts());
  setSceneGround(interiorGround(parts()));
  setInteractionsIndoors(true);
  moveAvatarToScene(interiorScene);
  placeAvatarAt(layout.entry.x, layout.entry.z);
  snapCamera(avatar.position);
  indoors = true;
  document.documentElement.classList.add('is-indoors');
  syncLeaveButton();
  // The room hears about it now, at the moment the screen has really moved.
  // (A visit was already confirmed by the room before the door opened.)
  if (!visiting) announceOwnHome();
}

function enterSurface() {
  const step = outsideDoorstep();
  setSceneGround(null);
  setInteractionsIndoors(false);
  moveAvatarToScene(surfaceScene);
  placeAvatarAt(step.x, step.z);
  snapCamera(avatar.position);
  indoors = false;
  document.documentElement.classList.remove('is-indoors');
  announceLeftHome();
  visiting = null;
  syncLeaveButton();
}

/** Fade out, swap, fade in; or just swap when the player prefers less motion. */
function crossOver(swap: () => void, message: string) {
  closePanels();
  if (reducedMotion() || !fade) {
    swap();
    showPetToast(message);
    return;
  }
  transitioning = true;
  fade.classList.add('is-on');
  window.setTimeout(() => {
    swap();
    fade?.classList.remove('is-on');
    showPetToast(message);
    window.setTimeout(() => { transitioning = false; }, FADE_MS);
  }, FADE_MS);
}

/** Step through the door. Returns whether it happened; says why in words when it did not. */
export function goInside(): boolean {
  if (indoors || transitioning) return false;
  const result = dispatchGameCommand({
    type: 'enterScene',
    scene: HOME_INTERIOR_SCENE,
    from: { x: avatar.position.x, z: avatar.position.z },
  });
  if (!result.ok) {
    showPetToast(result.reason);
    return false;
  }
  crossOver(enterInterior, describeArrival(parts()));
  return true;
}

/** Step back out to the doorstep. Always available from inside. */
export function goOutside(): boolean {
  if (!indoors || transitioning) return false;
  if (visiting) {
    // A visit never touched your own saved scene, so there is nothing to undo there.
    crossOver(enterSurface, `Back outside, at ${visiting.name}'s door.`);
    return true;
  }
  const result = dispatchGameCommand({ type: 'leaveScene' });
  if (!result.ok) {
    showPetToast(result.reason);
    return false;
  }
  crossOver(enterSurface, 'Back outside, at your front door.');
  return true;
}

/**
 * The room has put you inside a neighbor's home; make the screen follow.
 * (The answer to "may I come in?" is what calls this: see `game/guests.ts`.)
 */
export function enterVisitedHome(host: string, hostName: string): boolean {
  if (indoors || transitioning) return false;
  const home: NeighborHome | null = getNeighborHome(host);
  if (!home) {
    // The room let us in but that home is no longer on the map here. Step back out.
    announceLeftHome();
    showPetToast('That home is not there any more.');
    return false;
  }
  visiting = { accountId: home.accountId, name: home.name || hostName, parts: [...home.parts] };
  crossOver(enterInterior, describeVisit(visiting.name, visiting.parts));
  return true;
}

/** Said aloud on arriving as a guest: where you are, that chat stays in, and the way out. */
export function describeVisit(name: string, homeParts: readonly DwellingPartId[]): string {
  return `Inside ${name}'s ${interiorName(homeParts)}. Chat stays within these walls. Exit: the door, just in front of you.`;
}

/** The owner asked you to step out: the room has already moved you, the screen follows. */
function leaveBecauseAsked(): void {
  if (!visiting) return;
  const name = visiting.name;
  if (transitioning) {
    // Mid-crossing: let it finish, then step out.
    window.setTimeout(leaveBecauseAsked, FADE_MS * 2);
    return;
  }
  crossOver(enterSurface, `${name} asked you to step out. You are back at their door.`);
}

/** After loading a save that was made indoors, go back in (no fade). */
export function restoreSavedScene() {
  if (getGameState().player.scene !== HOME_INTERIOR_SCENE) return;
  enterInterior();
  showPetToast(describeArrival(parts()));
}

export function initializeSceneTransition(options: { closePanels: () => void }) {
  closePanels = options.closePanels;

  setGuestHandlers({
    admitted: (host, hostName) => { enterVisitedHome(host, hostName); },
    evicted: () => leaveBecauseAsked(),
    say: showPetToast,
  });
  // The room went away while you were a guest: you are on your own again, at
  // your own door. And if you were already in your own home when the room came
  // up (a save made indoors), it hears about it now.
  let wasAvailable = guestsAvailable();
  subscribeGuests(() => {
    const available = guestsAvailable();
    if (available === wasAvailable) return;
    wasAvailable = available;
    if (!indoors || transitioning) return;
    if (!available && visiting) {
      crossOver(enterSurface, 'The connection to the neighborhood ended, so you are back at your own door.');
    } else if (available && !visiting) {
      announceOwnHome();
    }
  });

  fade = document.createElement('div');
  fade.className = 'scene-fade';
  fade.setAttribute('aria-hidden', 'true');
  document.body.append(fade);

  leaveButton = document.createElement('button');
  leaveButton.type = 'button';
  leaveButton.className = 'scene-leave';
  leaveButton.hidden = true;
  leaveButton.addEventListener('click', () => { goOutside(); });
  document.querySelector('.hud')?.append(leaveButton);
  syncLeaveButton();
}
