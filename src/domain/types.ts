export interface Point2D {
  x: number;
  z: number;
}

export interface PolygonBody {
  id: string;
  name: string;
  color: string;
  visible: boolean;
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
  rawGravityMgal: number;
  rawMagneticNt: number;
}

export interface ResponseOptions {
  gravityNoiseMgal: number;
  magneticNoiseNt: number;
  smoothingWindow: number;
  noiseSeed: number;
}

export interface ModelBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
