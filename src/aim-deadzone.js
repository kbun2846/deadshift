// Superseded by aim-damping.js, which replaced the deadzone with a gain curve
// and a turn-rate ceiling. Kept only so nothing referring to the old path
// silently gets a second, diverging implementation. Safe to delete.
export {AIM_FEEL, aimsByPoint, createAimDamping} from './aim-damping.js';
export {AIM_FEEL as AIM_DEADZONE_FEEL} from './aim-damping.js';
