-- Anime Together — Supabase schema, RLS, RPCs, and Security Hardening.
-- Run once in the Supabase SQL editor. Then enable: Authentication → Providers → "Anonymous sign-ins".

create extension if not exists pgcrypto;

-- ───────────── Tables ─────────────
create table if not exists public.rooms (
  id text primary key check (id ~ '^[a-z2-7]{20}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  max_participants int not null default 6 check (max_participants between 2 and 12),
  host_only boolean not null default false,
  host_token_hash text default null,
  current_source jsonb default null,
  playback_state jsonb default null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

-- Ensure columns exist if migrating from earlier schema
alter table public.rooms add column if not exists host_only boolean not null default false;
alter table public.rooms add column if not exists host_token_hash text default null;
alter table public.rooms add column if not exists host_pubkey text default null;
alter table public.rooms add column if not exists host_epoch int not null default 1;
alter table public.rooms add column if not exists host_seq int not null default 0;
alter table public.rooms add column if not exists current_source jsonb default null;
alter table public.rooms add column if not exists playback_state jsonb default null;

create table if not exists public.room_members (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'planned' check (status in ('planned','watching','done')),
  progress int not null default 0 check (progress between 0 and 9999),
  added_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.saved_moments (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 200),
  position_seconds numeric not null check (position_seconds >= 0),
  source_title text not null default '' check (char_length(source_title) <= 160),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ───────────── Anime Bingo Tables ─────────────
create table if not exists public.bingo_games (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  mode text not null check (mode in ('cooperative', 'competitive')),
  status text not null default 'active' check (status in ('active', 'completed', 'reset')),
  category text not null default 'general',
  seed text not null default '',
  winner_id uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.bingo_boards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.bingo_games(id) on delete cascade,
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid references auth.users(id), -- null for cooperative board, non-null for competitive
  tropes jsonb not null, -- array of 25 trope items
  created_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create table if not exists public.bingo_marks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.bingo_games(id) on delete cascade,
  board_id uuid not null references public.bingo_boards(id) on delete cascade,
  index int not null check (index between 0 and 24),
  marked_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (board_id, index)
);

-- ───────────── Episode Predictions Tables ─────────────
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  question text not null check (char_length(question) between 3 and 200),
  kind text not null default 'choice' check (kind in ('choice', 'text')),
  options jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'locked', 'revealed', 'resolved', 'cancelled')),
  deadline_at timestamptz,
  episode_timestamp numeric,
  is_spoiler boolean not null default false,
  winning_option text,
  points_reward int not null default 10 check (points_reward between 1 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.prediction_answers (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 200),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prediction_id, user_id)
);

