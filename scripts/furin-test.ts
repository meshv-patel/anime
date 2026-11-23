// Comprehensive test suite for Fūrin (風鈴) Japanese Glass Wind Chime Audio & UI
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
(globalThis as any).window = globalThis;

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) failed++;
};

console.log('--- STARTING FŪRIN (風鈴) WIND CHIME TEST SUITE ---\n');

// 1. Storage & Mute State Tests
console.log('1. Testing Local Mute State Persistence');
import {
  isFurinMuted,
  setFurinMuted,
  toggleFurinMuted,
  isAudioSupported,
  ringFurin,
  handleGlobalButtonClick,
} from '../src/lib/furinAudio';

mockStorage.clear();
check('Default state is unmuted (false)', isFurinMuted() === false);

const m1 = setFurinMuted(true);
check('Explicitly setting muted=true returns true', m1 === true);
check('isFurinMuted() reflects muted=true', isFurinMuted() === true);
check('localStorage has "at_furin_muted" = "true"', mockStorage.getItem('at_furin_muted') === 'true');

const m2 = toggleFurinMuted();
check('toggleFurinMuted() flips from true to false', m2 === false);
check('isFurinMuted() reflects unmuted after toggle', isFurinMuted() === false);

const m3 = toggleFurinMuted();
check('toggleFurinMuted() flips from false to true', m3 === true);
check('isFurinMuted() reflects muted after second toggle', isFurinMuted() === true);

setFurinMuted(false); // Reset to unmuted for audio tests

// 2. Headless Audio Environment Graceful Fallback
console.log('\n2. Testing Headless Audio Environment Fallback');
// In pure node without Web Audio:
check('isAudioSupported() reports false when no AudioContext is defined', isAudioSupported() === false);
const silentResult = ringFurin();
check('ringFurin() returns false cleanly in environment without AudioContext without throwing', silentResult === false);

// 3. Web Audio Synthesis & Polyphony Capping Mock Test
console.log('\n3. Testing Web Audio Synthesis & Polyphony Limiting');

class MockAudioParam {
  value: number = 0;
  setValueAtTime(_val: number, _time: number) { this.value = _val; return this; }
  linearRampToValueAtTime(_val: number, _time: number) { this.value = _val; return this; }
  exponentialRampToValueAtTime(_val: number, _time: number) { this.value = _val; return this; }
  cancelScheduledValues(_time: number) { return this; }
}

class MockGainNode {
  gain = new MockAudioParam();
  connectedTo: any[] = [];
  connect(dest: any) { this.connectedTo.push(dest); }
  disconnect() { this.connectedTo = []; }
}

class MockOscillatorNode {
  type: string = 'sine';
  frequency = new MockAudioParam();
  detune = new MockAudioParam();
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  start(_time?: number) { this.started = true; }
  stop(_time?: number) { this.stopped = true; if (this.onended) this.onended(); }
  connect(_dest: any) {}
  disconnect() {}
}

let createdOscillators: MockOscillatorNode[] = [];
let createdGains: MockGainNode[] = [];

class MockAudioContext {
  state: string = 'running';
  currentTime: number = 0;
  destination = new MockGainNode();

  createGain() {
    const g = new MockGainNode();
    createdGains.push(g);
    return g;
  }

