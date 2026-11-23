/**
 * AI Anime Companion — INTEGRATION BOUNDARY ONLY (not implemented).
 * No model is called anywhere in the MVP. To add one later, implement `AICompanion` (e.g. a Cloudflare Worker / Supabase Edge
 * Function that holds the API key — never ship a key to the browser) and return it from `getCompanion()`.
 * Contract: replies must be clearly labelled as AI and must NOT reveal spoilers beyond `progress`.
 */
export interface CompanionContext {
  title: string;
  episode?: string;
  /** Furthest episode/timestamp EVERY viewer has reached. The companion must not discuss anything past this. */
  spoilerSafeProgress: { episode?: number; seconds?: number };
  recentChat: Array<{ nickname: string; text: string }>;
}
export type CompanionRequest = 'trivia' | 'explain-character' | 'discussion-prompt' | 'prediction' | 'recommendation';
export interface CompanionReply { text: string; label: 'AI'; spoilerSafe: true }
export interface AICompanion {
  readonly name: string;
  ask(kind: CompanionRequest, ctx: CompanionContext, question?: string): Promise<CompanionReply>;
}
export const getCompanion = (): AICompanion | null => null;
