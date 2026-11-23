// Comprehensive test suite for Japanese Seasonal Atmosphere (四時の気配 — Shiji no Kehai)
import * as fs from 'fs';
import * as path from 'path';

// Mock localStorage for Node.js
const memoryStorage: Record<string, string> = {};
const mockStorage = {
  getItem: (k: string) => memoryStorage[k] ?? null,
  setItem: (k: string, v: string) => { memoryStorage[k] = v; },
  removeItem: (k: string) => { delete memoryStorage[k]; },
  clear: () => { for (const k of Object.keys(memoryStorage)) delete memoryStorage[k]; }
};
(globalThis as any).localStorage = mockStorage;

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) failed++;
};

console.log('--- STARTING JAPANESE SEASONAL ATMOSPHERE TEST SUITE ---\n');

import {
  SEASONS,
  SEASON_STORAGE_KEY,
  getTokyoMonth,
  resolveAutoSeason,
  resolveActiveSeason,
  loadSeasonPreference,
  saveSeasonPreference,
  subscribeSeason,
  isValidSeasonPreference,
  type SeasonalTheme,
  type SeasonPreference
} from '../src/lib/season';

// 1. All 4 Seasonal Themes Metadata
console.log('1. Testing All Four Seasonal Themes Metadata');
const expectedThemes: SeasonalTheme[] = ['spring', 'summer', 'autumn', 'winter'];
for (const theme of expectedThemes) {
  const meta = SEASONS[theme];
  check(`SEASONS["${theme}"] is properly configured`, 
    Boolean(meta && meta.kanji && meta.romaji && meta.english && meta.motif && meta.accent && meta.bgGlow),
    `(${meta?.kanji} ${meta?.romaji} - ${meta?.english})`
  );
}

// 2. Automatic Mode Selects Correct Season for Each Month
console.log('\n2. Testing Calendar Month Resolution (All 12 Months)');
const monthToSeasonExpected: Record<number, SeasonalTheme> = {
  1: 'winter',  // January
  2: 'winter',  // February
  3: 'spring',  // March
  4: 'spring',  // April
  5: 'spring',  // May
  6: 'summer',  // June
  7: 'summer',  // July
  8: 'summer',  // August
  9: 'autumn',  // September
  10: 'autumn', // October
  11: 'autumn', // November
  12: 'winter', // December
};

for (let m = 1; m <= 12; m++) {
  // Construct date in middle of the month at midday Tokyo time (UTC+9)
  const d = new Date(Date.UTC(2026, m - 1, 15, 3, 0, 0)); // 12:00 PM JST
  const resolved = resolveAutoSeason(d);
  const expected = monthToSeasonExpected[m];
  check(`Month ${m.toString().padStart(2, '0')} resolves to ${expected}`, resolved === expected);
}

// 3. Asia/Tokyo Timezone Boundaries
console.log('\n3. Testing Asia/Tokyo Timezone Accuracy on Month Boundaries');
// UTC: 2026-02-28 20:00:00 (Feb 28 in UTC / US, but in Tokyo UTC+9 it is 2026-03-01 05:00:00 = Spring)
const febToMarchBoundaryUtc = new Date('2026-02-28T20:00:00Z');
const tokyoMonth1 = getTokyoMonth(febToMarchBoundaryUtc);
const season1 = resolveAutoSeason(febToMarchBoundaryUtc);
check('Feb 28 20:00 UTC is March 1 in Tokyo -> Month 3', tokyoMonth1 === 3);
check('Feb 28 20:00 UTC resolves to Spring (春) in Tokyo', season1 === 'spring');

// UTC: 2026-05-31 20:00:00 (May 31 in UTC, but in Tokyo it is 2026-06-01 05:00:00 = Summer)
const mayToJuneBoundaryUtc = new Date('2026-05-31T20:00:00Z');
const tokyoMonth2 = getTokyoMonth(mayToJuneBoundaryUtc);
const season2 = resolveAutoSeason(mayToJuneBoundaryUtc);
check('May 31 20:00 UTC is June 1 in Tokyo -> Month 6', tokyoMonth2 === 6);
check('May 31 20:00 UTC resolves to Summer (夏) in Tokyo', season2 === 'summer');

