# Roadmap

Where the card is going: what is done, what comes next, and ideas for later. The details of each version
are in the [changelog](CHANGELOG.md). Plans can change.
Ideas and requests are welcome in the issues.

The goal: one card for the whole home. The 3D plan, the room panel, and tiles and popups for every common
device, all built on Home Assistant's standard entities. That way they work with any brand that has an
integration, and you configure them in YAML.

## Done

| Version | What it brought |
|---|---|
| 0.1.0 | The 3D plan from a few lines of YAML: walls built from the rooms, doors and windows, live lights, shutters and temperatures, tap a room to zoom in and list its area's entities |
| 0.2.0 | `theme: sun`; rooms that belong to another one (`part_of`: a balcony opens the living room) and railings for open areas; the room temperature uses the sensor chosen for the area in Home Assistant; hooks for extensions |
| 0.3.0 | The room panel in sections: sensor chips at the top, entities grouped by domain, one switch for all the lights of the room; `sections` option to rename and reorder them |

## Next

All the device tiles and popups come in the 0.4 series, one group per release.

| Version | Status | Planned |
|---|---|---|
| 0.4.0 | To be released | The card's own tiles and popups for **lights** and **covers**: brightness, colour temperature, colour wheel, shutter dragged to a position, instant response to taps, warnings for low battery or unavailable devices; `light_groups`; `tiles: native` to keep Home Assistant's tile cards |
| 0.4.1 | In testing | Tiles and popups for **climate** (dial for the target temperature, modes, fan, swing, filter hours, back on in the last mode) and **switches** |
| 0.4.2 | Planned | **TV and media players**: now playing, volume, sources, power. The remote tab uses [TV Remote Card](https://github.com/xT4nk/HA-TV-Remote-Card) when it is installed; without it, the popup shows the standard media controls |
| 0.4.3 | Planned | **Vacuums**. A generic part for every brand: state, start, pause, return to base, suction power, and the battery, also when it is a separate sensor of the device. Model profiles, chosen automatically from the device's model, add base actions, consumables and fault codes. First profile: Xiaomi Robot Vacuum X20+ (`xiaomi_home` integration). More models can be added as profiles |
| 0.4.4 | Planned | **Weather sky and overview**: the sky behind the plan follows the weather and the sun (clouds, rain, snow, stars at night), with the temperature and the next 24 hours on screen; the home's power with a limit and a 24 h graph, the shopping list (`todo`), and chips for the devices that are running |

## Later

Ideas, in no fixed order.

- **More device types.** The card's own tiles and popups (from 0.4.0) use the attributes every integration has,
  but not yet `supported_features`, the list of what each device can actually do. Planned:
  - covers without position or stop (simple motors, gates, garage doors): only the buttons they support;
  - covers with tilting slats (venetian blinds);
  - thermostats with two targets (heat and cool at the same time, `target_temp_low` / `target_temp_high`);
  - temperature step and unit from the device (0.5°, °F) instead of whole degrees;
  - power on with `set_hvac_mode` when the climate has no `turn_on`;
  - controls hidden on climates without a settable temperature;
  - fan speeds with the names translated by Home Assistant.
- **Visual editor**: draw the rooms instead of typing coordinates, maybe over a picture of the plan.
- **1.0.0**: once the YAML format is stable, with the card in HACS's default list.
