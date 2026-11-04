/* Floorplan 3D Card — geometry (pure, no DOM, no Three.js).
 *
 * Plan coordinates are centimetres: x grows to the right (east), y grows down
 * (south), as on a paper drawing. The user only describes rooms (rectangles or
 * polygons) and openings (doors, windows, open passages); walls are derived
 * from the room outlines: every room edge becomes a wall, edges shared by two
 * rooms become one wall, and openings are cut out of them.
 */

export const DEFAULTS = Object.freeze({
  wall_thickness: 12,   // cm, plan scale
  wall_height: 130,     // visual height of the cut-away walls
  floor_height: 10,     // visual thickness of the floor slab
  sill: 45,             // window sill, on the wall_height scale
  door_width: 80,
  window_width: 120,
});

const EPS = 1;          // cm: points closer than this are the same point
const LINE_EPS = 1.5;   // cm: edges closer than this lie on the same wall line

// ---------------------------------------------------------------- helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = a => Math.hypot(a[0], a[1]);

function isPoint(p) {
  return Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v));
}

export function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) &&
        p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bbox(points) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of points) {
    if (x < x1) x1 = x; if (y < y1) y1 = y;
    if (x > x2) x2 = x; if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

/* A point inside the room for its label: the centroid when it falls inside
 * (convex and most L-shaped rooms), otherwise the middle of the widest
 * horizontal run through the bounding-box centre. */
export function labelPoint(poly) {
  const A = polygonArea(poly);
  if (Math.abs(A) > 1e-6) {
    let cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      const f = x1 * y2 - x2 * y1;
      cx += (x1 + x2) * f; cy += (y1 + y2) * f;
    }
    const c = [cx / (6 * A), cy / (6 * A)];
    if (pointInPolygon(c, poly)) return c;
  }
  const b = bbox(poly);
  for (const y of [b.cy, b.y1 + b.h * 0.25, b.y1 + b.h * 0.75]) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
    }
    xs.sort((a, b2) => a - b2);
    let best = null;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
    }
    if (best) return [(best[0] + best[1]) / 2, y];
  }
  return [b.cx, b.cy];
}

// ---------------------------------------------------------------- config
function fail(msg) { throw new Error(`floorplan-3d-card: ${msg}`); }

function roomPolygon(r, i) {
  const where = `rooms[${i}]${r && r.id ? ` (${r.id})` : ''}`;
  if (r.rect !== undefined) {
    const q = r.rect;
    if (!Array.isArray(q) || q.length !== 4 || !q.every(v => typeof v === 'number'))
      fail(`${where}: "rect" must be [x, y, width, depth] in cm`);
    const [x, y, w, h] = q;
    if (w <= 0 || h <= 0) fail(`${where}: "rect" width and depth must be > 0`);
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
  if (r.points !== undefined) {
    if (!Array.isArray(r.points) || r.points.length < 3 || !r.points.every(isPoint))
      fail(`${where}: "points" must be a list of at least 3 [x, y] pairs`);
    const pts = r.points.map(p => [p[0], p[1]]);
    if (pts.length > 3 && len(sub(pts[0], pts[pts.length - 1])) < EPS) pts.pop();
    if (Math.abs(polygonArea(pts)) < 1) fail(`${where}: the polygon has no area`);
    return pts;
  }
  fail(`${where}: give either "rect: [x, y, width, depth]" or "points: [[x, y], ...]"`);
}

/* Validates the user config and returns the normalized model. Throws an Error
 * with a readable message (Lovelace shows it in the error card). */
export function normalizeConfig(config) {
  if (!config || typeof config !== 'object') fail('missing configuration');
  const opt = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (config[k] !== undefined) {
      if (typeof config[k] !== 'number' || !(config[k] > 0)) fail(`"${k}" must be a positive number`);
      opt[k] = config[k];
    }
  }
  if (!Array.isArray(config.rooms) || !config.rooms.length) fail('"rooms" must be a non-empty list');

  const ids = new Set();
  const rooms = config.rooms.map((r, i) => {
    if (!r || typeof r !== 'object') fail(`rooms[${i}] must be an object`);
    const id = String(r.id ?? r.area ?? `room_${i + 1}`);
    if (ids.has(id)) fail(`duplicate room id "${id}"`);
    ids.add(id);
    const poly = roomPolygon(r, i);
    if (polygonArea(poly) < 0) poly.reverse();        // keep counter-clockwise (y down)
    if (r.label !== undefined && !isPoint(r.label)) fail(`rooms[${i}]: "label" must be [x, y]`);
    return {
      id,
      name: r.name ?? null,
      area: r.area ?? null,
      poly,
      bbox: bbox(poly),
      labelAt: r.label ? [r.label[0], r.label[1]] : labelPoint(poly),
      floor: r.floor ?? null,
      entities: Array.isArray(r.entities) ? r.entities : null,
      exclude: Array.isArray(r.exclude_entities) ? r.exclude_entities : [],
      lights: Array.isArray(r.lights) ? r.lights : null,
      temperature: r.temperature ?? null,
      walls: r.walls !== false,                        // walls: false → open area (terrace, balcony)
      raw: r,
    };
  });

  const openings = (config.openings || []).map((o, i) => {
    if (!o || typeof o !== 'object') fail(`openings[${i}] must be an object`);
    const type = o.type || 'door';
    if (!['door', 'window', 'opening'].includes(type))
      fail(`openings[${i}]: "type" must be door, window or opening`);
    let a, b;
    if (o.from !== undefined || o.to !== undefined) {
      if (!isPoint(o.from) || !isPoint(o.to)) fail(`openings[${i}]: "from" and "to" must be [x, y]`);
      a = o.from; b = o.to;
    } else if (isPoint(o.at)) {
      const w = o.width ?? (type === 'window' ? opt.window_width : opt.door_width);
      if (typeof w !== 'number' || !(w > 0)) fail(`openings[${i}]: "width" must be a positive number`);
      a = o.at; b = null; o = { ...o, width: w };
    } else fail(`openings[${i}]: give "at: [x, y]" (+ "width") or "from"/"to"`);
    return {
      index: i,
      id: o.id ?? `${type}_${i + 1}`,
      type, a, b,
      width: o.width ?? null,
      sill: type === 'window' ? (o.sill ?? opt.sill) : 0,
      name: o.name ?? null,
      cover: o.cover ?? null,
      contact: o.contact ?? null,
      shutter: o.shutter ?? !!o.cover,
      raw: o,
    };
  });

  return { options: opt, rooms, openings, bbox: bbox(rooms.flatMap(r => r.poly)) };
}

