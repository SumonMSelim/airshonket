// AirShonket map application.
//
// Renders Bangladesh with two data layers:
//   1. Air quality stations (PM2.5), coloured by AQI band.
//   2. Brick kilns from OpenStreetMap (the main winter pollution source).
//
// Tapping anywhere gives the nearest reading, the personalised health action,
// and a count of kilns nearby. The base map uses Amazon Location Service when
// configured, and an open demo style otherwise.

import { CONFIG } from './config.js';
import {
  AQI_BANDS,
  PROFILE_TAG_IDS,
  pm25ToAqi,
  bandForAqi,
  colorForPm25,
  adviceFor,
} from './aqi.js';
import { STRINGS, LANG_KEY, initialLang, saveLang } from './i18n.js';

const PROFILE_KEY = 'airshonket.profile';

// Current language and its string table.
let lang = initialLang();
let t = STRINGS[lang];

// Remember the last clicked point so we can re-render the panel on language
// or profile change without needing a fresh click.
let lastPoint = null;
let lastPlaceName = null;

// ---------------------------------------------------------------------------
// Profile (stored in the browser only)
// ---------------------------------------------------------------------------

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return ['healthy'];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : ['healthy'];
  } catch {
    return ['healthy'];
  }
}

function saveProfile(tags) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(tags));
}

let profile = loadProfile();

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const EARTH_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km between two [lon, lat] points. */
function haversineKm([lon1, lat1], [lon2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/** Nearest station feature to a clicked point, with its distance. */
function nearestStation(point, stations) {
  let best = null;
  let bestKm = Infinity;
  for (const f of stations) {
    const km = haversineKm(point, f.geometry.coordinates);
    if (km < bestKm) {
      bestKm = km;
      best = f;
    }
  }
  return best ? { feature: best, km: bestKm } : null;
}

/** Count kilns within a radius (km) of a point. */
function kilnsWithin(point, kilns, radiusKm) {
  let n = 0;
  for (const f of kilns) {
    if (haversineKm(point, f.geometry.coordinates) <= radiusKm) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Map setup
// ---------------------------------------------------------------------------

const state = { kilns: [], stations: [] };

const map = new maplibregl.Map({
  container: 'map',
  style: CONFIG.LOCATION_STYLE_URL || CONFIG.DEMO_STYLE_URL,
  center: CONFIG.BD_CENTER,
  zoom: CONFIG.BD_ZOOM,
  maxBounds: [
    [CONFIG.BD_BOUNDS[0][0] - 2, CONFIG.BD_BOUNDS[0][1] - 2],
    [CONFIG.BD_BOUNDS[1][0] + 2, CONFIG.BD_BOUNDS[1][1] + 2],
  ],
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

map.on('load', async () => {
  await loadData();
  addKilnLayer();
  addStationLayer();
  buildLegend();
  applyLanguage();
  applyMapLabelLanguage();
  map.on('click', onMapClick);
});

async function loadData() {
  const [kilns, stations] = await Promise.all([
    fetchJson(CONFIG.KILNS_URL),
    fetchStations(),
  ]);
  state.kilns = kilns?.features ?? [];
  state.stations = stations?.features ?? [];
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`Could not load ${url}:`, err);
    return null;
  }
}

// Try the live pipeline output first, then fall back to bundled sample data so
// the map is always explorable.
async function fetchStations() {
  const live = await fetchJson(CONFIG.STATIONS_URL);
  if (live?.features?.length) return live;
  console.info('Using sample PM2.5 data (no live pipeline output found).');
  showSampleBadge();
  return fetchJson('./sample/latest_pm25.geojson');
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function addKilnLayer() {
  map.addSource('kilns', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: state.kilns },
    cluster: true,
    clusterRadius: 45,
    clusterMaxZoom: 11,
  });

  // Clustered circles
  map.addLayer({
    id: 'kiln-clusters',
    type: 'circle',
    source: 'kilns',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': 'rgba(120, 72, 48, 0.55)',
      'circle-stroke-color': 'rgba(120, 72, 48, 0.9)',
      'circle-stroke-width': 1,
      'circle-radius': ['step', ['get', 'point_count'], 12, 50, 18, 200, 26],
    },
  });
  map.addLayer({
    id: 'kiln-cluster-count',
    type: 'symbol',
    source: 'kilns',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 11,
    },
    paint: { 'text-color': '#fff' },
  });

  // Individual kiln dots
  map.addLayer({
    id: 'kiln-points',
    type: 'circle',
    source: 'kilns',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#78482f',
      'circle-radius': 4,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 0.5,
      'circle-opacity': 0.85,
    },
  });
}

