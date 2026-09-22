import * as THREE from 'three';
import * as K from './kit';

// Creature mailboxes. Same contract as the object designs: a `build(ctx)`
// returning a `MailboxInstance`, standing on the ground at the origin, slot
// to +Z, eyes tracking the player.
//
// Ported from designs/3d-Mailbox-Designs/assets/mailbox-designs-animals.js —
// geometry and motion are unchanged from the design file; only types were
// added and `K.paper()` now resolves to the game's own compiled paper art
// (see kit.ts).

const buildShell = (ctx: K.MailboxBuildContext) => K.createShell(ctx);

function tree(root: THREE.Object3D, x: number, z: number, scale: number): THREE.Group {
  const group = K.hinge([x, 0.02, z]);
  for (let tier = 0; tier < 3; tier += 1) {
    group.add(K.cone(0.16 - tier * 0.035, 0.26, K.paper('p-leaf', [1.4, 1.4]), [0, 0.14 + tier * 0.17, 0], null, 12));
  }
  group.add(K.cyl(0.03, 0.035, 0.14, K.paper('p-bark', [1, 1]), [0, 0.07, 0], null, 8));
  group.scale.setScalar(scale);
  root.add(group);
  return group;
}

export const animalDesigns: K.MailboxDesign[] = [
  {
    id: 'dog',
    name: 'Good Boy',
    tagline: 'Sits, stays, and fetches the post. Floppy ears, guaranteed wag.',
    tags: ['animal', 'dog'],
    signal: 'Tail wags, ears flop, tongue pops, bark puff',
    team: true,
    palette: ['#a9764a', '#6b4a2c', '#c0432f'],
    focus: { distance: 2.8, height: 1.45, targetY: 0.62 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const fur = K.paper('p-brown-warm', [1.4, 1.4]);
      const dark = '#6b4a2c';
      const collarColor = ctx.team.primary;

      root.add(K.cyl(0.42, 0.44, 0.03, K.paper('p-green', [2, 2]), [0, 0.015, 0], null, 24));
      for (const side of [-1, 1]) root.add(K.sph(0.2, fur, [side * 0.17, 0.24, -0.18], 18));
      root.add(K.box(0.4, 0.46, 0.34, fur, [0, 0.44, 0.02]));
      for (const side of [-1, 1]) {
        root.add(K.cyl(0.058, 0.062, 0.32, fur, [side * 0.13, 0.17, 0.2], null, 12));
        root.add(K.sph(0.078, fur, [side * 0.13, 0.04, 0.27], 14));
      }
      root.add(K.box(0.4, 0.07, 0.36, K.paint(collarColor), [0, 0.65, 0.02]));
      root.add(K.sph(0.09, K.paint(collarColor), [0, 0.64, 0.19], 14));

      const head = K.hinge([0, 0.78, 0.04]);
      head.add(K.box(0.34, 0.3, 0.3, fur, [0, 0, 0]));
      head.add(K.dome(0.17, fur, [0, 0.15, 0]));
      head.add(K.box(0.18, 0.15, 0.18, fur, [0, -0.07, 0.22]));
      head.add(K.sph(0.048, K.paint('#2b231d', 0.7), [0, -0.03, 0.32], 12));
      head.add(K.box(0.17, 0.035, 0.12, K.paint('#2b231d', 0.95), [0, -0.11, 0.27]));
      root.add(head);

      const ears = [-1, 1].map((side) => {
        const ear = K.hinge([side * 0.18, 0.1, 0]);
        ear.add(K.box(0.09, 0.22, 0.06, K.paper('p-brown-deep', [1, 1]), [0, -0.11, 0]));
        head.add(ear);
        return ear;
      });

      const tongue = K.box(0.07, 0.09, 0.03, K.paint('#d98a8a', 0.9), [0, -0.16, 0.29]);
      head.add(tongue);

      const face = K.makeFace({
        radius: 0.052,
        spacing: 0.09,
        y: 0.02,
        z: 0.155,
        brows: dark,
        browTilt: 1.4,
        mouth: 'smile',
      });
      head.add(face.root);

      plate(root, 'collar', 0.24, [0, 0.58, 0.235], null);

      const tail = K.hinge([0, 0.42, -0.26]);
      for (let index = 0; index < 3; index += 1) {
        tail.add(K.box(0.06, 0.1, 0.07, fur, [0, 0.05 + index * 0.09, -0.02 * index], [0.25 - index * 0.1, 0, 0]));
      }
      tail.add(K.sph(0.05, fur, [0, 0.3, 0.05], 12));
      root.add(tail);

      const puffs: THREE.Mesh[] = [];
      for (let index = 0; index < 3; index += 1) {
        const puff = K.sph(0.045 + index * 0.01, K.paint('#cfc7b6', 0.95), [0, 0.78, 0.42]);
        puff.visible = false;
        puffs.push(puff);
        root.add(puff);
      }
      tree(root, -0.66, -0.1, 0.6);

      let wag = 0;
      let tailPhase = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.35 : 1;
        wag = K.damp(wag, state.message ? 1 : 0, 4, dt);
        tailPhase += dt * (2.4 + wag * 20) * amp;
        root.position.y = K.bob(t, 1.5, 0.007 * amp) + wag * Math.abs(Math.sin(t * 8)) * 0.012 * amp;
        root.rotation.z = Math.sin(t * 0.9) * 0.01 * amp;
        head.rotation.x = Math.sin(t * 1.3) * 0.03 * amp + wag * 0.08;
        head.rotation.y = Math.sin(t * 0.7) * 0.05 * amp;
        tail.rotation.y = Math.sin(tailPhase) * (0.35 + wag * 0.9);
        tail.rotation.x = Math.sin(tailPhase * 0.7) * 0.2 * (0.4 + wag);
        ears.forEach((ear, index) => {
          const sign = index === 0 ? -1 : 1;
          ear.rotation.z = sign * 0.5 + sign * wag * 0.4 + Math.sin(t * 5 + index) * 0.12 * wag * amp;
        });
        tongue.visible = wag > 0.3;
        tongue.position.y = -0.16 - wag * 0.02 + Math.sin(t * 12) * 0.006 * wag;
        puffs.forEach((puff, index) => {
          const cycle = (t * 1.6 + index * 0.4) % 1.8;
          puff.visible = wag > 0.35 && cycle < 1.1;
          puff.position.set(0.1 + cycle * 0.22, 0.74 + cycle * 0.1, 0.42 + cycle * 0.16);
          puff.scale.setScalar(0.5 + cycle);
        });
        face.updateLook(t, state.look, { excited: wag });
      });
    },
  },

  {
    id: 'cat',
    name: 'Nine Lives',
    tagline: 'Curled on a cushion, slit-eyed, watching the path for the postie.',
    tags: ['animal', 'cat'],
    signal: 'Tail flicks, whiskers twitch, yarn ball rolls out',
    palette: ['#8d8b84', '#f4c9c9', '#5d6b7a'],
    team: true,
    focus: { distance: 2.6, height: 1.4, targetY: 0.6 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const fur = K.paint('#8d8b84', 0.94);
      const furLight = K.paint('#c3beb2', 0.94);
      const pink = '#f4c9c9';

      root.add(K.cyl(0.42, 0.44, 0.05, K.paper('p-plaid', [1.4, 1.4]), [0, 0.025, 0], null, 26));
      root.add(K.box(0.4, 0.44, 0.42, fur, [0, 0.42, -0.04]));
      root.add(K.sph(0.19, furLight, [0, 0.44, 0.16], 18));
      for (const side of [-1, 1]) root.add(K.sph(0.075, furLight, [side * 0.12, 0.06, 0.24], 14));

      const head = K.hinge([0, 0.76, 0.04]);
      head.add(K.box(0.32, 0.28, 0.28, fur, [0, 0, 0]));
      head.add(K.box(0.17, 0.11, 0.14, furLight, [0, -0.08, 0.19]));
      head.add(K.cone(0.035, 0.05, K.paint(pink, 0.9), [0, -0.04, 0.27], [Math.PI / 2, 0, 0], 8));
      head.add(K.box(0.16, 0.032, 0.1, K.paint('#2b231d', 0.95), [0, -0.12, 0.22]));
      root.add(head);

      const ears = [-1, 1].map((side) => {
        const ear = K.hinge([side * 0.11, 0.13, -0.02]);
        const outer = K.cone(0.075, 0.16, fur, [0, 0.07, 0], [0, Math.PI / 4, 0], 4);
        const inner = K.cone(0.045, 0.1, K.paint(pink, 0.9), [0, 0.05, 0.02], [0, Math.PI / 4, 0], 4);
        ear.add(outer, inner);
        head.add(ear);
        return ear;
      });

      const whiskers: { mesh: THREE.Mesh; base: number }[] = [];
      for (const side of [-1, 1]) {
        for (let index = 0; index < 3; index += 1) {
          const base = side * (0.14 - index * 0.14);
          const whisker = K.box(0.15, 0.005, 0.005, K.paint('#e8e2cf'), [side * 0.15, -0.05 + index * 0.022, 0.25], [0, 0, base]);
          whiskers.push({ mesh: whisker, base });
          head.add(whisker);
        }
      }

      const face = K.makeFace({
        radius: 0.052,
        spacing: 0.088,
        y: 0.03,
        z: 0.148,
        brows: null,
        mouth: 'smile',
        pupilWidth: 0.42,
      });
      head.add(face.root);

      root.add(K.box(0.4, 0.06, 0.36, K.paint(ctx.team.primary), [0, 0.63, -0.02]));
      plate(root, 'tag', 0.22, [0, 0.56, 0.22], null);

      const tail = K.hinge([0, 0.3, -0.3]);
      for (let index = 0; index < 4; index += 1) {
        tail.add(K.cyl(0.045 - index * 0.004, 0.045 - index * 0.004, 0.16, fur, [0, 0.08 + index * 0.14, -0.03 * index], [0.22 - index * 0.06, 0, 0], 10));
      }
      tail.add(K.sph(0.04, fur, [0, 0.62, -0.1], 12));
      root.add(tail);

      const yarn = K.hinge([0.34, 0.08, 0.3]);
      yarn.add(K.sph(0.1, K.paint('#5d6b7a', 0.9), [0, 0, 0], 16));
      yarn.visible = false;
      root.add(yarn);

      let flick = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.35 : 1;
        flick = K.damp(flick, state.message ? 1 : 0, 4, dt);
        root.position.y = K.bob(t, 1.4, 0.006 * amp);
        root.rotation.z = Math.sin(t * 1.1) * 0.008 * amp;
        head.rotation.y = Math.sin(t * 0.6) * 0.12 * amp + flick * Math.sin(t * 2.2) * 0.2;
        head.rotation.x = Math.sin(t * 1.5) * 0.03 * amp - flick * 0.06;
        ears.forEach((ear, index) => {
          ear.rotation.z = Math.sin(t * 3 + index * 2) * (0.05 + flick * 0.22) * amp;
        });
        whiskers.forEach((whisker, index) => {
          whisker.mesh.rotation.z = whisker.base + Math.sin(t * 9 + index) * 0.05 * flick * amp;
        });
        tail.rotation.y = Math.sin(t * (0.9 + flick * 2)) * (0.25 + flick * 0.6);
        tail.rotation.x = Math.sin(t * (1.4 + flick * 1.6)) * 0.12 * (0.3 + flick);
        yarn.visible = flick > 0.3;
        yarn.position.x = 0.34 + flick * 0.28;
        yarn.rotation.z = -t * 3 * flick * amp;
        face.updateLook(t, state.look, { excited: flick });
      });
    },
  },

  {
    id: 'horse',
    name: 'Post Pony',
    tagline: 'A long-faced mail horse. Nods at everyone who passes the gate.',
    tags: ['animal', 'horse'],
    signal: 'Head nods, mane shakes, tail swishes, neigh puff',
    palette: ['#8a5a33', '#3b2f22', '#a9351f'],
    team: true,
    focus: { distance: 2.9, height: 1.55, targetY: 0.72 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const coat = K.paper('p-brown', [1.6, 1.6]);
      const maneColor = '#3b2f22';

      root.add(K.cyl(0.05, 0.06, 0.7, K.paper('p-bark', [1, 1]), [0, 0.35, 0], null, 12));
      root.add(K.box(0.24, 0.06, 0.24, K.paper('p-bark', [1, 1]), [0, 0.03, 0]));

      const board = K.box(0.44, 0.18, 0.03, K.paper('p-bark', [1, 1]), [0, 0.52, 0.12], [-0.12, 0, 0]);
      root.add(board);
      plate(root, 'brand', 0.36, [0, 0.52, 0.142], [-0.12, 0, 0]);

      const neck = K.hinge([0, 0.7, 0]);
      neck.add(K.box(0.26, 0.44, 0.3, coat, [0, 0.2, 0], [-0.22, 0, 0]));
      const head = K.hinge([0, 0.38, 0.1]);
      head.add(K.box(0.24, 0.34, 0.28, coat, [0, 0, 0], [-0.3, 0, 0]));
      head.add(K.box(0.22, 0.22, 0.24, coat, [0, -0.22, 0.14], [0.08, 0, 0]));
      head.add(K.sph(0.032, K.paint('#2b231d', 0.9), [-0.06, -0.24, 0.26], 10));
      head.add(K.sph(0.032, K.paint('#2b231d', 0.9), [0.06, -0.24, 0.26], 10));
      head.add(K.box(0.18, 0.04, 0.16, K.paint('#2b231d', 0.95), [0, -0.31, 0.22]));
      head.add(K.box(0.24, 0.035, 0.2, K.paint(ctx.team.secondary), [0, -0.16, 0.18], [0.08, 0, 0]));
      for (const side of [-1, 1]) {
        head.add(K.box(0.03, 0.3, 0.03, K.paint(ctx.team.secondary), [side * 0.1, -0.06, 0.12], [0.1, 0, 0]));
        const ear = K.cone(0.045, 0.14, coat, [side * 0.08, 0.24, -0.02], [-0.2, 0, side * 0.16], 10);
        head.add(ear);
      }

      const face = K.makeFace({ radius: 0.05, spacing: 0.1, y: 0.02, z: 0.16, brows: maneColor, mouth: 'line' });
      head.add(face.root);

      const mane: THREE.Mesh[] = [];
      for (let index = 0; index < 5; index += 1) {
        const tuft = K.box(0.06, 0.12, 0.16, K.paint(maneColor, 0.9), [0, 0.22 - index * 0.14, -0.14], [0.2, 0, 0]);
        mane.push(tuft);
        neck.add(tuft);
      }
      neck.add(head);
      root.add(neck);

      const tail = K.hinge([0, 0.6, -0.16]);
      for (let index = 0; index < 4; index += 1) {
        tail.add(K.box(0.05, 0.14, 0.06, K.paint(maneColor, 0.9), [0, -0.08 - index * 0.13, -0.05 * index], [0, 0, 0]));
      }
      root.add(tail);

      const puffs: THREE.Mesh[] = [];
      for (let index = 0; index < 3; index += 1) {
        const puff = K.sph(0.04 + index * 0.012, K.paint('#e8e2cf', 0.9), [0, 0.9, 0.4]);
        puff.visible = false;
        puffs.push(puff);
        root.add(puff);
      }

      let nod = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.35 : 1;
        nod = K.damp(nod, state.message ? 1 : 0, 4, dt);
        root.position.y = K.bob(t, 1.2, 0.006 * amp);
        root.rotation.z = Math.sin(t * 0.8) * 0.008 * amp;
        neck.rotation.x = Math.sin(t * 1.1) * 0.05 * amp + nod * Math.sin(t * 6) * 0.16 * amp;
        head.rotation.x = Math.sin(t * 1.7) * 0.06 * amp + nod * 0.12;
        head.rotation.y = Math.sin(t * 0.5) * 0.1 * amp;
        mane.forEach((tuft, index) => {
          tuft.rotation.z = Math.sin(t * (3 + nod * 4) + index * 0.5) * (0.04 + nod * 0.16) * amp;
        });
        tail.rotation.y = Math.sin(t * (1.6 + nod * 1.4)) * (0.2 + nod * 0.45);
        tail.rotation.z = Math.sin(t * 2.2) * 0.1 * amp;
        puffs.forEach((puff, index) => {
          const cycle = (t * 1.5 + index * 0.45) % 1.9;
          puff.visible = nod > 0.35 && cycle < 1.2;
          puff.position.set(0.06 + cycle * 0.2, 0.86 + cycle * 0.16, 0.36 + cycle * 0.1);
          puff.scale.setScalar(0.5 + cycle);
        });
        face.updateLook(t, state.look, { excited: nod });
      });
    },
  },

  {
    id: 'raccoon',
    name: 'Bin Bandit',
    tagline: 'Lives in the can, wears the mask, absolutely will not return your parcel.',
    tags: ['animal', 'raccoon'],
    signal: 'Lid pops, raccoon rises, tail curls, eyes glint',
    team: true,
    palette: ['#8d8b84', '#3b3a38', '#c9a473'],
    focus: { distance: 2.8, height: 1.45, targetY: 0.68 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const metal = K.paint('#8d8b84', 0.62);
      const dark = '#3b3a38';
      const fur = K.paint('#9a968c', 0.95);

      root.add(K.cyl(0.3, 0.26, 0.52, metal, [0, 0.26, 0], null, 22));
      for (const y of [0.16, 0.36]) root.add(K.torus(0.29, 0.018, K.paint('#6f6c66', 0.6), [0, y, 0], [Math.PI / 2, 0, 0], 8));
      root.add(K.box(0.22, 0.04, 0.06, K.paint(dark), [0, 0.38, 0.27]));
      plate(root, 'trash', 0.32, [0, 0.22, 0.292], null);

      const lid = K.hinge([0, 0.53, -0.28]);
      lid.add(K.cyl(0.34, 0.32, 0.05, metal, [0, 0.02, 0.28], null, 24));
      lid.add(K.torus(0.1, 0.022, K.paint('#6f6c66', 0.6), [0, 0.09, 0.28], [Math.PI / 2, 0, 0], 8));
      root.add(lid);

      const raccoon = K.hinge([0, 0.5, 0]);
      raccoon.add(K.sph(0.19, fur, [0, 0.1, 0], 20));
      raccoon.add(K.sph(0.15, fur, [0, 0.34, 0.02], 20));
      raccoon.add(K.box(0.36, 0.05, 0.34, K.paint(ctx.team.primary), [0, 0.2, 0.02]));
      for (const side of [-1, 1]) {
        raccoon.add(K.sph(0.05, fur, [side * 0.24, 0.12, 0.16], 12));
        raccoon.add(K.sph(0.055, K.paint(dark, 0.9), [side * 0.1, 0.46, 0.06], 12));
      }
      raccoon.add(K.box(0.33, 0.11, 0.08, K.paint(dark, 0.92), [0, 0.36, 0.15]));
      for (const side of [-1, 1]) raccoon.add(K.sph(0.055, K.paint(dark, 0.92), [side * 0.165, 0.36, 0.13], 12));
      raccoon.add(K.sph(0.075, K.paint('#e8e2cf', 0.95), [0, 0.28, 0.16], 14));
      raccoon.add(K.sph(0.032, K.paint('#2b231d', 0.7), [0, 0.3, 0.22], 10));
      root.add(raccoon);

      const face = K.makeFace({ radius: 0.04, spacing: 0.07, y: 0.36, z: 0.23, pupilColor: '#1d1b19', mouth: 'line', mouthColor: '#e8e2cf' });
      raccoon.add(face.root);

      const tail = K.hinge([0, 0.12, -0.14]);
      for (let index = 0; index < 5; index += 1) {
        const ring = K.cyl(0.075 - index * 0.008, 0.075 - index * 0.008, 0.07, K.paint(index % 2 ? dark : '#b9b3a2', 0.92), [0, 0.02 + index * 0.07, -0.02 * index], [0.3 + index * 0.12, 0, 0], 12);
        tail.add(ring);
      }
      raccoon.add(tail);

      const letter = K.envelope(0.12);
      letter.visible = false;
      raccoon.add(letter);

      let prowl = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.35 : 1;
        prowl = K.damp(prowl, state.message ? 1 : 0, 4, dt);
        root.position.y = K.bob(t, 1.5, 0.006 * amp);
        root.rotation.z = Math.sin(t * 5) * prowl * 0.02 * amp;
        lid.rotation.x = -1.15 * prowl;
        raccoon.position.y = 0.5 + prowl * 0.1;
        raccoon.rotation.y = Math.sin(t * 1.4) * 0.3 * amp + prowl * Math.sin(t * 2.6) * 0.35;
        raccoon.rotation.z = Math.sin(t * 1.1) * 0.03 * amp;
        tail.rotation.y = Math.sin(t * (1.2 + prowl * 1.6)) * (0.25 + prowl * 0.5);
        tail.rotation.x = -prowl * 0.3 + Math.sin(t * 2.4) * 0.08 * amp;
        letter.visible = prowl > 0.35;
        letter.position.set(0.16, 0.5, 0.24);
        letter.rotation.z = -0.4 + Math.sin(t * 6) * 0.08 * prowl;
        face.updateLook(t, state.look, { excited: prowl });
      });
    },
  },

  {
    id: 'bird',
    name: 'Song Post',
    tagline: 'A crested songbird on a perch, and a post box hung below it.',
    tags: ['animal', 'bird'],
    signal: 'Wings flap, crest lifts, notes rise from the beak',
    palette: ['#3d6ea8', '#e0b83a', '#a9351f'],
    team: true,
    focus: { distance: 2.6, height: 1.45, targetY: 0.66 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const feather = K.paint(ctx.team.primary, 0.9);
      const belly = K.paint('#f2ece0', 0.95);
      const accent = ctx.team.secondary;

      root.add(K.cyl(0.05, 0.06, 0.72, K.paper('p-bark', [1, 1]), [0, 0.36, 0], null, 12));
      root.add(K.box(0.22, 0.06, 0.22, K.paper('p-bark', [1, 1]), [0, 0.03, 0]));
      root.add(K.cyl(0.026, 0.026, 0.4, K.paper('p-bark', [1, 1]), [0, 0.72, 0.06], [0, 0, Math.PI / 2], 10));

      root.add(K.box(0.32, 0.22, 0.24, K.paint(ctx.team.primary, 0.9), [0, 0.44, 0.08]));
      root.add(K.dome(0.16, K.paint(ctx.team.primary, 0.9), [0, 0.55, 0.08]));
      root.add(K.box(0.2, 0.035, 0.06, K.paint('#2b231d', 0.95), [0, 0.47, 0.2]));
      plate(root, 'perch', 0.26, [0, 0.36, 0.212], null);

      const bird = K.hinge([0, 0.82, 0.06]);
      const body = K.sph(0.15, feather, [0, 0.06, 0], 20);
      body.scale.set(1, 1.05, 0.92);
      bird.add(body);
      bird.add(K.sph(0.1, belly, [0, 0.02, 0.09], 16));
      bird.add(K.sph(0.105, feather, [0, 0.2, 0.05], 18));
      bird.add(K.cone(0.04, 0.11, K.paint(accent), [0, 0.18, 0.19], [Math.PI / 2, 0, 0], 8));
      for (const side of [-1, 1]) {
        bird.add(K.cyl(0.012, 0.014, 0.1, K.paint('#6b5c46'), [side * 0.05, -0.03, 0.04], null, 8));
        bird.add(K.box(0.05, 0.014, 0.09, K.paint('#6b5c46'), [side * 0.05, -0.075, 0.08]));
      }
      for (let index = 0; index < 3; index += 1) {
        bird.add(K.box(0.09, 0.03, 0.03, K.paint('#e0b83a'), [index * 0.06, 0.3 - index * 0.01, 0.16], [0, 0, -0.5]));
        bird.add(K.box(0.02, 0.14, 0.02, K.paint('#2b231d', 0.9), [index * 0.06 + 0.06, 0.34, -0.02]));
      }
      for (let index = 0; index < 3; index += 1) {
        bird.add(K.box(0.14, 0.02, 0.05, feather, [0, 0.02 - index * 0.06, -0.16 - index * 0.02], [0, 0, 0]));
      }
      root.add(bird);

      const wings = [-1, 1].map((side) => {
        const wing = K.hinge([side * 0.12, 0.1, 0]);
        wing.add(K.box(0.06, 0.18, 0.16, K.paint(ctx.team.primary, 0.9), [side * 0.03, -0.06, -0.02]));
        wing.add(K.box(0.05, 0.1, 0.1, K.paint(accent), [side * 0.05, -0.16, -0.04]));
        bird.add(wing);
        return wing;
      });

      const face = K.makeFace({ radius: 0.036, spacing: 0.062, y: 0.23, z: 0.12, pupilColor: '#1d1b19', mouth: 'none' });
      bird.add(face.root);

      const beakLower = K.box(0.05, 0.02, 0.08, K.paint('#e0b83a'), [0, 0.145, 0.19]);
      bird.add(beakLower);

      const notes: { group: THREE.Group; head: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> }[] = [];
      for (let index = 0; index < 3; index += 1) {
        const note = new THREE.Group();
        const noteMaterial = new THREE.MeshStandardMaterial({ color: '#2d261e', metalness: 0, opacity: 0.85, roughness: 0.9, transparent: true });
        const noteHead = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), noteMaterial);
        noteHead.scale.set(1.3, 0.9, 1);
        const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.012), noteMaterial);
        stem.position.set(0.028, 0.05, 0);
        note.add(noteHead, stem);
        note.visible = false;
        notes.push({ group: note, head: noteHead });
        root.add(note);
      }

      let sing = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.35 : 1;
        sing = K.damp(sing, state.message ? 1 : 0, 4, dt);
        root.position.y = K.bob(t, 2, 0.006 * amp);
        root.rotation.z = Math.sin(t * 1.3) * 0.008 * amp;
        bird.position.y = 0.82 + Math.abs(Math.sin(t * (2 + sing * 4))) * (0.02 + sing * 0.04) * amp;
        bird.rotation.z = Math.sin(t * 2.2) * 0.05 * amp + sing * Math.sin(t * 9) * 0.05;
        bird.rotation.y = Math.sin(t * 0.7) * 0.14 * amp;
        wings.forEach((wing, index) => {
          const sign = index === 0 ? -1 : 1;
          wing.rotation.z = sign * (0.1 + sing * 0.5) + Math.sin(t * (5 + sing * 8)) * (0.06 + sing * 0.4) * amp;
        });
        beakLower.rotation.x = sing * 0.5 + Math.sin(t * 12) * 0.12 * sing * amp;
        notes.forEach(({ group, head }, index) => {
          const cycle = (t * 0.9 + index * 0.5) % 2.6;
          group.visible = sing > 0.3 && cycle < 1.7;
          group.position.set(0.12 + cycle * 0.12, 1.02 + cycle * 0.3, 0.16 + Math.sin(cycle * 3) * 0.06);
          group.rotation.z = Math.sin(cycle * 4) * 0.3;
          head.material.opacity = Math.max(0, 0.85 - cycle / 2);
        });
        face.updateLook(t, state.look, { excited: sing });
      });
    },
  },
];
