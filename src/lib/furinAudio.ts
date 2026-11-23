/**
 * Fūrin (風鈴) — Japanese Glass Wind Chime Audio Synthesizer.
 *
 * Synthesizes an authentic, delicate Japanese blown-glass wind chime using the Web Audio API.
 * Physical acoustic model of Edo Fūrin:
 * - High-pitched inharmonic vibrational modes of blown glass (circular bowl).
 * - Soft glass clapper (zetsu) strike transient.
 * - Gentle breeze-driven rebound strike flutter (subtle double-tinkle).
 * - Completely local to the client device: zero network, zero broadcast.
 * - Strict polyphony limiting (max 3 concurrent voices) to prevent build-up on rapid clicks.
 * - Handles autoplay restrictions and headless/unsupported browsers gracefully.
 */

const STORAGE_KEY_MUTED = 'at_furin_muted';

let audioCtx: AudioContext | null = null;
const activeVoiceGains: GainNode[] = [];
const MAX_CONCURRENT_VOICES = 3;

/** Check if Web Audio API is supported in the current environment. */
export function isAudioSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || (window as any).webkitAudioContext);
}

/** Check if wind chime is muted in local storage. */
export function isFurinMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
  } catch {
    return false;
  }
}

/** Set wind chime mute state. */
export function setFurinMuted(muted: boolean): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_MUTED, muted ? 'true' : 'false');
  } catch {
    /* storage may be blocked */
  }
  return muted;
}

/** Toggle wind chime mute state and return new state. */
export function toggleFurinMuted(): boolean {
  const next = !isFurinMuted();
  return setFurinMuted(next);
}

/** Lazily get or create the shared AudioContext. */
function getOrCreateContext(): AudioContext | null {
  if (!isAudioSupported()) return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Crystalline bell notes centered in the high register (~2.0 - 2.6 kHz) */
const PITCH_SEEDS = [1975.5, 2093.0, 2217.4, 2349.3, 2489.0, 2637.0];

/**
 * Play a single chime strike with delicate glass partials.
 */
function playStrike(
  ctx: AudioContext,
  masterOut: GainNode,
  baseFreq: number,
  startTime: number,
  velocity: number
) {
  // Edo Fūrin circular bowl inharmonic partial ratios
  const partials = [
    { ratio: 1.0,  gain: 0.40, decay: 1.8 }, // Fundamental glass ring
    { ratio: 1.48, gain: 0.14, decay: 1.0 }, // Sub-resonant ring
    { ratio: 2.76, gain: 0.22, decay: 1.2 }, // Upper glass shimmer
    { ratio: 3.82, gain: 0.08, decay: 0.7 }, // Crystal overtone
    { ratio: 5.40, gain: 0.05, decay: 0.5 }, // High delicate sparkle
  ];

  partials.forEach(({ ratio, gain, decay }) => {
    try {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      // Sine wave with subtle micro-detuning for organic airiness
      osc.type = 'sine';
      const detuneCents = (Math.random() - 0.5) * 8; // ±4 cents
      osc.frequency.setValueAtTime(baseFreq * ratio, startTime);
      osc.detune.setValueAtTime(detuneCents, startTime);

      // Volume envelope: near-instant attack + exponential natural decay
      const peakGain = gain * velocity;
      oscGain.gain.setValueAtTime(0.0001, startTime);
      oscGain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.003);
      oscGain.gain.exponentialRampToValueAtTime(0.00001, startTime + decay);

      osc.connect(oscGain);
      oscGain.connect(masterOut);

      osc.start(startTime);
      osc.stop(startTime + decay + 0.05);

      osc.onended = () => {
        try {
          osc.disconnect();
          oscGain.disconnect();
        } catch {}
      };
    } catch {}
  });

  // Soft clapper contact transient (gentle glass bead tap)
  try {
    const tapOsc = ctx.createOscillator();
    const tapGain = ctx.createGain();
    tapOsc.type = 'triangle';
    tapOsc.frequency.setValueAtTime(4200 + (Math.random() - 0.5) * 400, startTime);

    tapGain.gain.setValueAtTime(0.0001, startTime);
    tapGain.gain.linearRampToValueAtTime(0.06 * velocity, startTime + 0.001);
    tapGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.012);

    tapOsc.connect(tapGain);
    tapGain.connect(masterOut);

    tapOsc.start(startTime);
    tapOsc.stop(startTime + 0.015);

    tapOsc.onended = () => {
      try {
        tapOsc.disconnect();
        tapGain.disconnect();
      } catch {}
    };
  } catch {}
}

export interface FurinPlayOptions {
  /** Master volume multiplier (0.0 to 1.0, default 0.18 for comfortable gentle volume) */
  volume?: number;
  /** Force bypass mute check */
  force?: boolean;
}

/**
 * Ring the Fūrin (plays locally on this device only).
 * Returns true if sound was successfully played, false if muted or unavailable.
 */
