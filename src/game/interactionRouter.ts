export type ScreenInteraction = {
  id: string;
  priority: number;
  hitTest: (clientX: number, clientY: number) => boolean;
  interact: (clientX: number, clientY: number) => boolean;
};

const interactions = new Map<string, ScreenInteraction>();

/** Register a world interaction without teaching main.ts or the cursor about
 * its implementation. Higher priority wins when screen-space targets overlap. */
export function registerScreenInteraction(interaction: ScreenInteraction) {
  interactions.set(interaction.id, interaction);
  return () => interactions.delete(interaction.id);
}

function orderedInteractions() {
  return [...interactions.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function hasScreenInteractionAt(clientX: number, clientY: number) {
  return getScreenInteractionAt(clientX, clientY) !== null;
}

export function getScreenInteractionAt(clientX: number, clientY: number) {
  return orderedInteractions().find((interaction) => interaction.hitTest(clientX, clientY)) ?? null;
}

export function tryScreenInteractionAt(clientX: number, clientY: number) {
  for (const interaction of orderedInteractions()) {
    if (!interaction.hitTest(clientX, clientY)) continue;
    return interaction.interact(clientX, clientY);
  }
  return false;
}
