import { useState } from 'react';
import { Check, Eye, HelpCircle, Lock, Plus, Sparkles, Trophy } from 'lucide-react';
import type { Prediction, PredictionKind } from '../lib/types';
import { usePredictions } from '../hooks/usePredictions';
import type { Session } from '../hooks/useRoomSession';
import { Avatar } from './Avatar';

interface PredictionPanelProps {
  session: Session | null;
  roomId: string;
  userId: string;
  nickname: string;
  avatar: string;
  isHost: boolean;
}

export function PredictionPanel({
  session,
  roomId,
  userId,
  nickname,
  avatar,
  isHost
}: PredictionPanelProps) {
  const {
    predictions,
    activePrediction,
    activeAnswers,
    myAnswer,
    leaderboard,
    celebrating,
    error,
    activeId,
    setActiveId,
    createPrediction,
    submitAnswer,
    lockPrediction,
    revealPrediction,
    resolvePrediction
  } = usePredictions(session, roomId, userId, nickname, avatar, isHost);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [kind, setKind] = useState<PredictionKind>('choice');
  const [options, setOptions] = useState<string[]>(['Yes', 'No']);
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [pointsReward, setPointsReward] = useState(10);
  const [selectedAnswer, setSelectedAnswer] = useState('');

  const handleCreate = async () => {
    if (!question.trim()) return;
    const cleanOpts = kind === 'choice' ? options.filter((o) => o.trim()) : [];
    if (kind === 'choice' && cleanOpts.length < 2) return;
    await createPrediction(question, kind, cleanOpts, null, null, isSpoiler, pointsReward);
    setQuestion('');
    setShowForm(false);
  };

  const addOption = () => {
    if (options.length < 5) setOptions([...options, `Option ${options.length + 1}`]);
  };

  const updateOption = (idx: number, val: string) => {
    const list = [...options];
    list[idx] = val;
    setOptions(list);
  };

  return (
    <div className="space-y-4 p-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <h3 className="font-display text-base font-bold text-lantern-300 flex items-center gap-2">
            <Trophy size={18} className="text-lantern-400" /> Episode Predictions
          </h3>
          <p className="text-xs text-paper/60">Predict what happens next and climb the room leaderboard!</p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
            showForm ? 'bg-sakura-400 text-ink-950' : 'bg-white/10 hover:bg-white/15'
          }`}
        >
          <Plus size={14} /> New
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-sakura-500/20 px-3 py-2 text-xs text-sakura-200">{error}</p>}

      {celebrating && (
        <div className="animate-bounce rounded-2xl bg-gradient-to-r from-lantern-400 via-amber-300 to-sakura-400 p-3 text-center font-display font-extrabold text-ink-950 shadow-lg">
          🎉 CORRECT PREDICTION! POINTS AWARDED! 🎉
        </div>
      )}

      {/* Creation Form */}
      {showForm && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/80 p-4">
          <h4 className="font-bold text-xs text-paper/80 uppercase tracking-wider">Create New Prediction</h4>
          <input
            className="field py-2 text-xs"
            placeholder="e.g. Will Tanjiro land the final strike this episode?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('choice')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                kind === 'choice' ? 'bg-lantern-400 text-ink-950' : 'bg-white/10'
              }`}
            >
              Multiple Choice
            </button>
            <button
              type="button"
              onClick={() => setKind('text')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                kind === 'text' ? 'bg-lantern-400 text-ink-950' : 'bg-white/10'
              }`}
            >
              Custom Text
            </button>
          </div>

          {kind === 'choice' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-paper/70">Options</label>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="field py-1.5 text-xs"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                      className="text-paper/40 hover:text-sakura-300"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {options.length < 5 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="text-xs text-lantern-300 hover:underline"
                >
                  + Add another option
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isSpoiler}
                onChange={(e) => setIsSpoiler(e.target.checked)}
                className="h-4 w-4"
              />
              <span>Spoiler question</span>
            </label>

            <div className="flex items-center gap-2 text-xs">
              <span>Reward:</span>
              <select
                value={pointsReward}
                onChange={(e) => setPointsReward(Number(e.target.value))}
                className="rounded-lg bg-ink-950 px-2 py-1"
              >
                <option value={10}>10 pts</option>
                <option value={20}>20 pts</option>
                <option value={50}>50 pts</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => void handleCreate()}
              disabled={!question.trim()}
              className="btn-lantern flex-1 py-2 text-xs font-bold"
            >
              Post Prediction
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="btn-ghost py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Prediction Card */}
      {activePrediction ? (
        <div className="space-y-3 rounded-2xl bg-white/5 p-4">
          {/* Prediction Selector Tabs */}
          {predictions.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {predictions.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0 ${
                    (activeId ?? predictions[0]?.id) === p.id
                      ? 'bg-lantern-400 text-ink-950'
                      : 'bg-white/10 text-paper/70 hover:bg-white/15'
                  }`}
                >
                  #{idx + 1} {p.status.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Question Banner */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                activePrediction.status === 'open'
                  ? 'bg-emerald-400/20 text-emerald-300'
                  : activePrediction.status === 'locked'
                  ? 'bg-amber-400/20 text-amber-300'
                  : activePrediction.status === 'revealed'
                  ? 'bg-cyan-400/20 text-cyan-300'
                  : 'bg-sakura-400/20 text-sakura-300'
              }`}>
                ● {activePrediction.status}
              </span>
              <span className="text-xs text-lantern-300 font-bold">+{activePrediction.pointsReward} pts</span>
            </div>
            <p className="font-display text-sm font-bold text-paper">{activePrediction.question}</p>
          </div>

          {/* Voting / Submission Section */}
          {activePrediction.status === 'open' && (
            <div className="space-y-2 pt-2">
              {activePrediction.kind === 'choice' ? (
                <div className="grid gap-2">
                  {activePrediction.options.map((opt) => {
                    const isSelected = myAnswer === opt.text || selectedAnswer === opt.text;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelectedAnswer(opt.text);
                          void submitAnswer(activePrediction.id, opt.text);
                        }}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${
                          isSelected
                            ? 'bg-lantern-400 text-ink-950 ring-2 ring-lantern-300'
                            : 'bg-white/10 text-paper/80 hover:bg-white/15'
                        }`}
                      >
                        <span>{opt.text}</span>
                        {isSelected && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="field py-2 text-xs"
                    placeholder="Enter your prediction…"
                    value={selectedAnswer || myAnswer}
                    onChange={(e) => setSelectedAnswer(e.target.value)}
                  />
                  <button
                    onClick={() => void submitAnswer(activePrediction.id, selectedAnswer)}
                    className="btn-lantern !px-4 text-xs font-bold"
                  >
                    Lock in
                  </button>
                </div>
              )}

              {myAnswer && (
                <p className="text-xs text-emerald-300 flex items-center gap-1">
                  <Check size={13} /> Your prediction is recorded. You may change it until submissions lock.
                </p>
              )}
            </div>
          )}

          {/* Locked State Warning */}
          {activePrediction.status === 'locked' && (
            <div className="rounded-xl bg-amber-400/10 p-3 text-xs text-amber-200">
              <p className="font-bold flex items-center gap-1.5"><Lock size={13} /> Submissions are locked!</p>
              <p className="mt-0.5 text-paper/70">
                Your prediction: <span className="font-bold text-lantern-300">{myAnswer || 'None submitted'}</span>.
                Waiting for the host to reveal all answers.
              </p>
            </div>
          )}

          {/* Revealed / Resolved Answers List */}
          {(activePrediction.status === 'revealed' || activePrediction.status === 'resolved') && (
            <div className="space-y-2 pt-2">
              <h5 className="text-xs font-bold text-paper/70 uppercase">Submissions ({activeAnswers.length})</h5>
              <ul className="space-y-1.5">
                {activeAnswers.map((ans) => {
                  const isWinner =
                    activePrediction.status === 'resolved' &&
                    ans.answer.trim().toLowerCase() === activePrediction.winningOption?.trim().toLowerCase();

                  return (
                    <li
                      key={ans.id}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs ${
                        isWinner
                          ? 'bg-emerald-400/25 ring-1 ring-emerald-300 text-emerald-200 font-bold'
                          : 'bg-white/5 text-paper/80'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar value={ans.avatar ?? ''} size={22} />
                        <span>{ans.nickname ?? 'Player'}</span>
                      </div>
                      <span className="font-bold">{ans.answer}</span>
                    </li>
                  );
                })}
              </ul>

              {activePrediction.winningOption && (
                <div className="rounded-xl bg-sakura-500/20 p-2 text-center text-xs text-sakura-200">
                  Winning Outcome: <strong className="text-lantern-300">{activePrediction.winningOption}</strong>
                </div>
              )}
            </div>
          )}

          {/* Host Admin Controls */}
          {isHost && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
              {activePrediction.status === 'open' && (
                <button
                  onClick={() => void lockPrediction(activePrediction.id)}
                  className="btn-ghost py-1.5 text-xs text-amber-300 flex items-center gap-1"
                >
                  <Lock size={13} /> Lock Submissions
                </button>
              )}
              {activePrediction.status === 'locked' && (
                <button
                  onClick={() => void revealPrediction(activePrediction.id)}
                  className="btn-ghost py-1.5 text-xs text-cyan-300 flex items-center gap-1"
                >
                  <Eye size={13} /> Reveal Answers
                </button>
              )}
              {activePrediction.status === 'revealed' && activePrediction.options.length > 0 && (
                <div className="w-full space-y-1.5 pt-1">
                  <p className="text-xs font-bold text-paper/70">Declare Winning Outcome:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activePrediction.options.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => void resolvePrediction(activePrediction.id, opt.text)}
                        className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-400/30"
                      >
                        ✓ {opt.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="py-6 text-center text-paper/50 text-xs">
          <HelpCircle size={24} className="mx-auto mb-2 opacity-40" />
          No predictions active yet. Click "+ New" above to post the first prediction!
        </div>
      )}

      {/* Room Scoreboard / Leaderboard */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="font-display text-xs font-bold text-paper/80 uppercase tracking-wider flex items-center gap-1.5">
          <Trophy size={14} className="text-lantern-400" /> Room Scoreboard
        </h4>

        {leaderboard.length === 0 ? (
          <p className="text-xs text-paper/50">No scores recorded yet. Win predictions or complete bingos to earn points!</p>
        ) : (
          <ul className="space-y-1.5">
            {leaderboard.map((sc, i) => (
              <li
                key={sc.userId}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lantern-300 w-4">{i + 1}.</span>
                  <Avatar value={sc.avatar ?? ''} size={20} />
                  <span className="font-bold">{sc.nickname}</span>
                </div>
                <div className="flex items-center gap-3 text-paper/70">
                  <span title="Predictions won">🎯 {sc.predictionsWon}</span>
                  <span title="Bingos won">🌸 {sc.bingosWon}</span>
                  <span className="font-extrabold text-lantern-300">{sc.score} pts</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
