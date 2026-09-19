import { describe, expect, it } from 'vitest';
import {
  exploredFraction,
  initializeExplored,
  isExploredCoarse,
  markExplored,
  saveExplored,
} from './explored';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe('remembering where you have been', () => {
  it('marks a patch around you and nothing far away', () => {
    initializeExplored(memoryStorage(), false);
    markExplored(10, 10, 3);
    expect(isExploredCoarse(10, 10)).toBe(true);
    expect(isExploredCoarse(11.5, 10)).toBe(true);
    expect(isExploredCoarse(30, 30)).toBe(false);
    expect(exploredFraction(0, 0)).toBeGreaterThan(0);
    expect(exploredFraction(5, 5)).toBe(0);
  });

  it('works across page seams and negative coordinates', () => {
    initializeExplored(memoryStorage(), false);
    markExplored(-25, -25, 3); // the corner shared by four pages
    expect(isExploredCoarse(-26, -26)).toBe(true);
    expect(isExploredCoarse(-24, -24)).toBe(true);
    expect(isExploredCoarse(-26, -24)).toBe(true);
  });

  it('survives a reload', () => {
    const storage = memoryStorage();
    initializeExplored(storage, false);
    markExplored(120, -80, 3);
    saveExplored();
    initializeExplored(storage, false);
    expect(isExploredCoarse(120, -80)).toBe(true);
    expect(isExploredCoarse(0, 0)).toBe(false);
  });

  it('shrugs off a damaged record', () => {
    const storage = memoryStorage();
    storage.setItem('pp.explored.v1', '{"version":1,"pages":{"0,0":"not base64!!","x":"AAAA"}}');
    initializeExplored(storage, false);
    expect(isExploredCoarse(0, 0)).toBe(false);
  });
});
