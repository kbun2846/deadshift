// Development builds only: a JSON snapshot of the game on the canvas's
// data-debug attribute, for tests and for poking at state in the inspector.
export function writeDebugState(canvas, { sim, view, sound, settings, running, paused, measuredFPS, inputMode }) {
  canvas.dataset.debug = JSON.stringify({
    running, paused, time: sim.time, effectTime: view.effectTime, player: sim.player,
    camera: { x: view.focus.x, z: view.focus.z, height: view.cameraHeight }, roof: sim.roofId,
    targets: sim.targets.map(t => ({id:t.id,kind:t.kind,hp:t.hp,maxHp:t.maxHp})), roofs: view.roofs.map(r => ({ id: r.id, opacity: r.opacity })), spray: sim.spray, hexCooldown: sim.hexCooldown, hexSpin: sim.hexSpin ? {age:sim.hexSpin.age,edges:sim.hexSpin.edges} : null, hexOrbs: sim.hexOrbs, seeds: sim.seeds.length, ammo: sim.ammo,
    rechargeProgress: sim.rechargeProgress, rechargeWait: sim.rechargeWait,
    crops: sim.crops.map(c => ({ id: c.id, state: c.state, burnAge: c.burnAge })),
    bentStalks: [...view.cropView.parts.values()].reduce((n, p) => n + p.stalks.filter(s => s.bend > .01).length, 0),
    shots: sim.shots.map(s => ({ id: s.id, phase: s.phase, x: s.x, z: s.z, damage: s.damage })), stats: sim.stats,
    props: sim.props.filter(p => p.health !== null).map(p => ({ id: p.id, type: p.type, x: p.x, z: p.z, hp: p.hp })),
    beams: [...view.beams.values()].map(b => ({ age: b.age, finished: b.finished, startX: b.startX, startZ: b.startZ, endX: b.endX, endZ: b.endZ })),
    particles: view.particles.length, particleLife: view.particles[0]?.life,
    footprints: view.footprints.map(p => ({ x: p.x, z: p.z, age: p.age })), surfaceMarks: view.surfaceMarks.count,
    blasts: view.blasts.map(b => ({ x: b.x, z: b.z, radius: b.radius, age: b.age })),
    debris: view.particles.filter(p => p.debris).map(p => ({ x: p.x, z: p.z, y: p.y, vx: p.vx, vz: p.vz, bounces: p.bounces })),
    tumbleweeds: view.tumbleweeds.map(t => ({ x: t.position.x, z: t.position.z, age: t.userData.age })),
    moteX: view.motes.geometry.attributes.position.array[0],
    graphics: { preset: settings.quality, fpsCap: settings.fps, measuredFPS, pixelRatio: view.renderer.getPixelRatio(), shadowSize: view.quality.shadows, textureSize: view.quality.texture, motes: view.quality.motes, effects: view.quality.effects },
    inputMode, drawCalls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, audio: sound.context?.state ?? 'not-started',
  });}
