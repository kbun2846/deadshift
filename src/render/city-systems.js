// Lumen's city systems, registered with the hub (city-features.js) in the
// order they run each frame: the rain first (it sets the wetness and the
// masks), the signs (they register the emitters), the light pool (it reads
// them), the steam, the water and the wildlife, the mirror last (it draws
// what the others have set up). The soundscape registers itself from main.js
// (lumen-ambience.js).
import '../effects/rain.js';
import './city-signs.js';
import './city-entrances.js'; // (the doorways' light on the street, 2026-10-01)
import './light-pool.js';
import '../effects/steam-vents.js'; // (the steam vents' clouds; before the mirror, which reflects them)
import '../effects/lumen-water.js'; // (the water on the ground: prints, rings, gutters, drips, steam)
import '../effects/lumen-life.js'; // (pigeons and rats)
import '../effects/lumen-wrecks.js'; // (the wreck scenes: smoke, embers, arcs, sparks)
import '../effects/lumen-holograms.js'; // (stage 5: the holographic ads; projectors are sign pieces, so after the signs)
import '../effects/lumen-lights-life.js'; // (stage 5: moths at the lamps, mist halos; reads the signs' emitters)
import '../effects/lumen-interior-life.js'; // (stage 5: the interiors' machines and steam, the bus's doors)
import './city-detail.js'; // (stage 5: the street detail's finer tiers by preset)
import './ground-mirror.js';
import './city-interior-models.js'; // (the interiors' furniture, built with the shells: registers CITY_INTERIORS.build)
export { CityFeatures, BRIGHT_LAYER } from './city-features.js';
export { GROUND_LAYER } from './ground-mirror.js';
