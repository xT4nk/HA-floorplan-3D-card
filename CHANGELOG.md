# Changelog

What comes next: [ROADMAP.md](ROADMAP.md).

## 0.2.0
License
- From this version the card is licensed under the **GNU GPL v3.0 or later** (it was MIT). You can still use,
  change and share it freely; whoever distributes it, changed or not, must do so under the same license and
  with the source code. 0.1.0 stays under MIT. Three.js keeps its MIT license (`THIRD_PARTY_NOTICES.md`).

New
- `theme: sun`: dark after sunset, light during the day (follows `sun.sun`).
- Rooms: `part_of: <room id>` (a balcony that belongs to the living room: a tap opens the living room and the
  balcony stays visible with it) and `railing: true` for open areas (`walls: false`).
- `temperature: false` / `humidity: false` to show no value on a room.
- Room labels use the temperature/humidity sensor chosen for the area in Home Assistant (*Settings → Areas*)
  before falling back to the area's first sensor (which could be an appliance, e.g. an oven).
- Extensions: hooks `getViewInset(roomId)`, `getRoomMeta(room, state)`, `getTheme()`; helpers
  `areaEntities(room)`, `refreshInset()`, `isMobile`; `THREE`, `FloorplanScene`, `normalizeConfig`,
  `buildPlan`, `VERSION` on the element class, so extensions do not import the card by path.
- Scene: `setInset({left, right, top, bottom})` frames the plan in the free area on any side.

Fixed
- Tapping a ghosted window of another room could open a room with nothing to show (e.g. a balcony); it now
  follows `part_of` and skips disabled rooms.
- Documentation link and the import path in `docs/EXTENDING.md` (`HA-floorplan-3D-card`).

Changed
- `_areaEntities(room)` is now the public `areaEntities(room)`.
- `setInset({ top })` meant "covered at the bottom"; use `{ bottom }` (`top` now really means the top).

## 0.1.0
First release.
