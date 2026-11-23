import { useState } from 'react';
import { Award, Dices, Trophy } from 'lucide-react';
import type { Session } from '../hooks/useRoomSession';
import { BingoPanel } from './BingoPanel';
import { PredictionPanel } from './PredictionPanel';

interface GamesPanelProps {
  session: Session | null;
  roomId: string;
  userId: string;
  nickname: string;
  avatar: string;
  isHost: boolean;
}

export function GamesPanel(props: GamesPanelProps) {
  const [activeTab, setActiveTab] = useState<'bingo' | 'predictions'>('bingo');

  return (
    <div className="flex h-full flex-col">
      {/* Sub-tab Navigation */}
      <div className="flex border-b border-white/10 bg-black/20 p-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('bingo')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
            activeTab === 'bingo' ? 'bg-lantern-400 text-ink-950 shadow-sm' : 'text-paper/70 hover:bg-white/5'
          }`}
        >
          <Dices size={15} /> Anime Bingo
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('predictions')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
            activeTab === 'predictions' ? 'bg-lantern-400 text-ink-950 shadow-sm' : 'text-paper/70 hover:bg-white/5'
          }`}
        >
          <Trophy size={15} /> Predictions
        </button>
      </div>

      {/* Tab Contents */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'bingo' ? (
          <BingoPanel
            session={props.session}
            roomId={props.roomId}
            userId={props.userId}
            nickname={props.nickname}
            isHost={props.isHost}
          />
        ) : (
          <PredictionPanel
            session={props.session}
            roomId={props.roomId}
            userId={props.userId}
            nickname={props.nickname}
            avatar={props.avatar}
            isHost={props.isHost}
          />
        )}
      </div>
    </div>
  );
}
