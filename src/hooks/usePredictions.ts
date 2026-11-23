import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerScore, Prediction, PredictionAnswer, PredictionKind } from '../lib/types';
import { createGamesStore } from '../services/gamesStore';
import type { Session } from './useRoomSession';

export function usePredictions(
  session: Session | null,
  roomId: string,
  userId: string,
  nickname: string,
  avatar: string,
  isHost: boolean
) {
  const store = useMemo(() => createGamesStore(), []);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, PredictionAnswer[]>>({});
  const [leaderboard, setLeaderboard] = useState<PlayerScore[]>([]);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState('');
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadData = useCallback(async () => {
    try {
      const preds = await store.getPredictions(roomId);
      setPredictions(preds);

      const targetId = activeIdRef.current ?? preds[0]?.id ?? null;
      if (targetId) {
        const cur = preds.find((p) => p.id === targetId);
        const isRevealed = cur?.status === 'revealed' || cur?.status === 'resolved';
        const ansList = await store.getPredictionAnswers(targetId, userId, isRevealed);
        setAnswers((prev) => ({ ...prev, [targetId]: ansList }));
      }

      const scores = await store.getLeaderboard(roomId);
      setLeaderboard(scores);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [store, roomId, userId]);

  const loadAnswersFor = useCallback(
    async (predId: string, status: string) => {
      try {
        const isRevealed = status === 'revealed' || status === 'resolved';
        const ansList = await store.getPredictionAnswers(predId, userId, isRevealed);
        setAnswers((prev) => ({ ...prev, [predId]: ansList }));
      } catch (e) {
        console.warn('[predictions] Could not load answers', e);
      }
    },
    [store, userId]
  );

  // Initial load & realtime broadcast handling
  useEffect(() => {
    if (!session) return;
    void loadData();

    const off = session.transport.on('pred', (payload: any) => {
      if (!payload || typeof payload.op !== 'string') return;
      void loadData();

      if (payload.op === 'resolve') {
        const myWin = payload.winnerUserIds && Array.isArray(payload.winnerUserIds) && payload.winnerUserIds.includes(userId);
        if (myWin) {
          setCelebrating(true);
          setTimeout(() => setCelebrating(false), 5000);
        }
      }
    });

    return () => off();
  }, [session, loadData, userId]);

  const activePrediction = useMemo(
    () => predictions.find((p) => p.id === activeId) ?? predictions[0] ?? null,
    [predictions, activeId]
  );

  const activeAnswers = useMemo(
    () => (activePrediction ? answers[activePrediction.id] ?? [] : []),
    [answers, activePrediction]
  );

  const myAnswer = useMemo(
    () => activeAnswers.find((a) => a.userId === userId)?.answer ?? '',
    [activeAnswers, userId]
  );

  const createPrediction = useCallback(
    async (
      question: string,
      kind: PredictionKind,
      options: string[],
      deadlineAt?: number | null,
      episodeTimestamp?: number | null,
      isSpoiler = false,
      pointsReward = 10
    ) => {
      if (!session) return;
      try {
        setError('');
        const opts = options.map((t, i) => ({ id: `opt-${i + 1}`, text: t.trim() }));
        const created = await store.createPrediction(
          roomId,
          question,
          kind,
          opts,
          deadlineAt,
          episodeTimestamp,
          isSpoiler,
          pointsReward
        );
        setActiveId(created.id);
        session.transport.send('pred', { op: 'create', predictionId: created.id });
        await loadData();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [session, store, roomId, loadData]
  );

  const submitAnswer = useCallback(
    async (predictionId: string, answer: string) => {
      if (!session || !answer.trim()) return;
      try {
        setError('');
        const submitted = await store.submitAnswer(
          predictionId,
          roomId,
          userId,
          nickname,
          avatar,
          answer
        );
        setAnswers((prev) => {
          const list = prev[predictionId] ?? [];
          const idx = list.findIndex((a) => a.userId === userId);
          const updated = [...list];
          if (idx >= 0) updated[idx] = submitted;
          else updated.push(submitted);
          return { ...prev, [predictionId]: updated };
        });
        session.transport.send('pred', { op: 'submit', predictionId, userId });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [session, store, roomId, userId, nickname, avatar]
  );

  const lockPrediction = useCallback(
    async (predictionId: string) => {
      if (!session) return;
      try {
        setError('');
        const locked = await store.lockPrediction(predictionId);
        setPredictions((list) => list.map((p) => (p.id === predictionId ? locked : p)));
        session.transport.send('pred', { op: 'lock', predictionId });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [session, store]
  );

  const revealPrediction = useCallback(
    async (predictionId: string) => {
      if (!session) return;
      try {
        setError('');
        const revealed = await store.revealPrediction(predictionId);
        setPredictions((list) => list.map((p) => (p.id === predictionId ? revealed : p)));
        await loadAnswersFor(predictionId, 'revealed');
        session.transport.send('pred', { op: 'reveal', predictionId });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [session, store, loadAnswersFor]
  );

  const resolvePrediction = useCallback(
    async (predictionId: string, winningOption: string) => {
      if (!session) return;
      try {
        setError('');
        const resolved = await store.resolvePrediction(predictionId, winningOption);
        setPredictions((list) => list.map((p) => (p.id === predictionId ? resolved : p)));
        await loadData();

        // Calculate winners for celebration broadcast
        const ansList = answers[predictionId] ?? [];
        const winnerIds = ansList
          .filter((a) => a.answer.trim().toLowerCase() === winningOption.trim().toLowerCase())
          .map((a) => a.userId);

        session.transport.send('pred', { op: 'resolve', predictionId, winningOption, winnerUserIds: winnerIds });
        if (winnerIds.includes(userId)) {
          setCelebrating(true);
          setTimeout(() => setCelebrating(false), 5000);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [session, store, answers, loadData, userId]
  );

  return {
    predictions,
    activePrediction,
    activeAnswers,
    myAnswer,
    leaderboard,
    celebrating,
    error,
    activeId,
    setActiveId: (id: string) => {
      setActiveId(id);
      const p = predictions.find((x) => x.id === id);
      if (p) void loadAnswersFor(id, p.status);
    },
    createPrediction,
    submitAnswer,
    lockPrediction,
    revealPrediction,
    resolvePrediction,
    refresh: loadData
  };
}
