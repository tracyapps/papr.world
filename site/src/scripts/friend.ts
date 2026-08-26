/**
 * The little paper friend who walks down the page beside you, occasionally
 * says something, and can be drawn over.
 *
 * The drawing panel is a real <dialog>. That is worth the swap on its own:
 * the browser handles the focus trap, Escape to close, returning focus to
 * whatever opened it, and marking the rest of the page inert. Every one of
 * those is a thing a hand-rolled modal gets wrong.
 */

const CRAYONS = ['#2f251d', '#b8402f', '#2f6fa8', '#3f8f45', '#c98a1b', '#8a5aa8'];

const SAYINGS = [
  'hi',
  'this bit is my favourite',
  'careful, wet glue',
  'i made that hill',
  'you can draw over me, you know',
  'we are almost at the mailbox',
  'do you like tape? i like tape',
];

const friend = document.querySelector<HTMLElement>('[data-pal]');
const bubble = document.querySelector<HTMLElement>('[data-pal-say]');
const worn = document.querySelector<HTMLImageElement>('[data-pal-img]');
const dialog = document.querySelector<HTMLDialogElement>('[data-studio]');
const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');

const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ── Walking down the page ─────────────────────────────────────────────────

if (friend && !calm) {
  let lastScroll = window.scrollY;
  let saidAt = 0;

  const walk = () => {
    const doc = document.documentElement;
    const furthest = Math.max(1, doc.scrollHeight - window.innerHeight);
    const through = Math.min(1, Math.max(0, window.scrollY / furthest));

    // Starts a quarter down the window and ends near the bottom.
    friend.style.setProperty('--pal-y', `${(26 + through * 54).toFixed(2)}vh`);

    // Leans into the direction of travel, like someone hurrying downhill.
    const moved = window.scrollY - lastScroll;
    friend.style.setProperty('--pal-lean', `${Math.max(-9, Math.min(9, moved * 0.5)).toFixed(1)}deg`);
    lastScroll = window.scrollY;

    // Something to say every nine seconds or so.
    const now = performance.now();
    if (bubble && now - saidAt > 9000) {
      saidAt = now;
      bubble.textContent = SAYINGS[Math.floor(Math.random() * SAYINGS.length)];
      bubble.style.opacity = '1';
      window.setTimeout(() => { bubble.style.opacity = '0'; }, 3600);
    }

    requestAnimationFrame(walk);
  };

  requestAnimationFrame(walk);
}

// ── The drawing panel ─────────────────────────────────────────────────────

if (dialog && canvas) {
  const ctx = canvas.getContext('2d');
  let crayon = CRAYONS[0];

  if (ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;

    let drawing = false;

    // The canvas is a fixed pixel size but is displayed at whatever width
    // fits, so a pointer position has to be scaled into canvas coordinates.
    const pointAt = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - box.left) * (canvas.width / box.width),
        y: (event.clientY - box.top) * (canvas.height / box.height),
      };
    };

    canvas.addEventListener('pointerdown', (event) => {
      event.stopPropagation();     // do not also leave a crayon mark on the page
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const point = pointAt(event);
      ctx.strokeStyle = crayon;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const point = pointAt(event);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    });

    const stop = () => { drawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  document.querySelector('[data-studio-open]')?.addEventListener('click', () => dialog.showModal());
  document.querySelector('[data-studio-close]')?.addEventListener('click', () => dialog.close());

  document.querySelector('[data-studio-clear]')?.addEventListener('click', () => {
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  });

  for (const swatch of document.querySelectorAll<HTMLButtonElement>('[data-crayon]')) {
    swatch.addEventListener('click', () => {
      crayon = swatch.dataset.crayon ?? CRAYONS[0];
      for (const other of document.querySelectorAll<HTMLButtonElement>('[data-crayon]')) {
        other.setAttribute('aria-pressed', String(other === swatch));
      }
    });
  }

  document.querySelector('[data-studio-wear]')?.addEventListener('click', () => {
    if (!worn) return;
    worn.src = canvas.toDataURL('image/png');
    document.documentElement.style.setProperty('--pal-drawn', '1');
    dialog.close();
    if (bubble) {
      bubble.textContent = 'oh. i love it.';
      bubble.style.opacity = '1';
    }
  });

  // Clicking the backdrop closes it, the way people expect a modal to behave.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
