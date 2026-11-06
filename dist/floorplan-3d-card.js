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
import { normalizeConfig, buildPlan } from './floorplan-geometry.js?v=0.3.0';
import { FloorplanScene, THREE } from './floorplan-scene.js?v=0.3.0';
import { DEMO_PLAN } from './floorplan-demo.js?v=0.3.0';

export { THREE, FloorplanScene, normalizeConfig, buildPlan };
export const VERSION = '0.3.0';

const DOMAIN_ORDER = ['light', 'climate', 'cover', 'fan', 'media_player', 'switch', 'vacuum', 'lock',
  'humidifier', 'water_heater', 'sensor', 'binary_sensor', 'camera', 'scene', 'script', 'button'];
const PANEL_SKIP = new Set(['automation', 'update', 'device_tracker', 'person', 'zone', 'event', 'tts', 'stt',
  'conversation', 'wake_word', 'assist_satellite', 'image', 'todo', 'calendar', 'notify', 'text', 'select', 'number']);
const WARM = [255, 179, 92];
// default room panel: environment sensors as chips, the rest as tiles grouped in sections
const DEFAULT_SECTIONS = [
  { name: 'Lights', domains: ['light'] },
  { name: 'Covers', domains: ['cover'] },
  { name: 'Climate', domains: ['climate', 'fan', 'humidifier', 'water_heater'] },
  { name: 'Media', domains: ['media_player'] },
  { name: 'Vacuum', domains: ['vacuum'] },
  { name: 'Other', domains: ['switch', 'lock', 'camera', 'scene', 'script', 'button'] },
  { name: 'Sensors', domains: ['sensor', 'binary_sensor'] },
];
const CHIP_CLASSES = { sensor: ['temperature', 'humidity', 'illuminance'],
  binary_sensor: ['motion', 'occupancy', 'door', 'window', 'moisture'] };
