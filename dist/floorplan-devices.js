/* Floorplan 3D Card — device tiles and popups (lights and covers in 0.4.0).
 *
 * A mixin, so any card can have them: `class MyCard extends DeviceTiles(HTMLElement)`. The host gives
 * `this._hass`, a shadow root with an element `#fpPop` for the popups, and calls `_dtHass()` from its
 * `set hass` (see floorplan-3d-card.js). Everything is in English; states come from Home Assistant
 * (`hass.formatEntityState`, translated) and the card's own words from getText(key) (override it to
 * translate them).
 *
 * Optimistic state: many devices (cloud shutters, IR climate) report back late, so a tap applies a patch
 * on top of the real state right away; the patch goes when the real state catches up, or after a timeout.
 */

export const DEVICE_TEXT = {
  // null = the state as Home Assistant shows it (translated); override with your own words
  light_on: null, light_off: null, cover_open: null, cover_closed: null, cover_opening: null, cover_closing: null,
  light_on_pct: '{state} · {pct}%',
  cover_open_pct: '{state} · {pct}%',
  open: 'Open', close: 'Close',
  more_info: 'Settings', close_popup: 'Close', toggle: 'Turn on or off',
  unavailable: 'Unavailable', battery_low: 'Battery low', battery_low_pct: 'Battery low ({pct}%)', problem: 'Problem',
};

