#!/usr/bin/env node
// Fails on any dependency advisory at or above MIN_SEVERITY, except the ones
// accepted below.
//
// The allowlist is keyed by advisory id rather than by package name on purpose:
// a newly disclosed problem in an already-accepted package still breaks the
// build, which a package-level ignore would silently swallow.
//
// Usage: node scripts/audit-check.js [directory ...]

const { execFileSync } = require('child_process');
const path = require('path');

const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];
const MIN_SEVERITY = 'high';

const ACCEPTED = {
  'GHSA-xcpc-8h2w-3j85':
    'adm-zip DoS on a crafted ZIP, reachable only through steam-user -> globaloffensive. '
    + 'The only offered fix downgrades steam-user and breaks Storage Units, and the archives '
    + 'in that code path come from Valve. Documented in SECURITY.md.',
};

function auditJson(dir) {
  try {
    // npm audit exits non-zero when it finds anything, so the output has to be
    // read from the error object as well.
    return JSON.parse(execFileSync('npm', ['audit', '--json'], { cwd: dir, encoding: 'utf8' }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

// Every real advisory appears as an object inside some `via` array. Entries whose
// `via` holds only strings are downstream packages dragged in by another entry,
// so counting them again would just duplicate the same finding.
function collectAdvisories(report) {
  const found = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities || {})) {
    for (const via of vulnerability.via || []) {
      if (typeof via !== 'object') continue;
      const id = via.url ? via.url.split('/').pop() : String(via.source);
      found.set(id, { id, title: via.title || '(no title)', severity: via.severity, url: via.url });
    }
  }
  return [...found.values()];
}

function isAtLeastMinSeverity(severity) {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(MIN_SEVERITY);
}

const directories = process.argv.slice(2);
if (directories.length === 0) directories.push('.');

let failed = false;

for (const dir of directories) {
  const label = path.resolve(dir);
  const advisories = collectAdvisories(auditJson(dir)).filter((a) => isAtLeastMinSeverity(a.severity));
  const accepted = advisories.filter((a) => ACCEPTED[a.id]);
  const blocking = advisories.filter((a) => !ACCEPTED[a.id]);

  console.log(`\n${label}`);
  if (advisories.length === 0) {
    console.log(`  no advisories at ${MIN_SEVERITY} or above`);
  }
  for (const advisory of accepted) {
    console.log(`  accepted  ${advisory.severity.padEnd(8)} ${advisory.id}  ${advisory.title}`);
  }
  for (const advisory of blocking) {
    failed = true;
    console.log(`  BLOCKING  ${advisory.severity.padEnd(8)} ${advisory.id}  ${advisory.title}`);
    if (advisory.url) console.log(`            ${advisory.url}`);
  }
}

if (failed) {
  console.error(
    '\nNew advisories found. Fix them, or add the id to ACCEPTED in scripts/audit-check.js '
    + 'together with the reason and a matching note in SECURITY.md.',
  );
  process.exit(1);
}

console.log('\nDependency audit passed.');