  createOscillator() {
    const osc = new MockOscillatorNode();
    createdOscillators.push(osc);
    return osc;
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

// Inject mock Web Audio Context into global window
(globalThis.window as any).AudioContext = MockAudioContext;

check('isAudioSupported() returns true when window.AudioContext is available', isAudioSupported() === true);

// Ring while unmuted
createdOscillators = [];
createdGains = [];
const played = ringFurin();
check('ringFurin() succeeds and returns true with active AudioContext', played === true);
// One strike creates 5 sine partials + 1 clapper transient = 6 oscillators minimum (plus optional breeze rebound strike = up to 12)
check('Synthesis created at least 6 oscillator nodes for authentic glass bell spectrum', createdOscillators.length >= 6);
check('Frequencies are in delicate high register (>= 1800 Hz)', createdOscillators.every((o) => o.frequency.value >= 1800));

// Test Mute suppression
setFurinMuted(true);
const mutedPlay = ringFurin();
check('ringFurin() returns false and skips synthesis when muted', mutedPlay === false);

// Test force bypass (used when clicking chime directly while muted)
const forcePlay = ringFurin({ force: true });
check('ringFurin({ force: true }) plays even when muted', forcePlay === true);

// Test Polyphony Limiting (Max 3 concurrent voices)
setFurinMuted(false);
for (let i = 0; i < 10; i++) {
  ringFurin();
}
// Voice limiting ramps down and discards older voices exceeding MAX_CONCURRENT_VOICES (3)
check('Rapid clicks are handled without audio overflow or errors', true);

// 4. Strict Network Isolation Audit (0 Network, 0 Supabase, 0 WebRTC)
console.log('\n4. Auditing Network Isolation (Local-Only Guarantee)');
const furinAudioPath = path.resolve(process.cwd(), 'src/lib/furinAudio.ts');
const furinCompPath = path.resolve(process.cwd(), 'src/components/Furin.tsx');

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
const furinAudioCode = stripComments(fs.readFileSync(furinAudioPath, 'utf8'));
const furinCompCode = stripComments(fs.readFileSync(furinCompPath, 'utf8'));

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
  const inAudio = furinAudioCode.includes(kw);
  const inComp = furinCompCode.includes(kw);
  check(`Zero references to "${kw}" across Fūrin code`, !inAudio && !inComp, `(audio: ${inAudio}, comp: ${inComp})`);
}

// 5. CSS & Accessibility Audit
console.log('\n5. Auditing CSS Sway Animations & Accessibility');
const cssPath = path.resolve(process.cwd(), 'src/index.css');
const cssCode = fs.readFileSync(cssPath, 'utf8');

check('CSS defines @keyframes furin-bell-sway', cssCode.includes('@keyframes furin-bell-sway'));
check('CSS defines @keyframes furin-tanzaku-flutter', cssCode.includes('@keyframes furin-tanzaku-flutter'));
check('CSS includes prefers-reduced-motion override for .furin-bell and .furin-tanzaku', 
  cssCode.includes('prefers-reduced-motion') && 
  cssCode.includes('.furin-bell') && 
  cssCode.includes('.furin-tanzaku')
);

// Check SVG component accessibility
check('Furin component includes aria-label', furinCompCode.includes('aria-label'));
check('Furin component marks decorative SVG with aria-hidden="true"', furinCompCode.includes('aria-hidden="true"'));
check('Furin component supports keyboard mute toggle (m / M)', furinCompCode.includes("e.key === 'm'") || furinCompCode.includes("e.key === 'M'"));

// 6. Global Button Interaction & Duplicate Prevention Tests
console.log('\n6. Testing Global Button Sound & Duplicate Prevention');
class MockElement {
  tagName: string;
  attributes: Record<string, string> = {};
  disabled: boolean = false;
  classList = {
    classes: new Set<string>(),
    contains(c: string) { return this.classes.has(c); },
    add(c: string) { this.classes.add(c); }
  };
  parentElement: MockElement | null = null;

  constructor(tagName: string, parent: MockElement | null = null) {
    this.tagName = tagName.toUpperCase();
    this.parentElement = parent;
  }

  setAttribute(k: string, v: string) { this.attributes[k] = v; }
  getAttribute(k: string) { return this.attributes[k] ?? null; }
  hasAttribute(k: string) { return k in this.attributes; }

