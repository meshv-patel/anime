#!/usr/bin/env node
/**
 * Fail-Closed Staging Build Target Verification Script
 * Validates that compiled dist/ bundle targets the EXACT independently-supplied staging project.
 *
 * Rules:
 * 1. Requires EXPECTED_STAGING_REF to be independently supplied (env or --expected-ref).
 *    NEVER automatically infers from .env.staging.local.
 * 2. Unconditionally rejects production reference kpokzlxacmjtjmlzhgqi.
 * 3. Requires exactly one Supabase project URL in the bundle.
 * 4. Requires an exact match with the expected reference.
 * 5. Exits nonzero on ANY mismatch or missing configuration.
 */

const fs = require('fs');
const path = require('path');

const PROTECTED_PROD_REF = 'kpokzlxacmjtjmlzhgqi';
// The production project URL that must NEVER appear in a bundle as a live credential.
// Note: the bare ref string may appear in guard code embedded by the bundler; only the full URL form
// indicates that the bundle is actually targeting the production project.
const PROTECTED_PROD_URL = `https://${PROTECTED_PROD_REF}.supabase.co`;

// 1. Resolve expected staging reference (MUST be independently supplied)
let expectedRef = (process.env.EXPECTED_STAGING_REF || '').trim();
const flagIdx = process.argv.indexOf('--expected-ref');
if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
  expectedRef = process.argv[flagIdx + 1].trim();
}

if (!expectedRef) {
  console.error('\x1b[31m[VERIFY FAILED] Missing EXPECTED_STAGING_REF.\x1b[0m');
  console.error('An expected staging project reference must be independently supplied via env (EXPECTED_STAGING_REF) or flag (--expected-ref <ref>).');
  process.exit(1);
}

// 2. Unconditionally reject production project reference
if (expectedRef === PROTECTED_PROD_REF) {
  console.error('\x1b[41m\x1b[37m[SECURITY VIOLATION] EXPECTED_STAGING_REF cannot be the protected production project reference (kpokzlxacmjtjmlzhgqi)!\x1b[0m');
  process.exit(1);
}

// 3. Scan dist/assets
const distAssets = path.join(__dirname, '..', 'dist', 'assets');
if (!fs.existsSync(distAssets)) {
  console.error('\x1b[31m[VERIFY FAILED] dist/assets directory does not exist. Run build first.\x1b[0m');
  process.exit(1);
}

const jsFiles = fs.readdirSync(distAssets).filter(f => f.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error('\x1b[31m[VERIFY FAILED] No compiled JS files found in dist/assets.\x1b[0m');
  process.exit(1);
}

const detectedUrls = new Set();
let prodDetected = false;
let prodFile = '';

for (const file of jsFiles) {
  const content = fs.readFileSync(path.join(distAssets, file), 'utf-8');
  // Check for the production project URL (not the bare ref string, which may appear in guard code)
  if (content.includes(PROTECTED_PROD_URL)) {
    prodDetected = true;
    prodFile = file;
  }
  const matches = content.match(/https:\/\/[a-z0-9-]+\.supabase\.co/g);
  if (matches) {
    matches.forEach(u => detectedUrls.add(u));
  }
}

// 4. Assert no production leakage
if (prodDetected) {
  console.error(`\x1b[41m\x1b[37m[FATAL SECURITY FAILURE] Protected production project URL (${PROTECTED_PROD_URL}) detected in bundle (${prodFile})!\x1b[0m`);
  process.exit(1);
}

// 5. Assert exactly one Supabase project URL
if (detectedUrls.size === 0) {
  console.error('\x1b[31m[VERIFY FAILED] No Supabase project URL found in bundle.\x1b[0m');
  process.exit(1);
}

if (detectedUrls.size > 1) {
  console.error(`\x1b[31m[VERIFY FAILED] Multiple distinct Supabase project URLs detected in bundle: ${[...detectedUrls].join(', ')}\x1b[0m`);
  process.exit(1);
}

// 6. Assert exact match with independently supplied expected staging reference
const bundledUrl = [...detectedUrls][0];
const expectedUrl = `https://${expectedRef}.supabase.co`;

if (bundledUrl !== expectedUrl) {
  console.error(`\x1b[31m[VERIFY FAILED] Bundled Supabase URL (${bundledUrl}) does not match expected staging URL (${expectedUrl}).\x1b[0m`);
  process.exit(1);
}

console.log(`\x1b[32m[VERIFY PASSED]\x1b[0m Bundle strictly targets expected staging project: ${expectedUrl}`);
process.exit(0);