export function ringFurin(opts: FurinPlayOptions = {}): boolean {
  if (!opts.force && isFurinMuted()) {
    return false;
  }

  const ctx = getOrCreateContext();
  if (!ctx) return false;

  const now = ctx.currentTime;
  const masterVolume = Math.max(0.01, Math.min(1.0, opts.volume ?? 0.18));

  // Voice Limiting: Fade out older voices if exceeding MAX_CONCURRENT_VOICES
  while (activeVoiceGains.length >= MAX_CONCURRENT_VOICES) {
    const oldest = activeVoiceGains.shift();
    if (oldest) {
      try {
        oldest.gain.cancelScheduledValues(now);
        oldest.gain.linearRampToValueAtTime(0.0001, now + 0.06);
        setTimeout(() => {
          try { oldest.disconnect(); } catch {}
        }, 70);
      } catch {}
    }
  }

  try {
    const voiceMaster = ctx.createGain();
    voiceMaster.gain.setValueAtTime(masterVolume, now);
    voiceMaster.connect(ctx.destination);
    activeVoiceGains.push(voiceMaster);

    // Pick random base pitch with micro-variation
    const randomPitch = PITCH_SEEDS[Math.floor(Math.random() * PITCH_SEEDS.length)];
    const detuneMultiplier = 1 + (Math.random() - 0.5) * 0.05; // ±2.5% detune
    const baseFreq = randomPitch * detuneMultiplier;
    const velocity = 0.8 + Math.random() * 0.35; // Natural strike dynamics

    // 1. Primary clapper strike
    playStrike(ctx, voiceMaster, baseFreq, now, velocity);

    // 2. Breeze Flutter: 65% chance of a gentle rebound strike (tanzaku fluttering in the wind)
    if (Math.random() < 0.65) {
      const reboundDelay = 0.075 + Math.random() * 0.065; // 75ms - 140ms later
      const reboundVelocity = velocity * (0.25 + Math.random() * 0.15); // Softer rebound
      const reboundPitch = baseFreq * (1 + (Math.random() - 0.5) * 0.03);
      playStrike(ctx, voiceMaster, reboundPitch, now + reboundDelay, reboundVelocity);
    }

    // Auto-remove from active voices once sound naturally rings out
    setTimeout(() => {
      const idx = activeVoiceGains.indexOf(voiceMaster);
      if (idx !== -1) activeVoiceGains.splice(idx, 1);
      try { voiceMaster.disconnect(); } catch {}
    }, 2500);

    return true;
  } catch (err) {
    console.warn('[furin] failed to render chime audio', err);
    return false;
  }
}

/**
 * Global click handler that triggers the delicate Fūrin chime for all enabled buttons.
 *
 * Guarantees:
 * - Exactly one chime per interaction (no double-triggering on nested elements or multiple handlers).
 * - Only enabled buttons trigger sound (disabled buttons are completely silent).
 * - The dedicated Fūrin control button manages its own sound/unmute sequence and is bypassed here.
 * - Non-button interactions (text selection, typing, scrolling, focusing) are ignored.
 * - Muted state is strictly respected.
 */
export function handleGlobalButtonClick(e: MouseEvent | { target: any; button?: number }): boolean {
  // Only primary mouse button (button 0) or synthetic click without button property
  if (typeof (e as any).button === 'number' && (e as any).button !== 0) {
    return false;
  }

  // Prevent duplicate handling of the same event
  if ((e as any).__furinHandled) {
    return false;
  }

  const target = (e as any).target;
  if (!target || typeof target !== 'object') {
    return false;
  }

  // Look for the closest button or ARIA role="button"
  const element = target as Element;
  if (typeof element.closest !== 'function') {
    return false;
  }

  const button = element.closest('button, [role="button"]');
  if (!button) {
    return false;
  }

  // Check if disabled (HTML disabled attribute, property, or aria-disabled)
  const isHtmlDisabled = (button as HTMLButtonElement).disabled === true || button.hasAttribute('disabled');
  const isAriaDisabled = button.getAttribute('aria-disabled') === 'true';
  const hasDisabledClass = button.classList && button.classList.contains('disabled');
  if (isHtmlDisabled || isAriaDisabled || hasDisabledClass) {
    return false;
  }

  // Skip the dedicated Fūrin control itself (it handles its own ring & unmute logic)
  if (button.hasAttribute('data-furin-control') || (button.closest && button.closest('[data-furin-control="true"]'))) {
    return false;
  }

  // Mark event as handled so child/parent propagation or multiple listeners never double-chime
  (e as any).__furinHandled = true;

  // Ring with subtle, comfortable ambient button-tap volume
  return ringFurin({ volume: 0.14 });
}

/**
 * Initializes global button click sound listener.
 * Returns an unbind cleanup function.
 */
export function initGlobalButtonSound(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const listener = (e: MouseEvent) => {
    handleGlobalButtonClick(e);
  };

  document.addEventListener('click', listener, { capture: true });
  return () => {
    document.removeEventListener('click', listener, { capture: true });
  };
}
