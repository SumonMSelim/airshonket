// Wind helpers for the upwind-source feature.
//
// Pure geometry plus one fetch. No DOM. The idea: pollution from a kiln
// reaches you when the kiln is UPWIND of you. We compare the bearing from you
// to each kiln against the direction the wind is coming from.
//
// Meteorological convention: wind_direction is the direction the wind blows
// FROM. So if the wind is 270 (from the west), the kilns that matter are the
// ones to your west, i.e. whose bearing-from-you is near 270.

/** Fetch current wind at a point from Open-Meteo (no API key needed).
 *  Returns { fromDeg, speedKmh } or null on failure. fromDeg is the direction
 *  the wind comes FROM, in degrees (0 = north, 90 = east). */
export async function fetchWind(lat, lon) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=wind_speed_10m,wind_direction_10m&timezone=auto';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c = data.current || {};
    if (c.wind_direction_10m == null) return null;
    return {
      fromDeg: Number(c.wind_direction_10m),
      speedKmh: Number(c.wind_speed_10m),
    };
  } catch (err) {
    console.warn('Wind fetch failed:', err);
    return null;
  }
}

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Compass bearing in degrees (0..360) from point A to point B.
 *  Points are [lon, lat]. 0 = north, 90 = east. */
export function bearing([lon1, lat1], [lon2, lat2]) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest absolute difference between two bearings, 0..180. */
export function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Is a kiln upwind of the viewer?
 *
 * @param viewer  [lon, lat] the clicked point
 * @param kiln    [lon, lat] the kiln
 * @param windFromDeg  direction the wind comes FROM (degrees)
 * @param coneDeg  half-angle of the upwind cone (default 45)
 *
 * A kiln is upwind when the bearing FROM the viewer TO the kiln is close to
 * the direction the wind comes from. Then the wind carries that kiln's smoke
 * toward the viewer.
 */
export function isUpwind(viewer, kiln, windFromDeg, coneDeg = 45) {
  const b = bearing(viewer, kiln);
  return angleDiff(b, windFromDeg) <= coneDeg;
}

/** Turn a wind-from bearing into a short compass label, e.g. "north-west". */
export function compassName(deg) {
  const names = [
    'north', 'north-east', 'east', 'south-east',
    'south', 'south-west', 'west', 'north-west',
  ];
  return names[Math.round(deg / 45) % 8];
}

/** Same labels in Bangla. */
export function compassNameBn(deg) {
  const names = [
    'উত্তর', 'উত্তর-পূর্ব', 'পূর্ব', 'দক্ষিণ-পূর্ব',
    'দক্ষিণ', 'দক্ষিণ-পশ্চিম', 'পশ্চিম', 'উত্তর-পশ্চিম',
  ];
  return names[Math.round(deg / 45) % 8];
}
