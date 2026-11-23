import { REACTIONS } from '../lib/types';

export function ReactionBar({ onReact, disabled }: { onReact(e: string): void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Reactions">
      {REACTIONS.map((e) => (
        <button key={e} disabled={disabled} onClick={() => onReact(e)} aria-label={`React ${e}`}
          className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5 text-2xl transition hover:-translate-y-0.5 hover:bg-white/15 active:scale-90 disabled:opacity-40">{e}</button>
      ))}
    </div>
  );
}
