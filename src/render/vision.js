// What you can see: the grey shroud outside the room you are in and the crop
// field view, painted from sight polygons. Methods of WorldView
// (renderer.js); `this` is the view.
import { RULES } from '../simulation.js';
import { cropImmersion } from '../crops.js';
import { interiorPolygons, projectVisionPolygon, roomBox } from './vision-polygons.js';
import { viewWidth, viewHeight } from '../viewport.js';
import { VISION_REPAINT, VISION_SHROUD } from './renderer.js';

export const Vision = {
  updateVision(sim) { this.updateCropVision(sim); this.updateInteriorVision(sim); },

  updateCropVision(sim) {
    const immersion=cropImmersion(sim.crops,sim.player,RULES.radius),crop=immersion?.crop;
    const cropDisplay = crop ? 'block' : 'none';
    // Writing an unchanged display value still invalidates style on every frame.
    if (this.cropDisplay !== cropDisplay) { this.cropDisplay = cropDisplay; this.cropOverlay.style.display = cropDisplay; }
    if (!crop) { this.cropMaskKey = null; return; }
    const c = this.screenPoint(sim.player.x, sim.player.z, .7);
    const edge = this.screenPoint(sim.player.x + crop.visibility, sim.player.z, .7);
    const radius = Math.abs(edge.x - c.x);
    this.cropOverlay.style.opacity = immersion.entryOpacity;
    // The gradient tracks the player every frame, which is cheap; the field
    // silhouette behind it is soft and slow, so it is rate-capped per tier.
    const quantise = (value, step) => Math.round(value / step);
    const maskKey = [quantise(c.x, 2), quantise(c.y, 2), quantise(radius, 2), quantise(immersion.outerOpacity, .02),
      immersion.sections.length, viewWidth(), viewHeight()].join(',');
    if (this.cropMaskKey === maskKey) return;
    if (this.cropMaskClock > this.effectTime && this.cropMaskKey) return;
    this.cropMaskClock = this.effectTime + (VISION_REPAINT[this.qualityName] || VISION_REPAINT.balanced);
    this.cropMaskKey = maskKey;
    const sections = immersion.outerOpacity >= 1 ? [] : immersion.sections.map(section => projectVisionPolygon(
      [{x:section.x-section.w/2,z:section.z-section.d/2},{x:section.x+section.w/2,z:section.z-section.d/2},
       {x:section.x+section.w/2,z:section.z+section.d/2},{x:section.x-section.w/2,z:section.z+section.d/2}],
      this.camera, viewWidth(), viewHeight()));
    this.paintCrop(sections, c, radius, immersion.outerOpacity, Math.max(28, radius * .32));
  },

  // Standing in a crop, the world is visible close by and swallowed further out,
  // and only inside the field at all. Both of those are alpha, so they are one
  // paint: lay the mask down, then keep it only where the falloff says to.
  paintCrop(polygons, center, radius, outerOpacity, feather) {
    const context = this.cropContext;
    if (!context) return;
    const { width, height } = this.cropOverlay;
    const scaleX = width / viewWidth(), scaleY = height / viewHeight();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.clearRect(0, 0, width, height);
    context.fillStyle = `rgba(0,0,0,${Math.min(1, Math.max(0, outerOpacity))})`;
    context.fillRect(0, 0, width, height);
    if (polygons.length) {
      // The old pass eroded before blurring so the soft edge did not spill past
      // the field. At this resolution the blur is a couple of pixels wide and
      // the upscale carries the rest, so the erode is not worth a second pass.
      context.filter = `blur(${Math.max(1, feather * scaleX * .5).toFixed(1)}px)`;
      context.fillStyle = '#000';
      for (const points of polygons) {
        if (points.length < 3) continue;
        context.beginPath();
        context.moveTo(points[0].x * scaleX, points[0].y * scaleY);
        for (let i = 1; i < points.length; i++) context.lineTo(points[i].x * scaleX, points[i].y * scaleY);
        context.closePath();
        context.fill();
      }
      context.filter = 'none';
    }
    // Everything painted so far is the mask. The falloff now decides how much of
    // it survives, centred on the player and slightly wider than it is tall.
    context.globalCompositeOperation = 'destination-in';
    const x = center.x * scaleX, y = center.y * scaleY, r = Math.max(1, radius * scaleX);
    context.save();
    context.translate(x, y); context.scale(1.25, 1.14);
    const falloff = context.createRadialGradient(0, 0, 0, 0, 0, r);
    falloff.addColorStop(.18, 'rgba(0,0,0,0)'); falloff.addColorStop(.32, 'rgba(0,0,0,.12)');
    falloff.addColorStop(.5, 'rgba(0,0,0,.42)'); falloff.addColorStop(.7, 'rgba(0,0,0,.76)');
    falloff.addColorStop(.88, 'rgba(0,0,0,.95)'); falloff.addColorStop(1, '#000');
    context.fillStyle = falloff;
    context.fillRect(-width * 2, -height * 2, width * 4, height * 4);
    context.restore();
    context.globalCompositeOperation = 'source-over';
  },

  updateInteriorVision(sim) {
    const room = sim.interior; // (an open shed too: renderer.js cameraRoom)
    const visionDisplay = room ? 'block' : 'none';
    // Gated the same way the crop overlay beside it is: writing an unchanged
    // display value still invalidates style on every frame.
    if (this.visionDisplay !== visionDisplay) {
      this.visionDisplay = visionDisplay;
      this.visionOverlay.style.display = visionDisplay;
    }
    if (!room) { this.visionMaskClock = 0; this.visionMaskKey = null; return; }
    // Quantised so sub-pixel camera drift is not movement, and rate-capped --
    // far more loosely than the SVG version needed, because a repaint at a
    // twelfth of the viewport costs a fraction of what two filter passes did.
    const quantise = (value, step) => Math.round(value / step);
    const cameraKey = [room.id, viewWidth(), viewHeight(),
      ...this.camera.matrixWorld.elements.map(e => quantise(e, .01)),
      ...this.camera.projectionMatrix.elements.map(e => quantise(e, .01))].join(',');
    const maskKey = cameraKey + ',' + quantise(sim.player.x, .05) + ',' + quantise(sim.player.z, .05);
    if (this.visionMaskKey === maskKey) return;
    // The shroud is painted in screen space, so a camera that moved since the
    // last paint (the push-in on entering a room, the follow camera) must be
    // repainted this frame: held back by the rate cap, the shadow cones lagged
    // the walls they are cut from and jittered against them.
    const cameraMoved = this.visionCameraKey !== cameraKey;
    this.visionCameraKey = cameraKey;
    if (!cameraMoved && this.visionMaskClock > this.effectTime && this.visionMaskKey) return;
    this.visionMaskClock = this.effectTime + (VISION_REPAINT[this.qualityName] || VISION_REPAINT.balanced);
    this.visionMaskKey = maskKey;
    // The room's own box is never shrouded (vision-polygons.js roomBox); the
    // openings' cones are laid at .7 m over its floor.
    const polygons = roomBox(room).concat(interiorPolygons(room, sim.player));
    this.paintVision(polygons.map(points => projectVisionPolygon(points, this.camera, viewWidth(), viewHeight(), .7 + (room.baseY || 0))));
  },

  // Paints the shroud: a flat wash over the viewport with the clear regions
  // punched out of it. Everything is in the low-resolution buffer's own pixels,
  // so the cost is fixed by the tier rather than by the device's screen.
  paintVision(polygons) {
    const context = this.visionContext;
    if (!context) return;
    const { width, height } = this.visionOverlay;
    const scaleX = width / viewWidth(), scaleY = height / viewHeight();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, width, height);
    context.fillStyle = VISION_SHROUD[this.qualityName] || VISION_SHROUD.balanced;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = '#000';
    for (const points of polygons) {
      if (points.length < 3) continue;
      context.beginPath();
      context.moveTo(points[0].x * scaleX, points[0].y * scaleY);
      for (let i = 1; i < points.length; i++) context.lineTo(points[i].x * scaleX, points[i].y * scaleY);
      context.closePath();
      context.fill();
    }
    context.globalCompositeOperation = 'source-over';
  },
};