// ---------------------------------------------------------------- walls
/* Groups every room edge by the infinite line it lies on. */
function collectLines(rooms) {
  const lines = [];
  for (const room of rooms) {
    if (!room.walls) continue;
    const P = room.poly;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      const L = len(sub(q, p));
      if (L < EPS) continue;
      let d = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
      if (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] < 0)) d = [-d[0], -d[1]];
      const n = [-d[1], d[0]];
      const c = dot(n, p);
      let line = lines.find(l => Math.abs(l.d[0] * d[1] - l.d[1] * d[0]) < 1e-4 && Math.abs(l.c - c) < LINE_EPS);
      if (!line) { line = { d, n, c, spans: [] }; lines.push(line); }
      let t0 = dot(line.d, p), t1 = dot(line.d, q);
      if (t0 > t1) [t0, t1] = [t1, t0];
      line.spans.push({ t0, t1, room: room.id });
    }
  }
  return lines;
}

const pointOn = (line, t) => [line.n[0] * line.c + line.d[0] * t, line.n[1] * line.c + line.d[1] * t];

/* Splits each line at every span end; each piece knows which rooms touch it
 * (1 = exterior wall, 2 = wall between two rooms). Adjacent pieces with the
 * same rooms are merged back, and each merged run remembers whether its ends
 * are free (so walls can be extended to close the corners). */
function linePieces(line) {
  const cuts = [...new Set(line.spans.flatMap(s => [s.t0, s.t1]).map(t => Math.round(t * 100) / 100))].sort((a, b) => a - b);
  const pieces = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t0 = cuts[i], t1 = cuts[i + 1];
    if (t1 - t0 < EPS) continue;
    const mid = (t0 + t1) / 2;
    const rooms = [...new Set(line.spans.filter(s => s.t0 - 1e-6 <= mid && mid <= s.t1 + 1e-6).map(s => s.room))].sort();
    if (!rooms.length) continue;
    const prev = pieces[pieces.length - 1];
    if (prev && Math.abs(prev.t1 - t0) < 1e-6 && prev.rooms.join() === rooms.join()) prev.t1 = t1;
    else pieces.push({ t0, t1, rooms });
  }
  // a run is a maximal chain of touching pieces: only its two ends are "free"
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    p.freeStart = !(i > 0 && Math.abs(pieces[i - 1].t1 - p.t0) < 1e-6);
    p.freeEnd = !(i + 1 < pieces.length && Math.abs(pieces[i + 1].t0 - p.t1) < 1e-6);
  }
  return pieces;
}

