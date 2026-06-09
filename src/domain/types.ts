export interface Point2D {
  x: number;
  z: number;
}

export interface PolygonBody {
  vertices: Point2D[];
  densityContrastKgM3: number;
  susceptibilitySI: number;
}

export interface FieldSettings {
  fieldIntensityNt: number;
  inclinationDeg: number;
  declinationDeg: number;
  profileAzimuthDeg: number;
}

export interface ObservationGrid {
  minX: number;
  maxX: number;
  count: number;
  observationZ: number;
}

export interface ModelResponsePoint {
  x: number;
  gravityMgal: number;
  magneticNt: number;
}

export interface ModelBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
