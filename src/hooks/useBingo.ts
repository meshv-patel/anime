import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateBingoTropes } from '../lib/bingoTropes';
import type { BingoBoard, BingoCategory, BingoGame, BingoMode } from '../lib/types';
import { createGamesStore } from '../services/gamesStore';
import type { Session } from './useRoomSession';

// All 12 winning lines on a 5x5 Bingo board (5 rows, 5 columns, 2 diagonals)
export const BINGO_LINES: number[][] = [
  // Rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // Columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // Diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20]
];

export function checkBingoLines(markedIndices: number[]): { lines: number[][]; count: number; hasBingo: boolean } {
  const markSet = new Set([12, ...markedIndices]); // Free space (12) is always marked
  const completed = BINGO_LINES.filter((line) => line.every((idx) => markSet.has(idx)));
  return {
    lines: completed,
    count: completed.length,
    hasBingo: completed.length > 0
  };
}

export function useBingo(
  session: Session | null,
  roomId: string,
  userId: string,
  nickname: string,
  isHost: boolean
) {
  const store = useMemo(() => createGamesStore(), []);
  const [game, setGame] = useState<BingoGame | null>(null);
  const [board, setBoard] = useState<BingoBoard | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState('');
  const gameRef = useRef<BingoGame | null>(null);
  const boardRef = useRef<BingoBoard | null>(null);
  gameRef.current = game;
  boardRef.current = board;

  const marks = useMemo(() => board?.marks ?? [12], [board?.marks]);
  const detection = useMemo(() => checkBingoLines(marks), [marks]);

  const loadCurrentGame = useCallback(async () => {
    try {
      const activeGame = await store.getBingoGame(roomId);
      if (!activeGame) {
        setGame(null);
        setBoard(null);
        return;
      }
      setGame(activeGame);

      // In co-op, load null user_id; in competitive, load board for this user
      const targetUser = activeGame.mode === 'cooperative' ? null : userId;
      let activeBoard = await store.getBingoBoard(activeGame.id, targetUser);

      // In competitive mode, if participant hasn't generated a board yet, join/generate one
      if (!activeBoard && activeGame.mode === 'competitive') {
        const playerTropes = generateBingoTropes(activeGame.category, `${activeGame.seed}-${userId}`);
        activeBoard = await store.joinBingoBoard(activeGame.id, roomId, userId, playerTropes);
      }
      setBoard(activeBoard);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [store, roomId, userId]);

  // Initial load & transport event listeners
  useEffect(() => {
    if (!session) return;
    void loadCurrentGame();

    const off = session.transport.on('bingo', (payload: any) => {
      if (!payload || typeof payload.op !== 'string') return;
      const { op } = payload;

      if (op === 'new_game' || op === 'reset') {
        void loadCurrentGame();
      } else if (op === 'mark' || op === 'unmark') {
        const curBoard = boardRef.current;
        const curGame = gameRef.current;
        if (!curBoard || !curGame) return;

        // In co-op mode, all participants share the board
        // In competitive mode, only update if the mark applies to this client's board
        if (curGame.mode === 'cooperative' || curBoard.id === payload.boardId) {
          setBoard((prev) => {
            if (!prev) return null;
            const updated = op === 'mark'
              ? Array.from(new Set([...prev.marks, payload.index])).sort((a, b) => a - b)
              : prev.marks.filter((m) => m !== payload.index);
            return { ...prev, marks: updated };
          });
        }
      } else if (op === 'win') {
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 5000);
        void loadCurrentGame();
      }
    });

    return () => off();
  }, [session, loadCurrentGame]);

  const startNewGame = useCallback(
    async (mode: BingoMode = 'cooperative', category: BingoCategory = 'all') => {
      if (!session) return;
      try {
        setError('');
        const seed = Date.now().toString(36);
        const tropes = generateBingoTropes(category, seed);
        const { game: newGame, board: newBoard } = await store.createBingoGame(roomId, mode, category, tropes, seed, userId);

        setGame(newGame);
        setBoard(newBoard);
        session.transport.send('bingo', { op: 'new_game', gameId: newGame.id, mode, category, seed });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [session, store, roomId]
  );

  const toggleSquare = useCallback(
    async (index: number) => {
      const curBoard = boardRef.current;
      const curGame = gameRef.current;
      if (!session || !curBoard || !curGame || curGame.status !== 'active') return;
      if (index === 12) return; // Free space is permanently marked

      const isMarked = curBoard.marks.includes(index);
      try {
        setError('');
        let updatedMarks: number[];
        if (isMarked) {
          updatedMarks = await store.unmarkBingoSquare(curGame.id, curBoard.id, index, userId);
          setBoard((b) => (b ? { ...b, marks: updatedMarks } : null));
          session.transport.send('bingo', { op: 'unmark', gameId: curGame.id, boardId: curBoard.id, index, userId });
        } else {
          updatedMarks = await store.markBingoSquare(curGame.id, curBoard.id, index, userId);
          setBoard((b) => (b ? { ...b, marks: updatedMarks } : null));
          session.transport.send('bingo', { op: 'mark', gameId: curGame.id, boardId: curBoard.id, index, userId });

          // Check if this mark completes a winning line
          const check = checkBingoLines(updatedMarks);
          if (check.hasBingo && curGame.status === 'active') {
            const wonGame = await store.claimBingoWin(curGame.id, curBoard.id, userId, nickname);
            setGame(wonGame);
            setCelebrating(true);
            setTimeout(() => setCelebrating(false), 6000);
            session.transport.send('bingo', { op: 'win', gameId: curGame.id, winnerId: userId, winnerNickname: nickname });
          }
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [session, store, userId, nickname]
  );

  const resetGame = useCallback(async () => {
    const curGame = gameRef.current;
    if (!session || !curGame || !isHost) return;
    try {
      await store.resetBingoGame(curGame.id, roomId);
      setGame(null);
      setBoard(null);
      session.transport.send('bingo', { op: 'reset', gameId: curGame.id });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [session, store, roomId, isHost]);

  return {
    game,
    board,
    marks,
    linesCount: detection.count,
    hasBingo: detection.hasBingo,
    celebrating,
    error,
    startNewGame,
    toggleSquare,
    resetGame,
    refresh: loadCurrentGame
  };
}
