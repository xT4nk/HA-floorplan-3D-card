/* Floorplan 3D Card — a Lovelace card that draws your home in 3D from a few
 * lines of YAML and shows it live: lights glow in their room, roller shutters
 * follow the covers, open windows turn amber, each room shows its temperature.
 * Tap a room to zoom in and get its Home Assistant area entities.
 *
 * Files (all in dist/, loaded as ES modules, no build step):
 *   floorplan-3d-card.js   this file: the card, Home Assistant glue, panel
 *   floorplan-geometry.js  config validation, walls derived from rooms (pure)
 *   floorplan-scene.js     Three.js scene, camera, picking, overlays
 *   floorplan-demo.js      the demo apartment used by the card picker
 *   three.module.js        Three.js r128 (MIT)
 *
 * Extending: subclass Floorplan3DCard and override the hooks marked HOOK
 * (see docs/EXTENDING.md).
 *
 * Releasing: the internal imports carry ?v=<VERSION> so browsers fetch the new
 * modules after an update (HACS versions only this file's URL). Bump VERSION
 * and every ?v= together; tests/release.test.mjs checks it.
 */
import { normalizeConfig, buildPlan } from './floorplan-geometry.js?v=0.2.0';
import { FloorplanScene, THREE } from './floorplan-scene.js?v=0.2.0';
import { DEMO_PLAN } from './floorplan-demo.js?v=0.2.0';

export { THREE, FloorplanScene, normalizeConfig, buildPlan };
export const VERSION = '0.2.0';

const DOMAIN_ORDER = ['light', 'climate', 'cover', 'fan', 'media_player', 'switch', 'vacuum', 'lock',
  'humidifier', 'water_heater', 'sensor', 'binary_sensor', 'camera', 'scene', 'script', 'button'];
const PANEL_SKIP = new Set(['automation', 'update', 'device_tracker', 'person', 'zone', 'event', 'tts', 'stt',
  'conversation', 'wake_word', 'assist_satellite', 'image', 'todo', 'calendar', 'notify', 'text', 'select', 'number']);
const WARM = [255, 179, 92];
const MOBILE_W = 640;

const CSS = `
  :host{display:block}
  ha-card{overflow:hidden;height:100%}
  #wrap{position:relative;width:100%;height:var(--fp-height,480px);min-height:320px;overflow:hidden;
    background:#0c1016;border-radius:var(--ha-card-border-radius,12px);color:#e8e4dc;
    font-family:var(--ha-font-family-body,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);
    --fp-line:rgba(255,255,255,.08);--fp-dim:#9aa3ad;--fp-accent:var(--primary-color,#ffb35c)}
  canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
  #overlay{position:absolute;inset:0;pointer-events:none;z-index:3}
  #overlay > *{pointer-events:auto}
  #tools{position:absolute;top:12px;right:12px;z-index:5;display:flex;gap:8px}
  .btn{background:rgba(22,27,34,.72);border:1px solid var(--fp-line);color:#e8e4dc;height:36px;min-width:36px;
    padding:0 12px;border-radius:18px;font:inherit;font-size:13px;cursor:pointer;backdrop-filter:blur(10px);
    -webkit-backdrop-filter:blur(10px);display:inline-flex;align-items:center;gap:6px}
  .btn:hover{border-color:rgba(255,255,255,.2)}
  .btn ha-icon{--mdc-icon-size:18px}
  #panel{display:none;flex-direction:column;position:absolute;z-index:6;top:0;bottom:0;left:0;width:min(400px,46%);
    background:linear-gradient(to right,rgba(10,14,19,.86) calc(100% - 56px),rgba(10,14,19,0));
    --ha-card-background:rgba(255,255,255,.05);--card-background-color:rgba(255,255,255,.05);
    --ha-card-border-color:var(--fp-line);--ha-card-border-radius:14px;
    --primary-text-color:#e8e4dc;--secondary-text-color:var(--fp-dim)}
  #wrap.room #panel{display:flex}
  #wrap.mobile #panel{top:auto;right:0;width:auto;height:52%;
    background:rgba(10,14,19,.9);border-top:1px solid var(--fp-line);border-radius:18px 18px 0 0;
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  #pHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:18px 44px 8px 20px}
  #wrap.mobile #pHead{padding-right:20px}
  #pName{font-size:22px;font-weight:650}
  #pMeta{font-size:11px;color:var(--fp-dim);letter-spacing:.14em;text-transform:uppercase;margin-top:4px}
  #pClose{flex:none;width:34px;height:34px;padding:0;justify-content:center}
  #pList{flex:1;overflow-y:auto;padding:6px 44px 18px 18px;display:grid;gap:8px;align-content:start;
    grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  #wrap.mobile #pList{padding-right:18px}
  #pList .wide{grid-column:1/-1}
  .empty{color:var(--fp-dim);font-size:13px;grid-column:1/-1;padding:6px 2px}
  .row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05);
    border:1px solid var(--fp-line);font-size:13px;cursor:pointer;min-width:0}
  .row .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .row .s{color:var(--fp-dim);white-space:nowrap}
  .row.on .s{color:var(--fp-accent)}
  #err{position:absolute;inset:auto 12px 12px 12px;z-index:7;color:#ffb4a8;font-size:12px;display:none}
`;

