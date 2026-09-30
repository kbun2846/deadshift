import test from 'node:test';
import assert from 'node:assert/strict';
import { FPS, createFpsLook, seedFpsLook, turnFpsLook, fpsMove, fpsAim } from '../src/fps-mode.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('first person: W walks where you look, D steps to your right', () => {
 const look = createFpsLook(); look.yaw = 0; // facing +x (east)
 let m = fpsMove(look, 0, -1); near(m.moveX, 1); near(m.moveZ, 0);
 m = fpsMove(look, 1, 0); near(m.moveX, 0); near(m.moveZ, 1); // right of east is south (+z)
 look.yaw = -Math.PI / 2; // facing north (-z)
 m = fpsMove(look, 0, -1); near(m.moveX, 0); near(m.moveZ, -1);
 m = fpsMove(look, 1, 0); near(m.moveX, 1); near(m.moveZ, 0);
});

test('first person: the mouse turns right with a move right, pitch is clamped, the look starts on the aim', () => {
 const look = createFpsLook(); seedFpsLook(look, { aimX: 0, aimZ: 1 }); near(look.yaw, Math.PI / 2);
 turnFpsLook(look, 100, 0); assert.ok(look.yaw > Math.PI / 2);
 turnFpsLook(look, 0, -1e6); near(look.pitch, FPS.pitchLimit);
 turnFpsLook(look, 0, 1e6); near(look.pitch, -FPS.pitchLimit);
});

test('first person: the aim follows the yaw, its point where the crosshair meets the aim height', () => {
 const look = createFpsLook(); look.yaw = 0; look.pitch = 0;
 let a = fpsAim(look, { x: 2, z: 3 }); near(a.aimX, 1); near(a.aimZ, 0); near(a.aimPointX, 2 + FPS.farAim); near(a.aimPointZ, 3);
 look.pitch = -Math.atan((FPS.eyeHeight - FPS.aimHeight) / 10); // looking down onto a point 10 m ahead
 a = fpsAim(look, { x: 0, z: 0 }); near(a.aimPointX, 10);
});