create table if not exists public.player_scores (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null default 0 check (score >= 0),
  predictions_won int not null default 0 check (predictions_won >= 0),
  bingos_won int not null default 0 check (bingos_won >= 0),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.prediction_payouts (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  points int not null check (points between 1 and 100),
  created_at timestamptz not null default now(),
  constraint uq_prediction_payout unique (prediction_id, user_id)
);

-- ───────────── Helpers ─────────────
create or replace function public.is_member(rid text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.room_members m join public.rooms r on r.id = m.room_id
    where m.room_id = rid and m.user_id = auth.uid() and r.expires_at > now()
  );
$$;

create or replace function public.is_host(rid text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.rooms r
    where r.id = rid and r.host_id = auth.uid() and r.expires_at > now()
  );
$$;

-- ───────────── RLS ─────────────
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.saved_moments enable row level security;
alter table public.bingo_games enable row level security;
alter table public.bingo_boards enable row level security;
alter table public.bingo_marks enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_answers enable row level security;
alter table public.player_scores enable row level security;
alter table public.prediction_payouts enable row level security;

-- Rooms / Members: read-only for members. All writes go through RPCs.
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated using (public.is_member(id));
drop policy if exists members_select on public.room_members;
create policy members_select on public.room_members for select to authenticated using (public.is_member(room_id));

-- Watchlist
drop policy if exists wl_select on public.watchlist_items;
drop policy if exists wl_insert on public.watchlist_items;
drop policy if exists wl_update on public.watchlist_items;
drop policy if exists wl_delete on public.watchlist_items;
create policy wl_select on public.watchlist_items for select to authenticated using (public.is_member(room_id));
create policy wl_insert on public.watchlist_items for insert to authenticated with check (public.is_member(room_id) and added_by = auth.uid());
create policy wl_update on public.watchlist_items for update to authenticated using (public.is_member(room_id)) with check (public.is_member(room_id));
create policy wl_delete on public.watchlist_items for delete to authenticated using (public.is_member(room_id));

-- Moments
drop policy if exists mom_select on public.saved_moments;
drop policy if exists mom_insert on public.saved_moments;
drop policy if exists mom_delete on public.saved_moments;
create policy mom_select on public.saved_moments for select to authenticated using (public.is_member(room_id));
create policy mom_insert on public.saved_moments for insert to authenticated with check (public.is_member(room_id) and created_by = auth.uid());
create policy mom_delete on public.saved_moments for delete to authenticated using (public.is_member(room_id) and created_by = auth.uid());

-- Bingo RLS
drop policy if exists bg_select on public.bingo_games;
create policy bg_select on public.bingo_games for select to authenticated using (public.is_member(room_id));

drop policy if exists bb_select on public.bingo_boards;
create policy bb_select on public.bingo_boards for select to authenticated using (public.is_member(room_id));

drop policy if exists bm_select on public.bingo_marks;
create policy bm_select on public.bingo_marks for select to authenticated using (
  exists (select 1 from public.bingo_boards b where b.id = board_id and public.is_member(b.room_id))
);

-- Predictions RLS
drop policy if exists pred_select on public.predictions;
create policy pred_select on public.predictions for select to authenticated using (public.is_member(room_id));

-- Prediction Answers RLS (Privacy enforced: other users CANNOT read until revealed or resolved!)
drop policy if exists pred_ans_select on public.prediction_answers;
create policy pred_ans_select on public.prediction_answers for select to authenticated using (
  public.is_member(room_id) and (
    user_id = auth.uid() or
    exists (
      select 1 from public.predictions p
      where p.id = prediction_id and p.status in ('revealed', 'resolved')
    )
  )
);

-- Player Scores RLS
drop policy if exists ps_select on public.player_scores;
create policy ps_select on public.player_scores for select to authenticated using (public.is_member(room_id));

-- Prediction Payouts RLS
drop policy if exists pp_select on public.prediction_payouts;
create policy pp_select on public.prediction_payouts for select to authenticated using (public.is_member(room_id));
grant select on public.prediction_payouts to authenticated;

-- ───────────── Realtime Authorization (private channels) ─────────────
grant usage on schema realtime to authenticated;

drop policy if exists "room members receive" on realtime.messages;
drop policy if exists "room members send" on realtime.messages;

create policy "room members receive" on realtime.messages for select to authenticated using (
  realtime.topic() like 'room:%' and (
    public.is_member(split_part(realtime.topic(), ':', 2))
    or exists (
      select 1 from public.room_members m
      where m.room_id = split_part(realtime.topic(), ':', 2)
        and m.user_id = auth.uid()
    )
  )
);

create policy "room members send" on realtime.messages for insert to authenticated with check (
  realtime.topic() like 'room:%' and (
    public.is_member(split_part(realtime.topic(), ':', 2))
    or exists (
      select 1 from public.room_members m
      where m.room_id = split_part(realtime.topic(), ':', 2)
        and m.user_id = auth.uid()
    )
  )
);

-- ───────────── Safe Room Projection ─────────────
-- DB-03: Return projected safe fields only (never expose host_token_hash or internal auth material)
create or replace function public.safe_room_json(r public.rooms) returns jsonb
language sql immutable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', r.id,
    'host_id', r.host_id,
    'max_participants', r.max_participants,
    'host_only', r.host_only,
    'host_pubkey', r.host_pubkey,
    'host_epoch', r.host_epoch,
    'host_seq', r.host_seq,
    'current_source', r.current_source,
    'playback_state', r.playback_state,
    'created_at', r.created_at,
    'expires_at', r.expires_at
  );
$$;

