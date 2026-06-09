import {
  normalizePolygon,
  pointInPolygon,
  polygonBounds,
  polygonCentroid,
  signedPolygonArea
} from './geometry';
import type {
  FieldSettings,
  ModelResponsePoint,
  ObservationGrid,
  Point2D,
  PolygonBody,
  ResponseOptions
} from './types';

const GRAVITATIONAL_CONSTANT = 6.6743e-11;
const SI_TO_MGAL = 1e5;
const NT_TO_T = 1e-9;
const T_TO_NT = 1e9;
const TWO_PI = Math.PI * 2;
const MIN_RADIUS_SQUARED = 1;
const MIN_QUADRATIC = 1e-300;
const EPSILON = 1e-12;

export interface MagneticComputationOptions {
  targetSamples?: number;
}

export function computeGravityTalwani(
  observationXs: number[],
  body: PolygonBody,
  observationZ = 0
): number[] {
  if (body.vertices.length < 3 || body.densityContrastKgM3 === 0) {
    return observationXs.map(() => 0);
  }

  const vertices = normalizePolygon(body.vertices);
  if (Math.abs(signedPolygonArea(vertices)) < EPSILON) {
    return observationXs.map(() => 0);
  }

  return observationXs.map((observationX) => {
    let integral = 0;

    for (let i = 0; i < vertices.length; i += 1) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];
      const x1 = start.x - observationX;
      const z1 = start.z - observationZ;
      const x2 = end.x - observationX;
      const z2 = end.z - observationZ;

      integral -= (x2 - x1) * integrateLogRadiusAlongEdge(x1, z1, x2, z2);
    }

    const value = 2 * GRAVITATIONAL_CONSTANT * body.densityContrastKgM3 * integral * SI_TO_MGAL;
    return Number.isFinite(value) ? value : 0;
  });
}

export function computeMagneticTalwani(
  observationXs: number[],
  body: PolygonBody,
  field: FieldSettings,
  observationZ = 0,
  options: MagneticComputationOptions = {}
): number[] {
  if (
    body.vertices.length < 3 ||
    body.susceptibilitySI === 0 ||
    field.fieldIntensityNt === 0 ||
    Math.abs(signedPolygonArea(body.vertices)) < EPSILON
  ) {
    return observationXs.map(() => 0);
  }

  const vertices = normalizePolygon(body.vertices);
  const samples = samplePolygonArea(vertices, options.targetSamples ?? 900);
  const unitField = profilePlaneFieldUnitVector(field);
  const fieldIntensityT = field.fieldIntensityNt * NT_TO_T;
  const coefficient = (body.susceptibilitySI * fieldIntensityT) / TWO_PI;

  return observationXs.map((observationX) => {
    let kernelSum = 0;

    for (const sample of samples) {
      const rx = observationX - sample.x;
      const rz = observationZ - sample.z;
      const radiusSquared = Math.max(rx * rx + rz * rz, MIN_RADIUS_SQUARED);
      const directionalDot = unitField.x * rx + unitField.z * rz;
      const projectedKernel =
        (2 * directionalDot * directionalDot) / (radiusSquared * radiusSquared) -
        1 / radiusSquared;
      kernelSum += projectedKernel * sample.area;
    }

    const value = coefficient * kernelSum * T_TO_NT;
    return Number.isFinite(value) ? value : 0;
  });
}

export function computeModelResponse(
  grid: ObservationGrid,
  bodiesOrBody: PolygonBody | PolygonBody[],
  field: FieldSettings,
  options: Partial<ResponseOptions> = {}
): ModelResponsePoint[] {
  const count = Math.max(2, Math.round(grid.count));
  const step = (grid.maxX - grid.minX) / (count - 1);
  const observationXs = Array.from({ length: count }, (_, index) => grid.minX + index * step);
  const bodies = Array.isArray(bodiesOrBody) ? bodiesOrBody : [bodiesOrBody];
  const visibleBodies = bodies.filter((body) => body.visible !== false);
  const rawGravity = observationXs.map(() => 0);
  const rawMagnetic = observationXs.map(() => 0);

  for (const body of visibleBodies) {
    const gravity = computeGravityTalwani(observationXs, body, grid.observationZ);
    const magnetic = computeMagneticTalwani(observationXs, body, field, grid.observationZ);
    for (let index = 0; index < observationXs.length; index += 1) {
      rawGravity[index] += gravity[index];
      rawMagnetic[index] += magnetic[index];
    }
  }

  const responseOptions = normalizeResponseOptions(options);
  const noisyGravity = addDeterministicNoise(
    rawGravity,
    responseOptions.gravityNoiseMgal,
    responseOptions.noiseSeed
  );
  const noisyMagnetic = addDeterministicNoise(
    rawMagnetic,
    responseOptions.magneticNoiseNt,
    responseOptions.noiseSeed + 101
  );
  const gravity = movingAverage(noisyGravity, responseOptions.smoothingWindow);
  const magnetic = movingAverage(noisyMagnetic, responseOptions.smoothingWindow);

  return observationXs.map((x, index) => ({
    x,
    gravityMgal: gravity[index],
    magneticNt: magnetic[index],
    rawGravityMgal: rawGravity[index],
    rawMagneticNt: rawMagnetic[index]
  }));
}