export const DEVICE_CSS = `
  [hidden]{display:none !important}
  .ct{background:linear-gradient(155deg,rgba(255,255,255,.085),rgba(255,255,255,.03));
    border:1px solid var(--fp-line);border-radius:16px;padding:12px 13px;position:relative;
    overflow:hidden;cursor:pointer;backdrop-filter:blur(10px)}
  .ct::before{content:'';position:absolute;top:0;left:0;right:45%;height:46%;
    background:linear-gradient(180deg,rgba(255,255,255,.08),transparent);pointer-events:none}
  .ct .ctr{display:flex;align-items:center;gap:11px;position:relative}
  .ct .cic{width:40px;height:40px;border-radius:50%;flex:none;display:flex;align-items:center;
    justify-content:center;background:rgba(255,255,255,.07);transition:.2s;cursor:pointer}
  .ct .cic:hover{background:rgba(255,255,255,.13)}
  .ct .cic:active{transform:scale(.92)}
  .ct .cic ha-icon{--mdc-icon-size:21px;color:var(--fp-dim)}
  .ct.on .cic{background:radial-gradient(circle at 36% 30%,rgba(255,205,145,.5),rgba(255,179,92,.2));
    box-shadow:0 0 14px rgba(255,179,92,.35)}
  .ct.on .cic ha-icon{color:var(--fp-accent)}
  .ct .cmeta{min-width:0;flex:1}
  .ct .cnm{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ct .cstt{font-size:11.5px;color:var(--fp-dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ct.on .cstt{color:var(--fp-accent)}
  .ct .cbar{height:28px;border-radius:10px;background:rgba(255,255,255,.08);margin-top:11px;
    position:relative;overflow:hidden;touch-action:none;cursor:ew-resize}
  .ct .cbar i{position:absolute;inset:0;width:0;background:linear-gradient(90deg,rgba(255,205,145,.6),rgba(255,179,92,.36))}
  .ct .cbar span{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;color:#fff;font-weight:700}
  .ct .cb{display:flex;gap:6px;margin-top:11px}
  .ct .cb button{flex:1;height:32px;border:1px solid rgba(255,255,255,.1);border-radius:9px;
    background:rgba(255,255,255,.06);color:var(--fp-txt);font-size:13px;font-weight:600;cursor:pointer;
    display:flex;align-items:center;justify-content:center}
  .ct .cb button:hover{background:rgba(255,255,255,.12)}
  .ct .cb button ha-icon{--mdc-icon-size:19px}
  .cpop{position:absolute;inset:0;z-index:20;display:none;align-items:center;justify-content:center;
    padding:20px;background:rgba(6,9,13,.55);backdrop-filter:blur(3px)}
  .cpop.show{display:flex}
  .cpc{width:330px;max-width:100%;max-height:100%;overflow-y:auto;scrollbar-width:none;
    border-radius:26px;border:1px solid rgba(255,255,255,.2);
    background:linear-gradient(170deg,rgba(34,40,49,.94),rgba(20,25,32,.96));
    backdrop-filter:blur(30px) saturate(150%);box-shadow:0 36px 80px rgba(0,0,0,.55);
    position:relative;animation:cpop-in .26s cubic-bezier(.22,.9,.32,1)}
  .cpc::-webkit-scrollbar{display:none}
  @keyframes cpop-in{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
  .cph{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 6px}
  .cph .cn{font-size:17px;font-weight:650;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cph .ca{display:flex;gap:8px}
  .cph .ca button{width:33px;height:33px;border-radius:50%;background:rgba(255,255,255,.07);
    border:1px solid rgba(255,255,255,.08);color:var(--fp-dim);cursor:pointer;
    display:flex;align-items:center;justify-content:center}
  .cph .ca button:hover{color:var(--fp-txt)}
  .cph .ca button.act{color:var(--fp-accent);background:rgba(255,179,92,.18);border-color:rgba(255,179,92,.3)}
  .cph .ca button ha-icon{--mdc-icon-size:17px}
  .lctl{min-height:256px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;width:100%}
  .cvs.kelv{background:linear-gradient(0deg,#ff9d3c,#fff1dd 50%,#bcd8ff)}
  .lc-color{display:flex;flex-direction:column;align-items:center;gap:16px}
  .cpb{padding:14px 18px 22px;display:flex;flex-direction:column;align-items:center;gap:16px}
  .cbig{font-size:40px;font-weight:710;letter-spacing:-.02em;text-align:center;line-height:1}
  .cbig small{display:block;font-size:11px;color:var(--fp-dim);font-weight:500;letter-spacing:.06em;margin-top:6px}
  .cvs{width:96px;height:250px;border-radius:26px;position:relative;overflow:hidden;cursor:ns-resize;
    background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);touch-action:none}
  .cvs .fill{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(180deg,#ffdcab,#ffb35c)}
  .cvs .hd{position:absolute;left:50%;transform:translate(-50%,50%);width:36px;height:4px;border-radius:9px;
    background:rgba(255,255,255,.9);bottom:0}
  .ckel{width:100%;height:26px;border-radius:13px;position:relative;cursor:ew-resize;touch-action:none;
    background:linear-gradient(90deg,#ffb15a,#fff1dd,#cfe3ff)}
  .ckel i{position:absolute;inset:0;width:0}
  .ckel .hd{position:absolute;top:50%;left:0;transform:translate(-50%,-50%);width:6px;height:30px;
    border-radius:6px;background:#fff;box-shadow:0 0 6px rgba(0,0,0,.4)}
  .cseg{display:flex;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
    border-radius:14px;padding:5px;width:100%}
  .cseg button{flex:1;height:40px;border:none;border-radius:10px;background:transparent;color:var(--fp-dim);
    font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center}
  .cseg button ha-icon{--mdc-icon-size:20px}
  .cseg button.act{background:rgba(255,255,255,.12);color:#fff}
  .cseg button:disabled{opacity:.4;cursor:default}
  .cseg.amber button.act{background:linear-gradient(180deg,rgba(255,205,145,.36),rgba(255,179,92,.24))}
  .cdots{display:flex;gap:11px;justify-content:center;flex-wrap:wrap;width:100%}
  .cdot{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.16);cursor:pointer}
  .cwheel{width:190px;height:190px;border-radius:50%;position:relative;cursor:pointer;touch-action:none;
    background:conic-gradient(red,#ff0,#0f0,#0ff,#00f,#f0f,red)}
  .cwheel::before{content:'';position:absolute;inset:32%;border-radius:50%;background:rgba(20,25,32,.92)}
  .cwheel .kn{position:absolute;width:18px;height:18px;border-radius:50%;border:3px solid #fff;
    box-shadow:0 0 6px rgba(0,0,0,.5);transform:translate(-50%,-50%);left:87%;top:50%}
  .cshut{width:118px;height:250px;border-radius:18px;position:relative;overflow:hidden;cursor:ns-resize;
    background:#0c1014;border:1px solid rgba(255,255,255,.12);touch-action:none}
  .cshut .slats{position:absolute;left:0;right:0;top:0;height:0;
    background:repeating-linear-gradient(180deg,#94815f 0 7px,#806f54 7px 9px);box-shadow:0 5px 12px rgba(0,0,0,.45)}
  .cshut .cass{position:absolute;left:0;right:0;top:0;height:10px;background:#4a4136;z-index:1}
  .cshut .sky{position:absolute;inset:0;background:linear-gradient(180deg,#1d2c3d,#2e4a62)}
  .cbtns{display:flex;gap:8px;width:100%}
  .cbtns button{flex:1;min-height:46px;padding:8px 6px;border:1px solid rgba(255,255,255,.1);border-radius:12px;
    background:rgba(255,255,255,.06);color:var(--fp-txt);cursor:pointer;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:3px}
  .cbtns button:hover{background:rgba(255,255,255,.12)}
  .cbtns button ha-icon{--mdc-icon-size:24px}
  .cbtns button b{font-size:11.5px;font-weight:600;letter-spacing:.01em}
  @keyframes btnSent{0%{box-shadow:0 0 0 0 rgba(255,179,92,.55)}70%{box-shadow:0 0 0 9px rgba(255,179,92,0)}
    100%{box-shadow:0 0 0 9px rgba(255,179,92,0)}}
  button.sent{animation:btnSent .55s ease-out}
  .cbtns button:active,.cseg.amber button:active{transform:scale(.96)}
  .ct .cb button:active{transform:scale(.94);background:rgba(255,255,255,.16)}
  .ct .alert{--mdc-icon-size:20px;color:#ff6b6b;flex:none}
  .vwarn{width:100%;display:flex;flex-direction:column;gap:6px}
  .vwarn div{background:rgba(255,107,107,.14);border:1px solid rgba(255,107,107,.3);color:#ffb4b4;
    border-radius:10px;padding:8px 12px;font-size:12.5px}
  @media (max-width:640px){ .cpc{width:330px} .cvs,.cshut{height:220px} }
    box-shadow:0 0 14px rgba(127,184,232,.35)}
    box-shadow:0 0 14px rgba(255,130,100,.4)}
  .cpwarn{margin:10px 18px 0;width:auto}
  .cbig small{text-transform:uppercase}
`;

