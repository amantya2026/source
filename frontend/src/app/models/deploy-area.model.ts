export type DeployEditAction = 'move' | 'resize' | 'reshape';

export interface DeployArea {
  id: string;
  longitude: number;
  latitude: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  /** Custom boundary vertices (lon/lat). When set, the area renders as a polygon. */
  vertices?: [number, number][];
}
