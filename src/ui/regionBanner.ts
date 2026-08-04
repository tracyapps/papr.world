import type * as THREE from 'three';
import { getRegionAtPosition } from '../world/regions';

let banner: HTMLElement | null = null;
let nameElement: HTMLElement | null = null;
let biomeElement: HTMLElement | null = null;
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
}

export function updateRegionBanner(position: THREE.Vector3) {
  const region = getRegionAtPosition(position.x, position.z);
  if (region.id === currentRegionId) return;
  currentRegionId = region.id;
  if (nameElement) nameElement.textContent = region.name;
  if (biomeElement) biomeElement.textContent = region.biomeLabel;
  banner?.classList.add('is-visible');
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => banner?.classList.remove('is-visible'), 3600);
}
