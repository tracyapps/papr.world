type RevealablePanel = {
  hidden: boolean;
  classList: Pick<DOMTokenList, 'add'>;
};

/**
 * Reveal a panel before reflecting state into it. The ordering matters because
 * offline multiplayer state may itself request that the panel be opened.
 */
export function revealMultiplayerPanel(
  panel: RevealablePanel,
  reflect: () => void,
): void {
  panel.hidden = false;
  panel.classList.add('is-open');
  reflect();
}
