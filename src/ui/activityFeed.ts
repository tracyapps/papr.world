import type { GameState } from '../sim/state';
import { BIOME_MAP_NAMES } from '../world/biomeCompass';
import { diaryPlaceLabel, diarySpeakerLabel, diaryTopicLabel } from './diaryView';

export type LogFilter = 'activity' | 'travel' | 'conversations';

export type ActivityFeedEntry = {
  id: string;
  filter: LogFilter;
  kind: string;
  title: string;
  message: string;
  detail: string;
  at: number;
};

const ACTIVITY_TITLES: Record<GameState['player']['activityLog'][number]['kind'], string> = {
  garden: 'Garden',
  harvest: 'Harvest',
  gathering: 'Gathering',
  crafting: 'Crafting',
  building: 'Building',
};

export function buildActivityFeed(
  state: Readonly<GameState>,
  filters: ReadonlySet<LogFilter>,
  query = '',
): ActivityFeedEntry[] {
  const entries: ActivityFeedEntry[] = [];

  if (filters.has('activity')) {
    for (const entry of state.player.activityLog) {
      entries.push({
        id: `activity:${entry.id}`,
        filter: 'activity',
        kind: entry.kind,
        title: ACTIVITY_TITLES[entry.kind],
        message: entry.message,
        detail: 'World activity',
        at: entry.at,
      });
    }
  }

  if (filters.has('travel')) {
    for (const entry of state.player.travelLog) {
      const place = diaryPlaceLabel(entry.pageId);
      entries.push({
        id: `travel:${entry.id}`,
        filter: 'travel',
        kind: entry.biome,
        title: `Discovered ${place}`,
        message: `Reached a new part of ${BIOME_MAP_NAMES[entry.biome]}.`,
        detail: `Map page ${entry.pageId}`,
        at: entry.at,
      });
    }
  }

  if (filters.has('conversations')) {
    for (const entry of state.player.diaryEntries) {
      entries.push({
        id: `conversation:${entry.id}`,
        filter: 'conversations',
        kind: entry.kind,
        title: diarySpeakerLabel(entry),
        message: entry.text,
        detail: `${diaryTopicLabel(entry.kind)} · ${diaryPlaceLabel(entry.pageId)}`,
        at: entry.recordedAt,
      });
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  return entries
    .filter((entry) => !normalizedQuery || [entry.title, entry.message, entry.detail]
      .join(' ').toLocaleLowerCase().includes(normalizedQuery))
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}