const HTML = `
  <ha-card>
    <div id="wrap">
      <canvas id="c" tabindex="0" aria-label="3D floor plan"></canvas>
      <div id="overlay"></div>
      <div id="tools"><button class="btn" id="bHome" title="Overview" aria-label="Overview">⌂</button></div>
      <div id="panel" role="dialog" aria-labelledby="pName">
        <div id="pHead"><div><div id="pName"></div><div id="pMeta"></div></div>
          <button class="btn" id="pClose" aria-label="Close">✕</button></div>
        <div id="pList"></div>
      </div>
      <div id="err"></div>
    </div>
  </ha-card>`;

export class Floorplan3DCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._room = null;
    this._tiles = new Map();      // entity_id → tile element of the open panel
    this._applied = {};           // last values pushed to the scene (avoid redundant work)
  }

  // ------------------------------------------------------------ Lovelace API
  static getStubConfig() {
    return { type: 'custom:floorplan-3d-card', height: '520px', ...JSON.parse(JSON.stringify(DEMO_PLAN)) };
  }

  setConfig(config) {
    const model = normalizeConfig(config);     // throws → Lovelace shows the error card
    const plan = buildPlan(model);
    if (config.theme && !['auto', 'sun', 'dark', 'light'].includes(config.theme))
      throw new Error('floorplan-3d-card: "theme" must be auto, sun, dark or light');
    this._config = config;
    this._model = model;
    this._plan = plan;
    this._teardownScene();
    if (this.isConnected) this._mount();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._scene) this._sync();
    for (const t of this._tiles.values()) t.hass = hass;
  }
  get hass() { return this._hass; }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 'full', rows: 8, min_rows: 5 }; }

  connectedCallback() {
    if (this._config && !this._scene) this._mount();
    else if (this._scene) { this._scene.setActive(!document.hidden); this._observe(); }
  }

  disconnectedCallback() {
    // keep the scene (Lovelace often detaches and re-attaches cards), stop drawing
    if (this._scene) this._scene.setActive(false);
    this._unobserve();
  }

  // ------------------------------------------------------------ mount
  _mount() {
    const root = this.shadowRoot;
    if (!root.getElementById('wrap')) {
      const style = document.createElement('style');
      style.textContent = CSS + (this.extraStyles() || '');
      root.appendChild(style);
      const tpl = document.createElement('template');
      tpl.innerHTML = HTML;
      root.appendChild(tpl.content.cloneNode(true));
      root.getElementById('pClose').onclick = () => this.selectRoom(null);
      root.getElementById('bHome').onclick = () => { this.selectRoom(null); this._scene && this._scene.resetView(); };
    }
    this.$wrap = root.getElementById('wrap');
    this.$panel = root.getElementById('panel');
    this.overlay = root.getElementById('overlay');
    this.$wrap.style.setProperty('--fp-height', this._config.height || '480px');
    const canvas = root.getElementById('c');
    try {
      this._scene = this._createScene(canvas, {
        theme: this.getTheme(),
        autoRotate: !!this._config.auto_rotate,
        labels: this._config.labels !== false,
        onPick: hit => this._onPick(hit),
      });
    } catch (e) {
      this._showError(`3D view not available: ${e.message}`);
      return;
    }
    this._observe();
    if (this._hass) this._sync();
    this.onSceneReady(this._scene);
  }

  /** Builds the 3D scene (tests replace it with a stand-in: there is no WebGL in Node). */
  _createScene(canvas, opts) { return new FloorplanScene(canvas, this._model, this._plan, opts); }

  _teardownScene() {
    this._unobserve();
    if (this._scene) { this._scene.dispose(); this._scene = null; }
    this._applied = {};
    this._closePanel();
    const old = this.shadowRoot.getElementById('c');
    if (old) old.replaceWith(old.cloneNode(false));  // a fresh canvas = a fresh WebGL context
  }

  _observe() {
    if (this._ro || !this.$wrap) return;
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.$wrap);
    this._onVis = () => this._scene && this._scene.setActive(!document.hidden && this.isConnected);
    document.addEventListener('visibilitychange', this._onVis);
    this._resize();
  }

  _unobserve() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._onVis) { document.removeEventListener('visibilitychange', this._onVis); this._onVis = null; }
  }

  _resize() {
    const w = this.$wrap.clientWidth, h = this.$wrap.clientHeight;
    this.$wrap.classList.toggle('mobile', w < MOBILE_W);
    this._scene.setSize(w, h);
    this.refreshInset();
  }

  /** Re-reads getViewInset() and re-frames the plan: call it when your own overlays change size. */
  refreshInset() {
    if (this._scene) this._scene.setInset(this.getViewInset(this._room) || null);
  }

  /** True when the card is narrow and the panel is a bottom drawer. */
  get isMobile() { return !!this.$wrap && this.$wrap.classList.contains('mobile'); }

  _showError(msg) {
    const e = this.shadowRoot.getElementById('err');
    if (e) { e.textContent = msg; e.style.display = 'block'; }
    console.warn('floorplan-3d-card:', msg);
  }


  // ------------------------------------------------------------ live state
  _sync() {
    const hass = this._hass, S = this._scene;
    const theme = this.getTheme();
    if (this._applied.theme !== theme) { this._applied.theme = theme; S.setTheme(theme); }
    for (const room of this._model.rooms) {
      const name = this.roomName(room);
      if (this._applied['n:' + room.id] !== name) { this._applied['n:' + room.id] = name; S.setRoomName(room.id, name); }
      const st = this.getRoomState(room) || {};
      const glowKey = st.glow ? `${st.glow.intensity.toFixed(2)}|${st.glow.color}` : '';
      if (this._applied['g:' + room.id] !== glowKey) {
        this._applied['g:' + room.id] = glowKey;
        S.setRoomGlow(room.id, st.glow ? st.glow.intensity : 0, st.glow && st.glow.color);
      }
      if (this._applied['s:' + room.id] !== (st.sub || null)) {
        this._applied['s:' + room.id] = st.sub || null;
        S.setRoomSubLabel(room.id, st.sub || null);
      }
    }
    for (const op of this._plan.openings) {
      if (op.cover) {
        const k = coverClosed(hass.states[op.cover]);
        if (k !== null && this._applied['c:' + op.id] !== k) { this._applied['c:' + op.id] = k; S.setShutter(op.id, k); }
      }
      if (op.contact) {
        const s = hass.states[op.contact];
        const open = !!s && s.state === 'on';
        if (this._applied['o:' + op.id] !== open) { this._applied['o:' + op.id] = open; S.setOpenAlert(op.id, open); }
      }
    }
    if (this._room) this._refreshPanelMeta();
    this.onHassUpdate(hass);
  }

  /** Entities of the room's HA area (or its explicit `entities:` list), panel order.
   *  Public helper for subclasses; cached until the registries change. */
  areaEntities(room) {
    const hass = this._hass;
    if (!hass) return [];
    const ex = new Set(room.exclude);
    if (room.entities) return room.entities.map(e => (typeof e === 'string' ? e : e && e.entity)).filter(id => id && !ex.has(id));
    if (!room.area || !hass.entities) return [];
    // the registries change rarely: cache the lists until hass.entities/devices are replaced
    if (this._areaCacheKey !== hass.entities || this._areaCacheDev !== hass.devices) {
      this._areaCache = new Map(); this._areaCacheKey = hass.entities; this._areaCacheDev = hass.devices;
    }
    const key = room.area + '|' + room.exclude.join();
    const hit = this._areaCache.get(key);
    if (hit) return hit.filter(id => hass.states[id]);
    const devices = hass.devices || {};
    const out = [];
    for (const [id, ent] of Object.entries(hass.entities)) {
      if (ex.has(id) || ent.hidden || ent.entity_category || !hass.states[id]) continue;
      const area = ent.area_id || (ent.device_id && devices[ent.device_id] ? devices[ent.device_id].area_id : null);
      if (area === room.area) out.push(id);
    }
    const rank = id => { const i = DOMAIN_ORDER.indexOf(id.split('.')[0]); return i < 0 ? 99 : i; };
    out.sort((a, b) => rank(a) - rank(b) || friendly(hass, a).localeCompare(friendly(hass, b)));
    this._areaCache.set(key, out);
    return out;
  }

  /** Sensor of a room for a device class: `temperature:`/`humidity:` of the room (false = none), then the one
   *  chosen for the area in Home Assistant (Settings → Areas), then the area's first one. */
  _roomSensor(room, dc, area) {
    const hass = this._hass;
    const own = room[dc];
    if (own === false) return null;          // `temperature: false`: this room shows none
    if (own) return own;
    const a = room.area && hass.areas && hass.areas[room.area];
    const chosen = a && a[`${dc}_entity_id`];
    if (chosen && hass.states[chosen]) return chosen;
    return area.find(id => id.startsWith('sensor.') && deviceClass(hass, id) === dc);
  }

  /** The room a tap on `id` should open: its part_of parent; null if disabled. */
  _targetRoom(id) {
    let room = this._model.rooms.find(r => r.id === id);
    if (room && room.part_of) room = this._model.rooms.find(r => r.id === room.part_of);
    return room && !room.disabled ? room : null;
  }

  // ------------------------------------------------------------ HOOKS (override in subclasses)
  /** HOOK: display name of a room. */
  roomName(room) {
    if (room.name) return room.name;
    const a = room.area && this._hass && this._hass.areas && this._hass.areas[room.area];
    return a ? a.name : room.id;
  }

  /** HOOK: entity ids listed in the room panel. */
  getRoomEntities(room) {
    return this.areaEntities(room).filter(id => !PANEL_SKIP.has(id.split('.')[0]));
  }

  /** HOOK: overlay values for a room: { glow: {intensity 0..1, color [r,g,b]} | null, sub: string | null }. */
  getRoomState(room) {
    const hass = this._hass;
    const area = this.areaEntities(room);
    const lights = room.lights || area.filter(id => id.startsWith('light.'));
    let n = 0, sum = 0, color = null;
    for (const id of lights) {
      const s = hass.states[id];
      if (!s || s.state !== 'on') continue;
      n++;
      sum += s.attributes.brightness != null ? s.attributes.brightness / 255 : 1;
      if (!color && Array.isArray(s.attributes.rgb_color)) color = s.attributes.rgb_color;
    }
    const glow = n ? { intensity: Math.max(0.25, sum / n), color: color || WARM } : null;
    const temp = this._roomSensor(room, 'temperature', area);
    const hum = this._roomSensor(room, 'humidity', area);
    const parts = [];
    const t = num(hass.states[temp]);
    if (t !== null) parts.push(`${t.toFixed(1)}°`);
    const h = num(hass.states[hum]);
    if (h !== null) parts.push(`${Math.round(h)}%`);
    return { glow, sub: parts.length ? parts.join(' · ') : null };
  }

  /** HOOK: fill the room panel. Default: native tile cards (plain rows outside HA). */
  async renderRoomPanel(room, list) {
    const ids = this.getRoomEntities(room);
    if (!ids.length) {
      list.innerHTML = `<div class="empty">${room.area ? 'No entities in this area.' : 'Set "area" (or "entities") for this room to list its devices.'}</div>`;
      return;
    }
    const helpers = window.loadCardHelpers ? await window.loadCardHelpers().catch(() => null) : null;
    if (this._room !== room.id) return;       // panel changed while loading
    for (const id of ids) {
      let el;
      if (helpers) {
        el = helpers.createCardElement({ type: 'tile', entity: id });
        el.hass = this._hass;
        if (['climate', 'media_player', 'cover'].includes(id.split('.')[0])) el.classList.add('wide');
      } else {
        el = this._plainRow(id);
      }
      this._tiles.set(id, el);
      list.appendChild(el);
    }
  }

  /** HOOK: tap on a window or door. Default: more-info of its cover, else of its contact sensor. */
  onOpeningTap(opening) {
    const id = opening.cover || opening.contact;
    if (id) this.openMoreInfo(id);
  }

  /** HOOK: second line of the panel header. Default: "16.6 m² · 21.4° · 48%". Return '' to hide it. */
  getRoomMeta(room, state) {
    const m2 = Math.abs(polyArea(room.poly)) / 10000;
    return [`${m2.toFixed(1)} m²`, state && state.sub].filter(Boolean).join(' · ');
  }

  /** HOOK: space covered over the 3D view, {left, right, top, bottom} in px, so the plan is
   *  framed in the free area. Default: the room panel (left, or bottom on narrow cards). */
  getViewInset(roomId) {
    if (!roomId || !this.$panel) return null;
    return this.isMobile ? { bottom: this.$panel.offsetHeight } : { left: this.$panel.offsetWidth };
  }

  /** HOOK: 'dark' or 'light'. Default from the `theme` option: auto = Home Assistant's dark mode,
   *  sun = dark after sunset (sun.sun), or a fixed dark / light. Called on every hass update. */
  getTheme() {
    const t = (this._config && this._config.theme) || 'auto';
    if (t === 'dark' || t === 'light') return t;
    const hass = this._hass;
    if (t === 'sun') {
      const s = hass && hass.states['sun.sun'];
      if (s && (s.state === 'below_horizon' || s.state === 'above_horizon')) return s.state === 'below_horizon' ? 'dark' : 'light';
    }
    const dark = hass && hass.themes ? hass.themes.darkMode : true;
    return dark === false ? 'light' : 'dark';
  }

  /** HOOK: called once the 3D scene exists (add objects with scene.addToRoom). */
  onSceneReady(scene) {}  // eslint-disable-line no-unused-vars

  /** HOOK: called after every hass update has been applied to the scene. */
  onHassUpdate(hass) {}   // eslint-disable-line no-unused-vars

  /** HOOK: extra CSS for the shadow root. */
  extraStyles() { return ''; }

  // ------------------------------------------------------------ actions
  /** Opens a room (zoom + panel) or goes back to the overview with null. */
  selectRoom(id) {
    const room = id ? this._targetRoom(id) : null;
    if (!this._scene || (id && !room)) return;
    if (!room) {
      const was = this._room;
      this._closePanel();
      this.refreshInset();
      if (was) this._scene.focusRoom(null);
    } else if (this._room !== room.id) {
      this._openPanel(room);
      this.refreshInset();
      this._scene.focusRoom(room.id);
    }
    this.dispatchEvent(new CustomEvent('floorplan-room-changed', { detail: { room: this._room }, bubbles: true, composed: true }));
  }

  openMoreInfo(entityId) {
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  _onPick(hit) {
    if (!hit) { if (this._room) this.selectRoom(null); return; }
    if (hit.kind === 'room') {
      const room = this._targetRoom(hit.id);
      if (room) this.selectRoom(room.id);
      return;
    }
    const op = hit.opening;
    // a ghosted window belongs to another room: go there first (a room with something to show)
    const rooms = [...new Set(op.rooms.map(id => this._targetRoom(id)).filter(Boolean))];
    if (this._room && rooms.length && !rooms.some(r => r.id === this._room)) {
      const go = rooms.find(r => r.area || r.entities) || rooms[0];
      this.selectRoom(go.id);
      return;
    }
    this.onOpeningTap(op);
  }

  _openPanel(room) {
    this._closePanel();
    this._room = room.id;
    this.$wrap.classList.add('room');
    this.shadowRoot.getElementById('pName').textContent = this.roomName(room);
    this._refreshPanelMeta();
    const list = this.shadowRoot.getElementById('pList');
    list.innerHTML = '';
    Promise.resolve(this.renderRoomPanel(room, list)).catch(e => this._showError(e.message));
  }

  _refreshPanelMeta() {
    const room = this._model.rooms.find(r => r.id === this._room);
    if (!room) return;
    const st = this._hass ? this.getRoomState(room) : null;
    this.shadowRoot.getElementById('pMeta').textContent = this.getRoomMeta(room, st) || '';
  }

  _closePanel() {
    this._room = null;
    this._tiles.clear();
    if (this.$wrap) this.$wrap.classList.remove('room');
    const list = this.shadowRoot.getElementById('pList');
    if (list) list.innerHTML = '';
  }

  _plainRow(id) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<span class="n"></span><span class="s"></span>';
    const draw = hass => {
      const s = hass.states[id];
      row.querySelector('.n').textContent = friendly(hass, id);
      row.querySelector('.s').textContent = s ? `${s.state}${s.attributes.unit_of_measurement ? ' ' + s.attributes.unit_of_measurement : ''}` : 'missing';
      row.classList.toggle('on', !!s && ['on', 'open', 'heat', 'cool', 'playing'].includes(s.state));
    };
    Object.defineProperty(row, 'hass', { set: draw });
    row.onclick = () => this.openMoreInfo(id);
    draw(this._hass);
    return row;
  }
}

