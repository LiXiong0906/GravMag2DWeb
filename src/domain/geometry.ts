import type { ModelBounds, Point2D } from './types';

const EPSILON = 1e-10;

export function signedPolygonArea(vertices: Point2D[]): number {
  if (vertices.length < 3) {
    return 0;
  }

  let twiceArea = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    twiceArea += current.x * next.z - next.x * current.z;
  }

  return twiceArea / 2;
}

export function normalizePolygon(vertices: Point2D[]): Point2D[] {
  const normalized = vertices.map((point) => ({ ...point }));
  return signedPolygonArea(normalized) >= 0 ? normalized : normalized.reverse();
}

export function polygonCentroid(vertices: Point2D[]): Point2D {
  const area = signedPolygonArea(vertices);
  if (Math.abs(area) < EPSILON) {
    const sum = vertices.reduce(
      (acc, point) => ({ x: acc.x + point.x, z: acc.z + point.z }),
      { x: 0, z: 0 }
    );
    return {
      x: sum.x / Math.max(vertices.length, 1),
      z: sum.z / Math.max(vertices.length, 1)
    };
  }

  let cx = 0;
  let cz = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const cross = current.x * next.z - next.x * current.z;
    cx += (current.x + next.x) * cross;
    cz += (current.z + next.z) * cross;
  }

  return {
    x: cx / (6 * area),
    z: cz / (6 * area)
  };
}

export function polygonBounds(vertices: Point2D[]): ModelBounds {
  const xs = vertices.map((point) => point.x);
  const zs = vertices.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs)
  };
}

export function pointInPolygon(point: Point2D, vertices: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const a = vertices[i];
    const b = vertices[j];
    const intersects =
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z + EPSILON) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToSegment(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;

  if (lengthSquared < EPSILON) {
    return Math.hypot(point.x - start.x, point.z - start.z);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)
  );
  const projected = {
    x: start.x + t * dx,
    z: start.z + t * dz
  };

  return Math.hypot(point.x - projected.x, point.z - projected.z);
}

export function insertPointOnNearestEdge(vertices: Point2D[], point: Point2D): Point2D[] {
  if (vertices.length < 2) {
    return [...vertices, point];
  }

  let insertIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < vertices.length; i += 1) {
    const nextIndex = (i + 1) % vertices.length;
    const distance = distanceToSegment(point, vertices[i], vertices[nextIndex]);
    if (distance < bestDistance) {
      bestDistance = distance;
      insertIndex = nextIndex;
    }
  }

  return [...vertices.slice(0, insertIndex), point, ...vertices.slice(insertIndex)];
}

export function clampPointToBounds(point: Point2D, bounds: ModelBounds): Point2D {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, point.z))
  };
}

export function createObservationXs(minX: number, maxX: number, count: number): number[] {
  if (count <= 1) {
    return [(minX + maxX) / 2];
  }

  const step = (maxX - minX) / (count - 1);
  return Array.from({ length: count }, (_, index) => minX + index * step);
}
