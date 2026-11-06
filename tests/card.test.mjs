// node --test tests/ — the card with a tiny DOM and a stand-in scene (no WebGL in Node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { install } from './helpers/dom.mjs';

install();
console.info = () => {};
const { Floorplan3DCard, VERSION } = await import('../dist/floorplan-3d-card.js');
const { insetView } = await import('../dist/floorplan-scene.js');
const { DEMO_PLAN } = await import('../dist/floorplan-demo.js');

const st = (id, state, attributes = {}) => [id, { entity_id: id, state, attributes }];
function fakeHass(extra = {}) {
  return {
    states: Object.fromEntries([
      st('sun.sun', 'below_horizon'),
      st('light.living', 'on', { brightness: 255 }),
      st('sensor.a_oven_temperature', '200', { device_class: 'temperature' }),
      st('sensor.kitchen_temperature', '21.5', { device_class: 'temperature' }),
      st('cover.balcony', 'open', { current_position: 100 }),
      ...(extra.states || []),
    ]),
    entities: {
      'light.living': { entity_id: 'light.living', area_id: 'living_room' },
      'sensor.a_oven_temperature': { entity_id: 'sensor.a_oven_temperature', area_id: 'kitchen' },
      'sensor.kitchen_temperature': { entity_id: 'sensor.kitchen_temperature', area_id: 'kitchen' },
    },
    devices: {},
    areas: { living_room: { area_id: 'living_room', name: 'Living room' },
      kitchen: { area_id: 'kitchen', name: 'Kitchen', temperature_entity_id: extra.kitchenTemp ?? null } },
    themes: { darkMode: true },
  };
}
function fakeScene() {
  const calls = [];
  const rec = name => (...a) => calls.push([name, ...a]);
  return { calls, setTheme: rec('theme'), setRoomName() {}, setRoomGlow: rec('glow'), setRoomSubLabel: rec('sub'),
    setShutter() {}, setOpenAlert() {}, setActive() {}, setSize() {}, setInset: rec('inset'), focusRoom: rec('focus'),
    resetView() {}, dispose() {}, invalidate() {} };
}
let n = 0;
function mount(Base = Floorplan3DCard, config = {}) {
  const name = `fp-test-${++n}`;
  class C extends Base { _createScene() { return fakeScene(); } }
  customElements.define(name, C);
  const el = document.createElement(name);
  el.setConfig({ ...JSON.parse(JSON.stringify(DEMO_PLAN)), ...config });
  document.body.appendChild(el);
  el.connectedCallback();
  el.$wrap.clientWidth = 1200; el.$wrap.clientHeight = 700; el._resize();   // wide card: side panel
  return el;
}
const lastInset = el => el._scene.calls.filter(c => c[0] === 'inset').pop()[1];

test('extensions get THREE and the scene from the element class', () => {
  assert.equal(Floorplan3DCard.VERSION, VERSION);
  assert.ok(Floorplan3DCard.THREE && Floorplan3DCard.THREE.Mesh);
  assert.equal(typeof Floorplan3DCard.FloorplanScene, 'function');
});

test('a mixin with its own _areaEntities(areaId) does not break the card', () => {
  const Mixin = B => class extends B { _areaEntities(areaId) { return areaId.length ? null : []; } };
  const el = mount(Mixin(Floorplan3DCard));
  assert.doesNotThrow(() => { el.hass = fakeHass(); });
  assert.deepEqual(el.areaEntities(el._model.rooms[0]), ['light.living']);
});

test('theme: sun follows sun.sun', () => {
  const el = mount(Floorplan3DCard, { theme: 'sun' });
  el.hass = fakeHass();
  assert.equal(el.getTheme(), 'dark');
  el.hass = fakeHass({ states: [st('sun.sun', 'above_horizon')] });
  assert.equal(el.getTheme(), 'light');
  assert.deepEqual(el._scene.calls.filter(c => c[0] === 'theme').map(c => c[1]), ['dark', 'light']);
});

test('room label uses the sensor chosen for the area in Home Assistant', () => {
  const el = mount();
  const kitchen = el._model.rooms.find(r => r.id === 'kitchen');
  el.hass = fakeHass();
  assert.equal(el.getRoomState(kitchen).sub, '200.0°');          // no choice: first sensor found
  el.hass = fakeHass({ kitchenTemp: 'sensor.kitchen_temperature' });
  assert.equal(el.getRoomState(kitchen).sub, '21.5°');
  kitchen.temperature = false;                                    // `temperature: false`
  assert.equal(el.getRoomState(kitchen).sub, null);
});