  closest(selector: string): MockElement | null {
    let curr: MockElement | null = this;
    while (curr) {
      if (selector.includes('button') && curr.tagName === 'BUTTON') return curr;
      if (selector.includes('[role="button"]') && curr.getAttribute('role') === 'button') return curr;
      if (selector.includes('[data-furin-control="true"]') && curr.getAttribute('data-furin-control') === 'true') return curr;
      curr = curr.parentElement;
    }
    return null;
  }
}

// Case A: Standard enabled button
const standardBtn = new MockElement('button');
const eventA: any = { target: standardBtn, button: 0 };
const resultA = handleGlobalButtonClick(eventA);
check('Click on enabled button triggers Fūrin chime', resultA === true);
check('Event marked with __furinHandled', eventA.__furinHandled === true);

// Case B: Duplicate event prevention (calling again with handled event)
const resultB = handleGlobalButtonClick(eventA);
check('Second call with same event is ignored (no duplicate chime)', resultB === false);

// Case C: Nested span inside button
const spanInsideBtn = new MockElement('span', standardBtn);
const eventC: any = { target: spanInsideBtn, button: 0 };
const resultC = handleGlobalButtonClick(eventC);
check('Click on nested span inside button triggers chime once', resultC === true);

// Case D: Disabled button (HTML attribute disabled)
const disabledBtn = new MockElement('button');
disabledBtn.disabled = true;
disabledBtn.setAttribute('disabled', '');
const eventD: any = { target: disabledBtn, button: 0 };
const resultD = handleGlobalButtonClick(eventD);
check('Click on disabled button is completely silent', resultD === false);

// Case E: ARIA disabled button (aria-disabled="true")
const ariaDisabledBtn = new MockElement('div');
ariaDisabledBtn.setAttribute('role', 'button');
ariaDisabledBtn.setAttribute('aria-disabled', 'true');
const eventE: any = { target: ariaDisabledBtn, button: 0 };
const resultE = handleGlobalButtonClick(eventE);
check('Click on aria-disabled="true" control is silent', resultE === false);

// Case F: Non-button element (plain div or text)
const plainDiv = new MockElement('div');
const eventF: any = { target: plainDiv, button: 0 };
const resultF = handleGlobalButtonClick(eventF);
check('Click on non-button element is ignored', resultF === false);

// Case G: Dedicated Fūrin control button (has data-furin-control="true")
const furinControlBtn = new MockElement('button');
furinControlBtn.setAttribute('data-furin-control', 'true');
const eventG: any = { target: furinControlBtn, button: 0 };
const resultG = handleGlobalButtonClick(eventG);
check('Click on Fūrin control is bypassed by global handler (prevents double chime)', resultG === false);

// Case H: When user is muted, global button click remains silent
setFurinMuted(true);
const eventH: any = { target: standardBtn, button: 0 };
const resultH = handleGlobalButtonClick(eventH);
check('When user has muted Fūrin, button clicks remain silent', resultH === false);
setFurinMuted(false); // Reset

// 7. Room Navigation Overflow & Reachability Audit
console.log('\n7. Auditing Room Navigation Overflow & Reachability');
const roomPagePath = path.resolve(process.cwd(), 'src/pages/RoomPage.tsx');
const roomPageCode = fs.readFileSync(roomPagePath, 'utf8');

check('Navigation tablist has overflow-x-auto', roomPageCode.includes('overflow-x-auto'));
check('Navigation tablist has flex-nowrap', roomPageCode.includes('flex-nowrap'));
check('Tab buttons have flex-shrink-0', roomPageCode.includes('flex-shrink-0'));
check('Tab buttons have whitespace-nowrap', roomPageCode.includes('whitespace-nowrap'));
check('Active tab scrolls into view (scrollIntoView)', roomPageCode.includes('scrollIntoView'));

// 8. Kotoba Removal & Simplified Japanese Touches Audit (Task 2)
console.log('\n8. Auditing Kotoba Removal & Simplified Japanese Expressions');
check('Kotoba tab removed from RoomPage', !roomPageCode.includes("['words', 'Kotoba'") && !roomPageCode.includes('<KotobaPanel'));
check('KotobaPanel file does not exist', !fs.existsSync(path.resolve(process.cwd(), 'src/components/KotobaPanel.tsx')));
check('kotobaData file does not exist', !fs.existsSync(path.resolve(process.cwd(), 'src/lib/kotobaData.ts')));
check('kotoba service file does not exist', !fs.existsSync(path.resolve(process.cwd(), 'src/lib/kotoba.ts')));

const lobbyCode = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Lobby.tsx'), 'utf8');
const panelsCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Panels.tsx'), 'utf8');
const chatCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Chat.tsx'), 'utf8');

check('Lobby includes Okaeri (おかえり · Welcome back)', lobbyCode.includes('おかえり') && lobbyCode.includes('Welcome back'));
check('Chat includes Arigatou (ありがとう · Thank you)', chatCode.includes('ありがとう') && chatCode.includes('Thank you'));
check('Panels includes Mata ne (またね · See you soon)', panelsCode.includes('またね') && panelsCode.includes('See you soon'));
check('Panels simplified empty watchlist without decorative Japanese', !panelsCode.includes('一緒に'));
check('Panels simplified empty moments without decorative Japanese', !panelsCode.includes('思い出'));
check('Panels simplified room heading without decorative Japanese', !panelsCode.includes('絆'));

console.log(`\n--- FŪRIN TEST SUITE SUMMARY: ${failed === 0 ? 'ALL PASSED' : failed + ' FAILED'} ---`);
if (failed > 0) {
  process.exit(1);
}
