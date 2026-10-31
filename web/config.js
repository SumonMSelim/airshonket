// Runtime configuration for AirShonket.
//
// The base map can come from two places:
//  1. Amazon Location Service (the AWS service the hackathon asks for).
//  2. An open demo style (used for local development before AWS is wired up).
//
// Set LOCATION_STYLE_URL to the Amazon Location Service style descriptor URL
// (including the API key) to switch the base map to AWS. When it is null, the
// app falls back to the open demo style so the map still renders locally.

export const CONFIG = {
  // Example once AWS is set up:
  //   https://maps.geo.<region>.amazonaws.com/v2/styles/Standard/descriptor?key=<API_KEY>
  LOCATION_STYLE_URL: null,

  // Open fallback style for local development. CARTO Voyager has city names,
  // boundaries, roads and rivers, so the map reads properly before AWS is
  // wired up. Swapped for Amazon Location Service via LOCATION_STYLE_URL.
  DEMO_STYLE_URL:
    'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',

  // Where the map reads its data. These are static files written by the
  // pipeline to S3 and served through CloudFront. For local dev they are
  // relative paths into ../data.
  KILNS_URL: '../data/kilns.geojson',
  STATIONS_URL: '../data/latest_pm25.geojson', // written by the ingest Lambda

  // Demo location for testing and the demo video, used when the user is not
  // physically in Bangladesh. Hazrat Shahjalal International Airport, Dhaka.
  DEMO_LOCATION: { name: 'Dhaka Airport', point: [90.3978, 23.8433] },

  // Map framing for Bangladesh.
  BD_CENTER: [90.4, 23.7], // lon, lat (near Dhaka)
  BD_ZOOM: 6.2,
  BD_BOUNDS: [
    [87.9, 20.5], // south-west
    [92.8, 26.7], // north-east
  ],
};
