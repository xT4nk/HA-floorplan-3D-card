// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, buildPlan, labelPoint, pointInPolygon } from '../dist/floorplan-geometry.js';
import { DEMO_PLAN } from '../dist/floorplan-demo.js';

const plan = cfg => buildPlan(normalizeConfig(cfg));
const near = (a, b, e = 0.01) => Math.abs(a - b) < e;
// total wall length (full height) lying on the line y = c (horizontal) or x = c (vertical)
const onLine = (walls, axis, c, kind = 'wall') => walls.filter(w => w.kind === kind &&
  (axis === 'y' ? near(w.a[1], c) && near(w.b[1], c) : near(w.a[0], c) && near(w.b[0], c)));

test('single room: four walls, corners closed', () => {
  const { walls } = plan({ rooms: [{ id: 'a', rect: [0, 0, 400, 300] }] });
  assert.equal(walls.length, 4);
  for (const w of walls) assert.ok(near(w.length, (near(w.a[1], w.b[1]) ? 400 : 300) + 12));
  assert.deepEqual(walls[0].rooms, ['a']);
});

test('shared edge becomes one wall that belongs to both rooms', () => {
  const { walls } = plan({ rooms: [{ id: 'a', rect: [0, 0, 300, 300] }, { id: 'b', rect: [300, 0, 200, 300] }] });
  const mid = onLine(walls, 'x', 300);
  assert.equal(mid.length, 1);
  assert.deepEqual(mid[0].rooms, ['a', 'b']);
  assert.equal(walls.length, 7);   // 2 top + 2 bottom (split by room) + left + middle + right
});

test('partially shared edge: pieces with different owners, no gap', () => {
  const { walls } = plan({ rooms: [{ id: 'a', rect: [0, 0, 300, 400] }, { id: 'b', rect: [300, 100, 200, 200] }] });
  const ws = onLine(walls, 'x', 300).sort((p, q) => Math.min(p.a[1], p.b[1]) - Math.min(q.a[1], q.b[1]));
  assert.deepEqual(ws.map(w => w.rooms.join('+')), ['a', 'a+b', 'a']);
  const covered = ws.reduce((s, w) => s + w.length, 0);
  assert.ok(near(covered, 400 + 12));   // only the two free ends are extended
});

test('door cuts the wall, window leaves a sill', () => {
  const { walls, openings } = plan({
    rooms: [{ id: 'a', rect: [0, 0, 400, 300] }],
    openings: [{ type: 'door', at: [200, 300], width: 80 }, { type: 'window', at: [200, 0], width: 100, sill: 40 }],
  });
  const bottom = onLine(walls, 'y', 300);
  assert.equal(bottom.length, 2);
  assert.ok(near(bottom.reduce((s, w) => s + w.length, 0), 400 + 12 - 80));
  const sills = onLine(walls, 'y', 0, 'sill');
  assert.equal(sills.length, 1);
  assert.equal(sills[0].y1, 40);
  const win = openings.find(o => o.type === 'window');
  assert.deepEqual(win.outward.map(v => Math.round(v) + 0), [0, -1]);   // outside is towards negative y
  assert.deepEqual(win.rooms, ['a']);
});

test('opening off any wall is reported', () => {
  assert.throws(() => plan({ rooms: [{ id: 'a', rect: [0, 0, 400, 300] }], openings: [{ at: [200, 150] }] }),
    /not on any room edge/);
});

