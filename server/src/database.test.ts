import { describe, expect, it } from 'vitest';
import { defaultWorldSpecifications } from './database';

describe('default world provisioning', () => {
  it('gives each account one private solo world and access to the shared world', () => {
    const worlds = defaultWorldSpecifications({
      id: '25e7894b-3808-489c-9b80-e9ef90cb03c2',
      displayName: 'Wren',
    });

    expect(worlds.solo).toEqual({
      slug: 'solo-25e7894b-3808-489c-9b80-e9ef90cb03c2',
      name: "Wren's solo world",
      role: 'owner',
      capabilities: ['enter', 'build', 'invite', 'claim_home'],
    });
    expect(worlds.shared).toEqual({
      slug: 'shared',
      name: 'Shared world',
      role: 'member',
      capabilities: ['enter', 'build', 'claim_home'],
    });
  });
});