test('part_of: tapping the balcony floor opens the living room', () => {
  const el = mount();
  el.hass = fakeHass();
  el._onPick({ kind: 'room', id: 'balcony' });
  assert.equal(el._room, 'living');
});

test('ghosted window of a part_of room leads to its parent, not to the empty balcony', () => {
  const el = mount();
  el.hass = fakeHass();
  el.selectRoom('bedroom');
  const op = el._plan.openings.find(o => o.name === 'Balcony window');
  assert.deepEqual(op.rooms, ['balcony', 'living']);
  el._onPick({ kind: 'opening', id: op.id, opening: op });
  assert.equal(el._room, 'living');
});

test('disabled rooms are not opened', () => {
  const plan = JSON.parse(JSON.stringify(DEMO_PLAN));
  plan.rooms.find(r => r.id === 'closet').disabled = true;
  const el = mount(Floorplan3DCard, plan);
  el.hass = fakeHass();
  el._onPick({ kind: 'room', id: 'closet' });
  assert.equal(el._room, null);
});

test('getViewInset and getRoomMeta hooks', () => {
  class Custom extends Floorplan3DCard {
    getViewInset(roomId) { return roomId ? super.getViewInset(roomId) : { right: 300 }; }
    getRoomMeta() { return ''; }
  }
  const el = mount(Custom);
  el.hass = fakeHass();
  assert.deepEqual(lastInset(el), { right: 300 });               // overview: our column on the right
  el.$panel.offsetWidth = 400;
  el.selectRoom('living');
  assert.deepEqual(lastInset(el), { left: 400 });                // room: the default side panel
  assert.equal(el.shadowRoot.getElementById('pMeta').textContent, '');
  el.selectRoom(null);
  assert.deepEqual(lastInset(el), { right: 300 });
});

test('insetView: free area and centring offset on every side', () => {
  assert.deepEqual(insetView(1000, 600, null), { wa: 1000, ha: 600, x: 0, y: 0 });
  assert.deepEqual(insetView(1000, 600, { left: 400 }), { wa: 600, ha: 600, x: -200, y: 0 });
  assert.deepEqual(insetView(1000, 600, { right: 300 }), { wa: 700, ha: 600, x: 150, y: 0 });
  assert.deepEqual(insetView(1000, 600, { bottom: 300 }), { wa: 1000, ha: 300, x: 0, y: 150 });
  assert.deepEqual(insetView(1000, 600, { top: 100, bottom: 300 }), { wa: 1000, ha: 200, x: 0, y: 100 });
});

// ---------------------------------------------------------------- room panel (0.3.0)
function panelHass() {
  const h = fakeHass({ states: [
    st('light.lamp', 'off'),
    st('sensor.living_temperature', '21.4', { device_class: 'temperature', unit_of_measurement: '°C' }),
    st('cover.living', 'open', { current_position: 100 }),
    st('switch.fan', 'off'),
    st('sensor.living_power', '40', { device_class: 'power', unit_of_measurement: 'W' }),
  ] });
  for (const id of ['light.lamp', 'sensor.living_temperature', 'cover.living', 'switch.fan', 'sensor.living_power'])
    h.entities[id] = { entity_id: id, area_id: 'living_room' };
  h.formatEntityState = s => `fmt:${s.state}`;
  h.calls = [];
  h.callService = (domain, service, data) => h.calls.push([domain, service, data]);
  return h;
}
const tick = () => new Promise(r => setTimeout(r, 0));
function withHelpers() {
  const made = [];
  window.loadCardHelpers = async () => ({ createCardElement(cfg) {
    const e = document.createElement('hui-tile-card');
    e.cfg = cfg;
    Object.defineProperty(e, 'hass', { set(h) { e.got = h; } });
    made.push(e);
    return e;
  } });
  return made;
}
const sections = el => el.shadowRoot.getElementById('pList').querySelectorAll('.sec').map(s => s.firstElementChild.textContent);

