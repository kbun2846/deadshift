// The one place the game's version lives; the menus and HUD read it from here.
// Owner, 2026-09-30: versions are numbered like v0.1.0, with the stage after a
// dash where the full form shows (v0.1.0-alpha: GitHub, the README and
// CHANGELOG, Settings); the title screen and the corner in game show the
// number alone (v0.1.0), and the browser tab shows no version at all.
export const VERSION = '0.1.8';
export const STAGE = 'alpha';
export const VERSION_FULL = VERSION + '-' + STAGE;
export const TAB_TITLE = 'deadstab';