function addStationLayer() {
  map.addSource('stations', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: state.stations },
  });

  // Build a data-driven colour expression from the AQI bands.
  const colorExpr = ['step', ['get', 'pm25']];
  // step wants: default, then (stop, value) pairs in ascending order. Our
  // breakpoints are on PM2.5 values matching AQI band edges.
  const PM_EDGES = [9, 35.4, 55.4, 125.4, 225.4];
  colorExpr.push(AQI_BANDS[0].color);
  PM_EDGES.forEach((edge, i) => {
    colorExpr.push(edge, AQI_BANDS[i + 1].color);
  });

  map.addLayer({
    id: 'station-points',
    type: 'circle',
    source: 'stations',
    paint: {
      'circle-color': colorExpr,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 9, 10, 16],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': 0.92,
    },
  });

  map.on('mouseenter', 'station-points', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'station-points', () => (map.getCanvas().style.cursor = ''));
  map.on('click', 'station-points', (e) => {
    e.originalEvent.__stationClick = true;
    const f = e.features[0];
    openPanelForPoint(f.geometry.coordinates, f.properties.name);
  });
}

// ---------------------------------------------------------------------------
// Interaction: click to inspect
// ---------------------------------------------------------------------------

function onMapClick(e) {
  // Station clicks are handled by their own handler; avoid double-firing.
  if (e.originalEvent.__stationClick) return;
  openPanelForPoint([e.lngLat.lng, e.lngLat.lat]);
}

function openPanelForPoint(point, placeName) {
  lastPoint = point;
  lastPlaceName = placeName ?? null;

  const near = nearestStation(point, state.stations);
  const kilns15 = kilnsWithin(point, state.kilns, 15);
  const kilns5 = kilnsWithin(point, state.kilns, 5);

  const body = document.getElementById('panel-body');

  if (!near) {
    body.innerHTML = `<p>${escapeHtml(t.noReading)}</p>`;
    showPanel();
    return;
  }

  const pm25 = Number(near.feature.properties.pm25);
  const label = placeName || near.feature.properties.name || '';
  const bandLabel = t.bands[bandForAqi(pm25ToAqi(pm25)).key];
  const { aqi, band, lines } = adviceFor(pm25, profile, t);

  const sub =
    near.km < 2
      ? fill(t.readingSubHere, { pm25: pm25.toFixed(0) })
      : fill(t.readingSubAway, {
          pm25: pm25.toFixed(0),
          km: near.km.toFixed(0),
          name: near.feature.properties.name || '',
        });

  const within5 = kilns5 ? fill(t.within5, { n5: kilns5 }) : '';
  const kilnsText = fill(t.kilnsLine, {
    n15: kilns15,
    plural: lang === 'en' && kilns15 !== 1 ? 's' : '',
    within5,
  });

  body.innerHTML = `
    <div class="reading" style="--band:${band.color}">
      <div class="reading-aqi">${aqi}</div>
      <div class="reading-meta">
        <div class="reading-band">${escapeHtml(t.bands[band.key])}</div>
        <div class="reading-place">${escapeHtml(t.near)} ${escapeHtml(String(label))}</div>
      </div>
    </div>
    <p class="reading-sub">${escapeHtml(sub)}</p>

    <h3 class="panel-h">${escapeHtml(t.whatToDo)}</h3>
    <ul class="advice">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>

    <h3 class="panel-h">${escapeHtml(t.nearbySources)}</h3>
    <p class="sources">${escapeHtml(kilnsText)}</p>
    <p class="panel-foot">${escapeHtml(t.medicalNote)}</p>
  `;
  showPanel();
}

/** Replace {key} placeholders in a template with values. */
function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in values ? String(values[k]) : ''));
}

// ---------------------------------------------------------------------------
// Panel + legend + profile UI
// ---------------------------------------------------------------------------

