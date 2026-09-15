import type { DiaryEntry } from '../sim/state';
import { getPage } from '../world/pages';
import { getRegionName } from '../world/regions';

const TOPIC_LABELS: Record<string, string> = {
  materials: 'Gathering',
  harvest: 'Growing',
  wayfinding: 'Nearby',
  fun: 'Local character',
};

export type DiaryViewEntry = DiaryEntry & {
  placeLabel: string;
  speakerLabel: string;
  topicLabel: string;
};

export type DiaryGroup = {
  id: string;
  label: string;
  entries: DiaryViewEntry[];
};

function pageCoordinates(pageId: string): { px: number; pz: number } | null {
  const match = /^(-?\d+),(-?\d+)$/.exec(pageId);
  if (!match) return null;
  return { px: Number(match[1]), pz: Number(match[2]) };
}

export function diaryPlaceLabel(pageId: string): string {
  const coordinates = pageCoordinates(pageId);
  if (!coordinates) return 'Somewhere in the neighborhood';
  const page = getPage(coordinates.px, coordinates.pz);
  return getRegionName(coordinates.px, coordinates.pz, page.biome);
}

export function diaryTopicLabel(kind: string): string {
  return TOPIC_LABELS[kind] ?? kind.replace(/[-_]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export function diarySpeakerLabel(entry: DiaryEntry): string {
  return entry.speakerName?.trim() || 'A neighbor';
}

/**
 * Search and group the newest-first save entries for the scrapbook view.
 * Groups retain first-seen order, so the place with the newest matching note
 * is always nearest the left edge of the strip.
 */
export function buildDiaryGroups(entries: DiaryEntry[], query: string): DiaryGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const groups = new Map<string, DiaryGroup>();

  for (const entry of entries) {
    const placeLabel = diaryPlaceLabel(entry.pageId);
    const speakerLabel = diarySpeakerLabel(entry);
    const topicLabel = diaryTopicLabel(entry.kind);
    const viewEntry: DiaryViewEntry = { ...entry, placeLabel, speakerLabel, topicLabel };
    const searchable = [entry.text, entry.note, placeLabel, speakerLabel, topicLabel]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;

    const groupId = `${getPageBiomeKey(entry.pageId)}:${placeLabel}`;
    const group = groups.get(groupId) ?? { id: groupId, label: placeLabel, entries: [] };
    group.entries.push(viewEntry);
    groups.set(groupId, group);
  }

  return [...groups.values()];
}

function getPageBiomeKey(pageId: string): string {
  const coordinates = pageCoordinates(pageId);
  return coordinates ? getPage(coordinates.px, coordinates.pz).biome : pageId;
}
