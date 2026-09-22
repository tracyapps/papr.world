import * as THREE from 'three';
import * as K from './kit';

// Mailbox styles that are objects and scenes: the classic flag box, sport and
// hobby shapes, two safe homages to a favourite blue-box-and-pepperpot pair,
// and three little landscapes.
//
// Ported from designs/3d-Mailbox-Designs/assets/mailbox-designs-objects.js —
// geometry and motion are unchanged from the design file; only types were
// added, `K.paper()` now resolves to the game's own compiled paper art (see
// kit.ts), and three places that indexed `group.children[N]` to reach a glow
// sphere or note head now keep a direct reference instead, so the emissive
// flicker and fading opacity type-check against a real `MeshStandardMaterial`
// rather than a generic `Object3D`.
//
// Every design is a `build(ctx)` returning a `MailboxInstance`. `root` always
// sits on the ground at the origin with its slot facing +Z, whatever its
// silhouette, so the runtime can swap styles without moving the camera.
// `tick` gets a `MailboxTickState` — `look` is already in the rig's local
// space.

const buildShell = (ctx: K.MailboxBuildContext) => K.createShell(ctx);

const RAINBOW: string[] = ['#c0432f', '#d97b2b', '#e0b83a', '#4f8f4a', '#3d6ea8', '#6d4b93'];