export function horizontalCylinderGravityMgal(
  observationX: number,
  centerX: number,
  centerZ: number,
  radius: number,
  densityContrastKgM3: number,
  observationZ = 0
): number {
  const dx = observationX - centerX;
  const dz = centerZ - observationZ;
  const denominator = dx * dx + dz * dz;
  const value =
    (2 * Math.PI * GRAVITATIONAL_CONSTANT * densityContrastKgM3 * radius * radius * dz) /
    denominator;
  return value * SI_TO_MGAL;
}

export function makeCircularPolygon(
  centerX: number,
  centerZ: number,
  radius: number,
  segments = 96
): Point2D[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * TWO_PI;
    return {
      x: centerX + radius * Math.cos(angle),
      z: centerZ + radius * Math.sin(angle)
    };
  });
}

function integrateLogRadiusAlongEdge(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const a = dx * dx + dz * dz;

  if (a < EPSILON) {
    return 0;
  }

  const b = 2 * (x1 * dx + z1 * dz);
  const c = x1 * x1 + z1 * z1;
  const discriminant = Math.max(0, 4 * a * c - b * b);
  const root = Math.sqrt(discriminant);

  const primitive = (t: number) => {
    const quadratic = Math.max(MIN_QUADRATIC, a * t * t + b * t + c);
    const first = ((2 * a * t + b) / (2 * a)) * Math.log(quadratic) - 2 * t;
    const second =
      root > EPSILON ? (root / a) * Math.atan((2 * a * t + b) / root) : 0;
    return 0.5 * (first + second);
  };

  return primitive(1) - primitive(0);
}

function profilePlaneFieldUnitVector(field: FieldSettings): Point2D {
  const inclination = toRadians(field.inclinationDeg);
  const azimuthDelta = toRadians(field.declinationDeg - field.profileAzimuthDeg);
  const x = Math.cos(inclination) * Math.cos(azimuthDelta);
  const z = Math.sin(inclination);
  const length = Math.hypot(x, z);

  if (length < EPSILON) {
    return { x: 1, z: 0 };
  }

  return {
    x: x / length,
    z: z / length
  };
}

function samplePolygonArea(vertices: Point2D[], targetSamples: number) {
  const bounds = polygonBounds(vertices);
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxZ - bounds.minZ, 1);
  const aspect = width / height;
  const columns = Math.max(8, Math.ceil(Math.sqrt(targetSamples * aspect)));
  const rows = Math.max(8, Math.ceil(targetSamples / columns));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const cellArea = cellWidth * cellHeight;
  const samples: Array<Point2D & { area: number }> = [];

  for (let row = 0; row < rows; row += 1) {
    const z = bounds.minZ + (row + 0.5) * cellHeight;
    for (let column = 0; column < columns; column += 1) {
      const x = bounds.minX + (column + 0.5) * cellWidth;
      if (pointInPolygon({ x, z }, vertices)) {
        samples.push({ x, z, area: cellArea });
      }
    }
  }

  if (samples.length > 0) {
    return samples;
  }

  const centroid = polygonCentroid(vertices);
  return [{ ...centroid, area: Math.abs(signedPolygonArea(vertices)) }];
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeResponseOptions(options: Partial<ResponseOptions>): ResponseOptions {
  const smoothingWindow = Math.max(1, Math.round(options.smoothingWindow ?? 1));
  return {
    gravityNoiseMgal: Math.max(0, options.gravityNoiseMgal ?? 0),
    magneticNoiseNt: Math.max(0, options.magneticNoiseNt ?? 0),
    smoothingWindow: smoothingWindow % 2 === 0 ? smoothingWindow + 1 : smoothingWindow,
    noiseSeed: Math.max(1, Math.round(options.noiseSeed ?? 20260609))
  };
}

function addDeterministicNoise(values: number[], amplitude: number, seed: number): number[] {
  if (amplitude === 0) {
    return [...values];
  }

  const random = createSeededRandom(seed);
  return values.map((value) => value + amplitude * gaussianLike(random));
}

function movingAverage(values: number[], windowSize: number): number[] {
  if (windowSize <= 1) {
    return [...values];
  }

  const half = Math.floor(windowSize / 2);
  return values.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -half; offset <= half; offset += 1) {
      const sourceIndex = index + offset;
      if (sourceIndex >= 0 && sourceIndex < values.length) {
        sum += values[sourceIndex];
        count += 1;
      }
    }
    return sum / count;
  });
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function gaussianLike(random: () => number): number {
  return random() + random() + random() + random() + random() + random() - 3;
}
