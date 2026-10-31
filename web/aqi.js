// AQI bands and personalised health actions.
//
// Pure logic, no DOM and no map. This module converts a PM2.5 concentration
// (micrograms per cubic metre) into a US EPA AQI value, names the band, and
// produces plain-language advice tailored to the person.
//
// The PM2.5 -> AQI breakpoints are the US EPA standard (2024 update), which is
// the scale aqicn and most apps report for Dhaka.

/** EPA PM2.5 breakpoints: [concLow, concHigh, aqiLow, aqiHigh]. */
const PM25_BREAKPOINTS = [
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 400],
  [325.5, 500.4, 401, 500],
];

/** The six AQI bands, with colours used by the map and legend.
 *  Labels are resolved per language in the UI via i18n `bands`.
 */
export const AQI_BANDS = [
  { max: 50, key: 'good', color: '#009966' },
  { max: 100, key: 'moderate', color: '#ffde33' },
  { max: 150, key: 'usg', color: '#ff9933' },
  { max: 200, key: 'unhealthy', color: '#cc0033' },
  { max: 300, key: 'very', color: '#660099' },
  { max: Infinity, key: 'hazardous', color: '#7e0023' },
];

/**
 * Convert a PM2.5 concentration (ug/m3) to a US EPA AQI value.
 * Returns null for missing or invalid input.
 */
export function pm25ToAqi(pm25) {
  if (pm25 == null || Number.isNaN(pm25) || pm25 < 0) return null;
  // EPA truncates PM2.5 to one decimal place before the lookup.
  const c = Math.trunc(pm25 * 10) / 10;
  for (const [cLow, cHigh, aLow, aHigh] of PM25_BREAKPOINTS) {
    if (c >= cLow && c <= cHigh) {
      const aqi = ((aHigh - aLow) / (cHigh - cLow)) * (c - cLow) + aLow;
      return Math.round(aqi);
    }
  }
  // Above the top breakpoint: cap at 500.
  return 500;
}

/** Return the AQI band object for a given AQI value. */
export function bandForAqi(aqi) {
  if (aqi == null) return null;
  return AQI_BANDS.find((b) => aqi <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/** Colour for a PM2.5 value (used for map points and station markers). */
export function colorForPm25(pm25) {
  const band = bandForAqi(pm25ToAqi(pm25));
  return band ? band.color : '#9e9e9e';
}

// ---------------------------------------------------------------------------
// Personalised actions
// ---------------------------------------------------------------------------

/** Profile tag ids the user can pick. "healthy" is the default baseline.
 *  Labels are resolved per language in the UI via i18n `profiles`.
 */
export const PROFILE_TAG_IDS = ['healthy', 'respiratory', 'child', 'elderly', 'outdoor'];

// Whether a band is risky for sensitive groups (usg and worse).
function isSensitiveRisk(bandKey) {
  return ['usg', 'unhealthy', 'very', 'hazardous'].includes(bandKey);
}

/**
 * Build a list of advice sentences for a PM2.5 reading and a set of profile
 * tags, in the given language. Returns { aqi, band, lines }.
 *
 * @param {number} pm25  PM2.5 concentration in ug/m3
 * @param {string[]} profile  array of profile tag ids
 * @param {object} t  the strings object for the chosen language (STRINGS[lang])
 */
export function adviceFor(pm25, profile, t) {
  const aqi = pm25ToAqi(pm25);
  const band = bandForAqi(aqi);
  if (!band) {
    return { aqi: null, band: null, lines: [t.noReading] };
  }

  const tags = new Set(profile && profile.length ? profile : ['healthy']);
  const lines = [...t.advice[band.key]];
  const risky = isSensitiveRisk(band.key);

  if (tags.has('respiratory') && band.key !== 'good') {
    lines.push(risky ? t.extra.respiratoryRisky : t.extra.respiratoryMild);
  }
  if (tags.has('child') && risky) {
    lines.push(t.extra.child);
  }
  if (tags.has('elderly') && risky) {
    lines.push(t.extra.elderly);
  }
  if (tags.has('outdoor')) {
    if (band.key === 'unhealthy') {
      lines.push(t.extra.outdoorUnhealthy);
    } else if (risky && band.key !== 'usg') {
      lines.push(t.extra.outdoorRisky);
    }
  }

  return { aqi, band, lines };
}
