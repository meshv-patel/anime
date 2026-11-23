export const AVATAR_EMOJI = ['🦊', '🐱', '🐰', '🐼', '🐸', '🐙', '🦉', '🍙', '🌸', '🎐', '🐉', '🍡'];
export const AVATAR_COLORS = ['#f4a6c0', '#ffb86b', '#cbb8ff', '#8fd3c8', '#9cc4ff', '#f9e08b'];
export const makeAvatar = (emoji: string, color: string) => `${emoji}|${color}`;
export function parseAvatar(a: string): { emoji: string; color: string } {
  const [emoji, color] = (a || '').split('|');
  return { emoji: emoji || '🌸', color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#f4a6c0' };
}
