import { EyeOff, Lightbulb, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../lib/types';
import { Avatar } from './Avatar';

const PROMPTS = [
  'Who is your favourite character so far, and why?', 'What do you think will happen next? (No spoilers if you have read ahead!)',
  'Rate this episode so far out of 10.', 'Which scene made you laugh the most?', 'Best opening or ending song you have heard this season?', 'Would you recommend this to a friend yet?'
];

function Bubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const [shown, setShown] = useState(false);
  if (m.kind === 'system') return <p className="my-1 text-center text-xs text-paper/50">{m.text}</p>;
  const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      <Avatar value={m.avatar} size={32} />
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.kind === 'prompt' ? 'border border-wisteria-400/40 bg-wisteria-400/15' : mine ? 'bg-lantern-400/20' : 'bg-white/10'}`}>
        <p className="text-xs"><span className="font-bold text-lantern-300">{mine ? 'You' : m.nickname}</span><span className="ml-2 text-paper/40">{time}</span></p>
        {m.kind === 'prompt' && <p className="text-[11px] font-bold text-wisteria-300">Discussion prompt</p>}
        {m.spoiler && !shown
          ? <button className="mt-1 flex items-center gap-1.5 rounded-lg bg-black/40 px-2 py-1 text-xs font-bold" onClick={() => setShown(true)}><EyeOff size={14} /> Spoiler. Click to reveal</button>
          : <p className="break-words text-sm">{m.text}</p>}
      </div>
    </div>
  );
}

interface Props { messages: ChatMessage[]; myClientId: string; typingNames: string[]; onSend(text: string, spoiler: boolean, kind?: 'chat' | 'prompt'): boolean; onTyping(): void; disabled: boolean }

export function Chat({ messages, myClientId, typingNames, onSend, onTyping, disabled }: Props) {
  const [text, setText] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [prompts, setPrompts] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);
  const submit = () => { if (onSend(text, spoiler)) { setText(''); setSpoiler(false); } };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && <p className="mt-8 text-center text-sm text-paper/50">It is quiet in here. Say hello 👋 (Thank you for watching together · ありがとう)</p>}
        {messages.map((m) => <Bubble key={m.id} m={m} mine={m.clientId === myClientId} />)}
        <div ref={end} />
      </div>
      <p className="h-5 px-4 text-xs text-paper/50" aria-live="polite">{typingNames.length ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…` : ''}</p>
      {prompts && (
        <ul className="mx-3 mb-2 max-h-36 overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 p-1">
          {PROMPTS.map((p) => <li key={p}><button className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10" onClick={() => { onSend(p, false, 'prompt'); setPrompts(false); }}>{p}</button></li>)}
        </ul>
      )}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <input className="field py-2.5" value={text} maxLength={500} disabled={disabled} placeholder={disabled ? 'Reconnecting…' : spoiler ? 'Spoiler message…' : 'Message'} aria-label="Message"
            onChange={(e) => { setText(e.target.value); onTyping(); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <button className="icon-btn bg-lantern-400 text-ink-950 hover:bg-lantern-300" onClick={submit} disabled={disabled || !text.trim()} aria-label="Send message"><Send size={16} /></button>
        </div>
        <div className="mt-2 flex gap-2">
          <button aria-pressed={spoiler} onClick={() => setSpoiler(!spoiler)} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${spoiler ? 'bg-sakura-400 text-ink-950' : 'bg-white/10'}`}><EyeOff size={13} /> Spoiler</button>
          <button aria-expanded={prompts} onClick={() => setPrompts(!prompts)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold"><Lightbulb size={13} /> Prompts</button>
        </div>
      </div>
    </div>
  );
}
