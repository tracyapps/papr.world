// Remote-player interpolation buffer — renderer-free.
//
// Other players arrive as periodic server snapshots (~20/sec), not as smooth
// per-frame motion like your local avatar. If the renderer snapped a mesh to
// each snapshot it would look jittery. So we keep a short history of each
// remote player's positions and, at render time, sample slightly in the PAST
// (by INTERP_DELAY_MS) and blend between the two surrounding snapshots.
//
// This module knows nothing about Three.js. It hands back plain {x, z, facing}
// and the renderer decides how to move the paper cutout. Terrain height is
// still sampled locally, exactly like the local avatar.

/** How far behind real time we render remote players, to always interpolate
 *  between two known snapshots instead of extrapolating into the unknown. */
const INTERP_DELAY_MS = 100;

/** Drop snapshots older than this to keep the buffers tiny. */
const HISTORY_MS = 1000;

type Snapshot = { t: number; x: number; z: number; facing: number };

export type RemoteSample = { x: number; z: number; facing: number };

export class RemotePlayerBuffer {
  private history = new Map<string, Snapshot[]>();

  /** Record a snapshot for a player as it arrives from room state. */
  push(id: string, x: number, z: number, facing: number, now = Date.now()): void {
    let buf = this.history.get(id);
    if (!buf) {
      buf = [];
      this.history.set(id, buf);
    }
    buf.push({ t: now, x, z, facing });
    const cutoff = now - HISTORY_MS;
    while (buf.length > 2 && buf[0].t < cutoff) buf.shift();
  }

  /** Forget a player who left. */
  remove(id: string): void {
    this.history.delete(id);
  }

  /** Interpolated transform for a player at render time, or null if unknown. */
  sample(id: string, now = Date.now()): RemoteSample | null {
    const buf = this.history.get(id);
    if (!buf || buf.length === 0) return null;

    const target = now - INTERP_DELAY_MS;

    // Before our earliest sample: hold the oldest.
    if (target <= buf[0].t) {
      const s = buf[0];
      return { x: s.x, z: s.z, facing: s.facing };
    }
    // After our latest sample: hold the newest (brief stall rather than guess).
    const last = buf[buf.length - 1];
    if (target >= last.t) {
      return { x: last.x, z: last.z, facing: last.facing };
    }

    // Find the pair straddling `target` and blend.
    for (let i = 0; i < buf.length - 1; i++) {
      const a = buf[i];
      const b = buf[i + 1];
      if (target >= a.t && target <= b.t) {
        const span = b.t - a.t || 1;
        const k = (target - a.t) / span;
        return {
          x: a.x + (b.x - a.x) * k,
          z: a.z + (b.z - a.z) * k,
          facing: lerpAngle(a.facing, b.facing, k),
        };
      }
    }

    return { x: last.x, z: last.z, facing: last.facing };
  }

  /** Ids currently tracked — handy for reconciling renderer meshes. */
  ids(): string[] {
    return [...this.history.keys()];
  }
}

/** Shortest-path angle blend so facing doesn't spin the long way around. */
function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
