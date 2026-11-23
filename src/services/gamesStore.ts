import { liveConfigured } from '../lib/env';
import { readJson, writeJson } from '../lib/storage';
import { uid } from '../lib/ids';
import type {
  BingoBoard,
  BingoCategory,
  BingoGame,
  BingoMode,
  BingoTrope,
  PlayerScore,
  Prediction,
  PredictionAnswer,
  PredictionKind
} from '../lib/types';
import { getSupabase } from '../realtime/supabase';

export interface GamesStore {
  // ── Bingo ──
  getBingoGame(roomId: string): Promise<BingoGame | null>;
  createBingoGame(roomId: string, mode: BingoMode, category: BingoCategory, tropes: BingoTrope[], seed: string, creatorUserId?: string): Promise<{ game: BingoGame; board: BingoBoard }>;
  getBingoBoard(gameId: string, userId: string | null): Promise<BingoBoard | null>;
  joinBingoBoard(gameId: string, roomId: string, userId: string, tropes: BingoTrope[]): Promise<BingoBoard>;
  markBingoSquare(gameId: string, boardId: string, index: number, userId: string): Promise<number[]>;
  unmarkBingoSquare(gameId: string, boardId: string, index: number, userId: string): Promise<number[]>;
  claimBingoWin(gameId: string, boardId: string, userId: string, nickname: string): Promise<BingoGame>;
  resetBingoGame(gameId: string, roomId: string): Promise<void>;

  // ── Predictions ──
  getPredictions(roomId: string): Promise<Prediction[]>;
  createPrediction(
    roomId: string,
    question: string,
    kind: PredictionKind,
    options: Array<{ id: string; text: string }>,
    deadlineAt?: number | null,
    episodeTimestamp?: number | null,
    isSpoiler?: boolean,
    pointsReward?: number
  ): Promise<Prediction>;
  getPredictionAnswers(predictionId: string, currentUserId: string, isRevealed: boolean): Promise<PredictionAnswer[]>;
  submitAnswer(predictionId: string, roomId: string, userId: string, nickname: string, avatar: string, answer: string): Promise<PredictionAnswer>;
  lockPrediction(predictionId: string, actorUserId?: string): Promise<Prediction>;
  revealPrediction(predictionId: string, actorUserId?: string): Promise<Prediction>;
  resolvePrediction(predictionId: string, winningOption: string, actorUserId?: string): Promise<Prediction>;
  getLeaderboard(roomId: string): Promise<PlayerScore[]>;
}

