import { describe, expect, it } from 'vitest';
import { distanceInPages, formatPageDistance } from './distance';
import { PAGE_SIZE } from './types';

describe('page distance labels', () => {
  it('uses the world page as its unit', () => {
    expect(distanceInPages(PAGE_SIZE)).toBe(1);
    expect(distanceInPages(PAGE_SIZE * 1.75)).toBe(1.75);
  });

  it('shows useful tenths while keeping whole pages tidy', () => {
    expect(formatPageDistance(PAGE_SIZE)).toBe('1 page');
    expect(formatPageDistance(PAGE_SIZE * 1.76)).toBe('1.8 pages');
    expect(formatPageDistance(PAGE_SIZE * 2)).toBe('2 pages');
  });
});