test('panel: chips for environment sensors, tiles in sections, native tile features', async () => {
  const made = withHelpers();
  const el = mount();
  el.hass = panelHass();
  el.selectRoom('living');
  await tick(); await tick();
  const chips = el.shadowRoot.getElementById('pChips').querySelectorAll('.chip');
  assert.equal(chips.length, 1);
  assert.equal(chips[0].textContent, 'fmt:21.4');                  // translated by Home Assistant
  assert.deepEqual(sections(el), ['Lights', 'Covers', 'Other', 'Sensors']);
  const ent = made.map(e => e.cfg.entity);
  assert.ok(!ent.includes('sensor.living_temperature'));           // a chip, not a tile
  assert.deepEqual(made.find(e => e.cfg.entity === 'cover.living').cfg.features, [{ type: 'cover-open-close' }]);
  assert.ok(made.find(e => e.cfg.entity === 'cover.living').parentNode.classList.contains('wide'));
  assert.ok(made.every(e => e.got));                                 // every tile got hass
  delete window.loadCardHelpers;
});

test('panel: one switch for all the lights of the room', async () => {
  withHelpers();
  const el = mount();
  const h = panelHass();
  el.hass = h;
  el.selectRoom('living');
  await tick(); await tick();
  const input = el.shadowRoot.querySelector('.gtog input');
  assert.equal(input.checked, true);                                 // light.living is on
  input.checked = false; input.onchange();
  assert.deepEqual(h.calls.pop(), ['light', 'turn_off', { entity_id: ['light.lamp', 'light.living'] }]);
  const h2 = panelHass();
  h2.states['light.living'].state = 'off';
  el.hass = h2;
  assert.equal(input.checked, false);
  delete window.loadCardHelpers;
});

test('panel: sections option, renderPanelTop and createPanelTile hooks', async () => {
  withHelpers();
  const seen = [];
  class Custom extends Floorplan3DCard {
    renderPanelTop() {
      const top = document.createElement('div');
      top.className = 'top';
      Object.defineProperty(top, 'hass', { set: h => { top.textContent = h.states['light.living'].state; } });
      return [top];
    }
    createPanelTile(id) {
      seen.push(id);
      if (id === 'switch.fan') return false;                         // left out
      if (id !== 'light.lamp') return null;                          // default tile
      const t = document.createElement('div'); t.className = 'mine';
      Object.defineProperty(t, 'hass', { set: h => { t.textContent = h.states[id].state; } });
      return t;
    }
  }
  const el = mount(Custom, { sections: [{ name: 'Luci', domains: ['light'] }, { name: 'Altro', domains: ['switch'] }] });
  el.hass = panelHass();
  el.selectRoom('living');
  await tick(); await tick();
  const list = el.shadowRoot.getElementById('pList');
  assert.deepEqual(sections(el), ['Luci']);                          // 'Altro' is empty once switch.fan is left out
  assert.equal(list.firstElementChild.className.split(' ')[0], 'top');
  assert.equal(list.querySelector('.top').textContent, 'on');
  assert.equal(list.querySelector('.mine').textContent, 'off');
  assert.ok(!seen.includes('cover.living'));                         // not in any section: not shown
  const h = panelHass(); h.states['light.lamp'].state = 'on';
  el.hass = h;
  assert.equal(list.querySelector('.mine').textContent, 'on');       // live
  assert.throws(() => mount(Floorplan3DCard, { sections: [{ name: 'x' }] }), /sections/);
  delete window.loadCardHelpers;
});

test('panel: a late render of a room left meanwhile is dropped', async () => {
  withHelpers();
  const el = mount();
  el.hass = panelHass();
  el.selectRoom('living');
  el.selectRoom('kitchen');                                          // before the helpers resolve
  await tick(); await tick();
  assert.equal(el._room, 'kitchen');
  assert.ok(!sections(el).includes('Lights'));
  assert.ok(!sections(el).includes('Covers'));
  delete window.loadCardHelpers;
});

test('panel: plain rows outside Home Assistant', async () => {
  const el = mount();
  el.hass = panelHass();
  el.selectRoom('living');
  await tick(); await tick();
  const rows = el.shadowRoot.getElementById('pList').querySelectorAll('.row');
  assert.ok(rows.length >= 4);
  assert.ok(rows.every(r => r.querySelector('.s').textContent.startsWith('fmt:')));
});

test('panel: getText translates the panel texts', async () => {
  class It extends Floorplan3DCard { getText(k) { return k === 'no_entities' ? 'Nessuna entità.' : super.getText(k); } }
  const el = mount(It);
  el.hass = panelHass();
  el.selectRoom('bathroom');
  await tick();
  assert.equal(el.shadowRoot.querySelector('#pList .empty').textContent, 'Nessuna entità.');
});
