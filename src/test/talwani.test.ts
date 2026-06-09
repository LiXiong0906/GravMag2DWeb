import { describe, expect, it } from 'vitest';
import type { FieldSettings, PolygonBody } from '../domain/types';
import {
  computeGravityTalwani,
  computeMagneticTalwani,
  computeModelResponse,
  horizontalCylinderGravityMgal,
  makeCircularPolygon
} from '../domain/talwani';

const defaultField: FieldSettings = {
  fieldIntensityNt: 50000,
  inclinationDeg: 58,
  declinationDeg: -6,
  profileAzimuthDeg: 90
};

function makeBody(overrides: Partial<PolygonBody> = {}): PolygonBody {
  return {
    id: 'test-body',
    name: 'Test body',
    color: '#0f766e',
    visible: true,
    densityContrastKgM3: 500,
    susceptibilitySI: 0.02,
    vertices: makeCircularPolygon(0, 500, 200, 96),
    ...overrides
  };
}

describe('Talwani gravity polygon forward model', () => {
  it('matches the horizontal cylinder analytic response for a circular polygon', () => {
    const radius = 200;
    const centerZ = 500;
    const densityContrast = 500;
    const body: PolygonBody = makeBody({
      densityContrastKgM3: densityContrast,
      susceptibilitySI: 0.02,
      vertices: makeCircularPolygon(0, centerZ, radius, 160)
    });
    const observationXs = [-900, -450, 0, 450, 900];
    const modeled = computeGravityTalwani(observationXs, body);

    observationXs.forEach((x, index) => {
      const expected = horizontalCylinderGravityMgal(x, 0, centerZ, radius, densityContrast);
      expect(modeled[index]).toBeCloseTo(expected, 2);
    });
  });

  it('is invariant to vertex order after normalization', () => {
    const vertices = makeCircularPolygon(0, 420, 180, 72);
    const body: PolygonBody = makeBody({
      densityContrastKgM3: 430,
      susceptibilitySI: 0.01,
      vertices
    });
    const reversedBody = {
      ...body,
      vertices: [...vertices].reverse()
    };
    const xs = [-300, 0, 300];
    expect(computeGravityTalwani(xs, body)).toEqual(computeGravityTalwani(xs, reversedBody));
  });

  it('stays finite for shallow and zero-contrast edge cases', () => {
    const body: PolygonBody = makeBody({
      densityContrastKgM3: 0,
      susceptibilitySI: 0,
      vertices: [
        { x: -100, z: 1 },
        { x: 120, z: 4 },
        { x: 80, z: 120 },
        { x: -90, z: 100 }
      ]
    });
    const gravity = computeGravityTalwani([-50, 0, 50], body);
    const magnetic = computeMagneticTalwani([-50, 0, 50], body, defaultField);
    expect(gravity.every(Number.isFinite)).toBe(true);
    expect(magnetic.every(Number.isFinite)).toBe(true);
    expect(gravity).toEqual([0, 0, 0]);
    expect(magnetic).toEqual([0, 0, 0]);
  });
});

describe('Induced magnetic polygon forward model', () => {
  it('returns zero response when susceptibility is zero', () => {
    const body: PolygonBody = makeBody({
      densityContrastKgM3: 450,
      susceptibilitySI: 0,
      vertices: makeCircularPolygon(0, 420, 160, 64)
    });
    expect(computeMagneticTalwani([-200, 0, 200], body, defaultField)).toEqual([0, 0, 0]);
  });

  it('changes shape when field inclination changes', () => {
    const body: PolygonBody = makeBody({
      densityContrastKgM3: 450,
      susceptibilitySI: 0.035,
      vertices: makeCircularPolygon(0, 420, 160, 64)
    });
    const lowInclination = computeMagneticTalwani(
      [-300, -100, 100, 300],
      body,
      { ...defaultField, inclinationDeg: 15 },
      0,
      { targetSamples: 400 }
    );
    const highInclination = computeMagneticTalwani(
      [-300, -100, 100, 300],
      body,
      { ...defaultField, inclinationDeg: 70 },
      0,
      { targetSamples: 400 }
    );
    expect(lowInclination).not.toEqual(highInclination);
    expect(highInclination.every(Number.isFinite)).toBe(true);
  });
});

describe('Composite model responses', () => {
  it('sums visible bodies and ignores hidden bodies', () => {
    const grid = { minX: -100, maxX: 100, count: 3, observationZ: 0 };
    const bodyA = makeBody({ id: 'a', susceptibilitySI: 0 });
    const bodyB = makeBody({
      id: 'b',
      susceptibilitySI: 0,
      vertices: makeCircularPolygon(300, 500, 120, 72)
    });
    const hiddenBody = makeBody({
      id: 'hidden',
      visible: false,
      susceptibilitySI: 0,
      densityContrastKgM3: 10000
    });
    const response = computeModelResponse(grid, [bodyA, bodyB, hiddenBody], defaultField);
    const expectedA = computeGravityTalwani([-100, 0, 100], bodyA);
    const expectedB = computeGravityTalwani([-100, 0, 100], bodyB);

    response.forEach((point, index) => {
      expect(point.rawGravityMgal).toBeCloseTo(expectedA[index] + expectedB[index], 8);
      expect(point.gravityMgal).toBeCloseTo(point.rawGravityMgal, 8);
    });
  });

  it('adds deterministic noise and moving-average smoothing without changing raw response', () => {
    const grid = { minX: -200, maxX: 200, count: 9, observationZ: 0 };
    const body = makeBody({ susceptibilitySI: 0 });
    const raw = computeModelResponse(grid, body, defaultField);
    const processed = computeModelResponse(grid, body, defaultField, {
      gravityNoiseMgal: 0.05,
      magneticNoiseNt: 0,
      smoothingWindow: 5,
      noiseSeed: 42
    });
    const processedAgain = computeModelResponse(grid, body, defaultField, {
      gravityNoiseMgal: 0.05,
      magneticNoiseNt: 0,
      smoothingWindow: 5,
      noiseSeed: 42
    });

    expect(processed.map((point) => point.gravityMgal)).toEqual(
      processedAgain.map((point) => point.gravityMgal)
    );
    expect(processed.map((point) => point.gravityMgal)).not.toEqual(
      raw.map((point) => point.gravityMgal)
    );
    expect(processed.map((point) => point.rawGravityMgal)).toEqual(
      raw.map((point) => point.rawGravityMgal)
    );
  });
});
