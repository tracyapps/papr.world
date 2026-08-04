// Tiny procedural sounds for the paper world. No audio files are needed and
// the context is created only after a player gesture, keeping browser autoplay
// rules happy. The sounds are deliberately soft: more craft-table foley than UI
// beeps.

export type CozySound = 'chime' | 'chirp' | 'plop' | 'rustle' | 'tap';

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

function note(frequency: number, delay: number, duration: number, volume: number, wave: OscillatorType) {
  const audio = context();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + delay;
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export function playCozySound(sound: CozySound) {
  switch (sound) {
    case 'chime':
      note(659, 0, 0.3, 0.035, 'sine');
      note(880, 0.09, 0.38, 0.028, 'sine');
      break;
    case 'chirp':
      note(740, 0, 0.11, 0.03, 'sine');
      note(988, 0.08, 0.14, 0.025, 'sine');
      break;
    case 'plop':
      note(220, 0, 0.18, 0.035, 'sine');
      note(165, 0.07, 0.22, 0.025, 'sine');
      break;
    case 'rustle':
      note(132, 0, 0.08, 0.018, 'triangle');
      note(176, 0.05, 0.1, 0.014, 'triangle');
      note(148, 0.11, 0.09, 0.012, 'triangle');
      break;
    case 'tap':
      note(392, 0, 0.1, 0.025, 'triangle');
      break;
  }
}
