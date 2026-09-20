// The right-hand panel slot has grown two tenants, the neighbor's-door panel and
// the friends list. The older panels (seed store, mill, Thing Maker, home) close
// one another through direct calls; rather than thread the new ones through
// every file, they meet here: opening a guest panel closes the classic ones and
// the other guest panel, and each classic panel closes the guest panels when it
// opens (`closeGuestPanels`).

let closeClassic: () => void = () => {};

type GuestPanel = { close: () => boolean; element: () => HTMLElement | null };
const guestPanels = new Set<GuestPanel>();

/** Set once by main: how to close the seed store, mill, Thing Maker and home panels. */
export function setClassicPanelsCloser(close: () => void) {
  closeClassic = close;
}

export function registerGuestPanel(panel: GuestPanel) {
  guestPanels.add(panel);
}

/** A guest panel is opening: everything else in the slot steps aside. */
export function beginGuestPanel(mine: GuestPanel) {
  closeClassic();
  for (const panel of guestPanels) if (panel !== mine) panel.close();
}

export function closeGuestPanels(): boolean {
  let closed = false;
  for (const panel of guestPanels) closed = panel.close() || closed;
  return closed;
}

export function isWheelInsideGuestPanel(event: WheelEvent): boolean {
  const path = event.composedPath();
  for (const panel of guestPanels) {
    const element = panel.element();
    if (element && path.includes(element)) return true;
  }
  return false;
}
