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

export function createDefaultBody(): PolygonBody {
  return {
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

export function createDefaultField(): FieldSettings {
  return {
    fieldIntensityNt: 50000,
    inclinationDeg: 58,
    declinationDeg: -6,
    profileAzimuthDeg: 90
  };
}
