# Changelog

What comes next: [ROADMAP.md](ROADMAP.md).

## 0.4.0
New
- Tiles and popups of the card for **lights** and **covers**, now the default (`tiles: native` gives back Home
  Assistant's tile cards and more-info):
  - light: tap the icon to switch, drag the bar for brightness; the popup has brightness, colour temperature
    and a colour wheel (only what the light supports; on/off lights open more-info);
  - cover: up, stop, down, 50%; the popup draws the shutter and sets any position by dragging it;
  - the tile answers the tap at once (optimistic state) and follows the real state when it arrives;
  - a red triangle for unavailable devices, low battery and problem sensors of the same device.
- Tap on a window: the popup of its cover.
- `light_groups` option: several lights in one tile and one popup.
- States are Home Assistant's (translated); the card's own words can be translated with `getText`.
- Extensions: `DeviceTiles` mixin and `DEVICE_CSS` / `DEVICE_TEXT` on the element class, usable by other
  cards; hook `deviceGroup(id)`; helpers `createDeviceTile`, `openDevicePopup`, `closeDevicePopup`,
  `refreshDevices`.

## 0.3.0
New
- Room panel in sections: environment sensors (temperature, humidity, illuminance, motion, doors and windows,
  leaks) as chips at the top, the rest as native tile cards grouped by domain, two columns (one on narrow
  cards), with the tile features of each domain (brightness, open/close, target temperature…).
- One switch in the Lights header turns all the lights of the room on or off.
- `sections` option: names, order and domains of the panel sections (e.g. in your language).
- States in the panel are formatted by Home Assistant (`hass.formatEntityState`): translated, with units.
- Extensions: hooks `isPanelChip(id)`, `renderPanelTop(room)`, `createPanelTile(id, room)`, `getText(key)`; helper
  `refreshPanel()`.

Changed
- The default panel looks different (chips and sections instead of one grid of tiles); `renderRoomPanel`
  still replaces it entirely.
- On narrow cards the bottom panel sizes to its content (up to 52% of the card).

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
