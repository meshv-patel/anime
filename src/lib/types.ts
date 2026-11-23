export interface Profile { nickname: string; avatar: string }
export interface Peer { clientId: string; userId: string; nickname: string; avatar: string; joinedAt: number }
export type SourceKind = 'mp4' | 'hls' | 'local';
export interface MediaSource { kind: SourceKind; url: string; title: string; fileName?: string; size?: number }

export interface RoomInfo {
  id: string;
  hostId: string;
  maxParticipants: number;
  expiresAt: number;
  hostOnly?: boolean;
  hostPubkey?: string | null;
  hostEpoch?: number;
  hostSeq?: number;
  currentSource?: MediaSource | null;
  playbackState?: { op: string; time: number; playing: boolean; updatedAt?: number; seq?: number; epoch?: number } | null;
}

export interface ChatMessage {
  id: string;
  kind: 'chat' | 'system' | 'prompt';
  clientId: string;
  nickname: string;
  avatar: string;
  text: string;
  spoiler?: boolean;
  ts: number;
}

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export interface WatchItem { id: string; title: string; status: 'planned' | 'watching' | 'done'; progress: number }
export interface Moment { id: string; note: string; position: number; sourceTitle: string; createdAt: number }
export const REACTIONS = ['😂', '❤️', '🔥', '😭', '😱', '💀', '🗿', '👑', '🎉', '🤯'] as const;

// ── Ema Wish Board (絵馬) ──
export type EmaTheme = 'hinoki' | 'sakura' | 'matsu' | 'kuro';
export type EmaCategory = 'wish' | 'dream' | 'gratitude' | 'message';

export interface EmaPlaque {
  id: string;
  roomId: string;
  message: string;
  authorId: string;
  authorNickname: string;
  theme: EmaTheme;
  category: EmaCategory;
  createdAt: number;
}

export interface EmaDiagnostics {
  currentRoomId: string;
  storeRoomId: string;
  queryError: string | null;
  rowsReturned: number;
  reactStateCount: number;
  lastFetchedAt: number | null;
  otherRoomCards?: Array<{ id: string; roomId: string; nickname: string; message: string }>;
  rawSampleRow?: Record<string, unknown> | null;
}

// ── Anime Bingo ──
export type BingoMode = 'cooperative' | 'competitive';
export type BingoCategory = 'all' | 'shonen' | 'romance' | 'slice-of-life' | 'isekai' | 'fantasy' | 'mystery' | 'comedy' | 'general';

export interface BingoTrope {
  id: string;
  text: string;
  category: BingoCategory;
  isFree?: boolean;
}

export interface BingoBoard {
  id: string;
  gameId: string;
  roomId: string;
  userId: string | null; // null for shared cooperative board
  tropes: BingoTrope[];   // 25 items
  marks: number[];        // marked indices (0..24)
}

export interface BingoGame {
  id: string;
  roomId: string;
  mode: BingoMode;
  status: 'active' | 'completed' | 'reset';
  category: BingoCategory;
  seed: string;
  winnerId?: string | null;
  winnerNickname?: string | null;
  completedLines?: number;
  createdAt: number;
}

// ── Episode Predictions ──
export type PredictionKind = 'choice' | 'text';
export type PredictionStatus = 'open' | 'locked' | 'revealed' | 'resolved' | 'cancelled';

export interface PredictionOption {
  id: string;
  text: string;
}

export interface Prediction {
  id: string;
  roomId: string;
  question: string;
  kind: PredictionKind;
  options: PredictionOption[];
  status: PredictionStatus;
  deadlineAt?: number | null;
  episodeTimestamp?: number | null;
  isSpoiler: boolean;
  winningOption?: string | null;
  pointsReward: number;
  createdBy: string;
  createdAt: number;
  resolvedAt?: number | null;
}

export interface PredictionAnswer {
  id: string;
  predictionId: string;
  roomId: string;
  userId: string;
  nickname?: string;
  avatar?: string;
  answer: string;
  locked: boolean;
  isCorrect?: boolean;
  submittedAt: number;
}

export interface PlayerScore {
  userId: string;
  nickname: string;
  avatar?: string;
  score: number;
  predictionsWon: number;
  bingosWon: number;
}
