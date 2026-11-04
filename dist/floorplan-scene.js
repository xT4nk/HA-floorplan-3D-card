/* Floorplan 3D Card — Three.js scene.
 *
 * Draws the plan produced by floorplan-geometry.js and handles the camera,
 * picking, room focus (other rooms become ghosts) and live overlays (room glow,
 * labels, roller shutters, open windows). It knows nothing about Home Assistant:
 * the card feeds it plain values.
 *
 * Rendering is on demand: a frame is drawn only when something changed, while
 * the camera is flying, or while the optional auto-rotation is running.
 */
import * as THREE from './three.module.js?v=r128';

export { THREE };

const FLOORS = {
  wood: 0xb08d63, wood2: 0xa5825a, tile: 0x9fb1b5, carpet: 0x8f8798,
  concrete: 0x8e8a82, stone: 0xa8a196, dark: 0x5d564d,
};
const THEMES = {
  dark:  { bg: 0x0c1016, ground: 0x161b22, wall: 0xe9e3d8, cap: 0xf5f0e7, hemi: 0.32, sun: 0.30,
           glass: 0x8fc3e8, glassEm: 0x0a2a3a, glassOp: 0.38, label: 'rgba(255,255,255,.95)', sub: 'rgba(255,255,255,.62)' },
  light: { bg: 0x222a34, ground: 0x1b2129, wall: 0xefe9de, cap: 0xfaf6ee, hemi: 0.95, sun: 0.85,
           glass: 0xd9f1ff, glassEm: 0x9fd6f0, glassOp: 0.6, label: 'rgba(255,255,255,.97)', sub: 'rgba(255,255,255,.7)' },
};
const MAX_ROOM_LIGHTS = 12;   // point lights cost shader time on tablets: above this, glow is emissive only
const GHOST_OPACITY = 0.12;
const IDLE_RESUME_MS = 45000;