// extensions can reach everything from the element class, without importing by path:
//   await customElements.whenDefined('floorplan-3d-card'); const Base = customElements.get('floorplan-3d-card');
Object.assign(Floorplan3DCard, { THREE, FloorplanScene, normalizeConfig, buildPlan, VERSION });

// ------------------------------------------------------------ small helpers
function friendly(hass, id) {
  const s = hass.states[id];
  return (s && s.attributes.friendly_name) || id;
}
function deviceClass(hass, id) {
  const s = hass.states[id];
  return s ? s.attributes.device_class : undefined;
}
function num(s) {
  if (!s) return null;
  const v = parseFloat(s.state);
  return Number.isFinite(v) ? v : null;
}
function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
/** 0 = open … 1 = closed, from a cover state; null when unknown. */
export function coverClosed(s) {
  if (!s || s.state === 'unavailable' || s.state === 'unknown') return null;
  const pos = s.attributes.current_position;
  if (typeof pos === 'number') return 1 - pos / 100;
  if (s.state === 'closed') return 1;
  if (s.state === 'open' || s.state === 'opening' || s.state === 'closing') return 0;
  return null;
}

if (!customElements.get('floorplan-3d-card')) {
  customElements.define('floorplan-3d-card', Floorplan3DCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'floorplan-3d-card',
    name: 'Floorplan 3D Card',
    description: 'Your home in 3D from a few lines of YAML: rooms, live lights, shutters and temperatures.',
    preview: false,
    documentationURL: 'https://github.com/xT4nk/HA-floorplan-3D-card',
  });
  console.info(`%c FLOORPLAN-3D-CARD %c ${VERSION} `, 'background:#ffb35c;color:#2a1606;font-weight:700', 'background:#222;color:#fff');
}
