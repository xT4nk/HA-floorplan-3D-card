# Extending Floorplan 3D Card

The card is three layers, each usable on its own:

| Module | What it does | Depends on |
|---|---|---|
| `floorplan-geometry.js` | Validates the config, derives walls from rooms, places openings. Pure functions. | nothing |
| `floorplan-scene.js` | `FloorplanScene`: Three.js scene, camera, picking, focus/ghosts, overlays. Knows nothing about Home Assistant. | Three.js |
| `floorplan-3d-card.js` | `Floorplan3DCard`: the Lovelace element. Reads `hass`, feeds the scene, renders the panel. | the two above |

## Your own card on top of it
Import the class, subclass it, override the hooks you need, register a new element name. The plan stays in
YAML (or in your own file), the engine stays untouched.

```js
// /config/www/my-home-card.js
import { Floorplan3DCard, THREE } from '/hacsfiles/floorplan-3d-card/floorplan-3d-card.js';

class MyHomeCard extends Floorplan3DCard {
  // the panel: your own tiles/popups instead of the default tile cards
  async renderRoomPanel(room, list) {
    if (room.id !== 'kitchen') return super.renderRoomPanel(room, list);
    list.innerHTML = '<div class="row wide">Oven, dishwasher…</div>';
  }

  // tap on a window: your own popup
  onOpeningTap(opening) {
    if (opening.cover) this.openMoreInfo(opening.cover);
  }

  // glow and label: your own rules
  getRoomState(room) {
    const st = super.getRoomState(room);
    if (room.id === 'bathroom' && this.hass.states['fan.bathroom']?.state === 'on') st.sub = 'Fan on';
    return st;
  }

  // objects in the scene (plan coordinates in cm: x → x, plan y → z, height → y)
  onSceneReady(scene) {
    const sofa = new THREE.Mesh(new THREE.BoxGeometry(200, 40, 90),
      new THREE.MeshStandardMaterial({ color: 0x556070 }));
    sofa.position.set(250, 30, 330);
    scene.addToRoom('living', sofa);      // fades with the room when another room is focused
  }

  // chips, badges, anything over the 3D view
  onHassUpdate(hass) {
    if (!this._chip) { this._chip = document.createElement('div'); this.overlay.appendChild(this._chip); }
    this._chip.textContent = `${hass.states['sensor.power']?.state ?? '–'} W`;
  }

  extraStyles() { return '#overlay div{position:absolute;right:60px;top:14px;color:#ffb35c}'; }
}
customElements.define('my-home-card', MyHomeCard);
```

## Hooks
| Method | Default | Notes |
|---|---|---|
| `roomName(room)` | `name`, else the area name, else `id` | |
| `getRoomEntities(room)` | entities of the area (or `entities:`), sorted by domain | used by the default panel |
| `getRoomState(room)` | `{ glow: {intensity, color}, sub: "21.4° · 48%" }` | called on every `hass` update: keep it cheap |
| `renderRoomPanel(room, list)` | native tile cards (plain rows outside HA) | may be `async`; check `this._room === room.id` after awaits |
| `onOpeningTap(opening)` | more-info of `cover`, else `contact` | `opening` has `id, type, name, cover, contact, rooms, center…` |
| `onSceneReady(scene)` | — | once per config; `scene.addToRoom(roomId, object3D)` |
| `onHassUpdate(hass)` | — | after the scene has been updated |
| `extraStyles()` | `''` | CSS added to the shadow root |

Helpers: `selectRoom(id | null)`, `openMoreInfo(entityId)`, `this.overlay` (layer over the canvas),
`this.hass`. Event: `floorplan-room-changed` (`detail.room`).

`room` objects are the normalized rooms: `id, name, area, poly, bbox, labelAt, floor, entities, exclude,
lights, temperature, walls, raw` (`raw` is the YAML as written, so you can add your own keys to it).

## Scene API (`FloorplanScene`)
`setRoomGlow(id, 0..1, [r,g,b])`, `setRoomSubLabel(id, text)`, `setRoomName(id, text)`,
`setShutter(openingId, closed 0..1)`, `setOpenAlert(openingId, bool)`, `focusRoom(id | null)`, `resetView()`,
`setTheme('dark' | 'light')`, `setAutoRotate(bool)`, `addToRoom(id, object3D)`, `invalidate()` (draw one
frame after you changed something yourself), `scene`, `camera`, `world` (Three.js objects).

Draw on demand: after changing objects directly, call `scene.invalidate()`; nothing is redrawn otherwise.