export class FloorplanScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} model   normalizeConfig() result
   * @param {object} plan    buildPlan() result
   * @param {object} opts    { theme: 'dark'|'light', autoRotate: bool, labels: bool, onPick(hit) }
   */
  constructor(canvas, model, plan, opts = {}) {
    this.canvas = canvas;
    this.model = model;
    this.plan = plan;
    this.opts = { theme: 'dark', autoRotate: false, labels: true, onPick: () => {}, ...opts };
    this.focused = null;
    this._raf = 0;
    this._active = true;
    this._fly = null;
    this._interacting = false;
    this._idleUntil = 0;
    this._reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._tagged = [];
    this._ghosts = new Map();
    this._disposables = [];
    this._build();
    this._bindPointer();
    this.invalidate();
  }

  // ------------------------------------------------------------ public API
  /** Schedules one frame (cheap to call many times). */
  invalidate() {
    if (this._raf || !this._active || !this._w) return;
    this._raf = requestAnimationFrame(t => this._frame(t));
  }

  /** Pauses / resumes rendering (card detached, page hidden). */
  setActive(on) {
    this._active = on;
    if (!on && this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    if (on) { this._last = 0; this.invalidate(); }
  }

  setSize(w, h) {
    if (!w || !h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._applyInset();
    // until the user moves the camera, keep the whole plan framed
    if (!this._userMoved && !this._fly) {
      this._radius = this.focused ? this._roomRadius(this.focused) : this._homeRadius();
      this._updateCamera();
    }
    this.invalidate();
  }

  /** Space covered by the card's side panel, so the plan is framed in the free area. */
  setInset(inset) { this._inset = inset; this._applyInset(); this.invalidate(); }

  /** Camera distance that fits a plan of size S (cm) in the free part of the card. */
  _fit(S) {
    const w = this._w || 800, h = this._h || 500, i = this._inset || {};
    const wa = Math.max(80, w - (i.left || 0)), ha = Math.max(80, h - (i.top || 0));
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), th = tv * (w / h);
    return Math.max(S / (2 * tv) * (h / ha), S / (2 * th) * (w / wa));
  }
  _homeRadius() { return this._fit(this._size) * 1.12 + 150; }
  _roomRadius(id) {
    const b = this.rooms[id].data.bbox;
    return Math.max(this._rMin, Math.min(this._rMax, this._fit(Math.max(b.w, b.h, 200)) * 1.8));
  }

  setTheme(name) {
    const T = THEMES[name] || THEMES.dark;
    this.opts.theme = name;
    this.scene.background.setHex(T.bg);
    this.groundMat.color.setHex(T.ground);
    this.wallMat.color.setHex(T.wall);
    this.capMat.color.setHex(T.cap);
    this.hemi.intensity = T.hemi;
    this.sun.intensity = T.sun;
    this.glassMat.color.setHex(T.glass);
    this.glassMat.emissive.setHex(T.glassEm);
    this.glassMat.opacity = T.glassOp;
    for (const r of Object.values(this.rooms)) if (r.label) this._drawLabel(r);
    this.invalidate();
  }

  setAutoRotate(on) { this.opts.autoRotate = !!on; this.invalidate(); }

  /** Room glow: intensity 0..1 (0 = off), color [r, g, b]. */
  setRoomGlow(id, intensity, color) {
    const r = this.rooms[id]; if (!r) return;
    const k = Math.max(0, Math.min(1, intensity || 0));
    const c = new THREE.Color(...(color || [255, 179, 92]).map(v => v / 255));
    r.mat.emissive.copy(c).multiplyScalar(k ? 0.18 + 0.22 * k : 0);
    if (r.lamp) { r.lamp.color.copy(c); r.lamp.intensity = k ? 0.5 + 0.9 * k : 0; }
    this.invalidate();
  }

  /** Second line under the room name (e.g. "21.4° · 48%"); null hides it. */
  setRoomSubLabel(id, text) {
    const r = this.rooms[id]; if (!r || !r.label || r.sub === text) return;
    r.sub = text; this._drawLabel(r); this.invalidate();
  }

  /** Roller shutter: closed 0..1 (0 = fully open, 1 = fully closed). */
  setShutter(id, closed) {
    const o = this.openings[id]; if (!o || !o.shutter) return;
    const k = Math.max(0.04, Math.min(1, closed));
    const s = o.shutter;
    s.mesh.scale.y = k;
    s.mesh.position.y = s.topY - s.drop * k / 2;
    this.invalidate();
  }

  /** Window/door contact: true = open (glass tinted amber). */
  setOpenAlert(id, open) {
    const o = this.openings[id]; if (!o || !o.glass) return;
    o.glass.material = open ? this.glassOpenMat : this.glassMat;
    this.invalidate();
  }

  /** Zooms on a room (others become ghosts); null goes back to the overview. */
  focusRoom(id) {
    this.focused = id && this.rooms[id] ? id : null;
    this._applyFocus();
    if (this.focused) {
      const b = this.rooms[id].data.bbox;
      this._flyTo({ phi: 0.82, radius: this._roomRadius(id), tx: b.cx - this._cx, ty: 20, tz: b.cy - this._cy });
    } else {
      this._flyTo({ phi: this._home.phi, radius: this._homeRadius(), tx: 0, ty: this._home.ty, tz: 0 });
    }
  }

  /** Overview from the default angle. */
  resetView() {
    this.focused = null;
    this._applyFocus();
    this._userMoved = false;
    this._flyTo({ ...this._home, radius: this._homeRadius(), tx: 0, tz: 0 });
  }

  /** Adds a custom Object3D (plan coords, cm) that belongs to a room: it is
   *  ghosted with the room. Used by extensions (furniture, icons…). */
  addToRoom(roomId, object) {
    // object coords are plan coords: x → x, plan y → z, height → y
    this.world.add(object);
    object.traverse(m => { if (m.isMesh) this._tag(m, [roomId]); });
    this.invalidate();
    return object;
  }

  dispose() {
    this.setActive(false);
    this._unbind && this._unbind();
    for (const d of this._disposables) d.dispose && d.dispose();
    for (const g of this._ghosts.values()) g.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------ build
  _build() {
    const { options: O } = this.model;
    const T = THEMES[this.opts.theme] || THEMES.dark;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(T.bg);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(46, 1, 10, 20000);

    const B = this.model.bbox;
    this._cx = B.cx; this._cy = B.cy;
    const size = Math.max(B.w, B.h, 300);
    this._size = size;
    const world = new THREE.Group();
    world.position.set(-B.cx, 0, -B.cy);
    scene.add(world);
    this.world = world;

    this.hemi = new THREE.HemisphereLight(0xbfd0e8, 0x2a2118, T.hemi);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1de, T.sun);
    sun.position.set(size * 0.8, size * 1.4, size * 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const d = size;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, far: size * 4.5 });
    scene.add(sun);
    this.sun = sun;

    this.groundMat = this._keep(new THREE.MeshStandardMaterial({ color: T.ground, roughness: 1 }));
    const ground = new THREE.Mesh(this._keep(new THREE.CircleGeometry(size * 2.2, 48)), this.groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2; ground.receiveShadow = true;
    scene.add(ground);

    this.wallMat = this._keep(new THREE.MeshStandardMaterial({ color: T.wall, roughness: 0.92 }));
    this.capMat = this._keep(new THREE.MeshStandardMaterial({ color: T.cap, roughness: 0.9 }));
    this.frameMat = this._keep(new THREE.MeshStandardMaterial({ color: 0x4a4136, roughness: 0.6 }));
    this.shutterMat = this._keep(new THREE.MeshStandardMaterial({ color: 0x8d7b5e, roughness: 0.75 }));
    this.glassMat = this._keep(new THREE.MeshStandardMaterial({ color: T.glass, transparent: true,
      opacity: T.glassOp, roughness: 0.12, metalness: 0.05, emissive: T.glassEm }));
    this.glassOpenMat = this._keep(new THREE.MeshStandardMaterial({ color: 0xffb35c, transparent: true,
      opacity: 0.55, roughness: 0.2, emissive: 0x7a3d00 }));

    this._buildRooms(O);
    this._buildWalls(O);
    this._buildOpenings(O);

    // camera: orbit around the plan centre
    this._home = { theta: -0.62, phi: 0.92, ty: 30 };
    this._rMin = Math.max(250, size * 0.35);
    this._rMax = size * 4.5 + 1000;
    this._theta = this._home.theta; this._phi = this._home.phi; this._radius = this._homeRadius();
    this._target = new THREE.Vector3(0, this._home.ty, 0);
    this._updateCamera();
  }

  _keep(x) { this._disposables.push(x); return x; }
  _tag(mesh, rooms) { mesh.userData.rooms = new Set(rooms); this._tagged.push(mesh); }

  _box(w, h, d, mat) {
    const m = new THREE.Mesh(this._keep(new THREE.BoxGeometry(w, h, d)), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  /** Box along a plan segment: local x = along, local z = plan normal. */
  _place(mesh, center, angle, y) {
    mesh.position.set(center[0], y, center[1]);
    mesh.rotation.y = -angle;
    this.world.add(mesh);
    return mesh;
  }

  _buildRooms(O) {
    this.rooms = {};
    this._floorMeshes = [];
    const useLamps = this.model.rooms.length <= MAX_ROOM_LIGHTS;
    let alt = 0;
    for (const R of this.model.rooms) {
      const shape = new THREE.Shape(R.poly.map(([x, y]) => new THREE.Vector2(x, y)));
      const geo = this._keep(new THREE.ExtrudeGeometry(shape, { depth: O.floor_height, bevelEnabled: false }));
      geo.rotateX(Math.PI / 2);            // shape y → world z, extrusion → down
      geo.translate(0, O.floor_height, 0);  // top face at floor_height
      const color = this._floorColor(R.floor, alt++);
      const mat = this._keep(new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive: 0x000000 }));
      const floor = new THREE.Mesh(geo, mat);
      floor.receiveShadow = true;
      floor.userData.roomId = R.id;
      this.world.add(floor);
      this._floorMeshes.push(floor);
      this._tag(floor, [R.id]);

      const [lx, ly] = R.labelAt;
      let lamp = null;
      if (useLamps && R.walls) {
        lamp = new THREE.PointLight(0xffb35c, 0, Math.max(R.bbox.w, R.bbox.h) * 1.4 + 150, 2);
        lamp.position.set(lx, O.floor_height + O.wall_height - 14, ly);
        this.world.add(lamp);
      }
      const room = { data: R, floor, mat, lamp, label: null, sub: null, name: R.name || R.id };
      if (this.opts.labels) {
        room.canvas = document.createElement('canvas');
        room.canvas.width = 320; room.canvas.height = 120;
        room.tex = this._keep(new THREE.CanvasTexture(room.canvas));
        room.tex.minFilter = THREE.LinearFilter;
        const sp = new THREE.Sprite(this._keep(new THREE.SpriteMaterial({ map: room.tex, transparent: true, depthTest: false })));
        const k = Math.max(0.6, Math.min(1.2, this._size / 1100));
        sp.scale.set(290 * k, 109 * k, 1);
        sp.renderOrder = 10;
        sp.position.set(lx, O.floor_height + (R.walls ? O.wall_height + 70 : 80), ly);
        this.world.add(sp);
        room.label = sp;
        this._drawLabel(room);
      }
      this.rooms[R.id] = room;
    }
  }

  setRoomName(id, name) {
    const r = this.rooms[id]; if (!r || r.name === name) return;
    r.name = name; if (r.label) { this._drawLabel(r); this.invalidate(); }
  }

  _floorColor(f, i) {
    if (typeof f === 'string' && /^#?[0-9a-f]{6}$/i.test(f)) return parseInt(f.replace('#', ''), 16);
    if (f && FLOORS[f] !== undefined) return FLOORS[f];
    return i % 2 ? FLOORS.wood2 : FLOORS.wood;
  }

  _drawLabel(room) {
    const T = THEMES[this.opts.theme] || THEMES.dark;
    const cv = room.canvas, ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 10;
    ctx.font = '600 34px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = T.label;
    ctx.fillText(room.name, 160, room.sub ? 56 : 72, 310);
    if (room.sub) {
      ctx.font = '400 26px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = T.sub;
      ctx.fillText(room.sub, 160, 96, 310);
    }
    room.tex.needsUpdate = true;
  }

  _buildWalls(O) {
    for (const W of this.plan.walls) {
      const h = W.y1 - W.y0;
      const wall = this._place(this._box(W.length, h, O.wall_thickness, this.wallMat),
        W.center, W.angle, O.floor_height + W.y0 + h / 2);
      this._tag(wall, W.rooms);
      if (W.kind === 'wall') {
        const cap = this._place(this._box(W.length, 3, O.wall_thickness, this.capMat),
          W.center, W.angle, O.floor_height + W.y1 + 1.5);
        cap.castShadow = false;
        this._tag(cap, W.rooms);
      }
    }
  }

  _buildOpenings(O) {
    this.openings = {};
    this._openingMeshes = [];
    const T = O.wall_thickness;
    for (const P of this.plan.openings) {
      const entry = { data: P, glass: null, shutter: null };
      this.openings[P.id] = entry;
      if (P.type !== 'window') continue;
      const L = P.length, gh = O.wall_height - P.sill;
      const cy = O.floor_height + P.sill + gh / 2;
      const g = new THREE.Group();
      g.position.set(P.center[0], 0, P.center[1]);
      g.rotation.y = -P.angle;
      this.world.add(g);
      const add = (mesh, x, y, z) => {
        mesh.position.set(x, y, z);
        mesh.userData.openingId = P.id;
        g.add(mesh);
        this._openingMeshes.push(mesh);
        this._tag(mesh, P.rooms);
        return mesh;
      };
      // frame
      add(this._box(L, 4, 5, this.frameMat), 0, cy + gh / 2 - 2, 0);
      add(this._box(L, 4, 5, this.frameMat), 0, cy - gh / 2 + 2, 0);
      add(this._box(4, gh - 8, 5, this.frameMat), -L / 2 + 2, cy, 0);
      add(this._box(4, gh - 8, 5, this.frameMat), L / 2 - 2, cy, 0);
      const glass = add(this._box(Math.max(1, L - 8), gh - 8, 2.5, this.glassMat), 0, cy, 0);
      glass.castShadow = false;
      entry.glass = glass;
      // roller shutter on the outdoor side (local +z = plan normal)
      if (P.shutter) {
        const n = [-Math.sin(P.angle), Math.cos(P.angle)];
        const side = P.outward ? Math.sign(n[0] * P.outward[0] + n[1] * P.outward[1]) || 1 : 1;
        const z = side * (T / 2 + 4);
        add(this._box(L + 8, 12, 12, this.frameMat), 0, O.floor_height + O.wall_height - 6, z);
        const drop = gh - 12, topY = O.floor_height + O.wall_height - 12;
        const telo = add(this._box(Math.max(1, L - 4), drop, 5, this.shutterMat), 0, topY - drop / 2, z);
        entry.shutter = { mesh: telo, topY, drop };
        this.setShutter(P.id, 0.04);
      }
    }
  }

  // ------------------------------------------------------------ focus / ghosts
  _ghostOf(m) {
    let g = this._ghosts.get(m);
    if (!g) { g = m.clone(); g.transparent = true; g.opacity = GHOST_OPACITY; g.depthWrite = false; this._ghosts.set(m, g); }
    return g;
  }

  _applyFocus() {
    const id = this.focused;
    for (const m of this._tagged) {
      const full = !id || m.userData.rooms.has(id);
      if (full) {
        if (m.userData._mat) { m.material = m.userData._mat; m.castShadow = m.userData._cast; delete m.userData._mat; }
      } else if (!m.userData._mat) {
        m.userData._mat = m.material; m.userData._cast = m.castShadow;
        m.material = this._ghostOf(m.material); m.castShadow = false;
      }
    }
    for (const [rid, r] of Object.entries(this.rooms)) {
      const vis = !id || rid === id;
      if (r.lamp) r.lamp.visible = vis;
      if (r.label) r.label.visible = vis;
    }
    this.invalidate();
  }

  // ------------------------------------------------------------ camera
  _updateCamera() {
    this._phi = Math.max(0.18, Math.min(1.38, this._phi));
    this._radius = Math.max(this._rMin, Math.min(this._rMax, this._radius));
    const t = this._target, r = this._radius, p = this._phi, th = this._theta;
    this.camera.position.set(t.x + r * Math.sin(p) * Math.sin(th), t.y + r * Math.cos(p), t.z + r * Math.sin(p) * Math.cos(th));
    this.camera.lookAt(t);
  }

  _applyInset() {
    const w = this._w, h = this._h, i = this._inset;
    if (!w || !h) return;
    if (i && (i.left || i.top)) this.camera.setViewOffset(w, h, -(i.left || 0) / 2, (i.top || 0) / 2, w, h);
    else if (this.camera.view && this.camera.view.enabled) this.camera.clearViewOffset();
  }

  _flyTo(to, dur = 650) {
    const f = { theta: this._theta, phi: this._phi, radius: this._radius, tx: this._target.x, ty: this._target.y, tz: this._target.z };
    this._fly = { t0: performance.now(), dur: this._reduced ? 1 : dur, from: f, to: { ...f, ...to } };
    this.invalidate();
  }

  _stepFly(now) {
    const F = this._fly; if (!F) return false;
    const k = Math.min(1, (now - F.t0) / F.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const a = F.from, b = F.to, mix = (x, y) => x + (y - x) * e;
    this._theta = mix(a.theta, b.theta); this._phi = mix(a.phi, b.phi); this._radius = mix(a.radius, b.radius);
    this._target.set(mix(a.tx, b.tx), mix(a.ty, b.ty), mix(a.tz, b.tz));
    this._updateCamera();
    if (k >= 1) this._fly = null;
    return true;
  }

  _rotating(now) {
    return this.opts.autoRotate && !this.focused && !this._reduced && !this._interacting && now >= this._idleUntil;
  }

  _frame(now) {
    this._raf = 0;
    const dt = this._last ? Math.min(50, now - this._last) : 16;
    this._last = now;
    const flying = this._stepFly(now);
    const rotating = !flying && this._rotating(now);
    if (rotating) { this._theta += dt * 0.000045; this._updateCamera(); }
    this.renderer.render(this.scene, this.camera);
    if (flying || rotating) this.invalidate();
    else {
      this._last = 0;
      // auto-rotation paused by the user: wake up when the idle time is over
      if (this.opts.autoRotate && !this.focused && !this._reduced && now < this._idleUntil) {
        clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => this.invalidate(), this._idleUntil - now + 20);
      }
    }
  }

  // ------------------------------------------------------------ input
  _bindPointer() {
    const c = this.canvas, pointers = new Map();
    let down = null, pinch = 0, mid = null;
    const bump = () => { this._idleUntil = performance.now() + IDLE_RESUME_MS; };
    const pan = (dx, dy) => {
      const k = this._radius * 0.0011;
      const fwd = new THREE.Vector3(Math.sin(this._theta), 0, Math.cos(this._theta));
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      this._target.addScaledVector(right, dx * k).addScaledVector(fwd, dy * k);
      const lim = this._size * 0.7;
      this._target.x = Math.max(-lim, Math.min(lim, this._target.x));
      this._target.z = Math.max(-lim, Math.min(lim, this._target.z));
    };
    const on = (type, fn, o) => { c.addEventListener(type, fn, o); return () => c.removeEventListener(type, fn, o); };
    const offs = [
      on('pointerdown', e => {
        c.setPointerCapture(e.pointerId);
        this._interacting = true; bump();
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
        if (pointers.size === 2) {
          const p = [...pointers.values()];
          pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
        }
      }),
      on('pointermove', e => {
        if (!pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId);
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this._fly = null; this._userMoved = true;
        if (pointers.size === 1) {
          if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 9) down.moved = true;
          if (e.buttons === 2 || e.shiftKey) pan(dx, dy);
          else { this._theta -= dx * 0.0055; this._phi -= dy * 0.0045; }
        } else if (pointers.size === 2) {
          const p = [...pointers.values()];
          const nd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          const nm = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
          if (pinch > 0) this._radius *= pinch / nd;
          if (mid) pan(nm.x - mid.x, nm.y - mid.y);
          pinch = nd; mid = nm;
          if (down) down.moved = true;
        }
        this._updateCamera(); this.invalidate();
      }),
      on('pointerup', e => {
        pointers.delete(e.pointerId);
        pinch = 0; mid = null;
        if (down && !down.moved && Date.now() - down.t < 420 && pointers.size === 0) this._pick(e.clientX, e.clientY);
        if (pointers.size === 0) { down = null; this._interacting = false; bump(); this.invalidate(); }
      }),
      on('pointercancel', e => { pointers.delete(e.pointerId); pinch = 0; if (!pointers.size) this._interacting = false; }),
      on('wheel', e => {
        e.preventDefault();
        this._fly = null; this._userMoved = true;
        this._radius *= 1 + Math.sign(e.deltaY) * 0.09;
        bump(); this._updateCamera(); this.invalidate();
      }, { passive: false }),
      on('contextmenu', e => e.preventDefault()),
    ];
    this._unbind = () => { offs.forEach(f => f()); clearTimeout(this._idleTimer); };
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
  }

  _pick(px, py) {
    const rect = this.canvas.getBoundingClientRect();
    this._ndc.set(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const hitO = this._ray.intersectObjects(this._openingMeshes)[0];
    const hitF = this._ray.intersectObjects(this._floorMeshes)[0];
    let hit = null;
    if (hitO && (!hitF || hitO.distance < hitF.distance)) {
      const op = this.openings[hitO.object.userData.openingId].data;
      hit = { kind: 'opening', id: op.id, opening: op };
    } else if (hitF) {
      hit = { kind: 'room', id: hitF.object.userData.roomId };
    }
    this.opts.onPick(hit);
  }
}
