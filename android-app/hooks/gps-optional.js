// after_prepare: the geolocation plugin declares GPS as a *required* feature, which makes Google Play
// hide the app from devices without GPS. BEE-OAK works without it (city picker), so mark it optional.
const fs = require('fs');
const path = require('path');

module.exports = function (ctx) {
  const manifest = path.join(ctx.opts.projectRoot, 'platforms/android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(manifest)) return;
  const xml = fs.readFileSync(manifest, 'utf8');
  let out = xml.replace(/(<uses-feature[^>]*android:name="android\.hardware\.location[^"]*"[^>]*android:required=")true(")/g, '$1false$2');
  // Drop exact duplicate <uses-feature> lines (plugin + config can both add one).
  const seen = new Set();
  out = out.replace(/[ \t]*<uses-feature[^>]*\/>\r?\n?/g, (m) => { const k = m.trim(); if (seen.has(k)) return ''; seen.add(k); return m; });
  if (out !== xml) { fs.writeFileSync(manifest, out); console.log('gps-optional: marked location features as not required'); }
};
