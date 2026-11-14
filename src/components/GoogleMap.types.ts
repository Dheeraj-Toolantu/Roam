import type { StyleProp, ViewStyle } from 'react-native';

export type LatLng = { lat: number; lng: number };

export interface MapMarker extends LatLng {
  id: string;
  title?: string;
  description?: string;
  color?: string;
  /** Short text drawn inside web markers (e.g. initials) */
  label?: string;
  onPress?: () => void;
}

export interface GoogleMapProps {
  /** Polyline of the route (journey). */
  route?: LatLng[];
  /** Extra polylines (e.g. other crew members' shared journeys). */
  routes?: { id: string; points: LatLng[]; color?: string }[];
  markers?: MapMarker[];
  /** The user's live position (blue dot + accuracy circle). */
  me?: (LatLng & { accuracy?: number | null }) | null;
  /** Keep the camera centred on `me` as it moves. */
  followMe?: boolean;
  /** Fallback centre/zoom when there is nothing to fit. */
  center?: LatLng | null;
  zoom?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
