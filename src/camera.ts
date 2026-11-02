import * as THREE from 'three';
import { BOARD_D, BOARD_W } from './game/catalog';

/** Minimal surface of drei/three-stdlib OrbitControls that the on-screen buttons need. */
export type ControlsLike = {
  target: THREE.Vector3;
  object: THREE.Camera;
  minDistance: number;
  maxDistance: number;
  update: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

export const DEFAULT_CAMERA_POS = new THREE.Vector3(BOARD_W / 2 - 6, 34, BOARD_D / 2 + 44);
export const DEFAULT_TARGET = new THREE.Vector3(BOARD_W / 2 - 6, 0, BOARD_D / 2);
export const MIN_DISTANCE = 12;
export const MAX_DISTANCE = 110;

const state: { controls: ControlsLike | null } = { controls: null };
const listeners = new Set<(distance: number) => void>();

function notify() {
  const c = state.controls;
  if (!c) return;
  const d = c.object.position.distanceTo(c.target);
  for (const fn of listeners) fn(d);
}

export function registerControls(controls: ControlsLike | null) {
  if (state.controls) state.controls.removeEventListener('change', notify);
  state.controls = controls;
  if (controls) { controls.addEventListener('change', notify); notify(); }
}

export function onDistanceChange(fn: (distance: number) => void) {
  listeners.add(fn);
  notify();
  return () => { listeners.delete(fn); };
}

export function currentDistance(): number {
  const c = state.controls;
  return c ? c.object.position.distanceTo(c.target) : DEFAULT_CAMERA_POS.distanceTo(DEFAULT_TARGET);
}

export function setDistance(distance: number) {
  const c = state.controls;
  if (!c) return;
  const d = THREE.MathUtils.clamp(distance, c.minDistance, c.maxDistance);
  const dir = c.object.position.clone().sub(c.target).normalize();
  c.object.position.copy(c.target).addScaledVector(dir, d);
  c.update();
  notify();
}

export function zoomBy(factor: number) {
  setDistance(currentDistance() * factor);
}

/** Pan in screen-relative directions: right (+x) / forward (-z on screen = away from viewer). */
export function pan(right: number, forward: number) {
  const c = state.controls;
  if (!c) return;
  const cam = c.object;
  const dirRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion); dirRight.y = 0; dirRight.normalize();
  const dirFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); dirFwd.y = 0; dirFwd.normalize();
  const step = Math.max(2, currentDistance() * 0.08);
  const delta = dirRight.multiplyScalar(right * step).add(dirFwd.multiplyScalar(forward * step));
  c.target.add(delta);
  cam.position.add(delta);
  c.update();
}

/** Rotate the view around the vertical axis through the target. */
export function rotate(degrees: number) {
  const c = state.controls;
  if (!c) return;
  const offset = c.object.position.clone().sub(c.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(degrees));
  c.object.position.copy(c.target).add(offset);
  c.update();
}

/** Tilt the view up/down (polar angle). */
export function tilt(degrees: number) {
  const c = state.controls;
  if (!c) return;
  const offset = c.object.position.clone().sub(c.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.phi = THREE.MathUtils.clamp(spherical.phi + THREE.MathUtils.degToRad(degrees), 0.15, Math.PI / 2 - 0.08);
  offset.setFromSpherical(spherical);
  c.object.position.copy(c.target).add(offset);
  c.update();
}

export function resetView() {
  const c = state.controls;
  if (!c) return;
  c.target.copy(DEFAULT_TARGET);
  c.object.position.copy(DEFAULT_CAMERA_POS);
  c.update();
  notify();
}
