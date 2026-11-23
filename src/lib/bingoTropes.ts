// Comprehensive original anime trope library categorized across popular anime genres.
import type { BingoCategory, BingoTrope } from './types';

export interface TropeDefinition {
  id: string;
  text: string;
  category: BingoCategory;
  emoji: string;
  hint: string;
}

export const ANIME_TROPES: TropeDefinition[] = [
  // ── Shonen ──
  { id: 'sh-1', category: 'shonen', emoji: '⚡', text: 'Unexpected power awakening', hint: 'Protagonist awakens latent energy in a pinch' },
  { id: 'sh-2', category: 'shonen', emoji: '📜', text: 'Dramatic battle flashback', hint: 'Memories pause the fight at a pivotal moment' },
  { id: 'sh-3', category: 'shonen', emoji: '🗣️', text: 'Villain explains their plan', hint: 'Antagonist boasts every step of their evil scheme' },
  { id: 'sh-4', category: 'shonen', emoji: '🤝', text: 'Power of friendship speech', hint: 'A bond-fueled monologue boosts power level' },
  { id: 'sh-5', category: 'shonen', emoji: '🏋️', text: 'Intense training montage', hint: 'Rapid progression through sweat, rocks, and tears' },
  { id: 'sh-6', category: 'shonen', emoji: '🩸', text: 'Protagonist refuses to stay down', hint: 'Stands up despite catastrophic damage' },
  { id: 'sh-7', category: 'shonen', emoji: '🌀', text: 'Secret forbidden technique', hint: 'Mentor forbade using it, yet here it comes' },
  { id: 'sh-8', category: 'shonen', emoji: '🕶️', text: 'Rival scoffs from the shadows', hint: 'Cool rival smirks while watching from a cliff' },
  { id: 'sh-9', category: 'shonen', emoji: '💥', text: 'Attack name yelled at top volume', hint: 'Special move named before impact' },
  { id: 'sh-10', category: 'shonen', emoji: '🏆', text: 'Tournament arc announcement', hint: 'The squad enters an arena elimination bracket' },

  // ── Romance ──
  { id: 'ro-1', category: 'romance', emoji: '🌸', text: 'Sudden romantic confession', hint: 'Words blurted under cherry blossom branches' },
  { id: 'ro-2', category: 'romance', emoji: '🎆', text: 'Fireworks drown out key words', hint: 'The most important sentence is lost to explosions' },
  { id: 'ro-3', category: 'romance', emoji: '🍞', text: 'Running with toast in mouth', hint: 'Late for the first bell of the semester' },
  { id: 'ro-4', category: 'romance', emoji: '☔', text: 'Sharing a single umbrella', hint: 'A sudden downpour leads to shared shelter' },
  { id: 'ro-5', category: 'romance', emoji: '😳', text: 'Mutual intense blushing', hint: 'Accidental hand contact causes bright red cheeks' },
  { id: 'ro-6', category: 'romance', emoji: '🍱', text: 'Handmade bento offered', hint: 'Lovingly prepared lunch given with hesitation' },
  { id: 'ro-7', category: 'romance', emoji: '🎡', text: 'Awkward festival date', hint: 'Yukata attire and goldfish scooping stalls' },
  { id: 'ro-8', category: 'romance', emoji: '🪟', text: 'Gazing wistfully through the window', hint: 'Deep romantic sigh during a quiet homeroom lesson' },
  { id: 'ro-9', category: 'romance', emoji: '🩹', text: 'Careful band-aid application', hint: 'Tending to a tiny papercut with romantic tension' },
  { id: 'ro-10', category: 'romance', emoji: '💌', text: 'Unopened letter in shoe locker', hint: 'Secret admirer note found between slippers' },

  // ── Slice of Life ──
  { id: 'so-1', category: 'slice-of-life', emoji: '🏖️', text: 'Mandatory beach episode', hint: 'Watermelon splitting and ocean splash montage' },
  { id: 'so-2', category: 'slice-of-life', emoji: '♨️', text: 'Hot springs visit', hint: 'Relaxing onsen bath with steam obscuring views' },
  { id: 'so-3', category: 'slice-of-life', emoji: '📚', text: 'Panicked study session', hint: 'Cramming for exams until midnight with snacks' },
  { id: 'so-4', category: 'slice-of-life', emoji: '🍰', text: 'After-school tea and dessert', hint: 'Clubroom pastries take priority over club duties' },
  { id: 'so-5', category: 'slice-of-life', emoji: '🎐', text: 'Cicadas buzzing in summer heat', hint: 'The sound of summer echoing through the town' },
  { id: 'so-6', category: 'slice-of-life', emoji: '🐱', text: 'Stray cat joins the cast', hint: 'A cute neighborhood animal is fed by the group' },
  { id: 'so-7', category: 'slice-of-life', emoji: '⛺', text: 'Cozy camping trip', hint: 'Stargazing around a campfire in warm fleece' },
  { id: 'so-8', category: 'slice-of-life', emoji: '🎭', text: 'School cultural festival prep', hint: 'Building a maid cafe or haunted house booth' },
  { id: 'so-9', category: 'slice-of-life', emoji: '🚲', text: 'Bicycle ride at golden hour', hint: 'Riding home along the riverbank at sunset' },
  { id: 'so-10', category: 'slice-of-life', emoji: '🍜', text: 'Steaming bowl of ramen shared', hint: 'Slurping noodles at a cozy corner stall' },

  // ── Isekai ──
  { id: 'is-1', category: 'isekai', emoji: '🚚', text: 'Truck hazard in episode one', hint: 'The infamous catalyst for entering a new realm' },
  { id: 'is-2', category: 'isekai', emoji: '📊', text: 'Floating RPG status window', hint: 'HP, MP, and overpowered stats visible in the air' },
  { id: 'is-3', category: 'isekai', emoji: '🧙‍♀️', text: 'Eccentric guild receptionist', hint: 'Registering rank at the local adventurers hall' },
  { id: 'is-4', category: 'isekai', emoji: '🐉', text: 'S-Rank monster befriended', hint: 'Legendary beast turns into an adorable pet' },
  { id: 'is-5', category: 'isekai', emoji: '🍲', text: 'Modern cooking astounds locals', hint: 'Simple earth spices blow away fantasy nobility' },
  { id: 'is-6', category: 'isekai', emoji: '👑', text: 'Summoned by desperate kingdom', hint: 'Summoning circle greets the confused newcomer' },
  { id: 'is-7', category: 'isekai', emoji: '⚔️', text: 'Starting town looks medieval European', hint: 'Cobblestone streets, waterwheel, and castle walls' },
  { id: 'is-8', category: 'isekai', emoji: '✨', text: 'Overpowered cheat skill revealed', hint: 'Unique ability breaks all natural magic laws' },
  { id: 'is-9', category: 'isekai', emoji: '🧝', text: 'Elf archer joins the party', hint: 'Wise, sharp-eared ranger offers guidance' },
  { id: 'is-10', category: 'isekai', emoji: '💰', text: 'Inventing modern gadget for coin', hint: 'Introducing simple conveniences to amass wealth' },

  // ── Fantasy ──
  { id: 'fa-1', category: 'fantasy', emoji: '🔮', text: 'Ancient prophecy foretold', hint: 'Old scrolls predicted the arrival of the hero' },
  { id: 'fa-2', category: 'fantasy', emoji: '🗡️', text: 'Legendary sword pulled from stone', hint: 'Ancient blade recognizes its true master' },
  { id: 'fa-3', category: 'fantasy', emoji: '🏰', text: 'Dark castle storm clouds gather', hint: 'Foreboding thunderstorm above the demon spire' },
  { id: 'fa-4', category: 'fantasy', emoji: '🧰', text: 'Potion brewed in bubbling cauldron', hint: 'Alchemist stirs mysterious glowing elixirs' },
  { id: 'fa-5', category: 'fantasy', emoji: '📜', text: 'Forgotten ruins discovered', hint: 'Overgrown stone temple with glowing glyphs' },
  { id: 'fa-6', category: 'fantasy', emoji: '🛡️', text: 'Shield completely blocks ultimate spell', hint: 'Barrier holds firm with sheer determination' },
  { id: 'fa-7', category: 'fantasy', emoji: '🧚', text: 'Tiny fairy gives vague riddle', hint: 'Guide spirit offers cryptic hints in glowing light' },
  { id: 'fa-8', category: 'fantasy', emoji: '🌋', text: 'Active volcano dungeon climb', hint: 'Lava rivers and falling brimstone obstacles' },
  { id: 'fa-9', category: 'fantasy', emoji: '🕊️', text: 'Sacred grove healing pool', hint: 'Water cures all fatigue under enchanted trees' },
  { id: 'fa-10', category: 'fantasy', emoji: '🌑', text: 'Blood moon triggers dark ritual', hint: 'Red sky amplifies monstrous power' },

  // ── Mystery ──
  { id: 'my-1', category: 'mystery', emoji: '🔍', text: 'Clue overlooked by the detective', hint: 'Small dropped item reveals the whole case' },
  { id: 'my-2', category: 'mystery', emoji: '🌩️', text: 'Isolated manor cut off by storm', hint: 'Bridge washed out; everyone is trapped inside' },
  { id: 'my-3', category: 'mystery', emoji: '🎭', text: 'Mysterious masked figure', hint: 'Identity hidden behind porcelain or silk mask' },
  { id: 'my-4', category: 'mystery', emoji: '⏱️', text: 'Ticking countdown cipher', hint: 'Riddle must be solved before the clock strikes' },
  { id: 'my-5', category: 'mystery', emoji: '🕵️', text: 'Dramatic finger point deduction', hint: 'The culprit is exposed in front of everyone' },
  { id: 'my-6', category: 'mystery', emoji: '🕯️', text: 'Lights suddenly go out', hint: 'Total darkness followed by a gasp' },
  { id: 'my-7', category: 'mystery', emoji: '🗝️', text: 'Locked room puzzle presented', hint: 'No visible entry or exit from the crime scene' },
  { id: 'my-8', category: 'mystery', emoji: '📼', text: 'Distorted recorded message found', hint: 'Static-heavy recording provides eerie warning' },
  { id: 'my-9', category: 'mystery', emoji: '♟️', text: 'Mastermind playing chess alone', hint: 'Gloomy mastermind moves white knight deliberately' },
  { id: 'my-10', category: 'mystery', emoji: '📰', text: 'Old newspaper article surfaces', hint: 'Past tragedy connects all present suspects' },

  // ── Comedy ──
  { id: 'co-1', category: 'comedy', emoji: '👃', text: 'Comedic nosebleed reaction', hint: 'Rocket-propelled nosebleed after flustered shock' },
  { id: 'co-2', category: 'comedy', emoji: '🪨', text: 'Chibi transformation for a gag', hint: 'Character shrinks into a cute cartoon form' },
  { id: 'co-3', category: 'comedy', emoji: '🔨', text: 'Oversized hammer out of nowhere', hint: 'Slapstick discipline weapon appears from nowhere' },
  { id: 'co-4', category: 'comedy', emoji: '💨', text: 'Running legs turn into smoke circles', hint: 'Scrambling away in full cartoon panic' },
  { id: 'co-5', category: 'comedy', emoji: '🎤', text: 'Character breaks the fourth wall', hint: 'Speaking directly to the viewer or sound director' },
  { id: 'co-6', category: 'comedy', emoji: '🍚', text: 'Impossibly huge mountain of rice', hint: 'Comically tall dinner bowl devoured in seconds' },
  { id: 'co-7', category: 'comedy', emoji: '😱', text: 'Dramatic jaw-drop reaction', hint: 'Face stretches to the floor in disbelief' },
  { id: 'co-8', category: 'comedy', emoji: '🦎', text: 'Weird monster is completely harmless', hint: 'Terrifying beast just wants belly scratches' },
  { id: 'co-9', category: 'comedy', emoji: '🎭', text: 'Terrible disguise fools everyone', hint: 'Fake mustache and sunglasses convince the crowd' },
  { id: 'co-10', category: 'comedy', emoji: '💥', text: 'Accidental explosion leaves soot faces', hint: 'Failed science experiment leaves hair frizzled' },

  // ── General Anime ──
  { id: 'ge-1', category: 'general', emoji: '🎵', text: 'Opening song plays during the climax', hint: 'Main theme kicks in right before the final blow' },
  { id: 'ge-2', category: 'general', emoji: '🪟', text: 'Main character sits by the window', hint: 'Classic second-to-last desk next to the courtyard' },
  { id: 'ge-3', category: 'general', emoji: '👓', text: 'Glasses pushed up with glowing glint', hint: 'Calculated pause as lenses flash white' },
  { id: 'ge-4', category: 'general', emoji: '💧', text: 'Giant sweat drop behind head', hint: 'Embarrassed exasperation over an ally’s antics' },
  { id: 'ge-5', category: 'general', emoji: '🌅', text: 'Sunset reflection in eyes', hint: 'Emotional resolve forged facing the dusk horizon' },
  { id: 'ge-6', category: 'general', emoji: '🌪️', text: 'Wind blows dramatic cherry blossoms', hint: 'Petals swirl at an intensely emotional moment' },
  { id: 'ge-7', category: 'general', emoji: '🍱', text: 'Screaming while eating spicy food', hint: 'Tears stream from volcanic wasabi or pepper' },
  { id: 'ge-8', category: 'general', emoji: '🌸', text: 'Transfer student introduced today', hint: 'New seat assigned right next to the protagonist' },
  { id: 'ge-9', category: 'general', emoji: '🌙', text: 'Moonlit rooftop dialogue', hint: 'Important promise made under the full moon' },
  { id: 'ge-10', category: 'general', emoji: '🐾', text: 'Animal mascot talks with a catchphrase', hint: 'Cute furry sidekick ends sentences with a verbal tick' }
];

export const FREE_SPACE_TROPE: BingoTrope = {
  id: 'free-space-center',
  text: '🌸 Free Space (Cozy Cat)',
  category: 'general',
  isFree: true
};

/**
 * Seeded pseudo-random number generator (Mulberry32) for deterministic board generation
 */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple string-to-number hash for seeds */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Generate 24 unique tropes + 1 center free space (at index 12) for a 5x5 Bingo board.
 */
export function generateBingoTropes(category: BingoCategory = 'all', seedStr?: string): BingoTrope[] {
  let pool = ANIME_TROPES;
  if (category !== 'all') {
    pool = ANIME_TROPES.filter((t) => t.category === category || t.category === 'general');
    if (pool.length < 24) pool = ANIME_TROPES;
  }

  const rng = seedStr ? mulberry32(hashString(seedStr)) : Math.random;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected: BingoTrope[] = shuffled.slice(0, 24).map((t) => ({
    id: t.id,
    text: `${t.emoji} ${t.text}`,
    category: t.category
  }));

  // Insert FREE SPACE at index 12 (row 2, col 2: the center of a 5x5 board)
  selected.splice(12, 0, FREE_SPACE_TROPE);
  return selected;
}
