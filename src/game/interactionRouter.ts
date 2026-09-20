export type ScreenInteraction = {
  id: string;
  priority: number;
  /**
   * Where this can be used. Everything registered so far is a thing on the
   * surface, so that is the default; an interior only lets through the
   * interactions that say `'interior'` (or `'any'`), so a click inside your
   * tent can never reach a shovel-hole on the lawn outside.
   */
  scene?: 'surface' | 'interior' | 'any';
  /**
   * Whether a primary press over this target must reserve the gesture and
   * prevent camera orbit. Broad cozy click volumes opt out so dragging still
   * pans the world while a still click interacts.
   */
  blocksOrbit?: boolean;
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

let indoors = false;

/** Tell the router which kind of scene the player is in. */
export function setInteractionsIndoors(value: boolean) {
  indoors = value;
}

function availableHere(interaction: ScreenInteraction) {
  const scene = interaction.scene ?? 'surface';
  return scene === 'any' || (scene === 'interior') === indoors;
}

function orderedInteractions() {
  return [...interactions.values()]
    .filter(availableHere)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function hasScreenInteractionAt(clientX: number, clientY: number) {
  return getScreenInteractionAt(clientX, clientY) !== null;
}

export function hasOrbitBlockingInteractionAt(clientX: number, clientY: number) {
  return orderedInteractions().some((interaction) => (
    interaction.blocksOrbit !== false && interaction.hitTest(clientX, clientY)
  ));
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
