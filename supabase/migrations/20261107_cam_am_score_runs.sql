-- 20261107_cam_am_score_runs.sql
-- Chống gian lận bảng xếp hạng Luyện cảm âm.
--
-- Trước: cam_am_submit_score nhận bất kỳ điểm nào từ 1 tới 999 miễn đúng secret của người chơi —
-- ai mở console gọi RPC với điểm 999 là lên top.
-- Sau: mỗi ván phải mở "lượt chơi" (cam_am_start_run) lúc bắt đầu; nộp điểm phải kèm mã lượt,
-- mỗi lượt nộp đúng một lần, và thời gian thật (đo bằng đồng hồ máy chủ) phải đủ để chơi tới
-- số điểm đó. Vẫn không chặn được người kiên nhẫn để máy tự chơi, nhưng muốn điểm cao thì phải
-- ngồi đợi đúng bằng thời gian chơi thật (điểm 50 ≈ 5 phút, 100 ≈ 18 phút, 200 ≈ 70 phút).
--
-- Thời gian tối thiểu: vòng thứ r phát lại r+1 nốt, mỗi nốt cách nhau ít nhất 400ms, nghỉ 1,4s
-- giữa các vòng (src/luyen-cam-am.js: MIN_GAP_MS, completeRound). Tổng thật ≥ 0,2·S·(S+3) + 1,4·S
-- giây; ở đây chỉ đòi MỘT NỬA để không bao giờ từ chối nhầm người chơi thật.
--
-- THỨ TỰ TRIỂN KHAI: đẩy code web (đã tương thích cả hai kiểu) lên trước, rồi mới chạy file này.
-- Chạy xong, kiểu nộp cũ (5 tham số) bị xoá.

begin;

create table if not exists public.cam_am_runs (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.cam_am_players (player_id) on delete cascade,
  mode text not null check (mode in ('see', 'hear')),
  started_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists cam_am_runs_player_started_idx
  on public.cam_am_runs (player_id, started_at desc);

-- Chỉ đi qua hai hàm SECURITY DEFINER bên dưới; khách không đọc/ghi thẳng bảng này.
alter table public.cam_am_runs enable row level security;
revoke all on public.cam_am_runs from anon, authenticated;

create or replace function public.cam_am_min_run_seconds(p_score integer)
returns numeric
language sql
immutable
set search_path = public
as $$
  select 0.1 * p_score * (p_score + 3) + 0.7 * p_score
$$;

-- Mở lượt chơi. Kiểm tra đúng chủ người chơi (secret) như lúc nộp điểm.
create or replace function public.cam_am_start_run(p_player_id text, p_secret text, p_mode text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_recent integer;
  v_id uuid;
begin
  if p_mode not in ('see', 'hear') then
    raise exception 'invalid_mode';
  end if;
  if p_secret is null or length(p_secret) < 16 then
    raise exception 'invalid_secret';
  end if;

  select secret_hash into v_hash from cam_am_players where player_id = p_player_id for update;
  if not found then
    raise exception 'player_not_registered';
  end if;
  if v_hash is not null and crypt(p_secret, v_hash) <> v_hash then
    raise exception 'not_owner';
  end if;
  if v_hash is null then
    update cam_am_players set secret_hash = crypt(p_secret, gen_salt('bf')) where player_id = p_player_id;
  end if;

  -- Dọn lượt cũ của chính người này, và chặn mở lượt hàng loạt.
  delete from cam_am_runs where player_id = p_player_id and started_at < now() - interval '1 day';
  select count(*) into v_recent
    from cam_am_runs
   where player_id = p_player_id and started_at > now() - interval '1 hour';
  if v_recent >= 120 then
    raise exception 'too_many_runs';
  end if;

  insert into cam_am_runs (player_id, mode) values (p_player_id, p_mode) returning id into v_id;
  return v_id;
end;
$$;

drop function if exists public.cam_am_submit_score(text, text, text, text, integer);

create or replace function public.cam_am_submit_score(
  p_player_id text,
  p_secret text,
  p_mode text,
  p_name text,
  p_score integer,
  p_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_run cam_am_runs%rowtype;
begin
  if p_mode not in ('see', 'hear') then
    raise exception 'invalid_mode';
  end if;
  if p_score is null or p_score <= 0 or p_score > 999 then
    raise exception 'invalid_score';
  end if;
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 24 then
    raise exception 'invalid_name';
  end if;

  select secret_hash into v_hash from cam_am_players where player_id = p_player_id for update;
  if not found then
    raise exception 'player_not_registered';
  end if;
  if v_hash is null or crypt(p_secret, v_hash) <> v_hash then
    raise exception 'not_owner';
  end if;

  select * into v_run from cam_am_runs where id = p_run_id for update;
  if not found or v_run.player_id <> p_player_id or v_run.mode <> p_mode then
    raise exception 'invalid_run';
  end if;
  if v_run.used_at is not null then
    raise exception 'run_already_used';
  end if;
  if v_run.started_at < now() - interval '6 hours' then
    raise exception 'run_expired';
  end if;
  if extract(epoch from (now() - v_run.started_at)) < cam_am_min_run_seconds(p_score) then
    raise exception 'score_too_fast';
  end if;

  update cam_am_runs set used_at = now() where id = p_run_id;

  insert into cam_am_leaderboard (player_id, mode, player_name, score, updated_at)
  values (p_player_id, p_mode, p_name, p_score, now())
  on conflict (player_id, mode) do update
    set player_name = excluded.player_name,
        score = excluded.score,
        updated_at = excluded.updated_at
    where cam_am_leaderboard.score <= excluded.score;
end;
$$;

revoke all on function public.cam_am_min_run_seconds(integer) from public;
revoke all on function public.cam_am_start_run(text, text, text) from public;
revoke all on function public.cam_am_submit_score(text, text, text, text, integer, uuid) from public;
grant execute on function public.cam_am_start_run(text, text, text) to anon, authenticated;
grant execute on function public.cam_am_submit_score(text, text, text, text, integer, uuid) to anon, authenticated;

-- PostgREST nạp lại danh sách hàm ngay (không thì vài phút đầu vẫn thấy chữ ký cũ).
notify pgrst, 'reload schema';

commit;

-- Kiểm tra sau khi chạy (chỉ đọc):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname like 'cam_am%';
--   → cam_am_submit_score chỉ còn bản 6 tham số (có p_run_id uuid).
