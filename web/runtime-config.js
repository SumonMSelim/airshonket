// Deploy-time runtime configuration.
//
// This file is a committed placeholder. It holds no secrets. At deploy time
// deploy.sh overwrites it in the bucket with the Amazon Location style URL
// (which includes the map API key), so the key never lives in source.
//
// Locally this leaves the style URL unset, so the app falls back to the open
// demo style in config.js.
globalThis.__AIRSHONKET_STYLE_URL__ = null;