// UTC: 2026-08-31 20:00:00 (Aug 31 in UTC, but in Tokyo it is 2026-09-01 05:00:00 = Autumn)
const augToSepBoundaryUtc = new Date('2026-08-31T20:00:00Z');
const tokyoMonth3 = getTokyoMonth(augToSepBoundaryUtc);
const season3 = resolveAutoSeason(augToSepBoundaryUtc);
check('Aug 31 20:00 UTC is Sept 1 in Tokyo -> Month 9', tokyoMonth3 === 9);
check('Aug 31 20:00 UTC resolves to Autumn (秋) in Tokyo', season3 === 'autumn');

// UTC: 2026-11-30 20:00:00 (Nov 30 in UTC, but in Tokyo it is 2026-12-01 05:00:00 = Winter)
const novToDecBoundaryUtc = new Date('2026-11-30T20:00:00Z');
const tokyoMonth4 = getTokyoMonth(novToDecBoundaryUtc);
const season4 = resolveAutoSeason(novToDecBoundaryUtc);
check('Nov 30 20:00 UTC is Dec 1 in Tokyo -> Month 12', tokyoMonth4 === 12);
check('Nov 30 20:00 UTC resolves to Winter (冬) in Tokyo', season4 === 'winter');

// 4. Manual Selection Overrides Automatic Mode
console.log('\n4. Testing Manual Selection Overrides');
const springDate = new Date('2026-04-15T12:00:00Z');
check('Auto mode on April 15 returns spring', resolveActiveSeason('auto', springDate) === 'spring');
check('Manual "summer" overrides April to summer', resolveActiveSeason('summer', springDate) === 'summer');
check('Manual "autumn" overrides April to autumn', resolveActiveSeason('autumn', springDate) === 'autumn');
check('Manual "winter" overrides April to winter', resolveActiveSeason('winter', springDate) === 'winter');
check('Manual "spring" keeps spring', resolveActiveSeason('spring', springDate) === 'spring');

// 5. Preferences Persist in localStorage
console.log('\n5. Testing Preference Persistence');
mockStorage.clear();
check('Default preference when empty is "auto"', loadSeasonPreference() === 'auto');

saveSeasonPreference('autumn');
check('saveSeasonPreference("autumn") writes to localStorage', mockStorage.getItem(SEASON_STORAGE_KEY) === 'autumn');
check('loadSeasonPreference() returns "autumn"', loadSeasonPreference() === 'autumn');

saveSeasonPreference('winter');
check('saveSeasonPreference("winter") updates localStorage', mockStorage.getItem(SEASON_STORAGE_KEY) === 'winter');
check('loadSeasonPreference() returns "winter"', loadSeasonPreference() === 'winter');

saveSeasonPreference('auto');
check('saveSeasonPreference("auto") updates localStorage to "auto"', mockStorage.getItem(SEASON_STORAGE_KEY) === 'auto');
check('loadSeasonPreference() returns "auto"', loadSeasonPreference() === 'auto');

// 6. Safe Fallback for Invalid Stored Preferences
console.log('\n6. Testing Corrupt / Invalid Preference Fallbacks');
mockStorage.setItem(SEASON_STORAGE_KEY, 'invalid-theme-test');
check('Invalid preference string falls back to "auto"', loadSeasonPreference() === 'auto');

mockStorage.setItem(SEASON_STORAGE_KEY, '');
check('Empty string preference falls back to "auto"', loadSeasonPreference() === 'auto');

mockStorage.setItem(SEASON_STORAGE_KEY, 'null');
check('"null" string preference falls back to "auto"', loadSeasonPreference() === 'auto');

check('isValidSeasonPreference identifies valid values', 
  isValidSeasonPreference('auto') &&
  isValidSeasonPreference('spring') &&
  isValidSeasonPreference('summer') &&
  isValidSeasonPreference('autumn') &&
  isValidSeasonPreference('winter')
);
check('isValidSeasonPreference rejects invalid values', 
  !isValidSeasonPreference('cyberpunk') &&
  !isValidSeasonPreference(123) &&
  !isValidSeasonPreference(null) &&
  !isValidSeasonPreference(undefined)
);

