export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowState extends Bounds {
  id: string;
  appId: string;
  title: string;
  minimized: boolean;
  maximized: boolean;
  /** Bounds to return to when un-maximizing or un-snapping. */
  restore: Bounds | null;
  /** Opaque, serialisable launch parameters (e.g. which document to open). */
  props: Record<string, unknown>;
}
