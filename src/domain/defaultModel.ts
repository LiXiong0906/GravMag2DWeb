import type { FieldSettings, ModelBounds, ObservationGrid, PolygonBody } from './types';

export const modelBounds: ModelBounds = {
  minX: -1200,
  maxX: 1200,
  minZ: 30,
  maxZ: 900
};

export const defaultGrid: ObservationGrid = {
  minX: -1200,
  maxX: 1200,
  count: 241,
  observationZ: 0
};

export function createDefaultBodies(): PolygonBody[] {
  return [
    createDefaultBody('body-main', 'Main source', '#0f766e'),
    createBodyFromTemplate('body-west', 'Shallow lens', '#b42318', -360, 120, 0.58)
  ];
}

export function createDefaultBody(
  id = 'body-main',
  name = 'Main source',
  color = '#0f766e'
): PolygonBody {
  return {
    id,
    name,
    color,
    visible: true,
    densityContrastKgM3: 520,
    susceptibilitySI: 0.038,
    vertices: [
      { x: -410, z: 300 },
      { x: -150, z: 180 },
      { x: 260, z: 220 },
      { x: 420, z: 500 },
      { x: 160, z: 690 },
      { x: -300, z: 590 }
    ]
  };
}

export function createBodyFromTemplate(
  id: string,
  name: string,
  color: string,
  offsetX = 0,
  offsetZ = 0,
  scale = 1
): PolygonBody {
  const source = createDefaultBody(id, name, color);
  const centroidX =
    source.vertices.reduce((sum, point) => sum + point.x, 0) / source.vertices.length;
  const centroidZ =
    source.vertices.reduce((sum, point) => sum + point.z, 0) / source.vertices.length;

  return {
    ...source,
    densityContrastKgM3: Math.round(source.densityContrastKgM3 * scale),
    susceptibilitySI: Number((source.susceptibilitySI * scale).toFixed(3)),
    vertices: source.vertices.map((point) => ({
      x: centroidX + (point.x - centroidX) * scale + offsetX,
      z: centroidZ + (point.z - centroidZ) * scale + offsetZ
    }))
  };
}

export function createDefaultField(): FieldSettings {
  return {
    fieldIntensityNt: 50000,
    inclinationDeg: 58,
    declinationDeg: -6,
    profileAzimuthDeg: 90
  };
}
