import { describe, expect, it } from 'vitest';
import type { FieldSettings, PolygonBody } from '../domain/types';
import {
  computeGravityTalwani,
  computeMagneticTalwani,
  horizontalCylinderGravityMgal,
  makeCircularPolygon
} from '../domain/talwani';

const defaultField: FieldSettings = {
  fieldIntensityNt: 50000,
  inclinationDeg: 58,
  declinationDeg: -6,
  profileAzimuthDeg: 90
};

describe('Talwani gravity polygon forward model', () => {
  it('matches the horizontal cylinder analytic response for a circular polygon', () => {
    const radius = 200;
    const centerZ = 500;
    const densityContrast = 500;
    const body: PolygonBody = {
      densityContrastKgM3: densityContrast,
      susceptibilitySI: 0.02,
      vertices: makeCircularPolygon(0, centerZ, radius, 160)
    };
    const observationXs = [-900, -450, 0, 450, 900];
    const modeled = computeGravityTalwani(observationXs, body);

    observationXs.forEach((x, index) => {
      const expected = horizontalCylinderGravityMgal(x, 0, centerZ, radius, densityContrast);
      expect(modeled[index]).toBeCloseTo(expected, 2);
    });
  });

  it('is invariant to vertex order after normalization', () => {
    const vertices = makeCircularPolygon(0, 420, 180, 72);
    const body: PolygonBody = {
      densityContrastKgM3: 430,
      susceptibilitySI: 0.01,
      vertices
    };
    const reversedBody = {
      ...body,
      vertices: [...vertices].reverse()
    };
    const xs = [-300, 0, 300];
    expect(computeGravityTalwani(xs, body)).toEqual(computeGravityTalwani(xs, reversedBody));
  });

  it('stays finite for shallow and zero-contrast edge cases', () => {
    const body: PolygonBody = {
      densityContrastKgM3: 0,
      susceptibilitySI: 0,
      vertices: [
        { x: -100, z: 1 },
        { x: 120, z: 4 },
        { x: 80, z: 120 },
        { x: -90, z: 100 }
      ]
    };
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
    const body: PolygonBody = {
      densityContrastKgM3: 450,
      susceptibilitySI: 0,
      vertices: makeCircularPolygon(0, 420, 160, 64)
    };
    expect(computeMagneticTalwani([-200, 0, 200], body, defaultField)).toEqual([0, 0, 0]);
  });

  it('changes shape when field inclination changes', () => {
    const body: PolygonBody = {
      densityContrastKgM3: 450,
      susceptibilitySI: 0.035,
      vertices: makeCircularPolygon(0, 420, 160, 64)
    };
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
