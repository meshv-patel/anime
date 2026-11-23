-- Migration: 20261121_create_ema_cards.sql
-- Description: Phase 3C — Ema Wish Board (絵馬)
-- Creates the ema_cards table with RLS policies, check constraints, trigger, and indexes.

-- 1. Create table for Ema wooden plaques
create table if not exists public.ema_cards (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 280),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_nickname text not null check (char_length(trim(author_nickname)) between 1 and 24),
  theme text not null default 'hinoki' check (theme in ('hinoki', 'sakura', 'matsu', 'kuro')),
  category text not null default 'wish' check (category in ('wish', 'dream', 'gratitude', 'message')),
  created_at timestamptz not null default now()
);

-- 2. Index for room lookup ordered by newest first
create index if not exists idx_ema_cards_room_created on public.ema_cards (room_id, created_at desc);

-- 3. Enable Row Level Security (RLS)
alter table public.ema_cards enable row level security;

-- 4. Server-side Author Identity Integrity Trigger
-- Derives the authoritative author nickname from room_members and guarantees author_id matches auth.uid()
create or replace function public.set_ema_author_info() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m_nick text;
begin
  new.author_id := auth.uid();
  select m.nickname into m_nick
  from public.room_members m
  join public.rooms r on r.id = m.room_id
  where m.room_id = new.room_id and m.user_id = auth.uid() and r.expires_at > now();

  if m_nick is not null then
    new.author_nickname := m_nick;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_ema_author_info on public.ema_cards;
create trigger trg_set_ema_author_info
  before insert on public.ema_cards
  for each row
  execute function public.set_ema_author_info();

-- 5. RLS Policies
-- SELECT: Only active members of the room can read its Ema plaques
drop policy if exists ema_select on public.ema_cards;
create policy ema_select on public.ema_cards
  for select to authenticated
  using (public.is_member(room_id));

-- INSERT: Only active authenticated room members can insert, author_id must match auth.uid()
drop policy if exists ema_insert on public.ema_cards;
create policy ema_insert on public.ema_cards
  for insert to authenticated
  with check (
    public.is_member(room_id)
    and author_id = auth.uid()
    and char_length(trim(message)) between 1 and 280
  );

-- DELETE: Only the plaque author can delete their own Ema
drop policy if exists ema_delete on public.ema_cards;
create policy ema_delete on public.ema_cards
  for delete to authenticated
  using (
    public.is_member(room_id)
    and author_id = auth.uid()
  );

-- 6. Permissions
grant select, insert, delete on public.ema_cards to authenticated;
