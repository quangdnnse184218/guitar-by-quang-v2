-- Vá bảo mật (phát hiện khi kiểm tra kho code công khai + bộ kiểm tra của Supabase).
-- Chạy trong Supabase SQL Editor (một lần). An toàn khi chạy lại.
--
-- 1. admin_mark_revocation_drive KHÔNG có kiểm tra quyền và ai (kể cả chưa đăng nhập) cũng
--    gọi được qua /rest/v1/rpc. Hàm này chỉ do Edge Function admin-revoke-access gọi bằng
--    service role, nên KHÔNG thêm kiểm tra auth.uid() (service role không có uid, sẽ làm hỏng
--    việc ghi nhận gỡ quyền Drive) mà thu hồi quyền thực thi, chỉ để lại cho service_role.
-- 2. Các hàm admin_* và sync_own_email vốn tự kiểm tra role bên trong (đã thử: ẩn danh bị
--    chặn), nhưng vẫn bỏ quyền gọi của `anon` như lớp phòng thủ thứ hai — admin luôn đăng nhập.
-- 3. cam_am_players: `secret_hash` (mã bí mật của người chơi game, dạng băm) đang đọc được công
--    khai. Hiện chưa dòng nào có giá trị (0/5) và game chỉ cần player_id/player_name, nên giới
--    hạn cột được phép đọc, đồng thời bỏ quyền ghi trực tiếp (ghi đi qua RPC cam_am_*).

-- 1. Hàm chỉ dành cho server ---------------------------------------------------------------
revoke execute on function public.admin_mark_revocation_drive(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_mark_revocation_drive(uuid, boolean) to service_role;

-- 2. Bỏ quyền của khách chưa đăng nhập với các hàm quản trị --------------------------------
revoke execute on function public.admin_check_grant_context(uuid, text) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
revoke execute on function public.admin_expire_stale_orders(integer) from public, anon;
revoke execute on function public.admin_get_overview_stats() from public, anon;
revoke execute on function public.admin_get_pending_orders() from public, anon;
revoke execute on function public.admin_get_recent_orders() from public, anon;
revoke execute on function public.admin_get_recent_purchases() from public, anon;
revoke execute on function public.admin_get_recent_revocations() from public, anon;
revoke execute on function public.admin_get_recent_transactions() from public, anon;
revoke execute on function public.admin_get_unmatched_transactions() from public, anon;
revoke execute on function public.admin_get_user_detail(uuid) from public, anon;
revoke execute on function public.admin_get_users() from public, anon;
revoke execute on function public.admin_grant_access(uuid, text, text, text, uuid, numeric) from public, anon;
revoke execute on function public.admin_resolve_transaction(uuid, text, uuid, text) from public, anon;
revoke execute on function public.admin_revoke_access(uuid, text, text, text) from public, anon;
revoke execute on function public.sync_own_email() from public, anon;

-- Giữ nguyên quyền cho người đã đăng nhập (trang admin + trang cá nhân) và service role.
grant execute on function public.admin_check_grant_context(uuid, text) to authenticated, service_role;
grant execute on function public.admin_delete_user(uuid) to authenticated, service_role;
grant execute on function public.admin_expire_stale_orders(integer) to authenticated, service_role;
grant execute on function public.admin_get_overview_stats() to authenticated, service_role;
grant execute on function public.admin_get_pending_orders() to authenticated, service_role;
grant execute on function public.admin_get_recent_orders() to authenticated, service_role;
grant execute on function public.admin_get_recent_purchases() to authenticated, service_role;
grant execute on function public.admin_get_recent_revocations() to authenticated, service_role;
grant execute on function public.admin_get_recent_transactions() to authenticated, service_role;
grant execute on function public.admin_get_unmatched_transactions() to authenticated, service_role;
grant execute on function public.admin_get_user_detail(uuid) to authenticated, service_role;
grant execute on function public.admin_get_users() to authenticated, service_role;
grant execute on function public.admin_grant_access(uuid, text, text, text, uuid, numeric) to authenticated, service_role;
grant execute on function public.admin_resolve_transaction(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.admin_revoke_access(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.sync_own_email() to authenticated, service_role;

-- redeem_code: tính năng đã gỡ (bảng redemption_codes rỗng) — không cần ai gọi nữa.
revoke execute on function public.redeem_code(text) from public, anon, authenticated;

-- 3. cam_am_players: không lộ secret_hash, không cho ghi trực tiếp -------------------------
revoke all on public.cam_am_players from anon, authenticated;
grant select (player_id, player_name, created_at) on public.cam_am_players to anon, authenticated;
-- service_role và các hàm SECURITY DEFINER (chủ sở hữu bảng) không bị ảnh hưởng.

-- Kiểm tra sau khi chạy (mong đợi):
--   select has_function_privilege('anon', 'public.admin_mark_revocation_drive(uuid, boolean)', 'execute');  -- false
--   select has_function_privilege('anon', 'public.admin_get_users()', 'execute');                            -- false
--   select has_function_privilege('authenticated', 'public.admin_get_users()', 'execute');                   -- true
--   select has_column_privilege('anon', 'public.cam_am_players', 'secret_hash', 'select');                   -- false
--   select has_column_privilege('anon', 'public.cam_am_players', 'player_name', 'select');                   -- true
