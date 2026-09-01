import type * as THREE from 'three';
import { getRegionAtPosition } from '../world/regions';

let banner: HTMLElement | null = null;
let nameElement: HTMLElement | null = null;
let biomeElement: HTMLElement | null = null;
let currentlyElement: HTMLElement | null = null;
let currentlyNameElement: HTMLElement | null = null;
let currentRegionId = '';
let hideTimer: number | undefined;

export function initializeRegionBanner() {
  banner = document.createElement('div');
  banner.className = 'region-banner';
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = '<strong></strong><span></span>';
  document.body.append(banner);
  nameElement = banner.querySelector('strong');
  biomeElement = banner.querySelector('span');
  // Above the minimap: unlike the banner (which announces an *arrival* and
  // then fades), this stays up the whole time you're there.
  currentlyElement = document.querySelector('#mini-map-currently');
  if (currentlyElement) {
    // A location-pin icon replaces the word "Currently" — it updates as you
    // walk exactly like the text label used to, which is self-explanatory
    // without spending the widget's width on a word. The name itself stays
    // as plain text (still the thing a wider minimap is for reading), and
    // an sr-only prefix keeps "Currently at <name>" for screen readers.
    currentlyElement.innerHTML = `
      <span class="mini-map-currently-icon" aria-hidden="true"></span>
      <span class="sr-only">Currently at </span>
      <span class="mini-map-currently-name"></span>
    `;
    currentlyNameElement = currentlyElement.querySelector('.mini-map-currently-name');
  }
}

export function updateRegionBanner(position: THREE.Vector3) {
  const region = getRegionAtPosition(position.x, position.z);
  if (region.id === currentRegionId) return;
  currentRegionId = region.id;
  if (nameElement) nameElement.textContent = region.name;
  if (biomeElement) biomeElement.textContent = region.biomeLabel;
  if (currentlyNameElement) currentlyNameElement.textContent = region.name;
  banner?.classList.add('is-visible');
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => banner?.classList.remove('is-visible'), 3600);
}
