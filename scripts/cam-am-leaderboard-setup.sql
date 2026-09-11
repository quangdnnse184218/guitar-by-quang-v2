-- Bảng xếp hạng cho game Luyện Cảm Âm (luyen-cam-am.html), ẩn danh không cần
-- đăng nhập: mỗi trình duyệt tự sinh một player_id lưu trong localStorage,
-- người chơi tự nhập biệt danh trước khi vào chơi. Chạy script này 1 lần
-- trong Supabase SQL Editor (project guitar-by-quang-v2, ref covzjzcqerldfssxasax).

create table if not exists public.cam_am_leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  mode text not null check (mode in ('see', 'hear')),
  player_name text not null check (char_length(trim(player_name)) between 1 and 24),
  score integer not null check (score >= 0 and score <= 999),
  updated_at timestamptz not null default now(),
  unique (player_id, mode)
);

create index if not exists cam_am_leaderboard_mode_score_idx
  on public.cam_am_leaderboard (mode, score desc, updated_at asc);

alter table public.cam_am_leaderboard enable row level security;

-- Ai cũng xem được bảng xếp hạng, kể cả khách chưa đăng nhập.
create policy "cam_am_leaderboard_select_public"
  on public.cam_am_leaderboard for select
  to anon, authenticated
  using (true);

-- Không có đăng nhập nên không thể xác thực "đúng chủ" của một dòng — chấp
-- nhận đánh đổi này vì đây chỉ là sân chơi nhỏ, không cần chống gian lận.
create policy "cam_am_leaderboard_insert_public"
  on public.cam_am_leaderboard for insert
  to anon, authenticated
  with check (true);

create policy "cam_am_leaderboard_update_public"
  on public.cam_am_leaderboard for update
  to anon, authenticated
  using (true)
  with check (true);