const TILE_FEATURES = {
  light: [{ type: 'light-brightness' }],
  cover: [{ type: 'cover-open-close' }],
  climate: [{ type: 'target-temperature' }],
  vacuum: [{ type: 'vacuum-commands', commands: ['start_pause', 'return_home'] }],
  fan: [{ type: 'fan-speed' }],
};
const TEXT = {
  no_entities: 'No entities in this area.',
  no_area: 'Set "area" (or "entities") for this room to list its devices.',
  all_lights: 'All lights of the room',
};
const WIDE_DOMAINS = new Set(['cover', 'climate', 'vacuum']);
const ON_STATES = new Set(['on', 'open', 'opening', 'playing', 'cleaning', 'returning',
  'heat', 'cool', 'heat_cool', 'auto', 'fan_only', 'dry', 'unlocked']);
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
  #panel{display:none;flex-direction:column;position:absolute;z-index:6;top:0;bottom:0;left:0;width:min(460px,48%);
    background:linear-gradient(to right,rgba(10,14,19,.84) calc(100% - 64px),rgba(10,14,19,0));
    --ha-card-background:rgba(255,255,255,.05);--card-background-color:rgba(255,255,255,.05);
    --ha-card-border-color:var(--fp-line);--ha-card-border-radius:14px;
    --primary-text-color:#e8e4dc;--secondary-text-color:var(--fp-dim)}
  #wrap.room #panel{display:flex}
  #wrap.mobile #panel{top:auto;right:0;width:auto;max-height:52%;padding-top:6px;
    background:linear-gradient(to top,rgba(10,14,19,.9) calc(100% - 48px),rgba(10,14,19,0))}
  #pHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:20px 28px 8px 22px}
  #pName{font-size:24px;font-weight:650;letter-spacing:.01em}
  #pMeta{font-size:11px;color:var(--fp-dim);letter-spacing:.14em;text-transform:uppercase;margin-top:4px}
  #pMeta:empty{display:none}
  #pClose{flex:none;width:34px;height:34px;padding:0;justify-content:center;border-radius:50%;
    background:rgba(255,255,255,.04);color:var(--fp-dim);font-size:15px}
  #pChips{display:flex;flex-wrap:wrap;gap:8px;padding:8px 28px 2px 22px}
  #pChips:empty{display:none}
  #pList{flex:1;overflow-y:auto;padding:6px 28px 16px 22px;overscroll-behavior:contain;scrollbar-width:none}
  #pList::-webkit-scrollbar{display:none}
  .chip{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#e8e4dc;
    background:rgba(255,255,255,.07);border:1px solid var(--fp-line);border-radius:999px;
    padding:8px 13px;cursor:pointer;white-space:nowrap}
  .chip ha-state-icon{--mdc-icon-size:18px;color:var(--fp-dim)}
  .chip.on ha-state-icon{color:var(--fp-accent)}
  .sec{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11.5px;font-weight:600;
    letter-spacing:.08em;text-transform:uppercase;color:var(--fp-dim);padding:14px 6px 8px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .grid > *{min-width:0}
  .grid .wide,.grid .row{grid-column:1 / -1}
  #wrap.mobile .grid{grid-template-columns:1fr}
  .gtog{position:relative;width:40px;height:22px;flex:none;cursor:pointer;display:inline-block}
  .gtog input{opacity:0;width:0;height:0;position:absolute}
  .gtog .kn{position:absolute;inset:0;background:#3a4350;border-radius:999px;transition:background .2s}
  .gtog .kn::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;
    background:#cfd6de;transition:transform .2s}
  .gtog input:checked + .kn{background:var(--fp-accent)}
  .gtog input:checked + .kn::after{transform:translateX(18px)}
  .gtog input:focus-visible + .kn{outline:2px solid var(--fp-accent);outline-offset:2px}
  .fp-in{opacity:0;transform:translateY(14px);animation:fp-in .42s cubic-bezier(.22,.9,.32,1) forwards}
  @keyframes fp-in{to{opacity:1;transform:none}}
  @media (prefers-reduced-motion: reduce){ .fp-in{animation:none;opacity:1;transform:none} }
  .empty{color:var(--fp-dim);font-size:12px;line-height:1.5;padding:14px 16px}
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
        <div id="pChips"></div>
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
    this._panelLive = [];         // elements of the open panel that get every hass update
    this._panelSeq = 0;           // bumped on every panel change (async renders check it)
    this._enterN = 0;             // entry-animation counter of the open panel
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
    if (config.sections !== undefined && (!Array.isArray(config.sections) || config.sections.some(sec =>
      !sec || typeof sec.name !== 'string' || !Array.isArray(sec.domains) || !sec.domains.length)))
      throw new Error('floorplan-3d-card: "sections" must be a list of { name, domains: [domain, …] }');
    this._config = config;
    this._model = model;
    this._plan = plan;
    this._teardownScene();
    if (this.isConnected) this._mount();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._scene) this._sync();
    this.refreshPanel();
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

  /** HOOK: fill the room panel. Default: environment sensors as chips, then renderPanelTop(), then the
   *  entities in sections (the `sections` option), each one from createPanelTile() or a native tile card. */
  async renderRoomPanel(room, list) {
    const seq = this._panelSeq;
    const ids = this.getRoomEntities(room);
    const chipIds = ids.filter(id => this.isPanelChip(id));
    const chips = this.shadowRoot.getElementById('pChips');
    for (const id of chipIds) chips.appendChild(this._panelAdd(this._chip(id)));
    for (const el of this.renderPanelTop(room) || []) if (el) list.appendChild(this._panelAdd(el));
    if (!ids.length) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = this.getText(room.area || room.entities ? 'no_entities' : 'no_area');
      list.appendChild(p);
      return;
    }
    const helpers = await this._cardHelpers();
    if (seq !== this._panelSeq) return;       // the panel changed while loading
    const rest = ids.filter(id => !chipIds.includes(id));
    for (const sec of this._config.sections || DEFAULT_SECTIONS) {
      const secIds = rest.filter(id => sec.domains.includes(id.split('.')[0]));
      const head = secIds.length && this._sectionHead(sec, secIds);
      const tiles = [];
      for (const id of secIds) {
        const t = this.createPanelTile(id, room);
        if (t === false) continue;
        tiles.push(t || this._nativeTile(id, helpers));
      }
      if (!tiles.length) continue;
      const grid = document.createElement('div');
      grid.className = 'grid';
      list.appendChild(this._panelAdd(head));
      for (const t of tiles) grid.appendChild(this._panelAdd(t));
      list.appendChild(grid);
    }
  }

  /** HOOK: true when an entity goes in the chips row at the top of the panel instead of a section.
   *  Default: temperature, humidity and illuminance sensors; motion, occupancy, door, window, moisture. */
  isPanelChip(id) {
    const cls = CHIP_CLASSES[id.split('.')[0]];
    return !!cls && cls.includes(deviceClass(this._hass, id));
  }

  /** HOOK: texts of the panel, by key: no_entities, no_area, all_lights (section names: `sections` option). */
  getText(key) { return TEXT[key] || key; }

  /** HOOK: elements placed above the sections (called first on every render). Default: none. */
  renderPanelTop(room) { return []; }   // eslint-disable-line no-unused-vars

  /** HOOK: the element for one entity of the panel: an element, null for the default tile card,
   *  false to leave the entity out. An element with a `hass` setter gets every hass update. */
  createPanelTile(id, room) { return null; }   // eslint-disable-line no-unused-vars

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

  /** Pushes the current hass to every live element of the open panel again (after a local change). */
  refreshPanel() {
    for (const el of this._panelLive) {
      try { el.hass = this._hass; } catch (e) { console.error('floorplan-3d-card: panel update', e); }
    }
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
    const root = this.shadowRoot;
    root.getElementById('pName').textContent = this.roomName(room);
    this._refreshPanelMeta();
    this._enterN = 0;
    const head = root.getElementById('pHead');
    head.classList.remove('fp-in');
    void head.offsetWidth;                    // restart the entry animation on every room change
    this._enter(head);
    const list = root.getElementById('pList');
    const seq = this._panelSeq;
    Promise.resolve(this.renderRoomPanel(room, list))
      .then(() => { if (seq === this._panelSeq) this.refreshInset(); })   // a bottom drawer sizes to its content
      .catch(e => this._showError(e.message));
  }

  /** Registers a panel element: entry animation (a .grid tile by tile) and, with a `hass` setter, live updates. */
  _panelAdd(el) {
    if (el.classList && el.classList.contains('grid')) for (const c of el.children) this._enter(c);
    else this._enter(el);
    if ('hass' in el) {
      this._panelLive.push(el);
      if (this._hass) el.hass = this._hass;
    }
    return el;
  }

  _enter(el) {
    if (!el.classList) return;
    el.classList.add('fp-in');
    el.style.animationDelay = (0.02 + Math.min(this._enterN++, 18) * 0.04).toFixed(2) + 's';
  }

  _cardHelpers() {
    if (!this._helpers) this._helpers = window.loadCardHelpers ? window.loadCardHelpers().catch(() => null) : Promise.resolve(null);
    return this._helpers;
  }

  _sectionHead(sec, ids) {
    const head = document.createElement('div');
    head.className = 'sec';
    const t = document.createElement('span');
    t.textContent = sec.name;
    head.appendChild(t);
    const lights = ids.filter(id => id.startsWith('light.'));
    if (lights.length && lights.length === ids.length) {
      // one switch for every light of the room
      const lab = document.createElement('label');
      lab.className = 'gtog';
      lab.setAttribute('aria-label', this.getText('all_lights'));
      const input = document.createElement('input');
      input.type = 'checkbox';
      const kn = document.createElement('span');
      kn.className = 'kn';
      lab.append(input, kn);
      input.onchange = () => this._hass && this._hass.callService('light', input.checked ? 'turn_on' : 'turn_off', { entity_id: lights });
      head.appendChild(lab);
      Object.defineProperty(head, 'hass', { configurable: true, set: hass => {
        input.checked = !!hass && lights.some(id => hass.states[id] && hass.states[id].state === 'on');
      } });
    }
    return head;
  }

  _chip(id) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    const icon = document.createElement('ha-state-icon');
    const val = document.createElement('span');
    chip.append(icon, val);
    chip.onclick = () => this.openMoreInfo(id);
    Object.defineProperty(chip, 'hass', { configurable: true, set: hass => {
      const s = hass && hass.states[id];
      if (!s) return;
      icon.hass = hass;
      icon.stateObj = s;
      val.textContent = formatState(hass, s);
      chip.classList.toggle('on', ON_STATES.has(s.state));
    } });
    return chip;
  }

  _nativeTile(id, helpers) {
    const dom = id.split('.')[0];
    if (helpers) {
      try {
        const cfg = { type: 'tile', entity: id };
        if (TILE_FEATURES[dom]) cfg.features = TILE_FEATURES[dom];
        const card = helpers.createCardElement(cfg);
        const cell = document.createElement('div');
        if (WIDE_DOMAINS.has(dom)) cell.className = 'wide';
        cell.appendChild(card);
        Object.defineProperty(cell, 'hass', { configurable: true, set: hass => { card.hass = hass; } });
        return cell;
      } catch (e) { /* plain row below */ }
    }
    return this._plainRow(id);
  }

  _refreshPanelMeta() {
    const room = this._model.rooms.find(r => r.id === this._room);
    if (!room) return;
    const st = this._hass ? this.getRoomState(room) : null;
    this.shadowRoot.getElementById('pMeta').textContent = this.getRoomMeta(room, st) || '';
  }

  _closePanel() {
    this._room = null;
    this._panelSeq++;
    this._panelLive = [];
    if (this.$wrap) this.$wrap.classList.remove('room');
    for (const id of ['pList', 'pChips']) {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.innerHTML = '';
    }
  }

  _plainRow(id) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<span class="n"></span><span class="s"></span>';
    const draw = hass => {
      const s = hass.states[id];
      row.querySelector('.n').textContent = friendly(hass, id);
      row.querySelector('.s').textContent = s ? formatState(hass, s) : 'missing';
      row.classList.toggle('on', !!s && ON_STATES.has(s.state));
    };
    Object.defineProperty(row, 'hass', { configurable: true, set: draw });
    row.onclick = () => this.openMoreInfo(id);
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
/** State as Home Assistant shows it (translated, with unit); raw state + unit outside HA. */
function formatState(hass, s) {
  try { if (hass.formatEntityState) return hass.formatEntityState(s); } catch (e) { /* raw below */ }
  const u = s.attributes.unit_of_measurement;
  return s.state + (u ? ' ' + u : '');
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
