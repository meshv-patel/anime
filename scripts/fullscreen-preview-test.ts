/**
 * Test suite for:
 * 1. Host Screen Preview (verifies host sees shared screen, muted=true, volume=0, no placeholder)
 * 2. Mobile Fullscreen & CSS Fallback (verifies control visibility, native/CSS toggle, escape key, class application)
 */

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(` \x1b[32mPASS\x1b[0m  ${label}`);
    passed++;
  } else {
    console.error(` \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

console.log('════════════════════════════════════════════════════════════════');
console.log('  ANIME TOGETHER — HOST PREVIEW & MOBILE FULLSCREEN TESTS');
console.log('════════════════════════════════════════════════════════════════\n');

// 1. Inspect Stage.tsx implementation
console.log('▶ [1] Validating Host Screen Preview in Stage.tsx');
const stageFile = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Stage.tsx'), 'utf-8');

check(
  'Host preview uses StreamVideo instead of static anti-mirror placeholder',
  stageFile.includes('<StreamVideo') && !stageFile.includes('Preview is hidden here to avoid an infinite mirror')
);

check(
  'Host preview enforces muted={true} when screenOwner === "me"',
  stageFile.includes("muted={p.screenOwner === 'me' ? true : screenMuted}")
);

check(
  'Host preview enforces volume={0} when screenOwner === "me"',
  stageFile.includes("volume={p.screenOwner === 'me' ? 0 : screenVolume}")
);

check(
  'Host preview uses the existing p.screenStream reference without duplicate sessions',
  stageFile.includes('stream={p.screenStream}')
);

check(
  'Stage renders "Stop Sharing" action button for host directly on active screen overlay',
  stageFile.includes("p.screenOwner === 'me' && (") && stageFile.includes('p.onStopScreen') && stageFile.includes('Stop Sharing')
);

check(
  'Stage preserves audio warning alert if screen is shared without audio',
  stageFile.includes('p.screenAudioWarning')
);

// 2. Inspect Mobile Fullscreen Button & Layout
console.log('\n▶ [2] Validating Mobile Fullscreen Controls in Stage.tsx');
check(
  'Stage imports Maximize and Minimize icons from lucide-react',
  stageFile.includes('Maximize') && stageFile.includes('Minimize')
);

check(
  'Stage renders dedicated top-right fullscreen button',
  stageFile.includes('absolute right-3 top-3 z-30') && stageFile.includes('p.onFs')
);

check(
  'Fullscreen control renders dynamically whenever video or screen share is active (hasContent || p.isFs)',
  stageFile.includes('(hasContent || p.isFs)')
);

check(
  'Fullscreen button toggles icon between Maximize and Minimize based on p.isFs',
  stageFile.includes('p.isFs ? <Minimize') && stageFile.includes('<Maximize')
);

// 3. Inspect Fullscreen CSS Fallback in Stage.tsx
console.log('\n▶ [3] Validating CSS Fullscreen Fallback Styling in Stage.tsx');
check(
  'Stage applies fixed inset-0 z-50 h-full w-full rounded-none when p.isFs is true',
  stageFile.includes("p.isFs ? 'fixed inset-0 z-50 h-full w-full rounded-none'")
);

// 4. Inspect useFullscreen.ts Logic
console.log('\n▶ [4] Validating useFullscreen Hook Logic');
const fsFile = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useFullscreen.ts'), 'utf-8');

check(
  'useFullscreen maintains fallbackFs state for browsers lacking native Fullscreen API',
  fsFile.includes('fallbackFs') && fsFile.includes('setFallbackFs')
);

check(
  'useFullscreen locks body scroll (overflow = hidden) during fallback fullscreen',
  fsFile.includes("document.body.style.overflow = 'hidden'")
);

check(
  'useFullscreen listens for Escape key to exit fallback fullscreen',
  fsFile.includes("e.key === 'Escape'")
);

check(
  'useFullscreen always returns supported: true (native API or CSS fallback)',
  fsFile.includes('supported = true') || fsFile.includes('supported: true')
);

check(
  'useFullscreen catches native fullscreen rejection and activates CSS fallback',
  fsFile.includes('setFallbackFs(true)')
);

// 5. Inspect ControlBar.tsx
console.log('\n▶ [5] Validating ControlBar.tsx Fullscreen Control');
const cbFile = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ControlBar.tsx'), 'utf-8');

check(
  'ControlBar renders desktop/bottom fullscreen control via p.fsSupported',
  cbFile.includes('p.fsSupported &&') && cbFile.includes('p.onFs')
);

console.log(`\n════════════════════════════════════════════════════════════════`);
console.log(`  SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`════════════════════════════════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
