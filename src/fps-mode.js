// First-person view (dev only: Developer tools > Display > First-person view).
// A quick prototype, keyboard and mouse only (owner, 2026-09-29: "make the game
// into an fps just accessible through dev tools ... just a playable version").
//
// Nothing in the simulation changes: the rules stay flat (x/z), so this only
// swaps what the camera shows and how the mouse and WASD feed the same input.
// The mouse turns a yaw (and a look-only pitch) under pointer lock; the aim is
// the yaw, and the aim point is where the crosshair's ray meets the aim height
// (far ahead when looking level or up). WASD walk relative to the yaw. The
// renderer puts the camera at the player's eye and hides your own body.
// Every weapon runs through the same input, so all of them "work", some
// better than others (anything drawn for the overhead view looks odd).

export const FPS = Object.freeze({
 eyeHeight: 1.55,     // metres above where the player stands
 fov: 75,             // vertical degrees
 near: .05,           // the overhead camera's near plane (2 m) would clip everything
 sensitivity: .0022,  // radians per pixel of mouse movement
 pitchLimit: 1.35,    // radians up or down
 aimHeight: .7,       // shots fly at this height (renderer.js aim plane)
 farAim: 40,          // aim point distance when the crosshair does not meet the ground
 nearAim: 2,          // closest aim point when looking straight down
});

export function createFpsLook() { return { yaw: 0, pitch: 0, fresh: true }; }

// The first frame in first person faces where the player already aims.
export function seedFpsLook(look, player) {
 if (!look.fresh) return;
 const x = player.aimX || 0, z = player.aimZ || 0;
 look.yaw = x || z ? Math.atan2(z, x) : 0; look.pitch = 0; look.fresh = false;
}

export function turnFpsLook(look, dx, dy) {
 look.yaw += dx * FPS.sensitivity;
 look.pitch = Math.max(-FPS.pitchLimit, Math.min(FPS.pitchLimit, look.pitch - dy * FPS.sensitivity));
}

// WASD as the game reads them (moveX = D - A, moveZ = S - W) turned to the
// yaw: W walks where you look, D steps to your right.
export function fpsMove(look, moveX, moveZ) {
 const fx = Math.cos(look.yaw), fz = Math.sin(look.yaw), forward = -moveZ;
 // Right of forward (fx, fz) on the ground, y up: (-fz, fx).
 return { moveX: fx * forward - fz * moveX, moveZ: fz * forward + fx * moveX };
}

export function fpsAim(look, player) {
 const fx = Math.cos(look.yaw), fz = Math.sin(look.yaw), drop = FPS.eyeHeight - FPS.aimHeight;
 const distance = look.pitch < -.01 ? Math.max(FPS.nearAim, Math.min(FPS.farAim, drop / Math.tan(-look.pitch))) : FPS.farAim;
 return { aimX: fx, aimZ: fz, aimPointX: player.x + fx * distance, aimPointZ: player.z + fz * distance };
}

// Camera at the eye, looking along yaw and pitch. `camera` is the three.js
// PerspectiveCamera; `saved` keeps the overhead fov/near to restore.
export function placeFpsCamera(camera, look, x, y, z) {
 camera.position.set(x, y + FPS.eyeHeight, z);
 const c = Math.cos(look.pitch);
 camera.lookAt(x + Math.cos(look.yaw) * c, y + FPS.eyeHeight + Math.sin(look.pitch), z + Math.sin(look.yaw) * c);
 if (camera.fov !== FPS.fov || camera.near !== FPS.near) { camera.fov = FPS.fov; camera.near = FPS.near; camera.updateProjectionMatrix(); }
 camera.updateMatrixWorld();
}

// Pointer lock, the crosshair, and the mouse. `active()` says whether first
// person is on and the game is being played; `onUnlock` runs when the browser
// lets go of the pointer (Esc), so the game can pause.
export function installFpsInput({ world, look, active, onUnlock }) {
 const style = document.createElement('style');
 style.textContent = `
  body.fps-playing #reticle, body.fps-playing .aim-cone, body.fps-playing .rifle-spread, body.fps-playing #charge-ring, body.fps-playing .omen-cursor-timer { display: none !important; }
  body.fps-playing, body.fps-playing * { cursor: none !important; }
  .fps-crosshair { position: fixed; left: 50%; top: 50%; width: 14px; height: 14px; transform: translate(-50%, -50%); pointer-events: none; z-index: 5; display: none; }
  .fps-crosshair::before, .fps-crosshair::after { content: ''; position: absolute; background: #fff; box-shadow: 0 0 2px #000; }
  .fps-crosshair::before { left: 6px; top: 0; width: 2px; height: 14px; }
  .fps-crosshair::after { top: 6px; left: 0; width: 14px; height: 2px; }
  body.fps-playing .fps-crosshair { display: block; }`;
 document.head.append(style);
 const cross = document.createElement('div'); cross.className = 'fps-crosshair'; document.body.append(cross);
 const locked = () => document.pointerLockElement === world;
 // Pointer capture is refused while the pointer is locked (the game captures
 // on every press); skip it then rather than throw.
 const capture = world.setPointerCapture.bind(world);
 world.setPointerCapture = id => { if (document.pointerLockElement) return; try { capture(id); } catch { /* released pointer */ } };
 // Locking needs a press: the first click on the world takes the pointer.
 world.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || !active() || locked()) return;
  const request = world.requestPointerLock?.(); request?.catch?.(() => {});
 }, true);
 document.addEventListener('mousemove', e => { if (locked() && active()) turnFpsLook(look, e.movementX || 0, e.movementY || 0); });
 document.addEventListener('pointerlockchange', () => { if (!locked() && active()) onUnlock?.(); });
 return {
  // Every frame: the body class (the crosshair only while playing), and let
  // go of the pointer outside play.
  sync(on, playing) {
   const shown = on && playing;
   if (document.body.classList.contains('fps-playing') !== shown) document.body.classList.toggle('fps-playing', shown);
   if (!on) look.fresh = true;
   if ((!on || !playing) && locked()) document.exitPointerLock?.();
  },
 };
}
