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

/** The six AQI bands, with colours used by the map and legend. */
export const AQI_BANDS = [
  { max: 50, key: 'good', label: 'Good', color: '#009966' },
  { max: 100, key: 'moderate', label: 'Moderate', color: '#ffde33' },
  { max: 150, key: 'usg', label: 'Unhealthy for sensitive groups', color: '#ff9933' },
  { max: 200, key: 'unhealthy', label: 'Unhealthy', color: '#cc0033' },
  { max: 300, key: 'very', label: 'Very unhealthy', color: '#660099' },
  { max: Infinity, key: 'hazardous', label: 'Hazardous', color: '#7e0023' },
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

/** Profile tags the user can pick. "healthy" is the default baseline. */
export const PROFILE_TAGS = [
  { id: 'healthy', label: 'Healthy adult' },
  { id: 'respiratory', label: 'Has asthma, heart, or lung condition' },
  { id: 'child', label: 'Young child at home' },
  { id: 'elderly', label: 'Elderly' },
  { id: 'outdoor', label: 'Outdoor worker or cyclist' },
];

// Base advice per band. Short, plain sentences.
const BASE_ADVICE = {
  good: ['Air is clean.', 'A good day to open windows and go outside.'],
  moderate: [
    'Air is acceptable for most people.',
    'If you are unusually sensitive, take it easy outdoors.',
  ],
  usg: [
    'Air is unhealthy for sensitive people.',
    'Most people are fine, but sensitive groups should limit long spells outside.',
  ],
  unhealthy: [
    'Air is unhealthy.',
    'Wear a mask outside. Keep windows shut. Use an air purifier if you have one.',
  ],
  very: [
    'Air is very unhealthy.',
    'Avoid outdoor activity. A mask is essential. Seal windows.',
  ],
  hazardous: [
    'Air is hazardous.',
    'Stay indoors. Use an N95 mask if you must go out.',
  ],
};

// Whether a band is risky for sensitive groups (usg and worse).
function isSensitiveRisk(bandKey) {
  return ['usg', 'unhealthy', 'very', 'hazardous'].includes(bandKey);
}

/**
 * Build a list of advice sentences for a PM2.5 reading and a set of profile
 * tags. Returns { aqi, band, lines } where lines is an array of strings.
 *
 * @param {number} pm25  PM2.5 concentration in ug/m3
 * @param {string[]} profile  array of profile tag ids
 */
export function adviceFor(pm25, profile = ['healthy']) {
  const aqi = pm25ToAqi(pm25);
  const band = bandForAqi(aqi);
  if (!band) {
    return { aqi: null, band: null, lines: ['No reading available for this place.'] };
  }

  const tags = new Set(profile.length ? profile : ['healthy']);
  const lines = [...BASE_ADVICE[band.key]];

  // Extra, tag-specific lines, only when the air is actually risky.
  const risky = isSensitiveRisk(band.key);

  if (tags.has('respiratory') && band.key !== 'good') {
    lines.push(
      risky
        ? 'You told us someone has asthma, heart, or lung trouble. Keep rescue medicine close and stay indoors as much as you can.'
        : 'If you have asthma, heart, or lung trouble, keep your medicine close.'
    );
  }
  if (tags.has('child') && risky) {
    lines.push('Keep young children indoors and away from open windows.');
  }
  if (tags.has('elderly') && risky) {
    lines.push('Older people should rest indoors and avoid any outdoor effort.');
  }
  if (tags.has('outdoor')) {
    if (band.key === 'unhealthy') {
      lines.push('If you work or cycle outside, wear a proper mask and take breaks indoors.');
    } else if (risky && band.key !== 'usg') {
      lines.push('Avoid outdoor work or cycling today if you possibly can. If you must, wear an N95 mask.');
    }
  }

  return { aqi, band, lines };
}