function showPanel() {
  document.getElementById('panel').classList.remove('panel-hidden');
}
function hidePanel() {
  document.getElementById('panel').classList.add('panel-hidden');
}

function buildLegend() {
  const list = document.getElementById('legend-list');
  list.innerHTML = AQI_BANDS.map(
    (b) =>
      `<li><span class="swatch" style="background:${b.color}"></span>${escapeHtml(t.bands[b.key])}</li>`
  ).join('');
}

function buildProfileForm() {
  const form = document.getElementById('profile-form');
  form.innerHTML = PROFILE_TAG_IDS.map(
    (id) => `
    <label class="profile-option">
      <input type="checkbox" value="${id}" ${profile.includes(id) ? 'checked' : ''} />
      <span>${escapeHtml(t.profiles[id])}</span>
    </label>`
  ).join('');
}

function openProfileModal() {
  buildProfileForm();
  document.getElementById('profile-modal').classList.remove('modal-hidden');
}
function closeProfileModal() {
  document.getElementById('profile-modal').classList.add('modal-hidden');
}

function saveProfileFromForm() {
  const checked = [...document.querySelectorAll('#profile-form input:checked')].map((i) => i.value);
  profile = checked.length ? checked : ['healthy'];
  saveProfile(profile);
  closeProfileModal();
}

function showSampleBadge() {
  if (document.getElementById('sample-badge')) return;
  const el = document.createElement('div');
  el.id = 'sample-badge';
  el.className = 'sample-badge';
  el.textContent = t.sampleBadge;
  document.body.appendChild(el);
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

/** Apply the current language to all static chrome and re-render dynamic bits. */
function applyLanguage() {
  t = STRINGS[lang];
  document.documentElement.lang = lang;

  // Static chrome
  setText('brand-tag', t.tagline);
  setText('profile-btn', t.setProfile);
  setText('legend-title', t.legendTitle);
  setText('legend-note', t.legendNote);
  setText('coverage-note', t.coverageNote);
  setText('profile-title', t.profileTitle);
  setText('profile-sub', t.profileSub);
  setText('profile-save', t.save);
  setText('attribution', t.attribution);
  const closeBtn = document.getElementById('panel-close');
  if (closeBtn) closeBtn.setAttribute('aria-label', t.close);
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.textContent = lang === 'en' ? 'বাংলা' : 'English';

  const badge = document.getElementById('sample-badge');
  if (badge) badge.textContent = t.sampleBadge;

  // Dynamic bits that depend on language
  if (map.getLayer && map.getSource && map.getSource('kilns')) buildLegend();
  if (lastPoint) openPanelForPoint(lastPoint, lastPlaceName);
}

function toggleLanguage() {
  lang = lang === 'en' ? 'bn' : 'en';
  saveLang(lang);
  applyLanguage();
  applyMapLabelLanguage();
}

/** Ask the base map to show place-name labels in the chosen language.
 *  Works where the vector style has a name_{lang} / name:{lang} field and the
 *  data has that translation; otherwise labels stay in their default. */
function applyMapLabelLanguage() {
  const style = map.getStyle && map.getStyle();
  if (!style || !style.layers) return;
  const field = lang === 'bn' ? 'name:bn' : 'name:en';
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    const tf = layer.layout && layer.layout['text-field'];
    if (!tf) continue;
    try {
      // Prefer the language-specific name, fall back to the generic name.
      map.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', field],
        ['get', 'name:latin'],
        ['get', 'name'],
      ]);
    } catch {
      // Some layers do not allow overriding; skip them quietly.
    }
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Wire up static controls (safe even before the map loads).
document.getElementById('panel-close').addEventListener('click', hidePanel);
document.getElementById('profile-btn').addEventListener('click', openProfileModal);
document.getElementById('profile-save').addEventListener('click', saveProfileFromForm);
document.getElementById('lang-btn').addEventListener('click', toggleLanguage);
document.getElementById('profile-modal').addEventListener('click', (e) => {
  if (e.target.id === 'profile-modal') closeProfileModal();
});

// Set initial static text immediately (before the map finishes loading).
applyLanguage();

// Expose a couple of helpers for quick console testing / future unit tests.
window.__airshonket = { pm25ToAqi, bandForAqi, colorForPm25, adviceFor, haversineKm };
