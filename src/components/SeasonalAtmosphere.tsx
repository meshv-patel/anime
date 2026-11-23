import { useEffect, useState, useMemo } from 'react';
import {
  type SeasonalTheme,
  type SeasonPreference,
  loadSeasonPreference,
  resolveActiveSeason,
  subscribeSeason,
} from '../lib/season';

interface Particle {
  id: number;
  left: string;
  delay: string;
  duration: string;
  size: number;
  opacity: number;
}

/**
 * SeasonalAtmosphere (四時の気配 — Shiji no Kehai)
 *
 * Ambient visual layer for Anime Together:
 * - Spring: Soft cherry blossom petals (Sakura)
 * - Summer: Gentle firefly glow / festival breeze motes (Hotaru / Natsu-kaze)
 * - Autumn: Drifting Japanese maple leaves (Momiji)
 * - Winter: Quiet drifting snow (Yuki)
 *
 * Completely non-interactive (pointer-events: none), lightweight, zero external assets.
 * Respects prefers-reduced-motion.
 */
export function SeasonalAtmosphere() {
  const [pref, setPref] = useState<SeasonPreference>(loadSeasonPreference);
  const [activeSeason, setActiveSeason] = useState<SeasonalTheme>(() => resolveActiveSeason(pref));

  useEffect(() => {
    // Initial check
    setActiveSeason(resolveActiveSeason(pref));

    // Subscribe to preference updates across the app
    const unsubscribe = subscribeSeason((newPref, newActive) => {
      setPref(newPref);
      setActiveSeason(newActive);
    });

    return unsubscribe;
  }, [pref]);

  // Keep 7-8 subtle particles with deterministic spaced positions
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: `${(i * 13 + 7) % 94}%`,
      delay: `${-(i * 2.2)}s`,
      duration: `${11 + (i % 4) * 2.5}s`,
      size: 14 + (i % 3) * 4,
      opacity: 0.55 + (i % 3) * 0.15,
    }));
  }, []);

  return (
    <div
      className="seasonal-atmosphere pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
      data-season={activeSeason}
    >
      {/* Background ambient corner glow tint */}
      <div className={`seasonal-ambient-glow seasonal-glow-${activeSeason}`} />

      {/* Seasonal floating motifs */}
      {activeSeason === 'spring' && (
        <div className="season-particles season-spring">
          {particles.map((p) => (
            <div
              key={p.id}
              className="seasonal-particle particle-sakura"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: p.duration,
                width: `${p.size}px`,
                height: `${p.size * 0.75}px`,
                opacity: p.opacity,
              }}
            >
              <svg viewBox="0 0 20 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                <path
                  d="M10 0 C4 2, 0 8, 3 13 C6 16, 14 15, 17 11 C20 7, 16 2, 10 0 Z"
                  fill="url(#sakuraGrad)"
                />
                <defs>
                  <linearGradient id="sakuraGrad" x1="0" y1="0" x2="20" y2="15" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#fce7f0" />
                    <stop offset="50%" stopColor="#f4a6c0" />
                    <stop offset="100%" stopColor="#df5a8b" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          ))}
        </div>
      )}

      {activeSeason === 'summer' && (
        <div className="season-particles season-summer">
          {particles.map((p) => (
            <div
              key={p.id}
              className="seasonal-particle particle-summer"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: `${parseFloat(p.duration) * 0.8}s`,
                width: `${p.size * 0.8}px`,
                height: `${p.size * 0.8}px`,
                opacity: p.opacity * 0.85,
              }}
            >
              <div className="summer-firefly-glow" />
            </div>
          ))}
        </div>
      )}

      {activeSeason === 'autumn' && (
        <div className="season-particles season-autumn">
          {particles.map((p) => (
            <div
              key={p.id}
              className="seasonal-particle particle-momiji"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: p.duration,
                width: `${p.size * 1.1}px`,
                height: `${p.size * 1.1}px`,
                opacity: p.opacity,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                {/* Stylized Japanese Momiji (Maple) leaf */}
                <path
                  d="M12 2 L13.5 7 L17 4 L16 9 L21 9 L17 12.5 L20 16 L14.5 15 L12 21 L9.5 15 L4 16 L7 12.5 L3 9 L8 9 L7 4 L10.5 7 Z"
                  fill="url(#momijiGrad)"
                />
                <line x1="12" y1="9" x2="12" y2="23" stroke="#8c2e17" strokeWidth="1.2" strokeLinecap="round" />
                <defs>
                  <linearGradient id="momijiGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#f59e3f" />
                    <stop offset="50%" stopColor="#e07a5f" />
                    <stop offset="100%" stopColor="#9e2a2b" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          ))}
        </div>
      )}

      {activeSeason === 'winter' && (
        <div className="season-particles season-winter">
          {particles.map((p) => (
            <div
              key={p.id}
              className="seasonal-particle particle-yuki"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: `${parseFloat(p.duration) * 1.1}s`,
                width: `${p.size * 0.7}px`,
                height: `${p.size * 0.7}px`,
                opacity: p.opacity * 0.8,
              }}
            >
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                {/* Delicate snowflake dot with soft crystalline cross */}
                <circle cx="8" cy="8" r="4" fill="#ffffff" fillOpacity="0.85" />
                <circle cx="8" cy="8" r="7" fill="#b0c4de" fillOpacity="0.25" />
                <line x1="8" y1="1" x2="8" y2="15" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.7" />
                <line x1="1" y1="8" x2="15" y2="8" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.7" />
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
