import { avatar } from '../game/avatar';
import { getGuidanceDistance, getGuidanceTarget, setGuidanceTarget, ARRIVE_DISTANCE } from '../game/guidance';
import {
  addPlace,
  getPlace,
  getPlaces,
  onPlacesChanged,
  removePlace,
  renamePlace,
  suggestedPlaceName,
} from '../world/places';
import { distanceInPages, formatPageDistance } from '../world/distance';

// Saved places and the guidance picker. These used to float in their own
// panel on the right edge, then moved into the scrapbook's Map tab; they now
// live attached to the minimap instead, since "where am I going" is a map
// question and belongs next to the map rather than a tap away in a book.
//
// This module owns the controls; main.ts parents the returned element into
// the minimap widget, and updatePlacesPanel() keeps working whether or not
// that element is currently in the document.
//
// Accessibility: native controls, real labels, focus outlines left alone,
// and a polite live region for the distance readout.

let selectElement: HTMLSelectElement | null = null;
let renameButton: HTMLButtonElement | null = null;
let removeButton: HTMLButtonElement | null = null;
let statusElement: HTMLParagraphElement | null = null;
let lastAnnouncedDistance = -1;
/** Clears the guide a moment after arrival — see updatePlacesPanel(). */
let arrivalClearTimer: number | undefined;

function cancelArrivalClear() {
  window.clearTimeout(arrivalClearTimer);
  arrivalClearTimer = undefined;
}

function stopGameEvents(element: HTMLElement) {
  element.addEventListener('pointerdown', (event) => event.stopPropagation());
  element.addEventListener('pointerup', (event) => event.stopPropagation());
  element.addEventListener('wheel', (event) => event.stopPropagation());
}

function refreshOptions() {
  if (!selectElement) return;
  const selected = getGuidanceTarget()?.id ?? '';

  selectElement.innerHTML = '';
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = 'No guide';
  selectElement.append(noneOption);

  for (const place of getPlaces()) {
    const option = document.createElement('option');
    option.value = place.id;
    option.textContent = place.name;
    selectElement.append(option);
  }

  // Keep the selection if the place still exists; otherwise clear the guide.
  selectElement.value = getPlace(selected) ? selected : '';
  if (!selectElement.value && selected) {
    setGuidanceTarget(null);
  }
  updateActionButtons();
}

function updateActionButtons() {
  if (!selectElement || !renameButton || !removeButton) return;
  const place = selectElement.value ? getPlace(selectElement.value) : null;
  renameButton.disabled = !place;
  removeButton.disabled = !place || place.builtin;
  removeButton.title = place?.builtin ? 'Home can’t be removed.' : '';
}

export function markCurrentSpot() {
  const name = window.prompt('Name this place:', suggestedPlaceName());
  if (name === null) return; // cancelled
  const place = addPlace(name, avatar.position.x, avatar.position.z);
  // Select the new place. You're standing on it, so no arrows appear —
  // the status line just confirms "You're at <name>."
  if (selectElement) {
    cancelArrivalClear();
    selectElement.value = place.id;
    setGuidanceTarget(place.id);
    lastAnnouncedDistance = -1;
    updateActionButtons();
  }
}

/**
 * Build the saved-places controls as a detached element. The scrapbook's Map
 * tab parents this in; nothing here decides where it lives on screen.
 */
export function buildPlacesControls(): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'places-controls';
  panel.setAttribute('aria-label', 'Saved places');

  const label = document.createElement('label');
  label.className = 'places-label';
  label.textContent = 'Go to:';
  label.htmlFor = 'places-select';

  selectElement = document.createElement('select');
  selectElement.id = 'places-select';
  selectElement.className = 'places-select';
  selectElement.addEventListener('change', () => {
    cancelArrivalClear();
    setGuidanceTarget(selectElement?.value || null);
    lastAnnouncedDistance = -1;
    updateActionButtons();
  });

  const buttonRow = document.createElement('div');
  buttonRow.className = 'places-buttons';

  const makeButton = (text: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'places-button';
    button.textContent = text;
    return button;
  };

  const markButton = makeButton('Mark spot (M)');
  markButton.addEventListener('click', markCurrentSpot);

  renameButton = makeButton('Rename');
  renameButton.addEventListener('click', () => {
    const place = selectElement?.value ? getPlace(selectElement.value) : null;
    if (!place) return;
    const name = window.prompt('Rename place:', place.name);
    if (name === null) return;
    renamePlace(place.id, name);
  });

  removeButton = makeButton('Remove');
  removeButton.addEventListener('click', () => {
    const place = selectElement?.value ? getPlace(selectElement.value) : null;
    if (!place || place.builtin) return;
    if (!window.confirm(`Remove "${place.name}"?`)) return;
    if (getGuidanceTarget()?.id === place.id) {
      setGuidanceTarget(null);
    }
    removePlace(place.id);
  });

  buttonRow.append(markButton, renameButton, removeButton);

  statusElement = document.createElement('p');
  statusElement.className = 'places-status';
  statusElement.setAttribute('aria-live', 'polite');

  panel.append(label, selectElement, buttonRow, statusElement);
  stopGameEvents(panel);

  onPlacesChanged(refreshOptions);
  refreshOptions();
  return panel;
}

/** Called every frame; announces distance changes at a gentle cadence. */
export function updatePlacesPanel() {
  if (!statusElement) return;

  // Signs can change the guidance target directly. Keep the waypoint control
  // visually in sync so both entry points feel like one navigation system.
  const targetId = getGuidanceTarget()?.id ?? '';
  if (selectElement && selectElement.value !== targetId) {
    selectElement.value = targetId;
    updateActionButtons();
  }

  const distance = getGuidanceDistance(avatar.position);
  if (distance === null) {
    cancelArrivalClear();
    if (lastAnnouncedDistance !== -1) {
      statusElement.textContent = '';
      lastAnnouncedDistance = -1;
    }
    return;
  }

  if (distance < ARRIVE_DISTANCE) {
    if (lastAnnouncedDistance !== 0) {
      statusElement.textContent = `You’re at ${getGuidanceTarget()?.name ?? 'your place'}.`;
      lastAnnouncedDistance = 0;
      // Give the arrival message a moment to be read, then clear the guide
      // automatically — "Go to:" is about reaching a place, not leaving it
      // parked as your destination once you're standing on it.
      cancelArrivalClear();
      arrivalClearTimer = window.setTimeout(() => setGuidanceTarget(null), 2200);
    }
    return;
  }

  // Back outside arrival range (a quick overshoot, a turn to look around):
  // a pending auto-clear from a moment ago no longer applies.
  cancelArrivalClear();

  // Announce tenths of a page and only rewrite when that value changes,
  // so screen readers aren't flooded.
  const rounded = Math.round(distanceInPages(distance) * 10);
  if (rounded !== lastAnnouncedDistance) {
    statusElement.textContent = `${getGuidanceTarget()?.name ?? 'Place'}: ${formatPageDistance(distance)} away`;
    lastAnnouncedDistance = rounded;
  }
}
