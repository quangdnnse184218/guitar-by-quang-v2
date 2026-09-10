-- ==============================================================================
-- FIX: profiles.email bị thiếu ở một số tài khoản ("Chưa cập nhật email")
-- ==============================================================================
-- Nguyên nhân: trigger tự tạo hàng `profiles` khi có tài khoản Auth mới KHÔNG
-- copy cột `email` (chỉ set full_name/avatar_url/role từ user_metadata). Client
-- (register.js) có thử tự ghi thêm email ngay sau khi đăng ký, nhưng vì hàng
-- `profiles` đã được trigger tạo trước đó nên thao tác của client thực chất là
-- UPDATE — và cột `email` bị chặn quyền UPDATE trực tiếp từ client (đúng ý đồ
-- bảo mật: không cho user tự sửa email hiển thị khác với email đăng nhập
-- thật) nên ghi thất bại âm thầm, để lại `profiles.email = NULL`.
--
-- Chạy toàn bộ file này 1 lần trong Supabase Dashboard > SQL Editor để:
-- 1. Vá ngay các tài khoản đang bị thiếu email (dùng đúng email thật từ
--    auth.users, không phải giá trị tự nhập).
-- 2. Tạo 1 trigger + hàm SECURITY DEFINER để tự đồng bộ email cho MỌI tài
--    khoản mới hoặc khi email đổi trong tương lai — không cần sửa code nữa.
-- 3. Tạo RPC `sync_own_email()` để phía client (user-dashboard.js) có thể chủ
--    động tự vá lại email của chính mình mỗi khi vào trang, phòng trường hợp
--    trigger vì lý do gì đó chưa kịp chạy.
-- ==============================================================================

-- 1. Vá ngay các tài khoản hiện đang thiếu email
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null
  and u.email is not null;

-- 2. Trigger tự đồng bộ email mỗi khi có tài khoản mới hoặc email đổi
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id
    and new.email is not null
    and (email is null or email <> new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_sync on auth.users;
create trigger on_auth_user_email_sync
  after insert or update of email on auth.users
  for each row execute function public.sync_profile_email_from_auth();

-- 3. RPC để client tự vá email của chính mình (an toàn: chỉ đọc auth.email()
-- của chính người gọi, KHÔNG nhận tham số từ client nên không thể giả mạo)
create or replace function public.sync_own_email()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = auth.email()
  where id = auth.uid()
    and auth.email() is not null
    and (email is null or email <> auth.email());
end;
$$;

grant execute on function public.sync_own_email() to authenticated;
