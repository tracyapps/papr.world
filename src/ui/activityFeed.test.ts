import { describe, expect, it } from 'vitest';
import { createDefaultGameState } from '../sim/state';
import { buildActivityFeed, type LogFilter } from './activityFeed';

describe('combined activity feed', () => {
  function stateWithLogs() {
    const state = createDefaultGameState();
    state.player.activityLog = [
      { id: 'harvest:1', kind: 'harvest', message: 'Harvested two berries.', at: 100 },
    ];
    state.player.travelLog = [
      { id: 'travel:1,0', pageId: '1,0', biome: 'meadow', at: 300 },
    ];
    state.player.diaryEntries = [{
      id: 'story:1', critterId: '0,0#raccoon', speakerName: 'Bandit', pageId: '0,0',
      kind: 'wayfinding', text: 'The mill is west of here.', recordedAt: 200,
    }];
    return state;
  }

  it('combines selected log portions in newest-first order', () => {
    const filters = new Set<LogFilter>(['activity', 'travel', 'conversations']);
    expect(buildActivityFeed(stateWithLogs(), filters).map((entry) => entry.filter))
      .toEqual(['travel', 'conversations', 'activity']);
  });

  it('uses filters as independent multi-select toggles', () => {
    const filters = new Set<LogFilter>(['activity', 'conversations']);
    const feed = buildActivityFeed(stateWithLogs(), filters);
    expect(feed.map((entry) => entry.filter)).toEqual(['conversations', 'activity']);
  });

  it('searches across message, speaker, topic, and place details', () => {
    const filters = new Set<LogFilter>(['activity', 'travel', 'conversations']);
    expect(buildActivityFeed(stateWithLogs(), filters, 'Bandit').map((entry) => entry.filter))
      .toEqual(['conversations']);
    expect(buildActivityFeed(stateWithLogs(), filters, 'meadow').map((entry) => entry.filter))
      .toEqual(['travel']);
    expect(buildActivityFeed(stateWithLogs(), filters, 'berries').map((entry) => entry.filter))
      .toEqual(['activity']);
  });

  it('labels the expanded activity categories', () => {
    const state = stateWithLogs();
    state.player.activityLog.unshift({
      id: 'mine:1', kind: 'gathering', message: 'Mined granite cardstone.', at: 400,
    });
    expect(buildActivityFeed(state, new Set<LogFilter>(['activity']))[0]?.title).toBe('Gathering');
  });
});
