-- Anime Together — Phase 2 Security Remediation Migration
-- Date: 2026-11-23 (Updated Corrective Pass)
-- Applies: DB-01, DB-02, DB-03, DB-04, HOST-01, Extension Resolution, Search Path Security
-- WARNING: Do NOT apply to production without coordinated frontend deployment.
-- This migration must be tested in staging before production use.

-- ═══════════════════════════════════════════════════════════════
-- Drop Obsolete Function Overloads and Insecure Legacy RPCs
-- ═══════════════════════════════════════════════════════════════

-- Drop 2-argument register_host_pubkey to prevent overload ambiguity and bypass of epoch validation
drop function if exists public.register_host_pubkey(text, text);

-- Drop legacy plaintext host token registration RPC (SEC-02: ECDSA keys are required)
drop function if exists public.register_host_token(text, text);

-- Drop obsolete 5-arg update_playback if it exists from earlier schemas
drop function if exists public.update_playback(text, text, numeric, boolean, jsonb);

-- Drop obsolete create_prediction overloads if any exist
drop function if exists public.create_prediction(text, text, text, jsonb);
drop function if exists public.create_prediction(text, text, text, jsonb, timestamptz, numeric, boolean);

-- ═══════════════════════════════════════════════════════════════
-- DB-01: Prevent playback sequence poisoning & validate inputs
-- Only the host may advance host_seq. Non-host callers may update
-- playback_state (collaborative) but cannot touch host_seq.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.update_playback(
  p_room text, p_op text, p_time numeric, p_playing boolean, p_source jsonb default null, p_seq int default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.rooms;
  is_caller_host boolean;
  safe_room jsonb;
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


-- ═══════════════════════════════════════════════════════════════
-- DB-02: Protect leaderboard access — add membership check
-- ═══════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════
-- DB-03: Return safe projections from all room-returning RPCs
-- Replace to_jsonb(r) with explicit field projection, excluding
-- host_token_hash and other internal authentication material.
-- ═══════════════════════════════════════════════════════════════

-- Helper function for safe room projection (Internal only)
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

-- Create room with explicit extension-qualified gen_random_bytes
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

-- Concurrency-safe join_room with row locking on rooms
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

-- ═══════════════════════════════════════════════════════════════
-- HOST-01: Serialized host transfers and claims in PostgreSQL
-- Acquire FOR UPDATE row lock before checking authorization or liveness
-- ═══════════════════════════════════════════════════════════════

create or replace function public.transfer_host(p_room text, p_new_host uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found then raise exception 'Room not found or expired'; end if;
  if r.host_id <> auth.uid() then raise exception 'Only the current host can transfer hosting'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room and user_id = p_new_host) then
    raise exception 'Target is not in this room';
  end if;
  update public.rooms set
    host_id = p_new_host,
    host_token_hash = null,
    host_pubkey = null,
    host_epoch = coalesce(host_epoch, 1) + 1,
    host_seq = 0
  where id = p_room returning * into r;
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
    update public.rooms set
      host_id = auth.uid(),
      host_token_hash = null,
      host_pubkey = null,
      host_epoch = coalesce(host_epoch, 1) + 1,
      host_seq = 0
    where id = p_room returning * into r;
  else
    raise exception 'Current host is still active';
  end if;
  return public.safe_room_json(r);
end $$;

create or replace function public.register_host_pubkey(p_room text, p_pubkey text, p_epoch int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found then raise exception 'Room not found or expired'; end if;
  if r.host_id <> auth.uid() then raise exception 'Only the current host can register a host key'; end if;
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

create or replace function public.set_host_only(p_room text, p_host_only boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room and expires_at > now() for update;
  if not found then raise exception 'Room not found or expired'; end if;
  if r.host_id <> auth.uid() then raise exception 'Only the current host can change host-only controls'; end if;
  if p_host_only is null then raise exception 'host_only flag must not be null'; end if;
  update public.rooms set host_only = p_host_only where id = p_room returning * into r;
  return public.safe_room_json(r);
end $$;


-- ═══════════════════════════════════════════════════════════════
-- DB-04: Strict prediction state machine, host-only lifecycle,
-- schema validation, and idempotent payout ledger
-- ═══════════════════════════════════════════════════════════════

-- Payout ledger table ensuring database-level idempotency per (prediction_id, user_id)
create table if not exists public.prediction_payouts (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  points int not null check (points between 1 and 100),
  created_at timestamptz not null default now(),
  constraint uq_prediction_payout unique (prediction_id, user_id)
);

alter table public.prediction_payouts enable row level security;
drop policy if exists pp_select on public.prediction_payouts;
create policy pp_select on public.prediction_payouts for select to authenticated using (public.is_member(room_id));
grant select on public.prediction_payouts to authenticated;

-- create_prediction: enforce supported kind ('choice' | 'text'), points 1-100, and strict options schema
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

-- submit_prediction_answer: concurrency-safe with FOR UPDATE lock on prediction row
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

-- lock_prediction: HOST-ONLY, only allowed from 'open' status
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

-- reveal_prediction: HOST-ONLY, only allowed from 'locked' status
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

-- resolve_prediction: HOST-ONLY, from 'locked' or 'revealed', terminal state, idempotent scoring via ledger
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

-- ═══════════════════════════════════════════════════════════════
-- Permissions & Least Privilege
-- ═══════════════════════════════════════════════════════════════

-- Revoke all permissions on internal safe_room_json helper
revoke all on function public.safe_room_json(public.rooms) from public, anon, authenticated;

-- Revoke public / anon from RPCs
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

-- Grant execute on RPCs to authenticated clients
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
