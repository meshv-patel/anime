const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'; // 32 symbols -> no modulo bias with & 31

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}
/** 20 chars x 5 bits = 100 bits of entropy. Matches the CHECK constraint in supabase/schema.sql. */
export function randomRoomId(): string {
  return Array.from(randomBytes(20), (x) => ALPHABET[x & 31]).join('');
}
export const isValidRoomId = (s: string) => /^[a-z2-7]{20}$/.test(s);
/** Works in insecure contexts (plain http on a LAN) where crypto.randomUUID is unavailable. */
export function uid(): string {
  return Array.from(randomBytes(12), (x) => x.toString(16).padStart(2, '0')).join('');
}
/** Accepts a bare room ID or a full invitation link. */
export function parseRoomInput(input: string): string | null {
  const m = input.trim().toLowerCase().match(/[a-z2-7]{20}/g);
  return m ? m[m.length - 1] : null;
}
