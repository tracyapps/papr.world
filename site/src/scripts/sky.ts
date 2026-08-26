/**
 * The sky walks through four paper moods on a twelve-minute lap, mirroring
 * the game's own src/world/sky.ts. No night, nothing ever goes dark.
 *
 * It writes the two gradient stops (--sky-h at the horizon, --sky-z overhead)
 * straight onto :root, so the CSS in Sky.astro does not need to know this
 * exists. If this script never runs, the sky is simply the daylight values
 * from _tokens.scss, which is a perfectly good sky.
 */

const DAY = [
  ['#f2ead2', '#a9c9e2'],
  ['#eee9d4', '#8cbcdf'],
  ['#f4e4c6', '#9db9d8'],
  ['#eddccd', '#a7afda'],
];

const NIGHT = [
  ['#3b3040', '#131a2b'],
  ['#332b3c', '#101725'],
  ['#42332f', '#161c2e'],
  ['#35303f', '#121a2d'],
];

/** One lap, in seconds. Twelve minutes, same as the game. */
const LAP = 720;

const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const root = document.documentElement;

/** Mix two #rrggbb colours. */
function blend(a: string, b: string, t: number): string {
  const read = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = read(a);
  const [br, bg, bb] = read(b);
  const mix = [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t];
  return `#${mix.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function isNight(): boolean {
  const chosen = root.dataset.theme;
  if (chosen === 'dark') return true;
  if (chosen === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

if (!calm && document.body.hasAttribute('data-sky')) {
  const began = performance.now();

  const drift = () => {
    const elapsed = (performance.now() - began) / 1000;
    const moods = isNight() ? NIGHT : DAY;

    const position = ((elapsed % LAP) / LAP) * moods.length;
    const from = Math.floor(position) % moods.length;
    const to = (from + 1) % moods.length;

    // Smoothstep, so the changeover between two moods has no visible seam.
    const raw = position - Math.floor(position);
    const t = raw * raw * (3 - 2 * raw);

    root.style.setProperty('--sky-h', blend(moods[from][0], moods[to][0], t));
    root.style.setProperty('--sky-z', blend(moods[from][1], moods[to][1], t));

    requestAnimationFrame(drift);
  };

  requestAnimationFrame(drift);
}
