import { PAGE_SIZE } from './types';

export function distanceInPages(worldDistance: number) {
  return worldDistance / PAGE_SIZE;
}

export function formatPageDistance(worldDistance: number) {
  const pages = distanceInPages(worldDistance);
  const rounded = Math.round(pages * 10) / 10;
  return `${rounded.toFixed(Number.isInteger(rounded) ? 0 : 1)} ${rounded === 1 ? 'page' : 'pages'}`;
}
