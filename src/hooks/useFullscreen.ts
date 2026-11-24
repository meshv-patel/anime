import { useCallback, useEffect, useState, type RefObject } from 'react';

const fsEl = () => document.fullscreenElement ?? (document as any).webkitFullscreenElement ?? null;

/** Fullscreens the STAGE element (not <video>), with native API and robust CSS fallback for mobile. */
export function useFullscreen(ref: RefObject<HTMLElement>) {
  const [isFs, setIsFs] = useState(false);
  const [fallbackFs, setFallbackFs] = useState(false);

  useEffect(() => {
    const h = () => {
      const active = !!ref.current && fsEl() === ref.current;
      setIsFs(active);
      if (!active) {
        setFallbackFs(false);
      }
    };
    document.addEventListener('fullscreenchange', h);
    document.addEventListener('webkitfullscreenchange', h);
    return () => {
      document.removeEventListener('fullscreenchange', h);
      document.removeEventListener('webkitfullscreenchange', h);
    };
  }, [ref]);

  // Lock body & document scroll and allow Escape key or orientation change handling
  useEffect(() => {
    if (!fallbackFs) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevDocOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFallbackFs(false);
      }
    };
    const onOrientation = () => {
      // Re-evaluate scroll lock on mobile orientation flip
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onOrientation);
    window.addEventListener('orientationchange', onOrientation);

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevDocOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onOrientation);
      window.removeEventListener('orientationchange', onOrientation);
    };
  }, [fallbackFs]);

  const toggle = useCallback(async () => {
    const el = ref.current as any;
    if (!el) return;

    // 1. If currently in fallback fullscreen, exit it
    if (fallbackFs) {
      setFallbackFs(false);
      return;
    }

    // 2. If currently in native fullscreen, exit it
    if (fsEl()) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
      } catch (e) {
        console.warn('exitFullscreen failed', e);
      }
      return;
    }

    // 3. Try native Fullscreen API first
    let nativeSuccess = false;
    if (el.requestFullscreen || el.webkitRequestFullscreen) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
        nativeSuccess = true;
      } catch (e) {
        console.warn('Native fullscreen rejected or unsupported, using CSS fallback', e);
        nativeSuccess = false;
      }
    }

    // 4. Fallback to CSS fullscreen when native API is unavailable or rejected (e.g. iOS Safari)
    if (!nativeSuccess) {
      setFallbackFs(true);
    }
  }, [ref, fallbackFs]);

  const supported = true; // Always supported via native API or CSS fallback
  return { isFs: isFs || fallbackFs, toggle, supported, isFallback: fallbackFs, isImmersive: fallbackFs };
}