/* Finds the wall line an opening sits on and its [t0, t1] range there. */
function placeOpening(op, lines, rooms, opt) {
  const tol = Math.max(opt.wall_thickness, 15);
  let best = null;
  for (const line of lines) {
    const pts = op.b ? [op.a, op.b] : [op.a];
    const dist = Math.max(...pts.map(p => Math.abs(dot(line.n, p) - line.c)));
    if (dist > tol) continue;
    if (op.b && Math.abs(line.d[0] * (op.b[1] - op.a[1]) - line.d[1] * (op.b[0] - op.a[0])) > tol) continue;
    let t0, t1;
    if (op.b) { t0 = dot(line.d, op.a); t1 = dot(line.d, op.b); if (t0 > t1) [t0, t1] = [t1, t0]; }
    else { const t = dot(line.d, op.a); t0 = t - op.width / 2; t1 = t + op.width / 2; }
    const lo = Math.min(...line.spans.map(s => s.t0)), hi = Math.max(...line.spans.map(s => s.t1));
    if (t1 < lo - EPS || t0 > hi + EPS) continue;
    if (!best || dist < best.dist) best = { line, t0: Math.max(t0, lo), t1: Math.min(t1, hi), dist };
  }
  if (!best) {
    const where = op.raw.at ? `at [${op.a}]` : `from [${op.a}] to [${op.b}]`;
    throw new Error(`floorplan-3d-card: openings[${op.index}] (${op.type} ${where}) is not on any room edge`);
  }
  // which side is outside (no room there)? used to hang the roller shutter outside
  const mid = pointOn(best.line, (best.t0 + best.t1) / 2);
  const probe = s => [mid[0] + best.line.n[0] * s * opt.wall_thickness, mid[1] + best.line.n[1] * s * opt.wall_thickness];
  const inPlus = rooms.find(r => pointInPolygon(probe(+1), r.poly));
  const inMinus = rooms.find(r => pointInPolygon(probe(-1), r.poly));
  // open areas (walls: false, e.g. a balcony) count as outside
  const indoor = r => r && r.walls;
  const out = !indoor(inPlus) && indoor(inMinus) ? +1 : (!indoor(inMinus) && indoor(inPlus) ? -1 : 0);
  const roomIds = [...new Set([inPlus, inMinus].filter(Boolean).map(r => r.id))].sort();
  return { ...op, line: best.line, t0: best.t0, t1: best.t1, out, rooms: roomIds };
}

/* Main entry: the list of wall boxes to draw and the placed openings.
 * Wall piece: { a, b (plan points), length, angle, y0, y1, rooms[], kind }
 * kind: 'wall' (full height) | 'sill' (under a window). */
export function buildPlan(model) {
  const opt = model.options;
  const lines = collectLines(model.rooms);
  const openings = model.openings.map(op => placeOpening(op, lines, model.rooms, opt));
  const walls = [];
  const half = opt.wall_thickness / 2;

  for (const line of lines) {
    const ops = openings.filter(o => o.line === line).sort((p, q) => p.t0 - q.t0);
    for (const piece of linePieces(line)) {
      // subtract openings from the piece: what remains is full-height wall
      let segs = [{ t0: piece.t0, t1: piece.t1, s: piece.freeStart, e: piece.freeEnd }];
      for (const o of ops) {
        const next = [];
        for (const sg of segs) {
          if (o.t1 <= sg.t0 || o.t0 >= sg.t1) { next.push(sg); continue; }
          if (o.t0 > sg.t0 + EPS) next.push({ t0: sg.t0, t1: o.t0, s: sg.s, e: false });
          if (o.t1 < sg.t1 - EPS) next.push({ t0: o.t1, t1: sg.t1, s: false, e: sg.e });
        }
        segs = next;
      }
      for (const sg of segs) {
        const t0 = sg.t0 - (sg.s ? half : 0), t1 = sg.t1 + (sg.e ? half : 0);
        walls.push(wallBox(line, t0, t1, 0, opt.wall_height, piece.rooms, 'wall'));
      }
      // window sills inside this piece
      for (const o of ops) {
        if (o.type !== 'window' || o.sill <= 0) continue;
        const t0 = Math.max(o.t0, piece.t0), t1 = Math.min(o.t1, piece.t1);
        if (t1 - t0 >= EPS) walls.push(wallBox(line, t0, t1, 0, Math.min(o.sill, opt.wall_height), piece.rooms, 'sill'));
      }
    }
  }

  const placed = openings.map(o => {
    const a = pointOn(o.line, o.t0), b = pointOn(o.line, o.t1);
    return {
      id: o.id, type: o.type, name: o.name, cover: o.cover, contact: o.contact, shutter: o.shutter,
      sill: o.sill, a, b, length: o.t1 - o.t0,
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      angle: Math.atan2(o.line.d[1], o.line.d[0]),
      // unit vector (plan coords) pointing outdoors, null for interior openings
      outward: o.out ? [o.line.n[0] * o.out + 0, o.line.n[1] * o.out + 0] : null,
      rooms: o.rooms,
    };
  });
  return { walls, openings: placed };
}

function wallBox(line, t0, t1, y0, y1, rooms, kind) {
  const a = pointOn(line, t0), b = pointOn(line, t1);
  return {
    a, b, length: t1 - t0,
    center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    angle: Math.atan2(line.d[1], line.d[0]),
    y0, y1, rooms, kind,
  };
}