test('config errors are readable', () => {
  assert.throws(() => normalizeConfig({}), /"rooms" must be a non-empty list/);
  assert.throws(() => normalizeConfig({ rooms: [{ id: 'a' }] }), /give either "rect/);
  assert.throws(() => normalizeConfig({ rooms: [{ id: 'a', rect: [0, 0, 1, 1] }, { id: 'a', rect: [1, 0, 1, 1] }] }), /duplicate room id/);
  assert.throws(() => normalizeConfig({ rooms: [{ rect: [0, 0, 1, 1] }], openings: [{ type: 'hatch', at: [0, 0] }] }), /door, window or opening/);
});

test('polygon rooms: L shape, angled wall, label inside', () => {
  const L = [[0, 0], [400, 0], [400, 150], [150, 150], [150, 400], [0, 400]];
  assert.ok(pointInPolygon(labelPoint(L), L));
  const { walls } = plan({ rooms: [{ id: 'l', points: L }] });
  assert.equal(walls.length, 6);
  const tri = plan({ rooms: [{ id: 't', points: [[0, 0], [300, 0], [0, 300]] }] });
  assert.equal(tri.walls.length, 3);
  assert.ok(tri.walls.some(w => near(Math.abs(w.angle), 3 * Math.PI / 4) || near(Math.abs(w.angle), Math.PI / 4)));
});

test('demo plan: builds, every opening placed, open kitchen has no wall', () => {
  const m = normalizeConfig(DEMO_PLAN);
  const { walls, openings } = buildPlan(m);
  assert.equal(openings.length, DEMO_PLAN.openings.length);
  // living/kitchen line x=520 between y 40..220 must be empty
  const x520 = onLine(walls, 'x', 520);
  for (const w of x520) {
    const [y0, y1] = [w.a[1], w.b[1]].sort((p, q) => p - q);
    assert.ok(y1 <= 40 + 0.01 || y0 >= 220 - 0.01, `wall ${y0}..${y1} crosses the open kitchen`);
  }
  // balcony has walls: false → no wall belongs to it
  assert.ok(!walls.some(w => w.rooms.includes('balcony')));
  // the balcony door sits on the living room exterior wall, outside = -x
  const bd = openings.find(o => o.name === 'Balcony door');
  assert.deepEqual(bd.rooms, ['balcony', 'living']);
  assert.deepEqual(bd.outward.map(v => Math.round(v) + 0), [-1, 0]);
  // front door: exterior
  assert.deepEqual(openings.find(o => o.name === 'Front door').outward.map(v => Math.round(v) + 0), [1, 0]);
  assert.equal(openings.find(o => near(o.center[0], 700) && near(o.center[1], 420)).outward, null);
  // bathroom door is interior (two rooms)
  assert.deepEqual(openings.find(o => near(o.center[0], 550)).rooms.sort(), ['bathroom', 'hall']);
});

test('railing: free edges of an open area, not the edge it shares with a room', () => {
  const { railings } = plan(DEMO_PLAN);
  // demo balcony [-140, 60, 140, 300] leans on the living room along x = 0
  assert.equal(railings.length, 3);
  assert.ok(railings.every(r => r.rooms.join() === 'balcony'));
  assert.ok(near(railings.reduce((s, r) => s + r.length, 0), 140 + 300 + 140));
  assert.ok(!railings.some(r => near(r.a[0], 0) && near(r.b[0], 0)), 'no railing on the shared edge');
});

test('railing: edge shared only in part leaves two pieces', () => {
  const { railings } = plan({ rooms: [
    { id: 'in', rect: [0, 100, 300, 100] },
    { id: 'terrace', rect: [0, 0, 300, 400], walls: false, railing: true },
  ] });
  // rooms must not overlap in real plans; here only the edge logic matters: x = 0 is shared 100..200
  const left = railings.filter(r => near(r.a[0], 0) && near(r.b[0], 0));
  assert.deepEqual(left.map(r => Math.round(r.length)).sort((a, b) => a - b), [100, 200]);
});

test('part_of and railing are validated', () => {
  assert.throws(() => normalizeConfig({ rooms: [{ id: 'a', rect: [0, 0, 100, 100], railing: true }] }), /needs "walls: false"/);
  assert.throws(() => normalizeConfig({ rooms: [{ id: 'a', rect: [0, 0, 100, 100], part_of: 'x' }] }), /another room/);
  assert.throws(() => normalizeConfig({ rooms: [{ id: 'a', rect: [0, 0, 100, 100], part_of: 'a' }] }), /another room/);
  assert.throws(() => normalizeConfig({ rooms: [
    { id: 'a', rect: [0, 0, 100, 100] }, { id: 'b', rect: [100, 0, 100, 100], part_of: 'a' },
    { id: 'c', rect: [200, 0, 100, 100], part_of: 'b' }] }), /not itself part of another/);
  const m = normalizeConfig(DEMO_PLAN);
  assert.equal(m.rooms.find(r => r.id === 'balcony').part_of, 'living');
});
