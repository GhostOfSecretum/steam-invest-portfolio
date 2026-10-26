const fs = require('fs');
const path = require('path');
const { getStoreZip } = require('../server/services/extension-zip');

async function main() {
  const zip = await getStoreZip();
  const outDir = path.join(__dirname, '..', 'chrome-web-store');
  const out = path.join(outDir, zip.fileName);
  fs.writeFileSync(out, zip.buffer);
  console.log(`${out} ${zip.buffer.length} bytes v${zip.version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
