import { allTrinketDefs, TRINKET_AUTHORED_DEFS } from '../src/sim/catalogs/trinkets';
import { TRINKET_GENERATED_DEFS } from '../src/sim/catalogs/trinketVariants';
import { allQuestDefs } from '../src/sim/catalogs/quests';
import { QUEST_EXPANSION_DEFS } from '../src/sim/catalogs/questCatalog.expansion';
console.log('authoredTrinkets', Object.keys(TRINKET_AUTHORED_DEFS).length);
console.log('generatedTrinkets', TRINKET_GENERATED_DEFS.length);
console.log('totalTrinkets', allTrinketDefs().length);
console.log('totalQuests', allQuestDefs().length);
console.log('expansionQuests', QUEST_EXPANSION_DEFS.length);
const fams: Record<string,number> = {};
for (const d of allTrinketDefs()) fams[d.family] = (fams[d.family]||0)+1;
console.log('trinketsByFamily', JSON.stringify(fams));
const tiers: Record<string,number> = {};
for (const q of allQuestDefs()) tiers[q.tier] = (tiers[q.tier]||0)+1;
console.log('questsByTier', JSON.stringify(tiers));
console.log('uniqueTrinketIds', new Set(allTrinketDefs().map(d=>d.id)).size);
if (allQuestDefs()) {}
