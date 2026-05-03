export interface Mosque {
  id: string; // OSM ID or Supabase UUID
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  distance?: number;
  is_deleted?: boolean;
}

export interface PrayerTimes {
  id?: string;
  mosque_id: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  jumua: string | null;
  updated_at: string;
  fajr_score: number;
  dhuhr_score: number;
  asr_score: number;
  maghrib_score: number;
  isha_score: number;
  jumua_score: number;
  fajr_upvotes?: number;
  fajr_downvotes?: number;
  dhuhr_upvotes?: number;
  dhuhr_downvotes?: number;
  asr_upvotes?: number;
  asr_downvotes?: number;
  maghrib_upvotes?: number;
  maghrib_downvotes?: number;
  isha_upvotes?: number;
  isha_downvotes?: number;
  jumua_upvotes?: number;
  jumua_downvotes?: number;
}

export interface Vote {
  id: string;
  prayer_time_id: string;
  prayer_name: PrayerName;
  vote_type: 'up' | 'down';
  user_id: string;
  created_at: string;
}

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | 'jumua';

// Bangladesh Bounds
export const COUNTRY_BOUNDS: [[number, number], [number, number]] = [
  [20.670883, 88.01098], // Southwest
  [26.631824, 92.672721]  // Northeast
];

export const COUNTRY_CENTER: [number, number] = [23.8103, 90.4125];
export const COUNTRY_NAME = "Bangladesh";

export const isInBounds = (lat: number, lon: number): boolean => {
  const [[s, w], [n, e]] = COUNTRY_BOUNDS;
  return lat >= s && lat <= n && lon >= w && lon <= e;
};

export const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}
