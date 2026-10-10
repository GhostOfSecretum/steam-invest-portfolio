const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

const EXTENSION_DIR = path.join(__dirname, '..', '..', 'extension');
const DEV_ORIGIN = 'http://localhost:3000';
// 1980-01-01; a zero date is invalid in DOS format and some unzippers reject it.
const DOS_DATE_1980 = 0x0021;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function listFiles(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(dir, entry.name), rel));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}

// Downloaded builds must only talk to production, so the developer origin is
// dropped from the permissions and CSP; the extension hides the server field
// when the manifest no longer grants it.
function releaseManifest(raw) {
  const manifest = JSON.parse(raw);
  manifest.host_permissions = manifest.host_permissions.filter((host) => !host.startsWith(DEV_ORIGIN));
  manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages
    .replace(` ${DEV_ORIGIN}`, '');
  return { manifest, data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) };
}

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(DOS_DATE_1980 << 16, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(DOS_DATE_1980 << 16, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, buf) => sum + buf.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

let cached = null;

async function getExtensionZip() {
  if (cached) return cached;
  const folder = 'skinshead-extension';
  let version = '0.0.0';
  const entries = [];
  for (const rel of await listFiles(EXTENSION_DIR)) {
    let data = await fs.readFile(path.join(EXTENSION_DIR, rel));
    if (rel === 'manifest.json') {
      const release = releaseManifest(data.toString('utf8'));
      version = release.manifest.version;
      data = release.data;
    }
    entries.push({ name: `${folder}/${rel}`, data });
  }
  cached = { fileName: `skinshead-extension-${version}.zip`, version, buffer: buildZip(entries) };
  return cached;
}

module.exports = { getExtensionZip };
