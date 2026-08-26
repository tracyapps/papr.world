import type { ChatBroadcast } from '../../shared/src/index';

type SharedChatUi = {
  setStatus: (text: string, connected?: boolean) => void;
  addChat: (line: ChatBroadcast) => void;
  addNotice: (text: string) => void;
  focus: () => void;
};

export function initializeSharedChat(onSend: (text: string) => void): SharedChatUi {
  const aside = document.createElement('aside');
  aside.className = 'shared-chat';
  aside.setAttribute('aria-label', 'Neighborhood chat');
  aside.innerHTML = `
    <details open>
      <summary>Neighborhood <span data-role="status">connecting…</span></summary>
      <ol class="shared-chat-log" data-role="log" role="log" aria-live="polite" aria-relevant="additions"></ol>
      <form class="shared-chat-form" data-role="form">
        <label class="sr-only" for="shared-chat-message">Message the neighborhood</label>
        <input id="shared-chat-message" name="message" maxlength="240" autocomplete="off" placeholder="Say hello…">
        <button type="submit">Send</button>
      </form>
    </details>
  `;
  document.body.append(aside);

  const status = aside.querySelector<HTMLElement>('[data-role="status"]')!;
  const log = aside.querySelector<HTMLOListElement>('[data-role="log"]')!;
  const form = aside.querySelector<HTMLFormElement>('[data-role="form"]')!;
  const input = form.elements.namedItem('message') as HTMLInputElement;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    onSend(text);
    input.value = '';
  });

  function append(item: HTMLLIElement): void {
    log.append(item);
    while (log.children.length > 50) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  return {
    setStatus: (text, connected = false) => {
      status.textContent = text;
      status.dataset.connected = connected ? 'true' : 'false';
      input.disabled = !connected;
      form.querySelector('button')!.toggleAttribute('disabled', !connected);
    },
    addChat: (line) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = `${line.name}: `;
      item.append(name, document.createTextNode(line.text));
      append(item);
    },
    addNotice: (text) => {
      const item = document.createElement('li');
      item.className = 'shared-chat-notice';
      item.textContent = text;
      append(item);
    },
    focus: () => input.focus(),
  };
}
