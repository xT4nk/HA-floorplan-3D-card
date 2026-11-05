// Invented demo apartment (8.2 × 7.6 m), used by getStubConfig, the preview and the tests.
export const DEMO_PLAN = {
  rooms: [
    { id: 'living',   name: 'Living room', area: 'living_room', rect: [0, 0, 520, 420], floor: 'wood' },
    { id: 'kitchen',  name: 'Kitchen',     area: 'kitchen',     rect: [520, 0, 300, 260], floor: 'tile' },
    { id: 'hall',     name: 'Hall',        area: 'hallway',     rect: [520, 260, 300, 160], floor: 'wood' },
    { id: 'bedroom',  name: 'Bedroom',     area: 'bedroom',     rect: [0, 420, 380, 340], floor: 'wood' },
    { id: 'bathroom', name: 'Bathroom',    area: 'bathroom',    rect: [380, 420, 200, 200], floor: 'tile' },
    { id: 'closet',   name: 'Closet',      area: 'closet',      rect: [380, 620, 200, 140], floor: 'wood' },
    { id: 'office',   name: 'Office',      area: 'office',
      points: [[580, 420], [820, 420], [820, 760], [580, 760]], floor: 'carpet' },
    { id: 'balcony',  name: 'Balcony',     rect: [-140, 60, 140, 300], floor: 'concrete', walls: false,
      railing: true, part_of: 'living' },
  ],
  openings: [
    { type: 'opening', from: [520, 40], to: [520, 220] },               // open kitchen
    { type: 'door',    at: [520, 340], width: 90 },                      // living ↔ hall
    { type: 'door',    at: [820, 340], width: 95, name: 'Front door' },  // entrance
    { type: 'door',    at: [200, 420] },                                 // living ↔ bedroom
    { type: 'door',    at: [550, 420], width: 50 },                      // hall ↔ bathroom
    { type: 'door',    at: [700, 420] },                                 // hall ↔ office
    { type: 'door',    at: [380, 690], width: 70 },                      // bedroom ↔ closet
    { type: 'door',    at: [0, 300], width: 90, sill: 0, name: 'Balcony door' },
    { type: 'window',  at: [260, 0],   width: 200, name: 'Living room window', cover: 'cover.living_room' },
    { type: 'window',  at: [0, 150],   width: 140, name: 'Balcony window', cover: 'cover.balcony' },
    { type: 'window',  at: [670, 0],   width: 100, name: 'Kitchen window', contact: 'binary_sensor.kitchen_window' },
    { type: 'window',  at: [0, 590],   width: 140, name: 'Bedroom window', cover: 'cover.bedroom' },
    { type: 'window',  at: [700, 760], width: 120, name: 'Office window', cover: 'cover.office' },
  ],
};