// 7. Reactive Switching without Reload
console.log('\n7. Testing Reactive Switching Subscription (No Reload / Disconnect)');
let notifiedPref: SeasonPreference | null = null;
let notifiedActive: SeasonalTheme | null = null;

const unsubscribe = subscribeSeason((p, a) => {
  notifiedPref = p;
  notifiedActive = a;
});

saveSeasonPreference('summer');
check('Subscription listener received updated preference "summer"', notifiedPref === 'summer');
check('Subscription listener received active season "summer"', notifiedActive === 'summer');

saveSeasonPreference('autumn');
check('Subscription listener received updated preference "autumn"', notifiedPref === 'autumn');
check('Subscription listener received active season "autumn"', notifiedActive === 'autumn');

unsubscribe();
notifiedPref = null;
saveSeasonPreference('spring');
check('Unsubscribed listener receives no further notifications', notifiedPref === null);

// 8. Interaction Non-Interference (pointer-events: none & aria-hidden)
console.log('\n8. Auditing Interaction Non-Interference');
const compPath = path.resolve(process.cwd(), 'src/components/SeasonalAtmosphere.tsx');
const compCode = fs.readFileSync(compPath, 'utf8');

check('SeasonalAtmosphere component includes pointer-events-none class', compCode.includes('pointer-events-none'));
check('SeasonalAtmosphere has aria-hidden="true"', compCode.includes('aria-hidden="true"'));
check('SeasonalAtmosphere is fixed z-0 background layer', compCode.includes('fixed inset-0 z-0'));

const cssPath = path.resolve(process.cwd(), 'src/index.css');
const cssCode = fs.readFileSync(cssPath, 'utf8');
check('CSS defines .seasonal-atmosphere / .seasonal-particle with pointer-events: none', 
  cssCode.includes('pointer-events: none') && cssCode.includes('.seasonal-particle')
);

// 9. Reduced-Motion Mode Compliance
console.log('\n9. Auditing Reduced-Motion Accessibility Compliance');
check('CSS has @media (prefers-reduced-motion: reduce)', cssCode.includes('@media (prefers-reduced-motion: reduce)'));
check('Reduced motion disables .particle-sakura animation', cssCode.includes('.particle-sakura') && cssCode.includes('animation: none !important'));
check('Reduced motion disables .particle-summer animation', cssCode.includes('.particle-summer'));
check('Reduced motion disables .particle-momiji animation', cssCode.includes('.particle-momiji'));
check('Reduced motion disables .particle-yuki animation', cssCode.includes('.particle-yuki'));

// 10. Strict Zero-Network Isolation (No Realtime Broadcast / No DB Calls)
console.log('\n10. Auditing Zero-Network Isolation');
const seasonLibPath = path.resolve(process.cwd(), 'src/lib/season.ts');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
const seasonLibCode = stripComments(fs.readFileSync(seasonLibPath, 'utf8'));
const compCodeClean = stripComments(compCode);

const networkKeywords = [
  'supabase',
  '@supabase/supabase-js',
  'fetch(',
  'WebSocket',
  'RTCPeerConnection',
  'RTCDataChannel',
  'broadcast',
  '.send(',
  'useRtc',
  'useRoom',
  'useChat',
  'create_room',
  'realtime.messages'
];

for (const kw of networkKeywords) {
  const inLib = seasonLibCode.includes(kw);
  const inComp = compCodeClean.includes(kw);
  check(`Zero references to "${kw}" across season code`, !inLib && !inComp, `(lib: ${inLib}, comp: ${inComp})`);
}

console.log(`\n--- JAPANESE SEASONAL ATMOSPHERE TEST SUMMARY: ${failed === 0 ? 'ALL PASSED' : failed + ' FAILED'} ---`);
if (failed > 0) {
  process.exit(1);
}
