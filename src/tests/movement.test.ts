import { describe, expect, it } from 'vitest';
import { approachVelocity, targetVelocity, type MoveInput } from '../systems/Movement';

const tuning = { walkSpeed: 150, sprintMultiplier: 1.65, acceleration: 14, deceleration: 18 };
const none: MoveInput = { up: false, down: false, left: false, right: false, sprint: false };

describe('targetVelocity', () => {
  it('is zero with no input', () => {
    expect(targetVelocity(none, tuning, { x: 9, y: 9 })).toEqual({ x: 0, y: 0 });
  });

  it('diagonal speed equals straight speed', () => {
    const straight = targetVelocity({ ...none, right: true }, tuning, { x: 0, y: 0 });
    const diag = targetVelocity({ ...none, right: true, up: true }, tuning, { x: 0, y: 0 });
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(Math.hypot(straight.x, straight.y), 6);
    expect(diag.x).toBeGreaterThan(0);
    expect(diag.y).toBeLessThan(0);
  });

  it('opposite keys cancel', () => {
    expect(targetVelocity({ ...none, left: true, right: true }, tuning, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('sprint multiplies speed only while moving', () => {
    const s = targetVelocity({ ...none, down: true, sprint: true }, tuning, { x: 0, y: 0 });
    expect(s.y).toBeCloseTo(150 * 1.65);
    expect(targetVelocity({ ...none, sprint: true }, tuning, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('approachVelocity', () => {
  it('never overshoots the target and converges', () => {
    let v = { x: 0, y: 0 };
    const target = { x: 150, y: 0 };
    for (let i = 0; i < 120; i++) {
      v = approachVelocity(v, target, tuning, 1 / 60, { x: 0, y: 0 });
      expect(v.x).toBeLessThanOrEqual(150);
    }
    expect(v.x).toBeCloseTo(150, 1);
  });

  it('is frame-rate independent', () => {
    const run = (fps: number) => {
      let v = { x: 0, y: 0 };
      for (let i = 0; i < fps / 2; i++) v = approachVelocity(v, { x: 150, y: 0 }, tuning, 1 / fps, { x: 0, y: 0 });
      return v.x;
    };
    expect(run(30)).toBeCloseTo(run(144), 3);
  });

  it('clamps huge frame deltas', () => {
    const v = approachVelocity({ x: 0, y: 0 }, { x: 150, y: 0 }, tuning, 5, { x: 0, y: 0 });
    expect(v.x).toBeLessThanOrEqual(150);
    expect(Number.isFinite(v.x)).toBe(true);
  });

  it('snaps to a full stop when releasing keys', () => {
    let v = { x: 150, y: -150 };
    for (let i = 0; i < 60; i++) v = approachVelocity(v, { x: 0, y: 0 }, tuning, 1 / 60, { x: 0, y: 0 });
    expect(v).toEqual({ x: 0, y: 0 });
  });
});
