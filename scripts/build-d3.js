/**
 * Builds force-app/main/default/staticresources/d3.zip
 *
 * Concatenates d3 + d3-sankey UMD bundles into a single d3.min.js,
 * then zips it. Run with: npm run build:d3
 */
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT     = path.resolve(__dirname, '..');
const OUT_DIR  = path.join(ROOT, 'force-app', 'main', 'default', 'staticresources');
const TMP_DIR  = path.join(ROOT, '_d3bundle');
const TMP_FILE = path.join(TMP_DIR, 'd3.min.js');
const ZIP_OUT  = path.join(OUT_DIR, 'd3.zip');

const d3Path     = require.resolve('d3/dist/d3.min.js');
const sankeyPath = require.resolve('d3-sankey/dist/d3-sankey.min.js');

fs.mkdirSync(TMP_DIR, { recursive: true });

const combined = fs.readFileSync(d3Path, 'utf8')
    + '\n'
    + fs.readFileSync(sankeyPath, 'utf8');

fs.writeFileSync(TMP_FILE, combined, 'utf8');
console.log(`Combined bundle: ${(combined.length / 1024).toFixed(1)} KB`);

// Use PowerShell's Compress-Archive (Windows) or zip (macOS/Linux)
if (process.platform === 'win32') {
    if (fs.existsSync(ZIP_OUT)) fs.unlinkSync(ZIP_OUT);
    execSync(
        `powershell -Command "Compress-Archive -Path '${TMP_FILE}' -DestinationPath '${ZIP_OUT}'"`,
        { stdio: 'inherit' }
    );
} else {
    execSync(`cd "${TMP_DIR}" && zip -j "${ZIP_OUT}" d3.min.js`, { stdio: 'inherit' });
}

fs.rmSync(TMP_DIR, { recursive: true, force: true });
console.log(`d3.zip written to: ${ZIP_OUT} (${(fs.statSync(ZIP_OUT).size / 1024).toFixed(1)} KB)`);
