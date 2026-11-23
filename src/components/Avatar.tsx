import { parseAvatar } from '../lib/avatar';

export function Avatar({ value, size = 36, title }: { value: string; size?: number; title?: string }) {
  const { emoji, color } = parseAvatar(value);
  return (
    <span title={title} aria-label={title} className="inline-grid shrink-0 select-none place-items-center rounded-full"
      style={{ width: size, height: size, fontSize: size * 0.52, background: `${color}30`, boxShadow: `inset 0 0 0 2px ${color}aa` }}>
      {emoji}
    </span>
  );
}