export const objectDesigns: K.MailboxDesign[] = [
  {
    id: 'classic-flag',
    name: 'Flag Up',
    tagline: 'The neighbourhood standard. A red flag you can see from the path.',
    tags: ['classic', 'wood', 'flag'],
    signal: 'Flag snaps upright, door flaps, letter slides out',
    team: true,
    palette: ['#a9764a', '#fff8e4', '#c0432f'],
    focus: { distance: 3, height: 1.55, targetY: 0.8 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const wood = K.paper('p-brown', [2, 2]);
      const kraft = K.paper('p-brown-warm', [1.6, 1.6]);
      const doorColor = ctx.team.primary;

      root.add(K.cyl(0.05, 0.06, 0.64, wood, [0, 0.32, 0], null, 12));
      root.add(K.box(0.22, 0.06, 0.22, K.paper('p-brown-deep', [1, 1]), [0, 0.03, 0]));
      root.add(K.box(0.56, 0.62, 0.42, kraft, [0, 0.99, 0]));
      const roof = K.dome(0.31, kraft, [0, 1.3, 0]);
      roof.scale.set(0.97, 0.58, 0.76);
      root.add(roof);

      const doorHinge = K.hinge([0, 1.16, 0.215]);
      doorHinge.add(K.box(0.46, 0.42, 0.03, K.paint(doorColor), [0, -0.21, 0]));
      doorHinge.add(K.cyl(0.022, 0.022, 0.1, K.paint('#3b2f22'), [0, -0.36, 0.02], [Math.PI / 2, 0, 0], 10));
      const face = K.makeFace({ radius: 0.06, spacing: 0.098, mouth: 'smile', brows: '#3b2f22' });
      face.root.position.set(0, -0.2, 0.035);
      doorHinge.add(face.root);
      root.add(doorHinge);
      plate(root, 'enamel', 0.3, [0, 1.24, 0.212], null);

      const letter = K.envelope(0.15);
      letter.position.set(0, 0.74, 0.14);
      root.add(letter);

      const flag = K.hinge([0.29, 1.1, 0]);
      flag.add(K.box(0.028, 0.3, 0.028, K.paint('#3b2f22'), [0, 0.15, 0]));
      flag.add(K.box(0.13, 0.11, 0.02, K.paint('#c0432f'), [-0.05, 0.28, 0]));
      root.add(flag);

      let lift = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        lift = K.damp(lift, state.message ? 1 : 0, 5, dt);
        root.position.y = K.bob(t, 1.5, 0.008 * amp) + lift * Math.sin(t * 9) * 0.014 * amp;
        root.rotation.z = Math.sin(t * 0.9) * 0.012 * amp - lift * 0.04;
        flag.rotation.x = -1.35 * (1 - lift) + Math.sin(t * 14) * 0.05 * lift * amp;
        doorHinge.rotation.x = -lift * 0.34 + Math.sin(t * 11) * 0.05 * lift * amp;
        letter.position.z = 0.14 + lift * 0.2;
        letter.position.y = 0.74 + lift * 0.03;
        letter.rotation.z = 0.06 * Math.sin(t * 6) * lift;
        face.updateLook(t, state.look, { excited: lift });
      });
    },
  },

  {
    id: 'football-helmet',
    name: 'Helmet Stand',
    tagline: 'Gridiron shell on a display plinth. Your team colours, front and centre.',
    tags: ['sport', 'team colours'],
    signal: 'Penalty flag pops, helmet nods, face cage rattles',
    palette: ['#a9351f', '#fff8e4', '#2b231d'],
    team: true,
    focus: { distance: 2.9, height: 1.5, targetY: 0.62 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const primary = ctx.team.primary;
      const secondary = ctx.team.secondary;
      const dark = '#2b231d';

      root.add(K.box(0.52, 0.08, 0.42, K.paper('p-bark', [1.4, 1.4]), [0, 0.04, 0]));
      root.add(K.box(0.06, 0.14, 0.06, K.paint(dark), [0, 0.14, -0.1]));
      root.add(K.box(0.06, 0.14, 0.06, K.paint(dark), [0, 0.14, 0.1]));

      const head = K.hinge([0, 0.66, 0]);
      const band = K.cyl(0.3, 0.28, 0.26, K.paint(primary), [0, -0.02, 0], null, 24);
      band.scale.set(1.2, 1, 1.16);
      head.add(band);
      const crown = K.dome(0.3, K.paint(primary), [0, 0.11, 0]);
      crown.scale.set(1.2, 1.02, 1.16);
      head.add(crown);
      head.add(K.box(0.1, 0.03, 0.36, K.paint(secondary), [0, 0.34, 0]));
      head.add(K.box(0.1, 0.03, 0.22, K.paint(secondary), [0, 0.26, -0.34]));

      head.add(K.box(0.44, 0.26, 0.1, K.paint(dark), [0, -0.02, 0.32]));
      head.add(K.box(0.34, 0.026, 0.026, K.paint(dark), [0, -0.09, 0.4]));
      head.add(K.box(0.34, 0.026, 0.026, K.paint(dark), [0, 0.06, 0.4]));
      for (const x of [-0.13, 0, 0.13]) head.add(K.box(0.024, 0.18, 0.024, K.paint(dark), [x, -0.02, 0.4]));
      for (const x of [-0.38, 0.38]) head.add(K.cyl(0.075, 0.075, 0.06, K.paint(secondary), [x, -0.02, 0.02], [0, 0, Math.PI / 2], 16));
      head.add(K.capsule(0.016, 0.16, K.paint(dark), [-0.2, -0.2, 0.2], [0.3, 0, 0.3]));
      head.add(K.box(0.2, 0.02, 0.03, K.paint(dark), [0, -0.22, 0.24]));
      root.add(head);

      const face = K.makeFace({ radius: 0.046, spacing: 0.088, y: 0.66, z: 0.36, brows: secondary, mouth: 'smile', pupilColor: '#201b18' });
      root.add(face.root);

      root.add(K.box(0.42, 0.1, 0.03, K.paint('#e8dfc4'), [0, 0.19, 0.2]));
      plate(root, 'jersey', 0.34, [0, 0.19, 0.218], null);

      const flag = K.hinge([0.3, 0.98, 0]);
      flag.add(K.cyl(0.014, 0.014, 0.22, K.paint('#3b2f22'), [0, 0.11, 0], null, 8));
      flag.add(K.cone(0.07, 0.14, K.paint(secondary), [0.05, 0.2, 0], [0, 0, -Math.PI / 2], 3));
      root.add(flag);

      let pop = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        pop = K.damp(pop, state.message ? 1 : 0, 5, dt);
        head.rotation.z = Math.sin(t * 1.1) * 0.02 * amp - pop * 0.06;
        head.position.y = 0.66 + pop * Math.sin(t * 8) * 0.02 * amp;
        root.rotation.y = Math.sin(t * 0.8) * 0.02 * amp;
        flag.rotation.x = -1.4 * (1 - pop) + Math.sin(t * 16) * 0.06 * pop * amp;
        face.updateLook(t, state.look, { excited: pop });
      });
    },
  },

  {
    id: 'racecar',
    name: 'Pit Box',
    tagline: 'Livery, spoiler, exhaust. A mailbox that wants to be ahead on the straight.',
    tags: ['sport', 'wheels'],
    signal: 'Wheels spin, exhaust puffs, chequered flag waves',
    palette: ['#c0432f', '#fff8e4', '#2b231d'],
    team: true,
    focus: { distance: 3.1, height: 1.35, targetY: 0.44 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const body = ctx.team.primary;
      const trim = ctx.team.secondary;
      const dark = '#2b231d';

      root.add(K.box(0.42, 0.1, 0.94, K.paint(dark), [0, 0.2, 0]));
      root.add(K.box(0.44, 0.2, 0.86, K.paint(body), [0, 0.36, -0.02]));
      root.add(K.box(0.4, 0.14, 0.24, K.paint(body), [0, 0.33, 0.46]));
      root.add(K.box(0.3, 0.05, 0.16, K.paint(body), [0, 0.28, 0.6]));
      root.add(K.box(0.36, 0.22, 0.34, K.paint(body), [0, 0.57, -0.06]));
      const glass = K.box(0.32, 0.2, 0.02, K.paint('#bfe3e6', 0.25), [0, 0.56, 0.13], [-0.6, 0, 0]);
      root.add(glass);
      root.add(K.box(0.44, 0.03, 0.16, K.paint(dark), [0, 0.75, -0.44]));
      for (const x of [-0.15, 0.15]) root.add(K.box(0.03, 0.16, 0.03, K.paint(dark), [x, 0.66, -0.44]));
      root.add(K.box(0.9, 0.02, 0.06, K.paint(trim), [0, 0.465, 0.06]));
      root.add(K.box(0.9, 0.02, 0.06, K.paint(trim), [0, 0.68, 0]));

      const wheels: THREE.Group[] = [];
      for (const x of [-0.23, 0.23]) {
        for (const z of [-0.34, 0.36]) {
          const wheel = K.hinge([x, 0.14, z]);
          wheel.add(K.cyl(0.14, 0.14, 0.11, K.paint(dark), [0, 0, 0], [0, 0, Math.PI / 2], 18));
          wheel.add(K.cyl(0.07, 0.07, 0.12, K.paint('#d8b46a'), [0, 0, 0], [0, 0, Math.PI / 2], 12));
          wheels.push(wheel);
          root.add(wheel);
        }
      }
      root.add(K.cyl(0.03, 0.03, 0.1, K.paint('#8a8f96'), [-0.1, 0.3, -0.5], [Math.PI / 2, 0, 0], 10));
      root.add(K.cyl(0.03, 0.03, 0.1, K.paint('#8a8f96'), [0.1, 0.3, -0.5], [Math.PI / 2, 0, 0], 10));
      root.add(K.box(0.14, 0.03, 0.24, K.paint(dark), [0, 0.46, 0.3]));

      const face = K.makeFace({ radius: 0.05, spacing: 0.095, y: 0.6, z: 0.19, brows: dark, mouth: 'smile' });
      root.add(face.root);

      for (const side of [-1, 1]) plate(root, 'decal', 0.26, [side * 0.232, 0.38, -0.06], [0, side * Math.PI / 2, 0]);
      plate(root, 'decal', 0.28, [0, 0.572, 0.146], [-0.6, 0, 0]);

      const flag = K.hinge([0, 0.62, -0.52]);
      flag.add(K.cyl(0.012, 0.012, 0.3, K.paint(dark), [0, 0.15, 0], null, 8));
      const chequer = K.box(0.14, 0.1, 0.014, K.paint(trim), [0.07, 0.28, 0]);
      flag.add(chequer);
      for (const [cx, cy] of [[0.03, 0.25], [0.11, 0.25], [0.07, 0.31], [0.03, 0.31], [0.11, 0.31]]) {
        flag.add(K.box(0.035, 0.032, 0.016, K.paint(dark), [cx, cy, 0]));
      }
      root.add(flag);

      const puffs: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
      for (let index = 0; index < 4; index += 1) {
        const puff = K.sph(0.05 + index * 0.012, K.paint('#cfc7b6', 0.95), [0, 0.3, -0.58]);
        puff.visible = false;
        puffs.push(puff);
        root.add(puff);
      }

      let rev = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        rev = K.damp(rev, state.message ? 1 : 0, 5, dt);
        root.position.y = K.bob(t, 2.2, 0.006 * amp) + rev * Math.sin(t * 21) * 0.006 * amp;
        root.rotation.z = Math.sin(t * 2.4) * 0.01 * amp;
        wheels.forEach((wheel, index) => {
          wheel.rotation.x += dt * (1 + rev * 16) * (index % 2 ? 1 : 1);
        });
        flag.rotation.x = -1.2 * (1 - rev) + Math.sin(t * 13) * 0.14 * rev * amp;
        puffs.forEach((puff, index) => {
          const cycle = (t * (1.4 + rev * 2.4) + index * 0.7) % 3;
          puff.visible = rev > 0.1 && cycle < 1.6;
          puff.position.z = -0.58 - cycle * 0.26 * rev;
          puff.position.y = 0.3 + cycle * 0.16;
          puff.scale.setScalar(0.6 + cycle * 0.7);
        });
        face.updateLook(t, state.look, { excited: rev });
      });
    },
  },

  {
    id: 'bubble-screen',
    name: 'Bubble Screen',
    tagline: 'An all-in-one computer the colour of a boiled sweet. It hums when post arrives.',
    tags: ['retro', 'tech'],
    signal: 'Screen flares, floppy ejects, case wobbles',
    palette: ['#3f9fa8', '#d7ffe9', '#e8e2cf'],
    team: true,
    focus: { distance: 2.7, height: 1.4, targetY: 0.6 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const caseColor = ctx.team.primary;
      const shellMat = K.paint(caseColor, 0.42);
      const cream = K.paint('#e8e2cf', 0.6);
      const dark = '#2b231d';

      root.add(K.cyl(0.34, 0.38, 0.09, K.paint(caseColor, 0.42), [0, 0.045, 0], null, 26));
      const body = K.sph(0.3, shellMat, [0, 0.54, 0], 26);
      body.scale.set(1, 1.24, 0.96);
      root.add(body);
      root.add(K.box(0.44, 0.36, 0.08, cream, [0, 0.58, 0.19], [-0.08, 0, 0]));
      const screen = plate(root, 'crt', 0.34, [0, 0.58, 0.235], [-0.08, 0, 0], 'emissive');
      root.add(K.box(0.18, 0.035, 0.03, K.paint(dark), [0, 0.35, 0.28]));
      root.add(K.box(0.62, 0.05, 0.24, cream, [0, 0.05, 0.42]));
      for (let row = 0; row < 3; row += 1) {
        root.add(K.box(0.54, 0.012, 0.04, K.paint('#b9b3a2'), [0, 0.082, 0.33 + row * 0.07]));
      }
      root.add(K.box(0.14, 0.05, 0.2, cream, [0.44, 0.05, 0.42]));
      root.add(K.sph(0.02, K.glowPaint('#7ef0c0', 1.1), [0, 0.19, 0.3], 10));
      for (const x of [-0.3, 0.3]) root.add(K.box(0.04, 0.14, 0.5, K.paint(caseColor, 0.42), [x, 0.2, -0.06]));

      const floppy = K.hinge([0, 0.34, 0.28]);
      floppy.add(K.box(0.14, 0.13, 0.014, K.paint('#3b4a63'), [0, -0.065, 0]));
      floppy.add(K.box(0.08, 0.03, 0.016, cream, [0, -0.02, 0.002]));
      root.add(floppy);

      const face = K.makeFace({ radius: 0.058, spacing: 0.105, y: 0.93, z: 0.16, mouth: 'smile', brows: caseColor });
      root.add(face.root);

      let boot = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        boot = K.damp(boot, state.message ? 1 : 0, 4.5, dt);
        root.position.y = K.bob(t, 1.7, 0.009 * amp) + boot * Math.sin(t * 12) * 0.01 * amp;
        root.rotation.z = Math.sin(t * 1.3) * 0.01 * amp;
        body.scale.set(1 + boot * Math.sin(t * 8) * 0.02, 1.24 - boot * Math.sin(t * 8) * 0.015, 0.96);
        screen.material.emissiveIntensity = 0.75 + boot * (0.5 + Math.abs(Math.sin(t * 5)) * 0.7);
        floppy.rotation.x = boot * 0.5 + Math.sin(t * 9) * 0.05 * boot * amp;
        face.updateLook(t, state.look, { excited: boot });
      });
    },
  },

  {
    id: 'sewing-machine',
    name: 'Stitch & Send',
    tagline: 'A treadle machine that runs your post through the needle.',
    tags: ['hobby', 'craft'],
    signal: 'Wheel spins, needle stabs, a stitched strip feeds out',
    palette: ['#2b231d', '#c9903c', '#c0432f'],
    focus: { distance: 2.8, height: 1.35, targetY: 0.6 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const iron = '#2b231d';
      const brass = '#c9903c';

      root.add(K.box(0.78, 0.44, 0.42, K.paper('p-bark', [1.6, 1.6]), [0, 0.22, 0]));
      root.add(K.box(0.84, 0.06, 0.46, K.paper('p-brown-warm', [1.6, 1.6]), [0, 0.47, 0]));
      for (const x of [-0.3, 0.3]) root.add(K.box(0.39, 0.16, 0.02, K.paint('#6b543a'), [x, 0.24, 0.215]));
      root.add(K.cyl(0.05, 0.05, 0.02, K.paint(brass), [-0.3, 0.24, 0.225], [Math.PI / 2, 0, 0], 12));

      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 22, Math.PI), K.paint(iron));
      arch.position.set(-0.14, 0.72, 0);
      arch.castShadow = true;
      root.add(arch);
      root.add(K.box(0.18, 0.3, 0.16, K.paint(iron), [0.08, 0.62, 0]));
      root.add(K.box(0.2, 0.06, 0.18, K.paint(iron), [0.08, 0.5, 0]));

      const needle = K.hinge([0.08, 0.51, 0.02]);
      needle.add(K.box(0.02, 0.14, 0.02, K.paint(brass), [0, -0.07, 0]));
      needle.add(K.box(0.06, 0.02, 0.09, K.paint(iron), [0, -0.15, 0.02]));
      root.add(needle);

      const wheel = K.hinge([-0.36, 0.72, 0]);
      wheel.add(K.cyl(0.115, 0.115, 0.03, K.paint(iron), [0, 0, 0], [0, 0, Math.PI / 2], 20));
      wheel.add(K.cyl(0.05, 0.05, 0.05, K.paint(brass), [0, 0, 0], [0, 0, Math.PI / 2], 12));
      wheel.add(K.box(0.02, 0.2, 0.02, K.paint(iron), [0, 0.06, 0.09]));
      root.add(wheel);

      const spool = K.hinge([-0.2, 0.94, 0.02]);
      spool.add(K.cyl(0.014, 0.014, 0.12, K.paint(brass), [0, -0.04, 0], null, 8));
      spool.add(K.cyl(0.038, 0.038, 0.1, K.paint('#c0432f'), [0, 0.02, 0], null, 14));
      root.add(spool);

      const threads: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
      for (let index = 0; index < 9; index += 1) {
        const bead = K.sph(0.011, K.paint('#c0432f'), [0, 0, 0], 8);
        threads.push(bead);
        root.add(bead);
      }

      const cloth = K.hinge([0.08, 0.53, 0.02]);
      cloth.add(K.box(0.26, 0.012, 0.2, K.paper('p-salmon', [0.8, 0.8]), [0, 0, 0.1]));
      root.add(cloth);

      const pedal = K.hinge([0, 0.08, 0.44]);
      pedal.add(K.box(0.2, 0.028, 0.12, K.paint(iron), [0, 0.014, 0.06]));
      root.add(pedal);

      plate(root, 'stitch', 0.32, [-0.12, 0.24, 0.217], null);

      const face = K.makeFace({ radius: 0.05, spacing: 0.092, y: 0.79, z: 0.14, mouth: 'line', brows: brass });
      root.add(face.root);

      let jog = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        jog = K.damp(jog, state.message ? 1 : 0, 4.5, dt);
        const speed = 1 + jog * 5.5;
        root.position.y = K.bob(t, 1.8, 0.007 * amp);
        root.rotation.z = Math.sin(t * 3.2) * 0.008 * amp;
        wheel.rotation.x += dt * speed * 2.2;
        needle.position.y = 0.51 - Math.abs(Math.sin(t * speed * 6)) * 0.055 * (0.35 + jog);
        cloth.position.z = 0.02 + ((t * speed * 0.06) % 0.14) * (0.4 + jog);
        pedal.rotation.x = -Math.abs(Math.sin(t * speed * 4)) * 0.18 * (0.4 + jog);
        spool.rotation.y += dt * speed * 0.9;
        threads.forEach((bead, index) => {
          const p = index / (threads.length - 1);
          bead.position.set(-0.2 + p * 0.28, 0.94 - p * 0.42 + Math.sin(t * speed * 3 + index) * 0.012 * (0.4 + jog), 0.02 + Math.sin(t * speed * 2 + index * 0.6) * 0.02);
        });
        face.updateLook(t, state.look, { excited: jog });
      });
    },
  },

  {
    id: 'time-box',
    name: 'Time Box',
    tagline: 'A blue call box with a lantern that flashes when the post lands.',
    tags: ['whimsy', 'blue box'],
    signal: 'Lantern sweeps, windows glow, the whole box shimmers',
    palette: ['#274b7a', '#f4efdc', '#ffd777'],
    focus: { distance: 3.2, height: 1.7, targetY: 0.78 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const blue = '#274b7a';
      const panel = '#1e3a5f';

      root.add(K.box(0.6, 0.06, 0.6, K.paint(panel), [0, 0.03, 0]));
      root.add(K.box(0.5, 0.86, 0.5, K.paint(blue), [0, 0.49, 0]));
      for (const x of [-0.23, 0.23]) {
        for (const z of [-0.23, 0.23]) root.add(K.box(0.05, 0.9, 0.05, K.paint(panel), [x, 0.49, z]));
      }
      for (const x of [-0.12, 0.12]) {
        root.add(K.box(0.18, 0.26, 0.014, K.paint(panel), [x, 0.4, 0.257]));
        root.add(K.box(0.18, 0.1, 0.014, K.paint(panel), [x, 0.66, 0.257]));
      }
      root.add(K.box(0.16, 0.18, 0.014, K.paint('#f4efdc'), [0.01, 0.4, 0.262]));
      root.add(K.box(0.16, 0.18, 0.014, K.paint('#f4efdc'), [-0.12, 0.4, 0.262]));

      // Frosted panes with a cream surround. No muntins: the eyes come through
      // the glass, and a cross bar would cut straight across a pupil.
      const pane = new THREE.MeshStandardMaterial({ color: '#cfe4ef', metalness: 0, opacity: 0.34, roughness: 0.2, transparent: true });
      for (const x of [-0.12, 0.12]) {
        root.add(K.box(0.18, 0.22, 0.012, K.paint('#f4efdc'), [x, 0.82, 0.252]));
        root.add(K.box(0.15, 0.19, 0.01, pane, [x, 0.82, 0.26]));
      }

      root.add(K.box(0.46, 0.14, 0.02, K.paint('#f4efdc'), [0, 1.0, 0.24]));
      plate(root, 'police', 0.4, [0, 1.0, 0.252], null);

      root.add(K.box(0.58, 0.06, 0.58, K.paint(panel), [0, 1.08, 0]));
      root.add(K.box(0.44, 0.05, 0.44, K.paint(blue), [0, 1.13, 0]));
      const lantern = K.hinge([0, 1.15, 0]);
      lantern.add(K.cyl(0.07, 0.07, 0.05, K.paint(panel), [0, 0.03, 0], null, 12));
      const lanternGlow = K.sph(0.055, K.glowPaint('#ffd777', 0.9), [0, 0.09, 0], 16);
      lantern.add(lanternGlow);
      lantern.add(K.cone(0.08, 0.07, K.paint(blue), [0, 0.16, 0], null, 12));
      root.add(lantern);

      const face = K.makeFace({ radius: 0.055, spacing: 0.1, y: 0.82, z: 0.24, mouth: 'line' });
      root.add(face.root);

      const card = K.envelope(0.13);
      card.position.set(0.01, 0.4, 0.27);
      root.add(card);

      const motes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
      for (let index = 0; index < 7; index += 1) {
        const mote = K.sph(0.014, K.glowPaint('#ffd777', 0.8), [0, 0, 0], 8);
        mote.visible = false;
        motes.push(mote);
        root.add(mote);
      }

      let land = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        land = K.damp(land, state.message ? 1 : 0, 4, dt);
        const shimmer = Math.sin(t * 14) * land;
        root.position.y = K.bob(t, 1.2, 0.007 * amp) + shimmer * 0.012 * amp;
        root.rotation.z = Math.sin(t * 1.1) * 0.008 * amp + shimmer * 0.012;
        root.scale.setScalar(1 + shimmer * 0.014);
        lantern.rotation.z = Math.sin(t * (1.6 + land * 3)) * (0.06 + land * 0.2) * amp;
        lanternGlow.material.emissiveIntensity = 0.5 + land * (0.6 + Math.abs(Math.sin(t * 7)) * 0.9);
        card.position.z = 0.27 + land * 0.18;
        card.position.y = 0.4 - land * 0.05;
        motes.forEach((mote, index) => {
          const cycle = (t * 0.6 + index * 0.5) % 3;
          mote.visible = land > 0.15 && cycle < 1.8;
          mote.position.set(Math.sin(index * 2.1) * 0.3, 0.1 + cycle * 0.5, 0.1 + Math.cos(index * 1.7) * 0.3);
        });
        face.updateLook(t, state.look, { excited: land });
      });
    },
  },

  {
    id: 'pepperpot',
    name: 'Pepperpot',
    tagline: 'A brass pepperpot with a scanning eye and a mail claw. Very civil.',
    tags: ['whimsy', 'brass'],
    signal: 'Eye tracks you, claw extends, skirt bumps, dome lights blink',
    palette: ['#b8863f', '#8a5c2a', '#ff9d4d'],
    focus: { distance: 2.9, height: 1.35, targetY: 0.55 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const brass = '#b8863f';
      const bronze = '#8a5c2a';

      root.add(K.cyl(0.34, 0.34, 0.05, K.paint(bronze), [0, 0.025, 0], null, 18));
      root.add(K.cyl(0.2, 0.32, 0.42, K.paint(brass), [0, 0.26, 0], null, 18));
      for (let index = 0; index < 14; index += 1) {
        const angle = (index / 14) * Math.PI * 2;
        root.add(K.box(0.055, 0.36, 0.025, K.paint(bronze), [Math.sin(angle) * 0.255, 0.26, Math.cos(angle) * 0.255], [0.16, angle, 0]));
      }
      root.add(K.cyl(0.22, 0.22, 0.14, K.paint(brass), [0, 0.5, 0], null, 18));
      root.add(K.torus(0.17, 0.02, K.paint(bronze), [0, 0.58, 0], [Math.PI / 2, 0, 0], 8));
      root.add(K.torus(0.15, 0.02, K.paint(brass), [0, 0.63, 0], [Math.PI / 2, 0, 0], 8));
      root.add(K.cyl(0.12, 0.13, 0.08, K.paint(bronze), [0, 0.67, 0], null, 16));
      const headDome = K.dome(0.17, K.paint(brass), [0, 0.71, 0], 20);
      headDome.scale.set(1, 0.92, 1);
      root.add(headDome);

      const lights: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
      for (const angle of [-0.5, 0.5]) {
        const light = K.sph(0.022, K.glowPaint('#ff9d4d', 0.4), [Math.sin(angle) * 0.12, 0.8, Math.cos(angle) * 0.12], 10);
        lights.push(light);
        root.add(light);
      }

      const stalk = K.hinge([0, 0.83, 0.04]);
      stalk.add(K.cyl(0.015, 0.015, 0.16, K.paint(bronze), [0, 0.08, 0], [0.2, 0, 0], 10));
      const lens = K.hinge([0, 0.17, 0.03]);
      lens.add(K.cyl(0.05, 0.055, 0.07, K.paint(bronze), [0, 0, 0], [Math.PI / 2, 0, 0], 14));
      lens.add(K.sph(0.042, K.paint('#fff8df', 0.94), [0, 0, 0.02], 16));
      lens.add(K.sph(0.02, K.paint('#2b231d', 0.6), [0, 0, 0.05], 12));
      stalk.add(lens);
      root.add(stalk);

      const claw = K.hinge([-0.2, 0.5, 0]);
      claw.add(K.cyl(0.02, 0.02, 0.2, K.paint(brass), [-0.1, 0, 0], [0, 0, Math.PI / 2], 10));
      claw.add(K.cone(0.05, 0.12, K.paint(bronze), [-0.24, 0, 0], [0, 0, Math.PI / 2], 12));
      root.add(claw);
      const stamp = K.hinge([0.2, 0.5, 0]);
      stamp.add(K.cyl(0.02, 0.02, 0.16, K.paint(brass), [0.08, 0, 0], [0, 0, Math.PI / 2], 10));
      stamp.add(K.cyl(0.05, 0.045, 0.05, K.paint('#c0432f'), [0.18, 0, 0], [0, 0, Math.PI / 2], 12));
      root.add(stamp);

      root.add(K.box(0.32, 0.14, 0.02, K.paint('#171512'), [0, 0.3, 0.28]));
      plate(root, 'led', 0.3, [0, 0.3, 0.292], null);

      const letter = K.envelope(0.12);
      letter.position.set(-0.34, 0.5, 0.06);
      letter.visible = false;
      root.add(letter);

      let scan = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        scan = K.damp(scan, state.message ? 1 : 0, 4.5, dt);
        const bump = Math.sin(t * 7) * scan * 0.02 * amp;
        root.position.y = K.bob(t, 1.4, 0.006 * amp) + Math.abs(bump);
        root.rotation.z = Math.sin(t * 7) * scan * 0.014 * amp;
        root.rotation.y = Math.sin(t * (0.6 + scan * 1.2)) * 0.06 * amp;
        lights.forEach((light, index) => {
          light.material.emissiveIntensity = 0.25 + Math.abs(Math.sin(t * 4 + index * 1.6)) * (0.3 + scan * 1.1);
        });
        stalk.rotation.y = Math.sin(t * (0.9 + scan * 2.4)) * (0.5 + scan * 0.5) * amp;
        stalk.rotation.x = 0.18 + Math.sin(t * 1.6) * 0.08 * amp;
        claw.rotation.z = -0.2 - scan * 0.5 + Math.sin(t * 9) * 0.06 * scan;
        stamp.rotation.z = 0.2 + Math.sin(t * 5 + 1) * 0.1 * scan * amp;
        letter.visible = scan > 0.25;
        letter.position.x = -0.34 + scan * 0.1;
        letter.rotation.z = scan * 0.2;
      });
    },
  },

  {
    id: 'rainbow-arch',
    name: 'Cloud Nine',
    tagline: 'A painted rainbow over a puffy cloud. Post arrives with a little light show.',
    tags: ['whimsy', 'colour'],
    signal: 'Bands ripple, sun spins, a letter rides the arch down',
    palette: ['#c0432f', '#e0b83a', '#3d6ea8'],
    focus: { distance: 3.2, height: 1.6, targetY: 0.62 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;

      const puffs: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
      for (const [x, y, z, r] of [[0, 0.22, 0, 0.26], [-0.26, 0.18, 0.02, 0.2], [0.26, 0.18, 0.02, 0.2], [-0.12, 0.3, -0.06, 0.18], [0.14, 0.28, -0.06, 0.17]]) {
        const puff = K.sph(r, K.paint('#fdfaf0', 0.96), [x, y, z], 20);
        puff.scale.set(1, 0.72, 0.9);
        puffs.push(puff);
        root.add(puff);
      }

      const bands: THREE.Mesh[] = [];
      RAINBOW.forEach((color, index) => {
        const radius = 0.34 + index * 0.075;
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(radius, 0.042, 8, 34, Math.PI),
          K.paint(color, 0.9),
        );
        band.position.set(0, 0.34, -0.02);
        band.castShadow = true;
        bands.push(band);
        root.add(band);
      });

      const sun = K.hinge([0.6, 1.02, -0.12]);
      const sunDisc = K.cyl(0.11, 0.11, 0.02, K.paint('#e0b83a'), [0, 0, 0], [Math.PI / 2, 0, 0], 20);
      sun.add(sunDisc);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        sun.add(K.box(0.02, 0.1, 0.02, K.paint('#e0b83a'), [Math.sin(angle) * 0.16, Math.cos(angle) * 0.16, 0], [0, 0, -angle]));
      }
      root.add(sun);

      root.add(K.cyl(0.09, 0.11, 0.11, K.paint('#3b2f22'), [0.34, 0.08, 0.16], null, 12));
      for (let index = 0; index < 4; index += 1) root.add(K.sph(0.032, K.paint('#e0b83a', 0.5), [-0.03 + index * 0.022, 0.15, 0.14], 10));

      root.add(K.box(0.2, 0.03, 0.02, K.paint('#6b5c46'), [0, 0.1, 0.22]));
      plate(root, 'chalk', 0.34, [0, 0.2, 0.235], null);

      const face = K.makeFace({ radius: 0.06, spacing: 0.108, y: 0.34, z: 0.24, mouth: 'smile', brows: '#3d6ea8' });
      root.add(face.root);
      for (const x of [-0.19, 0.19]) {
        const blush = K.sph(0.032, K.paint('#e8a3a3', 0.95), [x, 0.27, 0.22], 12);
        blush.scale.set(1, 0.6, 0.4);
        root.add(blush);
      }

      const letter = K.envelope(0.13);
      letter.visible = false;
      root.add(letter);

      let shine = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        shine = K.damp(shine, state.message ? 1 : 0, 4, dt);
        root.position.y = K.bob(t, 1.5, 0.008 * amp);
        root.rotation.z = Math.sin(t * 0.8) * 0.012 * amp;
        bands.forEach((band, index) => {
          const phase = t * 2.4 - index * 0.24;
          band.scale.set(1 + Math.sin(phase) * 0.014 * (0.4 + shine), 1 + Math.sin(phase) * 0.02 * (0.4 + shine), 1);
          band.rotation.z = Math.sin(phase) * 0.03 * shine;
        });
        sun.rotation.z = t * (0.5 + shine * 2.4);
        puffs.forEach((puff, index) => {
          puff.position.y = (index % 2 ? 0.18 : 0.22) + Math.sin(t * 1.4 + index) * 0.02 * amp;
        });
        letter.visible = shine > 0.2;
        const ride = (t * 0.3) % 1;
        letter.position.set(Math.cos(ride * Math.PI) * 0.34, 0.34 + Math.sin(ride * Math.PI) * 0.34, 0.02);
        letter.rotation.z = ride * 3;
        face.updateLook(t, state.look, { excited: shine });
      });
    },
  },

  {
    id: 'coffee-cup',
    name: 'Morning Mug',
    tagline: 'A bottomless cup with a kraft sleeve that carries your name.',
    tags: ['hobby', 'kitchen'],
    signal: 'Steam curls, spoon spins, sleeve warms up',
    palette: ['#f2ece0', '#c9a473', '#4a2f1d'],
    focus: { distance: 2.6, height: 1.35, targetY: 0.42 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const porcelain = K.paint('#f2ece0', 0.42);
      const sleeveMat = K.paper('p-brown-warm', [1.2, 1.2]);

      root.add(K.cyl(0.4, 0.43, 0.035, porcelain, [0, 0.02, 0], null, 26));
      root.add(K.cyl(0.32, 0.28, 0.46, porcelain, [0, 0.26, 0], null, 26));
      root.add(K.torus(0.31, 0.018, porcelain, [0, 0.49, 0], [Math.PI / 2, 0, 0], 10));
      root.add(K.cyl(0.3, 0.3, 0.012, K.paint('#4a2f1d', 0.5), [0, 0.485, 0], null, 24));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 10, 24, Math.PI), porcelain);
      handle.position.set(0.3, 0.28, 0);
      handle.rotation.z = -Math.PI / 2;
      handle.castShadow = true;
      root.add(handle);
      const sleeve = K.cyl(0.325, 0.295, 0.22, sleeveMat, [0, 0.25, 0], null, 26);
      root.add(sleeve);
      root.add(K.box(0.02, 0.02, 0.02, K.paint('#8a5c0c'), [0, 0.25, 0.32]));

      const spoon = K.hinge([0.5, 0.16, -0.16]);
      spoon.add(K.box(0.018, 0.3, 0.018, K.paint('#c9c4b8', 0.3), [0, 0.15, 0], [0, 0, 0.2]));
      const bowl = K.sph(0.045, K.paint('#c9c4b8', 0.3), [0.05, 0.31, 0], 14);
      bowl.scale.set(0.7, 1, 1.2);
      spoon.add(bowl);
      root.add(spoon);

      const steam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
      for (let index = 0; index < 6; index += 1) {
        // One material per puff: the curl fades individually, so a shared
        // material would have every puff snap to the same opacity.
        const puffMaterial = new THREE.MeshStandardMaterial({
          color: '#ffffff',
          metalness: 0,
          opacity: 0.42,
          roughness: 1,
          transparent: true,
        });
        const puff = K.sph(0.045 + index * 0.006, puffMaterial, [0, 0.55, 0], 10);
        steam.push(puff);
        root.add(puff);
      }

      plate(root, 'sleeve', 0.3, [0, 0.25, 0.332], null);
      const face = K.makeFace({ radius: 0.052, spacing: 0.094, y: 0.4, z: 0.3, mouth: 'smile', brows: '#8a5c0c' });
      root.add(face.root);

      const stirrer = K.hinge([0.16, 0.5, 0.1]);
      stirrer.add(K.box(0.02, 0.22, 0.012, K.paper('p-brown', [1, 1]), [0, 0.11, 0]));
      stirrer.add(K.box(0.09, 0.06, 0.004, K.paint('#c0432f'), [0.03, 0.22, 0]));
      root.add(stirrer);

      let warm = 0;
      let stir = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        warm = K.damp(warm, state.message ? 1 : 0, 4, dt);
        stir += dt * warm * 5 * amp;
        root.position.y = K.bob(t, 1.6, 0.007 * amp) + warm * Math.sin(t * 10) * 0.008 * amp;
        root.rotation.z = Math.sin(t * 1.9) * 0.01 * amp;
        steam.forEach((puff, index) => {
          const cycle = (t * (0.5 + warm * 0.9) + index * 0.45) % 2.7;
          puff.visible = cycle < 2.2;
          puff.position.set(Math.sin(cycle * 1.8 + index) * 0.05, 0.55 + cycle * 0.22, Math.cos(cycle * 1.4) * 0.05);
          puff.scale.setScalar(0.5 + cycle * 0.5);
          puff.material.opacity = 0.42 * (1 - cycle / 2.6) * (0.7 + warm * 0.5);
        });
        spoon.rotation.y = Math.sin(t * 0.7) * 0.2 + stir;
        stirrer.rotation.z = -warm * 1.1 + Math.sin(t * 8) * 0.06 * warm * amp;
        sleeve.scale.setScalar(1 + warm * 0.006);
        face.updateLook(t, state.look, { excited: warm });
      });
    },
  },

  {
    id: 'camp-tent',
    name: 'Base Camp',
    tagline: 'An A-frame, a lantern and a campfire. Post reads better outdoors.',
    tags: ['hobby', 'outdoors'],
    signal: 'Doors flap open, lantern swings, fire flares, sparks rise',
    palette: ['#3d5c34', '#c9a473', '#e0a23a'],
    focus: { distance: 3.1, height: 1.5, targetY: 0.5 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const canvasMat = K.paper('p-salmon', [1.4, 1.4]);
      const awningMat = K.paper('p-stripes', [1.6, 1.2]);
      const canvasWall = K.paper('p-brown-warm', [1.4, 1.4]);

      root.add(K.cyl(0.6, 0.62, 0.035, K.paper('p-green', [2, 2]), [0, 0.018, 0], null, 26));
      for (const side of [-1, 1]) {
        root.add(K.box(0.6, 0.04, 0.78, awningMat, [side * 0.23, 0.79, 0], [0, 0, side * 0.69]));
      }
      for (const z of [-0.37, 0.37]) root.add(K.box(0.92, 0.6, 0.04, canvasWall, [0, 0.32, z]));
      root.add(K.cyl(0.022, 0.022, 0.84, K.paper('p-bark', [1, 1]), [0, 0.99, 0], [Math.PI / 2, 0, 0], 10));
      root.add(K.box(0.44, 0.42, 0.16, K.paint('#2b231d', 0.98), [0, 0.23, 0.3]));

      const doorLeft = K.hinge([-0.21, 0.44, 0.375]);
      const doorRight = K.hinge([0.21, 0.44, 0.375]);
      doorLeft.add(K.box(0.21, 0.42, 0.03, canvasMat, [0.105, -0.21, 0]));
      doorRight.add(K.box(0.21, 0.42, 0.03, canvasMat, [-0.105, -0.21, 0]));
      root.add(doorLeft, doorRight);

      const face = K.makeFace({ radius: 0.055, spacing: 0.098, y: 0.53, z: 0.4, mouth: 'smile', brows: '#2b231d' });
      root.add(face.root);

      const lantern = K.hinge([0.32, 0.6, 0.34]);
      lantern.add(K.cyl(0.012, 0.012, 0.1, K.paint('#3b2f22'), [0, -0.05, 0], null, 8));
      lantern.add(K.cyl(0.06, 0.06, 0.1, K.paint('#c9a473'), [0, -0.14, 0], null, 12));
      const lanternGlow = K.sph(0.04, K.glowPaint('#ffd777', 0.7), [0, -0.14, 0], 14);
      lantern.add(lanternGlow);
      lantern.add(K.cyl(0.07, 0.07, 0.03, K.paint('#3b2f22'), [0, -0.2, 0], null, 12));
      root.add(lantern);

      const fire = K.hinge([-0.5, 0.05, 0.2]);
      for (const [rot, dx] of [[0.5, -0.05], [-0.5, 0.05], [0, 0]]) {
        fire.add(K.cyl(0.03, 0.03, 0.22, K.paper('p-bark', [1, 1]), [dx, 0.03, 0.02], [Math.PI / 2, 0, rot], 8));
      }
      const flame = K.cone(0.07, 0.2, K.glowPaint('#e0a23a', 0.8), [0, 0.16, 0], null, 12);
      fire.add(flame);
      const flameInner = K.cone(0.04, 0.12, K.glowPaint('#e0b83a', 1), [0, 0.12, 0], null, 10);
      fire.add(flameInner);
      root.add(fire);

      for (const [x, z, scale] of [[0.54, -0.28, 1], [0.62, 0.04, 0.72]]) {
        const tree = K.hinge([x, 0.02, z]);
        for (let tier = 0; tier < 3; tier += 1) {
          tree.add(K.cone(0.16 - tier * 0.035, 0.26, K.paper('p-leaf', [1.4, 1.4]), [0, 0.14 + tier * 0.17, 0], null, 12));
        }
        tree.add(K.cyl(0.03, 0.035, 0.14, K.paper('p-bark', [1, 1]), [0, 0.07, 0], null, 8));
        tree.scale.setScalar(scale);
        root.add(tree);
      }

      plate(root, 'patch', 0.36, [0, 0.05, 0.58], [-0.64, 0, 0]);

      const sparks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
      for (let index = 0; index < 6; index += 1) {
        const spark = K.sph(0.014, K.glowPaint('#e0b83a', 1), [0, 0, 0], 8);
        spark.visible = false;
        sparks.push(spark);
        root.add(spark);
      }

      let glow = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        glow = K.damp(glow, state.message ? 1 : 0, 4, dt);
        root.position.y = K.bob(t, 1.1, 0.006 * amp);
        doorLeft.rotation.y = -glow * 0.72 - Math.sin(t * 7) * 0.05 * glow * amp;
        doorRight.rotation.y = glow * 0.72 + Math.sin(t * 7) * 0.05 * glow * amp;
        lantern.rotation.z = Math.sin(t * (1.4 + glow * 2)) * (0.12 + glow * 0.3) * amp;
        lanternGlow.material.emissiveIntensity = 0.5 + glow * (0.6 + Math.abs(Math.sin(t * 6)) * 0.9);
        flame.scale.set(1 + Math.sin(t * 7) * 0.12 * (0.5 + glow), 1 + Math.sin(t * 5) * 0.16 * (0.5 + glow), 1);
        flameInner.scale.copy(flame.scale);
        fire.rotation.y = Math.sin(t * 1.2) * 0.1 * amp;
        sparks.forEach((spark, index) => {
          const cycle = (t * 0.8 + index * 0.4) % 2.4;
          spark.visible = cycle < 1.6;
          spark.position.set(-0.5 + Math.sin(index * 2.4) * 0.1, 0.2 + cycle * 0.32, 0.2);
          spark.material.emissiveIntensity = 1 - cycle / 1.8;
        });
        face.updateLook(t, state.look, { excited: glow });
      });
    },
  },

  {
    id: 'mountain-range',
    name: 'Three Peaks',
    tagline: 'A trail sign, a lake and three snowcaps. The cave takes your parcels.',
    tags: ['hobby', 'outdoors', 'scene'],
    signal: 'Snowcaps puff, clouds drift, a bird circles, letter leaves the cave',
    palette: ['#8d927f', '#fdfaf0', '#3d6ea8'],
    focus: { distance: 3.3, height: 1.55, targetY: 0.5 },
    build(ctx) {
      const shell = buildShell(ctx);
      const { root, plate } = shell;
      const rock = K.paper('p-desert', [1.6, 1.6]);
      const snow = K.paint('#fdfaf0', 0.96);

      root.add(K.cyl(0.62, 0.64, 0.04, K.paper('p-green', [2, 2]), [0, 0.02, 0], null, 28));
      root.add(K.cone(0.4, 0.72, rock, [-0.14, 0.36, -0.08], null, 8));
      root.add(K.cone(0.26, 0.46, rock, [0.28, 0.23, -0.02], null, 8));
      root.add(K.cone(0.2, 0.34, rock, [-0.48, 0.17, 0.08], null, 8));
      root.add(K.cone(0.16, 0.26, snow, [-0.14, 0.6, -0.08], null, 8));
      root.add(K.cone(0.11, 0.18, snow, [0.28, 0.34, -0.02], null, 8));
      root.add(K.cone(0.085, 0.14, snow, [-0.48, 0.26, 0.08], null, 8));

      const lake = K.cyl(0.2, 0.2, 0.012, K.paint('#3d6ea8', 0.5), [0.36, 0.05, 0.36], null, 22);
      root.add(lake);
      root.add(K.box(0.32, 0.02, 0.02, K.paint('#6b5c46'), [0.36, 0.05, 0.36]));

      const cave = K.box(0.24, 0.2, 0.16, K.paint('#2b231d', 0.98), [-0.14, 0.13, 0.24]);
      root.add(cave);
      root.add(K.box(0.24, 0.04, 0.03, K.paint('#2b231d'), [-0.14, 0.2, 0.32]));

      for (const [x, z, scale] of [[0.5, 0.2, 1], [0.56, -0.06, 0.78], [-0.5, 0.42, 0.86]]) {
        const tree = K.hinge([x, 0.02, z]);
        for (let tier = 0; tier < 3; tier += 1) {
          tree.add(K.cone(0.14 - tier * 0.03, 0.24, K.paper('p-leaf', [1.4, 1.4]), [0, 0.13 + tier * 0.15, 0], null, 12));
        }
        tree.add(K.cyl(0.028, 0.032, 0.12, K.paper('p-bark', [1, 1]), [0, 0.06, 0], null, 8));
        tree.scale.setScalar(scale);
        root.add(tree);
      }

      const clouds: THREE.Group[] = [];
      for (const [x, y, z] of [[-0.36, 0.86, -0.2], [0.3, 0.96, -0.28]]) {
        const cloud = K.hinge([x, y, z]);
        for (const [dx, dy, r] of [[0, 0, 0.09], [0.11, -0.02, 0.07], [-0.11, -0.02, 0.07]]) {
          cloud.add(K.sph(r, K.paint('#fdfaf0', 0.96), [dx, dy, 0], 14));
        }
        clouds.push(cloud);
        root.add(cloud);
      }

      const post = K.hinge([0.36, 0.02, 0.32]);
      post.add(K.cyl(0.022, 0.026, 0.44, K.paper('p-bark', [1, 1]), [0, 0.22, 0], null, 8));
      root.add(post);
      plate(root, 'trailmark', 0.4, [0.36, 0.42, 0.34], [0, -0.34, 0]);

      const face = K.makeFace({ radius: 0.056, spacing: 0.1, y: 0.34, z: 0.28, mouth: 'smile', brows: '#6b5c46' });
      root.add(face.root);

      const bird = K.hinge([0, 0.9, 0]);
      const torso = K.sph(0.045, K.paint('#3b2f22', 0.9), [0, 0, 0], 12);
      torso.scale.set(1.5, 0.8, 0.8);
      bird.add(torso, K.cone(0.02, 0.05, K.paint('#e0b83a'), [0.08, 0, 0], [0, 0, -Math.PI / 2], 8));
      const wings = [1, -1].map((side) => {
        const wing = K.box(0.1, 0.012, 0.05, K.paint('#2b231d', 0.9), [0, 0, side * 0.045]);
        bird.add(wing);
        return wing;
      });
      bird.visible = false;
      root.add(bird);

      const letter = K.envelope(0.13);
      letter.visible = false;
      root.add(letter);

      let stir = 0;
      return shell.done((t, dt, state) => {
        const amp = state.reduced ? 0.3 : 1;
        stir = K.damp(stir, state.message ? 1 : 0, 4, dt);
        root.position.y = K.bob(t, 1.2, 0.006 * amp);
        root.rotation.y = Math.sin(t * 0.5) * 0.02 * amp;
        lake.scale.set(1, 1, 1 + Math.sin(t * 3) * 0.05 * stir);
        clouds.forEach((cloud, index) => {
          cloud.position.x += dt * (0.02 + stir * 0.06) * (index ? -1 : 1);
          if (cloud.position.x > 0.75) cloud.position.x = -0.75;
          if (cloud.position.x < -0.75) cloud.position.x = 0.75;
          cloud.position.y = (index ? 0.96 : 0.86) + Math.sin(t * 1.1 + index) * 0.03 * (0.6 + stir);
        });
        bird.visible = stir > 0.2;
        const orbit = t * 1.4 * amp;
        bird.position.set(Math.cos(orbit) * 0.52, 0.86 + Math.sin(orbit * 2) * 0.06, Math.sin(orbit) * 0.4 - 0.1);
        bird.rotation.y = -orbit;
        wings.forEach((wing, index) => {
          wing.rotation.x = Math.sin(t * 9 + index * 0.2) * 0.5 * amp * stir;
        });
        letter.visible = stir > 0.25;
        letter.position.set(-0.14, 0.12 + stir * 0.04, 0.3 + stir * 0.16);
        letter.rotation.x = -0.3;
        face.updateLook(t, state.look, { excited: stir });
      });
    },
  },
];