-- ───────────── RPCs (security definer) ─────────────
create or replace function public.create_room(p_nickname text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare rid text; r public.rooms;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  loop
    select string_agg(substr('abcdefghijklmnopqrstuvwxyz234567', 1 + (get_byte(extensions.gen_random_bytes(1), 0) & 31), 1), '')
      into rid from generate_series(1, 20);
    exit when not exists (select 1 from public.rooms where id = rid);
  end loop;
  insert into public.rooms (id, host_id) values (rid, auth.uid()) returning * into r;
  insert into public.room_members (room_id, user_id, nickname) values (rid, auth.uid(), left(coalesce(nullif(trim(p_nickname), ''), 'Guest'), 24));
  return public.safe_room_json(r);
end $$;

create or replace function public.join_room(p_room text, p_nickname text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms; active int; already boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found then raise exception 'Room not found or expired'; end if;
  select exists (select 1 from public.room_members where room_id = p_room and user_id = auth.uid()) into already;
  select count(*) into active from public.room_members
    where room_id = p_room and last_seen > now() - interval '60 seconds' and user_id <> auth.uid();
  if active >= r.max_participants then raise exception 'Room is full'; end if;
  insert into public.room_members (room_id, user_id, nickname)
    values (p_room, auth.uid(), left(coalesce(nullif(trim(p_nickname), ''), 'Guest'), 24))
    on conflict (room_id, user_id) do update set nickname = excluded.nickname, last_seen = now();
  return public.safe_room_json(r);
end $$;

create or replace function public.get_room(p_room text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms;
begin
  if not public.is_member(p_room) then raise exception 'Not a member of this room'; end if;
  select * into r from public.rooms where id = p_room;
  return public.safe_room_json(r);
end $$;

create or replace function public.heartbeat(p_room text) returns void
language sql security definer set search_path = public, extensions as $$
  update public.room_members set last_seen = now() where room_id = p_room and user_id = auth.uid();
$$;

create or replace function public.transfer_host(p_room text, p_new_host uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found or r.host_id <> auth.uid() then raise exception 'Only the host can transfer hosting'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room and user_id = p_new_host) then raise exception 'Target is not in this room'; end if;
  update public.rooms set host_id = p_new_host, host_token_hash = null, host_pubkey = null, host_epoch = coalesce(host_epoch, 1) + 1, host_seq = 0 where id = p_room returning * into r;
  return public.safe_room_json(r);
end $$;

create or replace function public.claim_host(p_room text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms; host_seen timestamptz;
begin
  if not public.is_member(p_room) then raise exception 'Not a member of this room or room expired'; end if;
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found then raise exception 'Room not found or expired'; end if;
  select last_seen into host_seen from public.room_members where room_id = p_room and user_id = r.host_id;
  if host_seen is null or host_seen < now() - interval '30 seconds' then
    update public.rooms set host_id = auth.uid(), host_token_hash = null, host_pubkey = null, host_epoch = coalesce(host_epoch, 1) + 1, host_seq = 0 where id = p_room returning * into r;
  else
    raise exception 'Current host is still active';
  end if;
  return public.safe_room_json(r);
end $$;

-- ───────────── Security Hardening RPCs ─────────────

-- Register the current host's verification public key (ECDSA P-256 JWK string)
create or replace function public.register_host_pubkey(p_room text, p_pubkey text, p_epoch int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found or r.host_id <> auth.uid() then raise exception 'Only the host can register a host key'; end if;
  if p_epoch is null or p_epoch <= 0 then
    raise exception 'Valid positive host epoch is required for key registration';
  end if;
  if p_epoch <> r.host_epoch then
    raise exception 'Stale host epoch; key registration rejected (current epoch: %, requested: %)', r.host_epoch, p_epoch;
  end if;
  if p_pubkey is null or char_length(trim(p_pubkey)) = 0 then
    raise exception 'Public key must not be empty';
  end if;
  update public.rooms set host_pubkey = trim(p_pubkey) where id = p_room returning * into r;
  return public.safe_room_json(r);
end $$;

-- Authoritative host-only control toggle
create or replace function public.set_host_only(p_room text, p_host_only boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found or r.host_id <> auth.uid() then raise exception 'Only the host can change host-only controls'; end if;
  if p_host_only is null then raise exception 'host_only flag must not be null'; end if;
  update public.rooms set host_only = p_host_only where id = p_room returning * into r;
  return public.safe_room_json(r);
end $$;
begin
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found or r.host_id <> auth.uid() then raise exception 'Only the host can change host-only controls'; end if;
  update public.rooms set host_only = p_host_only where id = p_room returning * into r;
  return public.safe_room_json(r);
end $$;

-- Authoritative Playback State Update (DB-01: host-only sequence increment)
create or replace function public.update_playback(
  p_room text, p_op text, p_time numeric, p_playing boolean, p_source jsonb, p_seq int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rooms;
  is_caller_host boolean;
begin
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found then raise exception 'Room not found or expired'; end if;
  if not public.is_member(p_room) then raise exception 'Not a member of this room'; end if;

  -- Validate inputs
  if p_time is null or p_time < 0 or p_time > 10000000 then raise exception 'Invalid playback time'; end if;
  if p_playing is null then raise exception 'Playing state must not be null'; end if;
  if p_op is null or trim(p_op) not in ('play', 'pause', 'seek', 'source', 'state') then
    raise exception 'Invalid operation name';
  end if;

  is_caller_host := (r.host_id = auth.uid());

  -- Host-only mode: reject non-host callers
  if r.host_only and not is_caller_host then
    raise exception 'Host-only mode is active; unauthorized control attempt';
  end if;

  if is_caller_host then
    -- Host: may advance host_seq. Server-side auto-increment ensures monotonicity.
    -- p_seq is ignored; the server always increments by 1 from current host_seq.
    update public.rooms set
      playback_state = jsonb_build_object(
        'op', trim(p_op),
        'time', p_time,
        'playing', p_playing,
        'is_host', true,
        'seq', coalesce(host_seq, 0) + 1,
        'updated_at', extract(epoch from now())
      ),
      current_source = coalesce(p_source, current_source),
      host_seq = coalesce(host_seq, 0) + 1
    where id = p_room returning * into r;
  else
    -- Non-host (collaborative mode): may store playback state for late-joiner sync,
    -- but must NOT touch host_seq. p_seq is completely ignored.
    update public.rooms set
      playback_state = jsonb_build_object(
        'op', trim(p_op),
        'time', p_time,
        'playing', p_playing,
        'is_host', false,
        'seq', coalesce(host_seq, 0),
        'updated_at', extract(epoch from now())
      ),
      current_source = coalesce(p_source, current_source)
    where id = p_room returning * into r;
  end if;

  return public.safe_room_json(r);
end $$;

-- ───────────── Anime Bingo RPCs ─────────────

create or replace function public.create_bingo_game(
  p_room text, p_mode text, p_category text, p_tropes jsonb, p_seed text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rooms;
  g public.bingo_games;
  b public.bingo_boards;
  m record;
begin
  if not public.is_host(p_room) then raise exception 'Only the host can start a Bingo game'; end if;
  select * into r from public.rooms where id = p_room;

  -- End previous active games
  update public.bingo_games set status = 'reset' where room_id = p_room and status = 'active';

  insert into public.bingo_games (room_id, mode, category, seed, created_by)
    values (p_room, p_mode, p_category, p_seed, auth.uid()) returning * into g;

  if p_mode = 'cooperative' then
    -- Shared single board for all room members
    insert into public.bingo_boards (game_id, room_id, user_id, tropes)
      values (g.id, p_room, null, p_tropes) returning * into b;
  else
    -- In competitive mode, initialize board for creator; other members will initialize their own
    insert into public.bingo_boards (game_id, room_id, user_id, tropes)
      values (g.id, p_room, auth.uid(), p_tropes) returning * into b;
  end if;

  return jsonb_build_object('game', to_jsonb(g), 'board', to_jsonb(b));
end $$;

create or replace function public.join_bingo_board(p_game uuid, p_tropes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.bingo_games;
  b public.bingo_boards;
begin
  select * into g from public.bingo_games where id = p_game and status = 'active';
  if not found then raise exception 'Active game not found'; end if;
  if not public.is_member(g.room_id) then raise exception 'Not a member of this room'; end if;

  if g.mode = 'cooperative' then
    select * into b from public.bingo_boards where game_id = p_game and user_id is null;
  else
    select * into b from public.bingo_boards where game_id = p_game and user_id = auth.uid();
    if not found then
      insert into public.bingo_boards (game_id, room_id, user_id, tropes)
        values (p_game, g.room_id, auth.uid(), p_tropes) returning * into b;
    end if;
  end if;

  return to_jsonb(b);
end $$;

-- Helper to authoritatively verify if a board has at least one complete 5x5 Bingo line
create or replace function public.has_bingo_line(p_board uuid) returns boolean
language plpgsql security definer stable set search_path = public as $$
declare
  marked_indices int[];
  lines int[][] := array[
    -- rows
    array[0,1,2,3,4], array[5,6,7,8,9], array[10,11,12,13,14], array[15,16,17,18,19], array[20,21,22,23,24],
    -- cols
    array[0,5,10,15,20], array[1,6,11,16,21], array[2,7,12,17,22], array[3,8,13,18,23], array[4,9,14,19,24],
    -- diags
    array[0,6,12,18,24], array[4,8,12,16,20]
  ];
  line int[];
begin
  select coalesce(array_agg(index), '{}'::int[]) into marked_indices
  from public.bingo_marks where board_id = p_board;

  -- Index 12 is the center Free Space, always treated as marked
  if not (12 = any(marked_indices)) then
    marked_indices := array_append(marked_indices, 12);
  end if;

  foreach line slice 1 in array lines loop
    if line <@ marked_indices then
      return true;
    end if;
  end loop;

  return false;
end $$;

create or replace function public.mark_bingo_square(p_game uuid, p_board uuid, p_index int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.bingo_games;
  b public.bingo_boards;
  m public.bingo_marks;
begin
  if p_index < 0 or p_index > 24 then raise exception 'Square index out of bounds (0-24)'; end if;
  select * into g from public.bingo_games where id = p_game and status = 'active';
  if not found then raise exception 'Game not active'; end if;
  select * into b from public.bingo_boards where id = p_board and game_id = p_game;
  if not found then raise exception 'Board not found'; end if;
  if not public.is_member(b.room_id) then raise exception 'Not a member of this room'; end if;

  -- In competitive mode, players can only mark their own board!
  if g.mode = 'competitive' and (b.user_id is null or b.user_id <> auth.uid()) then
    raise exception 'Cannot mark another participant’s competitive board';
  end if;

  insert into public.bingo_marks (game_id, board_id, index, marked_by)
    values (p_game, p_board, p_index, auth.uid())
    on conflict (board_id, index) do nothing
    returning * into m;

  return jsonb_build_object('success', true, 'index', p_index);
end $$;

create or replace function public.unmark_bingo_square(p_game uuid, p_board uuid, p_index int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.bingo_games;
  b public.bingo_boards;
begin
  if p_index = 12 then raise exception 'Cannot unmark free space'; end if;
  if p_index < 0 or p_index > 24 then raise exception 'Square index out of bounds (0-24)'; end if;

  select * into g from public.bingo_games where id = p_game and status = 'active';
  if not found then raise exception 'Game not active'; end if;
  select * into b from public.bingo_boards where id = p_board and game_id = p_game;
  if not found then raise exception 'Board not found'; end if;
  if not public.is_member(b.room_id) then raise exception 'Not a member of this room'; end if;

  if g.mode = 'competitive' and (b.user_id is null or b.user_id <> auth.uid()) then
    raise exception 'Cannot unmark another participant’s competitive board';
  end if;

  delete from public.bingo_marks where board_id = p_board and index = p_index;
  return jsonb_build_object('success', true, 'index', p_index);
end $$;

create or replace function public.claim_bingo_win(p_game uuid, p_board uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.bingo_games;
  b public.bingo_boards;
begin
  select * into g from public.bingo_games where id = p_game and status = 'active' for update;
  if not found or not public.is_member(g.room_id) then raise exception 'Game not active or unauthorized'; end if;
  select * into b from public.bingo_boards where id = p_board and game_id = p_game;
  if not found then raise exception 'Board not found'; end if;

  -- In competitive mode, players can only claim their own board
  if g.mode = 'competitive' and (b.user_id is null or b.user_id <> auth.uid()) then
    raise exception 'Cannot claim win for another player’s competitive board';
  end if;

  -- Authoritatively verify that the board has at least one complete line!
  if not public.has_bingo_line(p_board) then
    raise exception 'Board does not have a complete Bingo line';
  end if;

  update public.bingo_games set status = 'completed', winner_id = auth.uid(), completed_at = now()
  where id = p_game returning * into g;

  -- Award score point
  insert into public.player_scores (room_id, user_id, score, bingos_won)
    values (g.room_id, auth.uid(), 25, 1)
    on conflict (room_id, user_id) do update set
      score = public.player_scores.score + 25,
      bingos_won = public.player_scores.bingos_won + 1,
      updated_at = now();

  return to_jsonb(g);
end $$;

create or replace function public.reset_bingo_game(p_game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g public.bingo_games;
begin
  select * into g from public.bingo_games where id = p_game;
  if not found then raise exception 'Game not found'; end if;
  if not public.is_host(g.room_id) then raise exception 'Only the host can reset the Bingo game'; end if;
  update public.bingo_games set status = 'reset' where id = p_game;
end $$;

-- ───────────── Episode Predictions RPCs ─────────────

-- DB-04: create_prediction with explicit points range check and strict options schema
create or replace function public.create_prediction(
  p_room text, p_question text, p_kind text, p_options jsonb,
  p_deadline timestamptz default null, p_timestamp numeric default null,
  p_spoiler boolean default false, p_points int default 10
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  pred public.predictions;
  opt_count int;
  distinct_ids int;
  distinct_texts int;
  clean_kind text;
begin
  if not public.is_member(p_room) then raise exception 'Not a member of this room'; end if;
  clean_kind := trim(p_kind);
  if clean_kind not in ('choice', 'text') then
    raise exception 'Invalid prediction kind (must be choice or text)';
  end if;
  if p_points is null or p_points < 1 or p_points > 100 then
    raise exception 'Points reward must be between 1 and 100';
  end if;
  if p_question is null or char_length(trim(p_question)) = 0 then
    raise exception 'Question must not be empty';
  end if;

  if clean_kind = 'choice' then
    if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then
      raise exception 'Choice prediction must have at least 2 options';
    end if;
    if jsonb_array_length(p_options) > 10 then
      raise exception 'Choice prediction cannot have more than 10 options';
    end if;

    -- Validate schema of every option: object with non-empty id and non-empty text
    select count(*),
           count(distinct lower(trim(elem->>'id'))),
           count(distinct lower(trim(elem->>'text')))
      into opt_count, distinct_ids, distinct_texts
      from jsonb_array_elements(p_options) elem
     where jsonb_typeof(elem) = 'object'
       and elem->>'id' is not null and char_length(trim(elem->>'id')) > 0
       and elem->>'text' is not null and char_length(trim(elem->>'text')) > 0;

    if opt_count <> jsonb_array_length(p_options) then
      raise exception 'Every option must be an object with non-empty id and text';
    end if;
    if distinct_ids <> opt_count then
      raise exception 'Option IDs must be unique';
    end if;
    if distinct_texts <> opt_count then
      raise exception 'Option text labels must be distinct';
    end if;
  else
    p_options := coalesce(p_options, '[]'::jsonb);
  end if;

  insert into public.predictions (
    room_id, question, kind, options, deadline_at, episode_timestamp, is_spoiler, points_reward, created_by
  ) values (
    p_room, trim(p_question), clean_kind, p_options, p_deadline, p_timestamp, p_spoiler, p_points, auth.uid()
  ) returning * into pred;
  return to_jsonb(pred);
end $$;

create or replace function public.submit_prediction_answer(p_prediction uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  pred public.predictions;
  ans public.prediction_answers;
  clean_answer text;
begin
  clean_answer := trim(p_answer);
  if clean_answer is null or char_length(clean_answer) = 0 then
    raise exception 'Answer must not be empty';
  end if;

  -- Acquire row lock to prevent race condition with concurrent lock_prediction
  select * into pred from public.predictions where id = p_prediction for update;
  if not found then raise exception 'Prediction not found'; end if;
  if pred.status <> 'open' then raise exception 'Prediction is locked or resolved'; end if;
  if pred.deadline_at is not null and pred.deadline_at < now() then raise exception 'Prediction deadline has passed'; end if;
  if not public.is_member(pred.room_id) then raise exception 'Not a member of this room'; end if;

  -- Validate answer against registered options for choice predictions
  if pred.kind = 'choice' then
    if not exists (
      select 1 from jsonb_array_elements(pred.options) opt
      where opt->>'text' = clean_answer or opt->>'id' = clean_answer
    ) then
      raise exception 'Submitted answer does not match any registered option';
    end if;
  end if;

  insert into public.prediction_answers (prediction_id, room_id, user_id, answer, locked)
    values (p_prediction, pred.room_id, auth.uid(), clean_answer, false)
    on conflict (prediction_id, user_id) do update set
      answer = excluded.answer, updated_at = now()
    returning * into ans;

  return to_jsonb(ans);
end $$;

-- DB-04: lock_prediction — HOST-ONLY, only allowed from 'open' status
create or replace function public.lock_prediction(p_prediction uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pred public.predictions;
begin
  select * into pred from public.predictions where id = p_prediction for update;
  if not found then raise exception 'Prediction not found'; end if;
  if pred.status <> 'open' then
    raise exception 'Prediction can only be locked from open status (current: %)', pred.status;
  end if;
  if not public.is_host(pred.room_id) then
    raise exception 'Only the room host can lock predictions';
  end if;
  update public.predictions set status = 'locked' where id = p_prediction returning * into pred;
  update public.prediction_answers set locked = true where prediction_id = p_prediction;
  return to_jsonb(pred);
end $$;

-- DB-04: reveal_prediction — HOST-ONLY, only allowed from 'locked' status
create or replace function public.reveal_prediction(p_prediction uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pred public.predictions;
begin
  select * into pred from public.predictions where id = p_prediction for update;
  if not found then raise exception 'Prediction not found'; end if;
  if pred.status <> 'locked' then
    raise exception 'Prediction can only be revealed from locked status (current: %)', pred.status;
  end if;
  if not public.is_host(pred.room_id) then
    raise exception 'Only the room host can reveal answers';
  end if;
  update public.predictions set status = 'revealed' where id = p_prediction returning * into pred;
  return to_jsonb(pred);
end $$;

-- DB-04: resolve_prediction — HOST-ONLY, from 'locked' or 'revealed', terminal state, idempotent scoring via ledger
create or replace function public.resolve_prediction(p_prediction uuid, p_winning_option text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  pred public.predictions;
  winner record;
  trimmed_option text;
begin
  trimmed_option := trim(p_winning_option);
  if trimmed_option is null or char_length(trimmed_option) = 0 then
    raise exception 'Winning option must not be empty';
  end if;

  select * into pred from public.predictions where id = p_prediction for update;
  if not found then raise exception 'Prediction not found'; end if;

  -- Terminal state: resolved predictions can never be changed
  if pred.status = 'resolved' then raise exception 'Prediction is already resolved'; end if;
  if pred.status = 'cancelled' then raise exception 'Prediction has been cancelled'; end if;

  -- Only valid source states for resolution
  if pred.status not in ('locked', 'revealed') then
    raise exception 'Prediction must be locked or revealed before resolution (current: %)', pred.status;
  end if;

  -- HOST-ONLY resolution (approved policy): only the room host can resolve and award points
  if not public.is_host(pred.room_id) then
    raise exception 'Only the room host can resolve predictions and award points';
  end if;

  -- Validate options structure and winning option match (for choice kind)
  if pred.kind = 'choice' then
    if pred.options is null or jsonb_typeof(pred.options) <> 'array' then
      raise exception 'Malformed prediction options';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(pred.options) opt
      where opt->>'text' = trimmed_option or opt->>'id' = trimmed_option
    ) then
      raise exception 'Winning option does not match any registered prediction option';
    end if;
  end if;

  -- Atomic status transition
  update public.predictions set status = 'resolved', winning_option = trimmed_option, resolved_at = now()
  where id = p_prediction returning * into pred;

  -- Idempotent payout ledger: guarantees that concurrent or re-run resolution attempts
  -- never award duplicate points for the same (prediction_id, user_id).
  for winner in (
    select user_id from public.prediction_answers
    where prediction_id = p_prediction
      and (answer = trimmed_option or (
        pred.kind = 'choice' and exists (
          select 1 from jsonb_array_elements(pred.options) o
          where (o->>'id' = trimmed_option and answer = o->>'text')
             or (o->>'text' = trimmed_option and answer = o->>'id')
        )
      ))
  ) loop
    insert into public.prediction_payouts (prediction_id, room_id, user_id, points)
      values (pred.id, pred.room_id, winner.user_id, pred.points_reward)
      on conflict (prediction_id, user_id) do nothing;
    if found then
      insert into public.player_scores (room_id, user_id, score, predictions_won)
        values (pred.room_id, winner.user_id, pred.points_reward, 1)
        on conflict (room_id, user_id) do update set
          score = public.player_scores.score + pred.points_reward,
          predictions_won = public.player_scores.predictions_won + 1,
          updated_at = now();
    end if;
  end loop;

  return to_jsonb(pred);
end $$;
  end loop;

  return to_jsonb(pred);
end $$;

-- DB-02: get_room_leaderboard with membership check
create or replace function public.get_room_leaderboard(p_room text) returns jsonb
language plpgsql security definer stable set search_path = public, extensions as $$
begin
  if not public.is_member(p_room) then
    raise exception 'Not a member of this room';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    from (
      select ps.user_id, rm.nickname, ps.score, ps.predictions_won, ps.bingos_won
      from public.player_scores ps
      left join public.room_members rm on rm.room_id = ps.room_id and rm.user_id = ps.user_id
      where ps.room_id = p_room
      order by ps.score desc
    ) s
  );
end $$;

-- Permissions & Least Privilege
-- Revoke all permissions on internal safe_room_json helper from all roles
revoke all on function public.safe_room_json(public.rooms) from public, anon, authenticated;

revoke all on function public.create_room(text), public.join_room(text, text), public.get_room(text),
  public.heartbeat(text), public.transfer_host(text, uuid), public.claim_host(text),
  public.register_host_pubkey(text, text, int), public.set_host_only(text, boolean), public.update_playback(text, text, numeric, boolean, jsonb, int),
  public.create_bingo_game(text, text, text, jsonb, text), public.join_bingo_board(uuid, jsonb),
  public.mark_bingo_square(uuid, uuid, int), public.unmark_bingo_square(uuid, uuid, int),
  public.claim_bingo_win(uuid, uuid), public.reset_bingo_game(uuid),
  public.create_prediction(text, text, text, jsonb, timestamptz, numeric, boolean, int),
  public.submit_prediction_answer(uuid, text), public.lock_prediction(uuid),
  public.reveal_prediction(uuid), public.resolve_prediction(uuid, text),
  public.get_room_leaderboard(text) from public, anon;

grant execute on function public.create_room(text), public.join_room(text, text), public.get_room(text),
  public.heartbeat(text), public.transfer_host(text, uuid), public.claim_host(text),
  public.register_host_pubkey(text, text, int), public.set_host_only(text, boolean), public.update_playback(text, text, numeric, boolean, jsonb, int),
  public.create_bingo_game(text, text, text, jsonb, text), public.join_bingo_board(uuid, jsonb),
  public.mark_bingo_square(uuid, uuid, int), public.unmark_bingo_square(uuid, uuid, int),
  public.claim_bingo_win(uuid, uuid), public.reset_bingo_game(uuid),
  public.create_prediction(text, text, text, jsonb, timestamptz, numeric, boolean, int),
  public.submit_prediction_answer(uuid, text), public.lock_prediction(uuid),
  public.reveal_prediction(uuid), public.resolve_prediction(uuid, text),
  public.get_room_leaderboard(text) to authenticated;
grant execute on function public.is_member(text), public.is_host(text) to authenticated, anon;

-- ───────────── Phase 3C: Ema Wish Board (絵馬) ─────────────
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

create index if not exists idx_ema_cards_room_created on public.ema_cards (room_id, created_at desc);

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

drop policy if exists ema_select on public.ema_cards;
create policy ema_select on public.ema_cards
  for select to authenticated
  using (public.is_member(room_id));

drop policy if exists ema_insert on public.ema_cards;
create policy ema_insert on public.ema_cards
  for insert to authenticated
  with check (
    public.is_member(room_id)
    and author_id = auth.uid()
    and char_length(trim(message)) between 1 and 280
  );

drop policy if exists ema_delete on public.ema_cards;
create policy ema_delete on public.ema_cards
  for delete to authenticated
  using (
    public.is_member(room_id)
    and author_id = auth.uid()
  );

grant select, insert, delete on public.ema_cards to authenticated;
