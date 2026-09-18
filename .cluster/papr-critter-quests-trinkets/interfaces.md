# Frozen interfaces (v1) — do not rename without updating all consumers

## conversations.json — new `continuations` section (additive, version stays 1)
```jsonc
"continuations": {
  "materials": [ "{{name}} scratches a fold. “Yesterday I mentioned the local materials — I went and had a closer look.”" ],
  "harvest":   [ ... ],
  "wayfinding":[ ... ],
  "fun":       [ ... ],
  "place":     [ ... ]   // generic fallback
}
```
Each entry must be a non-empty array of strings. Placeholders allowed:
{{name}} {{species}} {{region}} {{biome}} {{pageId}} {{material:id}} {{material-short:id}}
{{tool:id}} {{tool-for:id}} {{found-in:id}} {{only-here:id}} {{lastTopic}}.

## `src/sim/catalogs/trinkets.ts`
```ts
export type TrinketFamilyId = 'found'|'natural'|'handmade'|'curious'|'seasonal'|'story';
export type TrinketShapeId =
  |'pebble'|'cube'|'sphere'|'ring'|'cone'|'star'|'heart'|'leaf'|'shell'|'key'
  |'button'|'grain'|'crystal'|'spool'|'bell'|'acorn'|'pinwheel'|'thimble'
  |'windup-mouse'|'windup-bird'|'windup-fox'|'windup-cat'|'windup-bunny'
  |'windup-frog'|'windup-duck'|'windup-bear'|'windup-beetle'|'windup-fish';
export type TrinketMotionId = 'still'|'spin'|'bob'|'wobble'|'windup'|'sway'|'flip'|'orbit';
export type TrinketPartId =
  |'ears'|'tail'|'eyes'|'wings'|'key'|'hat'|'stem'|'antenna'|'fin'|'beak'|'ribbon'|'feather'|'spots'|'stripes'|'glitter';
export type TrinketDef = {
  id: string; label: string; description: string;
  family: TrinketFamilyId; shape: TrinketShapeId; motion: TrinketMotionId;
  parts: TrinketPartId[];
  palette: { base: string; accent: string; detail: string };
  textureUrl?: string | null;
  scale: number;            // ~0.7..1.4 ; base trinket ≈0.16 world units
  rarity: 1|2|3;
  tags: string[];           // e.g. ['biome:forest','material:stone']
};
export const TRINKET_FAMILIES: Record<TrinketFamilyId,{id:TrinketFamilyId;label:string;description:string}>;
export const TRINKET_AUTHORED_DEFS: Record<string, TrinketDef>;
export function getTrinketDef(id: string): TrinketDef | null;
export function allTrinketDefs(): TrinketDef[];
export function trinketDefsInFamily(family: TrinketFamilyId): TrinketDef[];
export function pickTrinketDef(pool: { family?: TrinketFamilyId; shapes?: TrinketShapeId[]; tag?: string }, owned: ReadonlySet<string>, seed: number): TrinketDef;
```
`trinketVariants.ts` must export `export const TRINKET_GENERATED_DEFS: TrinketDef[];`

## `src/sim/catalogs/quests.ts`
```ts
export type QuestTier = 'favor'|'errand'|'odyssey';
export type QuestObjective =
 |{kind:'collect';resource:ResourceId;quantity:number}
 |{kind:'craft';recipeId:RecipeId}
 |{kind:'craftTool';family:ToolFamilyId;tier?:1|2|3}
 |{kind:'learnTech';nodeId:TechNodeId}
 |{kind:'plant';seedId:SeedId}
 |{kind:'harvest';resource:ResourceId;quantity:number}
 |{kind:'visitBiome';biome:Biome}
 |{kind:'visitPage';pageId:string}
 |{kind:'dig';layer:1|2|3}
 |{kind:'trim';species:TreeSpecies}
 |{kind:'talk';critterId:string}
 |{kind:'place';templateKey:BuildPieceKey}
 |{kind:'deliver';itemId:string}
 ;
export type QuestReward = { trinketFamily: TrinketFamilyId; trinketShapes?: TrinketShapeId[]; trinketTag?: string; friendship: number };
export type QuestDef = {
  id: string; title: string; summary: string; tier: QuestTier;
  giverSpecies?: CritterSpecies[]; giverPersonalities?: PersonalityTrait[]; giverCritterIds?: string[];
  minFriendship: FriendshipLevel; biomes?: Biome[];
  requiresQuests?: string[];
  objectives: QuestObjective[];
  reward: QuestReward;
  opening: string[]; acceptLabel: string; acceptReply: string[];
  declineLabel?: string; declineReply?: string[];
  progressOpening: string[]; turnInOpening: string[]; turnInReply: string[];
  weight?: number; exclusivityGroup?: string;
};
export const QUEST_DEFS: Record<string, QuestDef>;
export function allQuestDefs(): QuestDef[];
export function getQuestDef(id: string): QuestDef | null;
export function objectiveReach(obj: QuestObjective, state: GameState): 'done'|'ready'|'next-step'|'far';
export function questReachable(quest: QuestDef, state: GameState): boolean;
```
`questCatalog.expansion.ts` must export `export const QUEST_EXPANSION_DEFS: QuestDef[];`
Only use ids that exist in the live catalogs (validator enforces).

## Player save additions (`src/sim/state.ts`)
```ts
player.trinkets: TrinketInstance[];                       // {id,defId,seed,acquiredAt,source,placed:null|{pageId,x,z,rotY}}
player.quests: { active: Record<string,ActiveQuest>; completed: string[]; completedByCritter: Record<string,string[]>; cooldownUntil: Record<string,number> };
player.visitedBiomes: Biome[]; player.visitedPages: string[]; player.metCritters: string[];
player.metCritterNames: Record<string,string>;
```
```ts
type ActiveQuest = { questId:string; acceptedAt:number; baselines:number[]; satisfied:boolean[]; step:number };
```
