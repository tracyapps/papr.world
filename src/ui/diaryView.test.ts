import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../sim/state';
import {
  buildDiaryGroups,
  diaryPlaceLabel,
  diarySpeakerLabel,
  diaryTopicLabel,
} from './diaryView';

const entries: DiaryEntry[] = [
  {
    id: 'newest',
    critterId: '0,0#raccoon',
    speakerName: 'Bandit',
    pageId: '0,0',
    kind: 'materials',
    text: 'Paper fiber turns up near the clearing.',
    recordedAt: 2_000,
  },
  {
    id: 'older',
    critterId: '0,0#squirrel',
    pageId: '0,0',
    kind: 'wayfinding',
    text: 'The paper mill is west of here.',
    recordedAt: 1_000,
  },
  {
    id: 'forest',
    critterId: '-2,0#woodchuck',
    speakerName: 'Chisel',
    pageId: '-2,0',
    kind: 'fun',
    text: 'This grove sounds different after rain.',
    recordedAt: 500,
  },
];

describe('diary view model', () => {
  it('turns saved ids into player-facing labels with old-save fallbacks', () => {
    expect(diaryPlaceLabel('0,0')).toBe('The Paper Clearing');
    expect(diaryPlaceLabel('not-a-page')).toBe('Somewhere in the neighborhood');
    expect(diarySpeakerLabel(entries[0])).toBe('Bandit');
    expect(diarySpeakerLabel(entries[1])).toBe('A neighbor');
    expect(diaryTopicLabel('wayfinding')).toBe('Nearby');
    expect(diaryTopicLabel('secret_spot')).toBe('Secret spot');
  });

  it('groups entries by named region while preserving newest-first order', () => {
    const groups = buildDiaryGroups(entries, '');

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('The Paper Clearing');
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(['newest', 'older']);
    expect(groups[1].entries.map((entry) => entry.id)).toEqual(['forest']);
  });

  it('searches sentences, speakers, places, topics, and future notes', () => {
    const annotated = [{ ...entries[2], note: 'Return with Pip' }, ...entries.slice(0, 2)];

    expect(buildDiaryGroups(entries, 'Bandit')[0].entries.map((entry) => entry.id)).toEqual(['newest']);
    expect(buildDiaryGroups(entries, 'nearby')[0].entries.map((entry) => entry.id)).toEqual(['older']);
    expect(buildDiaryGroups(entries, 'grove')[0].entries.map((entry) => entry.id)).toEqual(['forest']);
    expect(buildDiaryGroups(annotated, 'pip')[0].entries.map((entry) => entry.id)).toEqual(['forest']);
    expect(buildDiaryGroups(entries, 'not in the diary')).toEqual([]);
  });
});
