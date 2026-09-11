-- Bảng đăng ký biệt danh cho game Luyện Cảm Âm (luyen-cam-am.html), tách
-- riêng khỏi cam_am_leaderboard vì leaderboard chỉ có dòng khi người chơi
-- đã phá kỷ lục — bảng này đăng ký tên NGAY lúc người chơi vừa nhập, để
-- chặn trùng tên đúng như yêu cầu ("tự truy bảng db ra và so sánh không
-- cho trùng tên"). Chạy 1 lần trong Supabase SQL Editor (project
-- guitar-by-quang-v2, ref covzjzcqerldfssxasax) — SAU khi đã chạy
-- cam-am-leaderboard-setup.sql.

create table if not exists public.cam_am_players (
  player_id text primary key,
  player_name text not null check (char_length(trim(player_name)) between 1 and 24),
  created_at timestamptz not null default now()
);

-- So khớp không phân biệt hoa/thường ("Quang" và "quang" tính là trùng) —
-- unique index trên lower(player_name) chặn trùng tên ở tầng DB, không chỉ
-- ở tầng client, để tránh race condition hai người cùng chọn một tên cùng lúc.
create unique index if not exists cam_am_players_name_lower_idx
  on public.cam_am_players (lower(player_name));

alter table public.cam_am_players enable row level security;

-- Ai cũng cần đọc được để kiểm tra trùng tên trước khi đăng ký, kể cả khách
-- chưa đăng nhập.
create policy "cam_am_players_select_public"
  on public.cam_am_players for select
  to anon, authenticated
  using (true);

-- Không có đăng nhập nên không thể xác thực "đúng chủ" của một dòng — chấp
-- nhận đánh đổi này vì đây chỉ là sân chơi nhỏ, không cần chống gian lận.
create policy "cam_am_players_insert_public"
  on public.cam_am_players for insert
  to anon, authenticated
  with check (true);

create policy "cam_am_players_update_public"
  on public.cam_am_players for update
  to anon, authenticated
  using (true)
  with check (true);