const COLOR_MODES = ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'];

export const DeviceTiles = Base => class extends Base {
  // ------------------------------------------------------------ HOOKS
  /** HOOK: card words by key (DEVICE_TEXT); null = the state as Home Assistant shows it. */
  getText(key) {
    if (key in DEVICE_TEXT) return DEVICE_TEXT[key];
    return super.getText ? super.getText(key) : key;
  }

  /** HOOK: lights shown and driven as one: { name, icon, entities: [...] } or null. */
  deviceGroup(id) { return null; }   // eslint-disable-line no-unused-vars

  // ------------------------------------------------------------ public
  /** A tile for an entity (light, cover), or null when the domain has none. Returns an element with
   *  a `hass` setter; the host pushes every hass update to it. */
  createDeviceTile(id) {
    const dom = id.split('.')[0];
    let t = null;
    if (dom === 'light') {
      const g = this.deviceGroup(id);
      const ids = g ? g.entities.filter(e => this._hass && this._hass.states[e]) : [id];
      if (!ids.length) return null;
      t = this._dtLightTile({ ids, rep: ids[0], name: g && g.name, icon: g && g.icon });
    } else if (dom === 'cover') t = this._dtCoverTile(id);
    if (!t) return null;
    Object.defineProperty(t.cell, 'hass', { configurable: true, set: () => t.update() });
    return t.cell;
  }

  /** Opens the popup of an entity (light, cover); other domains, and plain on/off lights, get more-info. */
  openDevicePopup(id) {
    const h = this._hass, dom = id.split('.')[0];
    if (!h || !h.states[id]) { this._dtMoreInfo(id); return; }
    if (dom === 'light') {
      const g = this.deviceGroup(id);
      const ids = g ? g.entities.filter(e => h.states[e]) : [id];
      const target = { ids, rep: ids[0] || id, name: g && g.name, icon: g && g.icon };
      const a = h.states[target.rep].attributes, modes = a.supported_color_modes || [];
      if (!this._dtDimmable(h.states[target.rep]) && !modes.includes('color_temp') && !modes.some(m => COLOR_MODES.includes(m))) {
        this._dtMoreInfo(target.rep);             // on/off only: the native dialog has the toggle
        return;
      }
      this._dtShowPopup(target.rep, card => this._dtLightPopup(target, card), () => this._dtWarnFor(target.ids));
    } else if (dom === 'cover') {
      this._dtShowPopup(id, card => this._dtCoverPopup(id, card), () => this._dtWarnFor([id]));
    } else this._dtMoreInfo(id);
  }

  closeDevicePopup() {
    const pop = this._dtPopEl();
    if (pop) { pop.classList.remove('show'); pop.innerHTML = ''; pop.onclick = null; }
    this._dtPopup = null;
  }

  /** Redraws the tiles and the open popup from the current (real + optimistic) state. */
  refreshDevices() {
    if (this.refreshPanel) this.refreshPanel();
    this._dtUpdatePopup();
  }

  // ------------------------------------------------------------ host glue
  /** Call from `set hass`, before pushing hass to the tiles: drops optimistic patches the real state reached. */
  _dtHass() { this._dtPrune(); }
  _dtUpdatePopup() {
    const p = this._dtPopup;
    if (!p) return;
    try { p.update(); this._dtRenderWarn(); } catch (e) { console.error('floorplan-3d-card: popup update', e); }
  }
  _dtPopEl() { return this.shadowRoot && this.shadowRoot.getElementById('fpPop'); }
  _dtMoreInfo(id) {
    if (this.openMoreInfo) this.openMoreInfo(id);
    else this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true }));
  }
  _dtT(key, vars) {
    let t = this.getText(key);
    if (t == null) return null;
    for (const k in vars || {}) t = t.split('{' + k + '}').join(vars[k]);
    return t;
  }
  /** Label of a state: the card's own word when set (getText), else Home Assistant's. */
  _dtLabel(key, st) {
    const own = this._dtT(key);
    if (own != null) return own;
    try { if (this._hass.formatEntityState) return this._hass.formatEntityState(st); } catch (e) { /* raw below */ }
    return st.state;
  }

  // ------------------------------------------------------------ services and optimistic state
  _dtSvc(domain, service, data) { if (this._hass) this._hass.callService(domain, service, data); }
  _dtSt(id) {
    const real = this._hass && this._hass.states[id];
    const o = real && this._dtOpt && this._dtOpt[id];
    if (!o) return real;
    return { ...real, state: o.state != null ? o.state : real.state, attributes: { ...real.attributes, ...o.attributes } };
  }
  _dtOptSet(id, patch, ttl) {
    if (!this._hass || !this._hass.states[id]) return;
    this._dtOpt = this._dtOpt || {};
    const cur = this._dtOpt[id];
    this._dtOpt[id] = { state: patch.state !== undefined ? patch.state : (cur ? cur.state : undefined),
      attributes: Object.assign({}, cur && cur.attributes, patch.attributes), t: Date.now(), ttl: ttl || 15000 };
    this.refreshDevices();
  }
  _dtOptClear(id) {
    if (this._dtOpt) delete this._dtOpt[id];
    this.refreshDevices();
  }
  _dtPrune() {
    const o = this._dtOpt;
    if (!o) return;
    const now = Date.now(), h = this._hass;
    for (const id in o) {
      const e = o[id], real = h && h.states[id];
      let done = !real;
      if (real) {
        const ak = Object.keys(e.attributes);
        if (ak.length) done = ak.every(k => real.attributes[k] === e.attributes[k]);
        else done = e.state === undefined || real.state === e.state;
      }
      if (done || now - e.t > e.ttl) delete o[id];
    }
  }
  /** Calls the service and applies the optimistic patch right away. */
  _dtCmd(domain, service, data, opt, ttl) {
    this._dtSvc(domain, service, data);
    if (opt && data && typeof data.entity_id === 'string') this._dtOptSet(data.entity_id, opt, ttl);
  }

  // ------------------------------------------------------------ small helpers
  _dtDimmable(st) {
    const m = (st && st.attributes.supported_color_modes) || [];
    return m.some(x => x !== 'onoff');
  }
  /** Icon and halo in the light's real colour; rgb null = back to the CSS accent. */
  _dtTint(cic, ic, rgb) {
    if (Array.isArray(rgb) && rgb.length === 3) {
      const c = rgb.join(',');
      if (ic) ic.style.color = `rgb(${c})`;
      if (cic) { cic.style.background = `radial-gradient(circle at 36% 30%,rgba(${c},.5),rgba(${c},.2))`; cic.style.boxShadow = `0 0 14px rgba(${c},.4)`; }
    } else {
      if (ic) ic.style.color = '';
      if (cic) { cic.style.background = ''; cic.style.boxShadow = ''; }
    }
  }
  /** Linear drag: onMove(frac) redraws, onCommit(frac) calls the service (throttled, and on release). */
  _dtTrack(el, axis, onMove, onCommit) {
    const calc = e => {
      const r = el.getBoundingClientRect();
      const f = axis === 'y' ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
      return Math.max(0, Math.min(1, f));
    };
    let on = false, last = 0;
    const move = e => {
      if (!on) return;
      e.preventDefault();
      const f = calc(e);
      onMove(f);
      const n = Date.now();
      if (n - last > 150) { last = n; onCommit(f); }
    };
    const up = e => {
      if (!on) return;
      on = false; el._drag = false; onCommit(calc(e));
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointerdown', e => {
      e.stopPropagation(); on = true; el._drag = true; onMove(calc(e));
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
  }
  /** "Command sent": a short pulse on the button. */
  _dtPress(btn) {
    if (!btn) return;
    btn.classList.remove('sent'); void btn.offsetWidth; btn.classList.add('sent');
    setTimeout(() => btn.classList.remove('sent'), 600);
  }

  // ------------------------------------------------------------ warnings (the red triangle)
  /** device → entities that can raise a warning (battery, problem); rebuilt when the registry changes. */
  _dtWarnIndex() {
    const h = this._hass;
    if (this._dtWiRef === h.entities && this._dtWi) return this._dtWi;
    const byDev = {};
    for (const eid in (h.entities || {})) {
      const e = h.entities[eid];
      if (!e.device_id || e.hidden || e.disabled_by) continue;
      const st = h.states[eid];
      if (!st) continue;
      const dc = st.attributes.device_class;
      if (dc === 'battery' || dc === 'problem') (byDev[e.device_id] = byDev[e.device_id] || []).push({ eid, dc });
    }
    this._dtWiRef = h.entities; this._dtWi = byDev;
    return byDev;
  }
  /** Warnings for a set of entities: unavailable, low battery, problem (from their devices). */
  _dtWarnFor(ids) {
    const h = this._hass;
    if (!h) return [];
    const w = [];
    for (const id of ids) { const st = h.states[id]; if (!st || st.state === 'unavailable') w.push(this._dtT('unavailable')); }
    const idx = this._dtWarnIndex(), devs = new Set();
    for (const id of ids) { const e = h.entities && h.entities[id]; if (e && e.device_id) devs.add(e.device_id); }
    for (const dev of devs) {
      for (const { eid, dc } of (idx[dev] || [])) {
        const s = h.states[eid];
        if (!s) continue;
        if (dc === 'battery') {
          if (eid.startsWith('binary_sensor.') && s.state === 'on') w.push(this._dtT('battery_low'));
          else if (eid.startsWith('sensor.') && !isNaN(+s.state) && +s.state <= 15) w.push(this._dtT('battery_low_pct', { pct: Math.round(+s.state) }));
        } else if (dc === 'problem' && s.state === 'on') w.push(s.attributes.friendly_name || this._dtT('problem'));
      }
    }
    return [...new Set(w)];
  }
  _dtRenderWarn() {
    const p = this._dtPopup;
    if (!p || !p.warnEl) return;
    const ws = p.warnFn();
    p.warnEl.hidden = !ws.length;
    p.warnEl.innerHTML = '';
    for (const x of ws) { const d = document.createElement('div'); d.textContent = '⚠️ ' + x; p.warnEl.appendChild(d); }
  }

  // ------------------------------------------------------------ tiles
  /** target: { ids: [...], rep, name?, icon? } — one light or a group driven as one. */
  _dtLightTile(target) {
    const ids = target.ids, rep = target.rep;
    const anyOn = () => ids.some(i => this._hass.states[i] && this._hass.states[i].state === 'on');
    const cell = document.createElement('div');
    const el = document.createElement('div');
    el.className = 'ct light';
    el.innerHTML = `<div class="ctr">
        <div class="cic" role="button" tabindex="0"><ha-icon icon="mdi:lightbulb"></ha-icon></div>
        <div class="cmeta"><div class="cnm"></div><div class="cstt"></div></div>
        <ha-icon class="alert" icon="mdi:alert" hidden></ha-icon>
      </div>
      <div class="cbar" hidden><i></i><span></span></div>`;
    cell.appendChild(el);
    const nm = el.querySelector('.cnm'), stt = el.querySelector('.cstt'), alert = el.querySelector('.alert'),
      cic = el.querySelector('.cic'), ic = el.querySelector('.cic ha-icon'),
      bar = el.querySelector('.cbar'), fill = bar.querySelector('i'), pct = bar.querySelector('span');
    cic.setAttribute('aria-label', this._dtT('toggle'));
    // body → popup; icon → on/off
    el.addEventListener('click', () => this.openDevicePopup(rep));
    cic.addEventListener('click', e => { e.stopPropagation(); this._dtSvc('light', anyOn() ? 'turn_off' : 'turn_on', { entity_id: ids }); });
    this._dtTrack(bar, 'x',
      f => { fill.style.width = (f * 100) + '%'; pct.textContent = Math.round(f * 100) + '%'; },
      f => {
        const p = Math.round(f * 100);
        if (p <= 0) this._dtSvc('light', 'turn_off', { entity_id: ids });
        else this._dtSvc('light', 'turn_on', { entity_id: ids, brightness_pct: p });
      });
    bar.addEventListener('click', e => e.stopPropagation());
    const update = () => {
      const st = this._hass && this._hass.states[rep];
      if (!st) return;
      const on = anyOn(), dim = this._dtDimmable(st);
      el.classList.toggle('on', on);
      nm.textContent = target.name || st.attributes.friendly_name || rep;
      ic.setAttribute('icon', target.icon || st.attributes.icon || 'mdi:lightbulb');
      this._dtTint(cic, ic, on ? st.attributes.rgb_color : null);
      const word = this._dtLabel(on ? 'light_on' : 'light_off', { ...st, state: on ? 'on' : 'off' });
      bar.hidden = !dim;
      if (dim) {
        const b = on ? Math.round(((st.attributes.brightness || 0) / 255) * 100) : 0;
        if (!bar._drag) { fill.style.width = b + '%'; pct.textContent = on ? b + '%' : '—'; }
        stt.textContent = on ? this._dtT('light_on_pct', { state: word, pct: b }) : word;
      } else stt.textContent = word;
      const ws = this._dtWarnFor(ids);
      alert.hidden = !ws.length; alert.title = ws.join(' · ');
    };
    return { cell, update };
  }

  _dtCoverTile(id) {
    const cell = document.createElement('div');
    cell.className = 'wide';
    const el = document.createElement('div');
    el.className = 'ct cover';
    el.innerHTML = `<div class="ctr">
        <div class="cic"><ha-icon icon="mdi:window-shutter"></ha-icon></div>
        <div class="cmeta"><div class="cnm"></div><div class="cstt"></div></div>
        <ha-icon class="alert" icon="mdi:alert" hidden></ha-icon>
      </div>
      <div class="cb">
        <button data-a="up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
        <button data-a="stop"><ha-icon icon="mdi:stop"></ha-icon></button>
        <button data-a="down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
        <button data-a="half">50%</button>
      </div>`;
    cell.appendChild(el);
    el.addEventListener('click', () => this.openDevicePopup(id));
    el.querySelectorAll('.cb button').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); this._dtPress(b); this._dtCoverAction(id, b.dataset.a);
    }));
    const nm = el.querySelector('.cnm'), stt = el.querySelector('.cstt'),
      ic = el.querySelector('.cic ha-icon'), alert = el.querySelector('.alert');
    const update = () => {
      const st = this._dtSt(id);
      if (!st) return;
      const pos = st.attributes.current_position;
      const opened = st.state === 'open' || st.state === 'opening' || (typeof pos === 'number' && pos > 0);
      el.classList.toggle('on', opened);
      nm.textContent = st.attributes.friendly_name || id;
      ic.setAttribute('icon', st.attributes.icon || 'mdi:window-shutter');
      let label;
      if (st.state === 'opening') label = this._dtLabel('cover_opening', st);
      else if (st.state === 'closing') label = this._dtLabel('cover_closing', st);
      else {
        const open = typeof pos === 'number' ? pos > 1 : opened;
        const word = this._dtLabel(open ? 'cover_open' : 'cover_closed', { ...st, state: open ? 'open' : 'closed' });
        label = typeof pos === 'number' && pos > 1 && pos < 99 ? this._dtT('cover_open_pct', { state: word, pct: pos }) : word;
      }
      stt.textContent = label;
      const ws = this._dtWarnFor([id]);
      alert.hidden = !ws.length; alert.title = ws.join(' · ');
    };
    return { cell, update };
  }

  /** up / open, down / close, stop, half — with the optimistic patch (shutters report back late). */
  _dtCoverAction(id, a) {
    if (a === 'up' || a === 'open') this._dtCmd('cover', 'open_cover', { entity_id: id }, { state: 'opening', attributes: { current_position: 100 } }, 45000);
    else if (a === 'down' || a === 'close') this._dtCmd('cover', 'close_cover', { entity_id: id }, { state: 'closing', attributes: { current_position: 0 } }, 45000);
    else if (a === 'stop') { this._dtSvc('cover', 'stop_cover', { entity_id: id }); this._dtOptClear(id); }
    else this._dtCoverTo(id, 50);
  }
  _dtCoverTo(id, pos) {
    const cur = this._dtSt(id).attributes.current_position ?? 0;
    this._dtCmd('cover', 'set_cover_position', { entity_id: id, position: pos },
      { state: pos > cur ? 'opening' : 'closing', attributes: { current_position: pos } }, 45000);
  }

  // ------------------------------------------------------------ popups
  _dtShowPopup(id, build, warnFn) {
    const pop = this._dtPopEl();
    if (!pop) { this._dtMoreInfo(id); return; }
    this.closeDevicePopup();
    if (!pop._fxBound) {                       // every tap on a popup button pulses ("sent")
      pop._fxBound = true;
      pop.addEventListener('click', e => {
        const btn = e.target && e.target.closest && e.target.closest('button');
        if (btn && pop.contains(btn)) this._dtPress(btn);
      }, true);
    }
    const card = document.createElement('div');
    card.className = 'cpc';
    card.addEventListener('click', e => e.stopPropagation());
    pop.appendChild(card);
    const update = build(card);
    const warnEl = document.createElement('div');
    warnEl.className = 'vwarn cpwarn'; warnEl.hidden = true;
    card.insertBefore(warnEl, card.children[1] || null);
    this._dtPopup = { id, update, warnEl, warnFn };
    this._dtUpdatePopup();
    pop.classList.add('show');
    pop.onclick = () => this.closeDevicePopup();
  }

  _dtPopHeader(card, id, name) {
    const st = this._hass.states[id];
    const h = document.createElement('div');
    h.className = 'cph';
    h.innerHTML = `<div class="cn"></div>
      <div class="ca">
        <button data-a="more"><ha-icon icon="mdi:cog"></ha-icon></button>
        <button data-a="close"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>`;
    h.querySelector('.cn').textContent = name || st.attributes.friendly_name || id;
    h.querySelector('[data-a=more]').setAttribute('aria-label', this._dtT('more_info'));
    h.querySelector('[data-a=close]').setAttribute('aria-label', this._dtT('close_popup'));
    h.querySelector('[data-a=more]').onclick = () => { this.closeDevicePopup(); this._dtMoreInfo(id); };
    h.querySelector('[data-a=close]').onclick = () => this.closeDevicePopup();
    card.appendChild(h);
    return h;
  }

  _dtLightPopup(target, card) {
    const ids = target.ids, rep = target.rep;
    const anyOn = () => ids.some(i => this._hass.states[i] && this._hass.states[i].state === 'on');
    const head = this._dtPopHeader(card, rep, target.name);
    const acts = head.querySelector('.ca');
    const pw = document.createElement('button');
    pw.setAttribute('aria-label', this._dtT('toggle'));
    pw.innerHTML = '<ha-icon icon="mdi:power"></ha-icon>';
    acts.insertBefore(pw, acts.firstChild);
    pw.onclick = () => this._dtSvc('light', anyOn() ? 'turn_off' : 'turn_on', { entity_id: ids });

    const st0 = this._hass.states[rep];
    const dim = this._dtDimmable(st0);
    const modes = st0.attributes.supported_color_modes || [];
    const hasTemp = modes.includes('color_temp');
    const hasColor = modes.some(m => COLOR_MODES.includes(m));
    const kmin = st0.attributes.min_color_temp_kelvin || 2000, kmax = st0.attributes.max_color_temp_kelvin || 6500;

    const b = document.createElement('div');
    b.className = 'cpb';
    b.innerHTML = `
      <div class="cbig"><span class="v"></span><small></small></div>
      <div class="lctl">
        ${dim ? '<div class="cvs lc lc-bri"><div class="fill"></div><div class="hd"></div></div>' : ''}
        ${hasTemp ? '<div class="cvs kelv lc lc-temp"><div class="hd"></div></div>' : ''}
        ${hasColor ? `<div class="lc lc-color"><div class="cwheel"><div class="kn"></div></div>
          <div class="cdots">
            <span class="cdot" data-rgb="255,120,80" style="background:#ff7850"></span>
            <span class="cdot" data-rgb="255,180,90" style="background:#ffb45a"></span>
            <span class="cdot" data-rgb="255,240,210" style="background:#fff0d2"></span>
            <span class="cdot" data-rgb="120,180,232" style="background:#78b8e8"></span>
            <span class="cdot" data-rgb="180,150,255" style="background:#b496ff"></span>
          </div></div>` : ''}
      </div>
      <div class="cseg amber lsel">
        ${dim ? '<button data-sel="bri"><ha-icon icon="mdi:brightness-6"></ha-icon></button>' : ''}
        ${hasTemp ? '<button data-sel="temp"><ha-icon icon="mdi:thermometer"></ha-icon></button>' : ''}
        ${hasColor ? '<button data-sel="color"><ha-icon icon="mdi:palette"></ha-icon></button>' : ''}
      </div>`;
    card.appendChild(b);
    const vv = b.querySelector('.cbig .v'), sm = b.querySelector('.cbig small'),
      vs = b.querySelector('.lc-bri'), fill = vs && vs.querySelector('.fill'), hd = vs && vs.querySelector('.hd'),
      temp = b.querySelector('.lc-temp'), tempHd = temp && temp.querySelector('.hd'),
      color = b.querySelector('.lc-color'), wheel = color && color.querySelector('.cwheel'),
      wheelKn = wheel && wheel.querySelector('.kn');

    // one control at a time, picked from the bar at the bottom (like Home Assistant's dialog)
    const ctrls = { bri: vs, temp, color };
    const selBtns = b.querySelectorAll('.lsel button');
    const showMode = m => {
      for (const k in ctrls) if (ctrls[k]) ctrls[k].style.display = k === m ? '' : 'none';
      selBtns.forEach(x => x.classList.toggle('act', x.dataset.sel === m));
    };
    selBtns.forEach(x => { x.onclick = () => showMode(x.dataset.sel); });
    showMode(dim ? 'bri' : hasTemp ? 'temp' : 'color');

    if (vs) this._dtTrack(vs, 'y',
      f => { fill.style.height = (f * 100) + '%'; hd.style.bottom = (f * 100) + '%'; vv.textContent = Math.round(f * 100) + '%'; },
      f => this._dtSvc('light', 'turn_on', { entity_id: ids, brightness_pct: Math.max(1, Math.round(f * 100)) }));
    if (temp) this._dtTrack(temp, 'y',
      f => { tempHd.style.bottom = (f * 100) + '%'; },
      f => this._dtSvc('light', 'turn_on', { entity_id: ids, color_temp_kelvin: Math.round(kmin + f * (kmax - kmin)) }));
    const placeKnob = hue => {
      const rad = hue * Math.PI / 180, rr = 0.37;
      wheelKn.style.left = (50 + Math.cos(rad) * rr * 100) + '%';
      wheelKn.style.top = (50 + Math.sin(rad) * rr * 100) + '%';
    };
    if (wheel) {
      const setHue = e => {
        const r = wheel.getBoundingClientRect();
        let hue = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
        if (hue < 0) hue += 360;
        placeKnob(hue);
        return hue;
      };
      let on = false, last = 0;
      const send = hue => this._dtSvc('light', 'turn_on', { entity_id: ids, hs_color: [Math.round(hue), 100] });
      const move = e => {
        if (!on) return;
        e.preventDefault();
        const hue = setHue(e), n = Date.now();
        if (n - last > 150) { last = n; send(hue); }
      };
      const up = e => {
        if (!on) return;
        on = false; wheel._drag = false; send(setHue(e));
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      };
      wheel.addEventListener('pointerdown', e => {
        e.stopPropagation(); on = true; wheel._drag = true; setHue(e);
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
      b.querySelectorAll('.cdot').forEach(d => {
        d.onclick = () => this._dtSvc('light', 'turn_on', { entity_id: ids, rgb_color: d.dataset.rgb.split(',').map(Number) });
      });
    }
    return () => {
      const st = this._hass && this._hass.states[rep];
      if (!st) return;
      const a = st.attributes, on = anyOn();
      const bp = on ? Math.round(((a.brightness || 0) / 255) * 100) : 0;
      vv.textContent = dim ? bp + '%' : (on ? 'On' : 'Off');
      sm.textContent = this._dtLabel(on ? 'light_on' : 'light_off', { ...st, state: on ? 'on' : 'off' });
      pw.classList.toggle('act', on);
      if (vs && !vs._drag) { fill.style.height = bp + '%'; hd.style.bottom = bp + '%'; }
      if (temp && !temp._drag && typeof a.color_temp_kelvin === 'number')
        tempHd.style.bottom = ((a.color_temp_kelvin - kmin) / (kmax - kmin) * 100) + '%';
      if (wheel && !wheel._drag && Array.isArray(a.hs_color)) placeKnob(a.hs_color[0]);
    };
  }

  _dtCoverPopup(id, card) {
    this._dtPopHeader(card, id);
    const b = document.createElement('div');
    b.className = 'cpb';
    b.innerHTML = `
      <div class="cbig"><span class="v"></span><small></small></div>
      <div class="cshut"><div class="sky"></div><div class="cass"></div><div class="slats"></div></div>
      <div class="cbtns">
        <button data-a="up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
        <button data-a="stop"><ha-icon icon="mdi:stop"></ha-icon></button>
        <button data-a="down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
      </div>
      <div class="cseg amber">
        <button data-a="open"></button><button data-a="half">50%</button><button data-a="close"></button>
      </div>`;
    b.querySelector('.cseg [data-a=open]').textContent = this._dtT('open');
    b.querySelector('.cseg [data-a=close]').textContent = this._dtT('close');
    card.appendChild(b);
    const vv = b.querySelector('.cbig .v'), sm = b.querySelector('.cbig small'),
      shut = b.querySelector('.cshut'), slats = b.querySelector('.slats');
    this._dtTrack(shut, 'y',
      f => { const pos = Math.round(f * 100); slats.style.height = (100 - pos) + '%'; vv.textContent = pos + '%'; },
      f => this._dtCoverTo(id, Math.round(f * 100)));
    b.querySelectorAll('.cbtns button, .cseg button').forEach(btn => { btn.onclick = () => this._dtCoverAction(id, btn.dataset.a); });
    return () => {
      const st = this._dtSt(id);
      if (!st) return;
      const pos = st.attributes.current_position;
      const p = typeof pos === 'number' ? pos : (st.state === 'open' ? 100 : 0);
      vv.textContent = p + '%';
      sm.textContent = st.state === 'opening' ? this._dtLabel('cover_opening', st)
        : st.state === 'closing' ? this._dtLabel('cover_closing', st)
          : this._dtLabel(p <= 1 ? 'cover_closed' : 'cover_open', { ...st, state: p <= 1 ? 'closed' : 'open' });
      if (!shut._drag) slats.style.height = (100 - p) + '%';
    };
  }
};