function checkBingoCompleted(marks: number[]): boolean {
  const markSet = new Set([...marks, 12]);
  const lines = [
    [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
    [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
    [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
  ];
  return lines.some((line) => line.every((idx) => markSet.has(idx)));
}

// ── Local Demo Store Implementation (localStorage) ──
class LocalGamesStore implements GamesStore {
  private gk = (r: string) => `at_bg_game_${r}`;
  private bk = (g: string) => `at_bg_boards_${g}`;
  private pk = (r: string) => `at_preds_${r}`;
  private ak = (p: string) => `at_pred_ans_${p}`;
  private lk = (r: string) => `at_lead_${r}`;
  private predRoomMap = new Map<string, string>();

  private findPrediction(predictionId: string): { key: string; preds: Prediction[]; idx: number } | null {
    const knownRoom = this.predRoomMap.get(predictionId);
    if (knownRoom) {
      const preds = readJson<Prediction[]>(this.pk(knownRoom), []);
      const idx = preds.findIndex((p) => p.id === predictionId);
      if (idx >= 0) return { key: this.pk(knownRoom), preds, idx };
    }
    const demoRooms = Object.keys(readJson<Record<string, unknown>>('at_demo_rooms', {}));
    for (const r of demoRooms) {
      const preds = readJson<Prediction[]>(this.pk(r), []);
      const idx = preds.findIndex((p) => p.id === predictionId);
      if (idx >= 0) {
        this.predRoomMap.set(predictionId, r);
        return { key: this.pk(r), preds, idx };
      }
    }
    try {
      const allKeys = Object.keys(localStorage).filter((k) => k.startsWith('at_preds_'));
      for (const key of allKeys) {
        const preds = readJson<Prediction[]>(key, []);
        const idx = preds.findIndex((p) => p.id === predictionId);
        if (idx >= 0) return { key, preds, idx };
      }
    } catch { /* ignore */ }
    return null;
  }

  // ── Bingo ──
  async getBingoGame(roomId: string): Promise<BingoGame | null> {
    const game = readJson<BingoGame | null>(this.gk(roomId), null);
    return game && game.status !== 'reset' ? game : null;
  }

  async createBingoGame(roomId: string, mode: BingoMode, category: BingoCategory, tropes: BingoTrope[], seed: string, creatorUserId = 'user-1'): Promise<{ game: BingoGame; board: BingoBoard }> {
    const game: BingoGame = {
      id: uid(),
      roomId,
      mode,
      status: 'active',
      category,
      seed,
      completedLines: 0,
      createdAt: Date.now()
    };
    writeJson(this.gk(roomId), game);

    // Initial board: null userId for co-op; for competitive, board for the creator
    const board: BingoBoard = {
      id: uid(),
      gameId: game.id,
      roomId,
      userId: mode === 'cooperative' ? null : creatorUserId,
      tropes,
      marks: [12] // Center free space marked by default
    };

    const boards = readJson<Record<string, BingoBoard>>(this.bk(game.id), {});
    boards[board.userId ?? 'coop'] = board;
    writeJson(this.bk(game.id), boards);

    return { game, board };
  }

  async getBingoBoard(gameId: string, userId: string | null): Promise<BingoBoard | null> {
    const boards = readJson<Record<string, BingoBoard>>(this.bk(gameId), {});
    return boards[userId ?? 'coop'] ?? null;
  }

  async joinBingoBoard(gameId: string, roomId: string, userId: string, tropes: BingoTrope[]): Promise<BingoBoard> {
    const boards = readJson<Record<string, BingoBoard>>(this.bk(gameId), {});
    const existing = boards[userId];
    if (existing) return existing;

    const board: BingoBoard = {
      id: uid(),
      gameId,
      roomId,
      userId,
      tropes,
      marks: [12]
    };
    boards[userId] = board;
    writeJson(this.bk(gameId), boards);
    return board;
  }

  async markBingoSquare(gameId: string, boardId: string, index: number, userId: string): Promise<number[]> {
    const boards = readJson<Record<string, BingoBoard>>(this.bk(gameId), {});
    for (const [key, b] of Object.entries(boards)) {
      if (b.id === boardId) {
        if (b.userId && b.userId !== userId) {
          throw new Error('Cannot mark another participant’s competitive board');
        }
        if (!b.marks.includes(index)) {
          b.marks = [...b.marks, index].sort((x, y) => x - y);
          boards[key] = b;
          writeJson(this.bk(gameId), boards);
        }
        return b.marks;
      }
    }
    return [12];
  }

  async unmarkBingoSquare(gameId: string, boardId: string, index: number, userId: string): Promise<number[]> {
    if (index === 12) return [12]; // Free space cannot be unmarked
    const boards = readJson<Record<string, BingoBoard>>(this.bk(gameId), {});
    for (const [key, b] of Object.entries(boards)) {
      if (b.id === boardId) {
        if (b.userId && b.userId !== userId) {
          throw new Error('Cannot unmark another participant’s competitive board');
        }
        b.marks = b.marks.filter((m) => m !== index);
        boards[key] = b;
        writeJson(this.bk(gameId), boards);
        return b.marks;
      }
    }
    return [12];
  }

  async claimBingoWin(gameId: string, boardId: string, userId: string, nickname: string): Promise<BingoGame> {
    const boards = readJson<Record<string, BingoBoard>>(this.bk(gameId), {});
    const board = Object.values(boards).find((b) => b.id === boardId);
    if (!board) throw new Error('Board not found');

    const game = readJson<BingoGame | null>(this.gk(board.roomId), null);
    if (!game || game.status !== 'active') throw new Error('Game not active or already completed');

    if (game.mode === 'competitive' && board.userId && board.userId !== userId) {
      throw new Error('Cannot claim win on another player’s competitive board');
    }

    if (!checkBingoCompleted(board.marks)) {
      throw new Error('Board does not have a complete Bingo line');
    }

    const updatedGame: BingoGame = {
      ...game,
      status: 'completed',
      winnerId: userId,
      winnerNickname: nickname
    };
    writeJson(this.gk(board.roomId), updatedGame);

    // Update player scores
    const scores = await this.getLeaderboard(board.roomId);
    const existing = scores.find((s) => s.userId === userId);
    if (existing) {
      existing.score += 25;
      existing.bingosWon += 1;
    } else {
      scores.push({ userId, nickname, score: 25, predictionsWon: 0, bingosWon: 1 });
    }
    writeJson(this.lk(board.roomId), scores);

    return updatedGame;
  }

  async resetBingoGame(gameId: string, roomId: string): Promise<void> {
    const game = readJson<BingoGame | null>(this.gk(roomId), null);
    if (game && game.id === gameId) {
      writeJson(this.gk(roomId), { ...game, status: 'reset' });
    }
  }

  // ── Predictions ──
  async getPredictions(roomId: string): Promise<Prediction[]> {
    return readJson<Prediction[]>(this.pk(roomId), []);
  }

  async createPrediction(
    roomId: string,
    question: string,
    kind: PredictionKind,
    options: Array<{ id: string; text: string }>,
    deadlineAt?: number | null,
    episodeTimestamp?: number | null,
    isSpoiler?: boolean,
    pointsReward = 10
  ): Promise<Prediction> {
    if (kind !== 'choice' && kind !== 'text') {
      throw new Error('Invalid prediction kind (must be choice or text)');
    }
    if (typeof pointsReward !== 'number' || !Number.isInteger(pointsReward) || pointsReward < 1 || pointsReward > 100) {
      throw new Error('Points reward must be between 1 and 100');
    }
    if (!question || !question.trim()) {
      throw new Error('Question must not be empty');
    }
    if (kind === 'choice') {
      if (!Array.isArray(options) || options.length < 2) {
        throw new Error('Prediction must have at least 2 options');
      }
      if (options.length > 10) {
        throw new Error('Prediction cannot have more than 10 options');
      }
      const seenIds = new Set<string>();
      const seenTexts = new Set<string>();
      for (const opt of options) {
        if (!opt || typeof opt !== 'object') {
          throw new Error('Each option must be an object with non-empty id and text');
        }
        const id = typeof opt.id === 'string' ? opt.id.trim() : '';
        const text = typeof opt.text === 'string' ? opt.text.trim() : '';
        if (!id || !text) {
          throw new Error('Each option must have non-empty id and text');
        }
        if (seenIds.has(id.toLowerCase())) {
          throw new Error('Option IDs must be unique');
        }
        if (seenTexts.has(text.toLowerCase())) {
          throw new Error('Option text labels must be distinct');
        }
        seenIds.add(id.toLowerCase());
        seenTexts.add(text.toLowerCase());
      }
    }
    const preds = await this.getPredictions(roomId);
    const newPred: Prediction = {
      id: uid(),
      roomId,
      question: question.trim(),
      kind,
      options: kind === 'choice' ? options : [],
      status: 'open',
      deadlineAt: deadlineAt ?? null,
      episodeTimestamp: episodeTimestamp ?? null,
      isSpoiler: !!isSpoiler,
      pointsReward,
      createdBy: 'host',
      createdAt: Date.now()
    };
    writeJson(this.pk(roomId), [newPred, ...preds]);
    this.predRoomMap.set(newPred.id, roomId);
    return newPred;
  }

  async getPredictionAnswers(predictionId: string, currentUserId: string, isRevealed: boolean): Promise<PredictionAnswer[]> {
    const all = readJson<PredictionAnswer[]>(this.ak(predictionId), []);
    // Privacy guarantee: if not revealed, only return current user's answer (or mask text of others)
    if (isRevealed) return all;
    return all.map((a) => (a.userId === currentUserId ? a : { ...a, answer: '🔒 Submitted' }));
  }

  async submitAnswer(
    predictionId: string,
    roomId: string,
    userId: string,
    nickname: string,
    avatar: string,
    answer: string
  ): Promise<PredictionAnswer> {
    const preds = await this.getPredictions(roomId);
    const pred = preds.find((p) => p.id === predictionId);
    if (!pred || pred.status !== 'open') throw new Error('Prediction is locked or closed');
    if (pred.deadlineAt && pred.deadlineAt < Date.now()) throw new Error('Deadline has passed');

    const cleanAnswer = answer ? answer.trim() : '';
    if (!cleanAnswer) throw new Error('Answer must not be empty');

    if (pred.kind === 'choice') {
      const match = pred.options.some((o) => o.text === cleanAnswer || o.id === cleanAnswer);
      if (!match) {
        throw new Error(`Submitted answer "${cleanAnswer}" does not match any registered option`);
      }
    }

    const answers = readJson<PredictionAnswer[]>(this.ak(predictionId), []);
    const existingIndex = answers.findIndex((a) => a.userId === userId);
    if (existingIndex >= 0 && answers[existingIndex].locked) {
      throw new Error('Your answer has already been locked');
    }

    const newAnswer: PredictionAnswer = {
      id: existingIndex >= 0 ? answers[existingIndex].id : uid(),
      predictionId,
      roomId,
      userId,
      nickname,
      avatar,
      answer: cleanAnswer,
      locked: false,
      submittedAt: Date.now()
    };

    if (existingIndex >= 0) answers[existingIndex] = newAnswer;
    else answers.push(newAnswer);

    writeJson(this.ak(predictionId), answers);
    return newAnswer;
  }

  async lockPrediction(predictionId: string, actorUserId?: string): Promise<Prediction> {
    const loc = this.findPrediction(predictionId);
    if (!loc) throw new Error('Prediction not found');
    const { key, preds, idx } = loc;
    const pred = preds[idx];
    // DB-04: Only allowed from 'open' status
    if (pred.status !== 'open') {
      throw new Error(`Prediction can only be locked from open status (current: ${pred.status})`);
    }
    if (actorUserId && actorUserId !== 'host') {
      const room = readJson<Record<string, any>>('at_demo_rooms', {})[pred.roomId];
      if (room && room.hostId !== actorUserId) {
        throw new Error('Only the room host can lock this prediction');
      }
    }
    preds[idx] = { ...preds[idx], status: 'locked' };
    writeJson(key, preds);

    // Lock all answers
    const answers = readJson<PredictionAnswer[]>(this.ak(predictionId), []);
    writeJson(this.ak(predictionId), answers.map((a) => ({ ...a, locked: true })));
    return preds[idx];
  }

  async revealPrediction(predictionId: string, actorUserId?: string): Promise<Prediction> {
    const loc = this.findPrediction(predictionId);
    if (!loc) throw new Error('Prediction not found');
    const { key, preds, idx } = loc;
    const pred = preds[idx];
    // DB-04: Only allowed from 'locked' status
    if (pred.status !== 'locked') {
      throw new Error(`Prediction can only be revealed from locked status (current: ${pred.status})`);
    }
    if (actorUserId && actorUserId !== 'host') {
      const room = readJson<Record<string, any>>('at_demo_rooms', {})[pred.roomId];
      if (room && room.hostId !== actorUserId) {
        throw new Error('Only the room host can reveal answers');
      }
    }
    preds[idx] = { ...preds[idx], status: 'revealed' };
    writeJson(key, preds);
    return preds[idx];
  }

  async resolvePrediction(predictionId: string, winningOption: string, actorUserId?: string): Promise<Prediction> {
    const loc = this.findPrediction(predictionId);
    if (!loc) throw new Error('Prediction not found');
    const { key, preds, idx } = loc;
    const pred = preds[idx];
    // DB-04: Terminal state enforcement
    if (pred.status === 'resolved') {
      throw new Error('Prediction is already resolved');
    }
    if (pred.status === 'cancelled') {
      throw new Error('Prediction has been cancelled');
    }
    // DB-04: Only valid source states for resolution
    if (pred.status !== 'locked' && pred.status !== 'revealed') {
      throw new Error(`Prediction must be locked or revealed before resolution (current: ${pred.status})`);
    }
    if (actorUserId && actorUserId !== 'host') {
      const room = readJson<Record<string, any>>('at_demo_rooms', {})[pred.roomId];
      if (room && room.hostId !== actorUserId) {
        throw new Error('Only the room host can resolve this prediction');
      }
    }
    if (pred.kind === 'choice') {
      const exists = pred.options.some((o) => o.text.trim().toLowerCase() === winningOption.trim().toLowerCase());
      if (!exists) {
        throw new Error('Winning option does not match any registered prediction option');
      }
    }
    const updated: Prediction = {
      ...pred,
      status: 'resolved',
      winningOption: winningOption.trim(),
      resolvedAt: Date.now()
    };
    preds[idx] = updated;
    writeJson(key, preds);

    // Score correct answers
    const answers = readJson<PredictionAnswer[]>(this.ak(predictionId), []);
    const scores = await this.getLeaderboard(pred.roomId);

    for (const a of answers) {
      a.isCorrect = a.answer.trim().toLowerCase() === winningOption.trim().toLowerCase();
      if (a.isCorrect) {
        const sc = scores.find((s) => s.userId === a.userId);
        if (sc) {
          sc.score += pred.pointsReward;
          sc.predictionsWon += 1;
        } else {
          scores.push({
            userId: a.userId,
            nickname: a.nickname ?? 'Player',
            avatar: a.avatar,
            score: pred.pointsReward,
            predictionsWon: 1,
            bingosWon: 0
          });
        }
      }
    }
    writeJson(this.ak(predictionId), answers);
    writeJson(this.lk(pred.roomId), scores);
    return updated;
  }

  async getLeaderboard(roomId: string): Promise<PlayerScore[]> {
    return readJson<PlayerScore[]>(this.lk(roomId), []);
  }
}

// ── Live Supabase Store Implementation ──
class LiveGamesStore implements GamesStore {
  private sb = () => getSupabase();
  private check<T>(r: { data: T; error: { message: string } | null }): T {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }

  async getBingoGame(roomId: string): Promise<BingoGame | null> {
    const { data, error } = await this.sb()
      .from('bingo_games')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      roomId: data.room_id,
      mode: data.mode,
      status: data.status,
      category: data.category,
      seed: data.seed,
      winnerId: data.winner_id,
      createdAt: Date.parse(data.created_at)
    };
  }

  async createBingoGame(roomId: string, mode: BingoMode, category: BingoCategory, tropes: BingoTrope[], seed: string): Promise<{ game: BingoGame; board: BingoBoard }> {
    const res = this.check(
      await this.sb().rpc('create_bingo_game', {
        p_room: roomId,
        p_mode: mode,
        p_category: category,
        p_tropes: tropes,
        p_seed: seed
      })
    );
    const g = res.game;
    const b = res.board;
    return {
      game: { id: g.id, roomId: g.room_id, mode: g.mode, status: g.status, category: g.category, seed: g.seed, createdAt: Date.parse(g.created_at) },
      board: { id: b.id, gameId: b.game_id, roomId: b.room_id, userId: b.user_id, tropes: b.tropes, marks: [12] }
    };
  }

  async getBingoBoard(gameId: string, userId: string | null): Promise<BingoBoard | null> {
    let q = this.sb().from('bingo_boards').select('*, bingo_marks(index)').eq('game_id', gameId);
    if (userId) q = q.eq('user_id', userId);
    else q = q.is('user_id', null);
    const { data, error } = await q.maybeSingle();
    if (error || !data) return null;
    const marks: number[] = Array.from(new Set([12, ...(data.bingo_marks ?? []).map((m: any) => m.index)]));
    return { id: data.id, gameId: data.game_id, roomId: data.room_id, userId: data.user_id, tropes: data.tropes, marks };
  }

  async joinBingoBoard(gameId: string, _roomId: string, _userId: string, tropes: BingoTrope[]): Promise<BingoBoard> {
    const res = this.check(await this.sb().rpc('join_bingo_board', { p_game: gameId, p_tropes: tropes }));
    return { id: res.id, gameId: res.game_id, roomId: res.room_id, userId: res.user_id, tropes: res.tropes, marks: [12] };
  }

  async markBingoSquare(gameId: string, boardId: string, index: number, _userId: string): Promise<number[]> {
    this.check(await this.sb().rpc('mark_bingo_square', { p_game: gameId, p_board: boardId, p_index: index }));
    const { data } = await this.sb().from('bingo_marks').select('index').eq('board_id', boardId);
    return Array.from(new Set([12, ...(data ?? []).map((m: any) => m.index)]));
  }

  async unmarkBingoSquare(gameId: string, boardId: string, index: number, _userId: string): Promise<number[]> {
    this.check(await this.sb().rpc('unmark_bingo_square', { p_game: gameId, p_board: boardId, p_index: index }));
    const { data } = await this.sb().from('bingo_marks').select('index').eq('board_id', boardId);
    return Array.from(new Set([12, ...(data ?? []).map((m: any) => m.index)]));
  }

  async claimBingoWin(gameId: string, boardId: string, _userId: string, _nickname: string): Promise<BingoGame> {
    const res = this.check(await this.sb().rpc('claim_bingo_win', { p_game: gameId, p_board: boardId }));
    return { id: res.id, roomId: res.room_id, mode: res.mode, status: res.status, category: res.category, seed: res.seed, winnerId: res.winner_id, createdAt: Date.parse(res.created_at) };
  }

  async resetBingoGame(gameId: string, _roomId: string): Promise<void> {
    this.check(await this.sb().rpc('reset_bingo_game', { p_game: gameId }));
  }

  // ── Predictions Live ──
  async getPredictions(roomId: string): Promise<Prediction[]> {
    const rows = this.check(await this.sb().from('predictions').select('*').eq('room_id', roomId).order('created_at', { ascending: false }));
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      roomId: r.room_id,
      question: r.question,
      kind: r.kind,
      options: r.options ?? [],
      status: r.status,
      deadlineAt: r.deadline_at ? Date.parse(r.deadline_at) : null,
      episodeTimestamp: r.episode_timestamp ? Number(r.episode_timestamp) : null,
      isSpoiler: !!r.is_spoiler,
      winningOption: r.winning_option,
      pointsReward: r.points_reward,
      createdBy: r.created_by,
      createdAt: Date.parse(r.created_at),
      resolvedAt: r.resolved_at ? Date.parse(r.resolved_at) : null
    }));
  }

  async createPrediction(
    roomId: string,
    question: string,
    kind: PredictionKind,
    options: Array<{ id: string; text: string }>,
    deadlineAt?: number | null,
    episodeTimestamp?: number | null,
    isSpoiler = false,
    pointsReward = 10
  ): Promise<Prediction> {
    const res = this.check(
      await this.sb().rpc('create_prediction', {
        p_room: roomId,
        p_question: question,
        p_kind: kind,
        p_options: options,
        p_deadline: deadlineAt ? new Date(deadlineAt).toISOString() : null,
        p_timestamp: episodeTimestamp,
        p_spoiler: isSpoiler,
        p_points: pointsReward
      })
    );
    return {
      id: res.id,
      roomId: res.room_id,
      question: res.question,
      kind: res.kind,
      options: res.options,
      status: res.status,
      deadlineAt: res.deadline_at ? Date.parse(res.deadline_at) : null,
      episodeTimestamp: res.episode_timestamp ? Number(res.episode_timestamp) : null,
      isSpoiler: res.is_spoiler,
      pointsReward: res.points_reward,
      createdBy: res.created_by,
      createdAt: Date.parse(res.created_at)
    };
  }

  async getPredictionAnswers(predictionId: string, currentUserId: string, isRevealed: boolean): Promise<PredictionAnswer[]> {
    const rows = this.check(await this.sb().from('prediction_answers').select('*').eq('prediction_id', predictionId));
    return (rows ?? []).map((r: any) => {
      const showAnswer = isRevealed || r.user_id === currentUserId;
      return {
        id: r.id,
        predictionId: r.prediction_id,
        roomId: r.room_id,
        userId: r.user_id,
        answer: showAnswer ? r.answer : '🔒 Submitted',
        locked: r.locked,
        submittedAt: Date.parse(r.created_at)
      };
    });
  }

  async submitAnswer(
    predictionId: string,
    _roomId: string,
    _userId: string,
    _nickname: string,
    _avatar: string,
    answer: string
  ): Promise<PredictionAnswer> {
    const res = this.check(await this.sb().rpc('submit_prediction_answer', { p_prediction: predictionId, p_answer: answer }));
    return {
      id: res.id,
      predictionId: res.prediction_id,
      roomId: res.room_id,
      userId: res.user_id,
      answer: res.answer,
      locked: res.locked,
      submittedAt: Date.parse(res.created_at)
    };
  }

  async lockPrediction(predictionId: string, _actorUserId?: string): Promise<Prediction> {
    const res = this.check(await this.sb().rpc('lock_prediction', { p_prediction: predictionId }));
    return { id: res.id, roomId: res.room_id, question: res.question, kind: res.kind, options: res.options, status: res.status, isSpoiler: res.is_spoiler, pointsReward: res.points_reward, createdBy: res.created_by, createdAt: Date.parse(res.created_at) };
  }

  async revealPrediction(predictionId: string, _actorUserId?: string): Promise<Prediction> {
    const res = this.check(await this.sb().rpc('reveal_prediction', { p_prediction: predictionId }));
    return { id: res.id, roomId: res.room_id, question: res.question, kind: res.kind, options: res.options, status: res.status, isSpoiler: res.is_spoiler, pointsReward: res.points_reward, createdBy: res.created_by, createdAt: Date.parse(res.created_at) };
  }

  async resolvePrediction(predictionId: string, winningOption: string, _actorUserId?: string): Promise<Prediction> {
    const res = this.check(await this.sb().rpc('resolve_prediction', { p_prediction: predictionId, p_winning_option: winningOption }));
    return { id: res.id, roomId: res.room_id, question: res.question, kind: res.kind, options: res.options, status: res.status, winningOption: res.winning_option, isSpoiler: res.is_spoiler, pointsReward: res.points_reward, createdBy: res.created_by, createdAt: Date.parse(res.created_at), resolvedAt: Date.now() };
  }

  async getLeaderboard(roomId: string): Promise<PlayerScore[]> {
    const res = this.check(await this.sb().rpc('get_room_leaderboard', { p_room: roomId }));
    return (res ?? []).map((s: any) => ({
      userId: s.user_id,
      nickname: s.nickname || 'Player',
      score: s.score || 0,
      predictionsWon: s.predictions_won || 0,
      bingosWon: s.bingos_won || 0
    }));
  }
}

export const createGamesStore = (): GamesStore => (liveConfigured ? new LiveGamesStore() : new LocalGamesStore());
