import { describe, expect, it } from 'vitest';
import { accountDeskUrl } from './accountDesk';

describe('account desk URL', () => {
  it('is same-origin in production, wherever the game is deployed', () => {
    expect(accountDeskUrl('https://papr.world', false).toString()).toBe(
      'https://papr.world/account/',
    );
    expect(accountDeskUrl('https://preview-branch.vercel.app', false).toString()).toBe(
      'https://preview-branch.vercel.app/account/',
    );
  });

  it('points at the site dev server in DEV, ignoring the game origin', () => {
    expect(accountDeskUrl('http://localhost:5173', true).toString()).toBe(
      'http://localhost:4321/account/',
    );
  });
});
