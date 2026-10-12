-- 2026-10-12 — Siết bảo mật đợt 2: (A) ảnh đại diện sang bucket riêng có giới hạn,
-- (B) kiểm tra trùng tên hiển thị lúc đăng ký. An toàn khi chạy lại.
-- Chạy SAU KHI bản frontend mới đã lên web (frontend mới tự dùng bucket `avatars`; frontend cũ vẫn
-- ghi vào uploads/avatars và sẽ bị từ chối sau khi chạy file này).

-- ---------------------------------------------------------------------------------------------
-- (A) Bucket `avatars`: công khai để hiện ảnh, tối đa 10MB, chỉ nhận ảnh.
-- Trước đây khách ghi ảnh đại diện vào bucket `uploads`, mà bucket đó cho 50MB và cả video (để
-- admin tải bài hát) → một tài khoản thường có thể tải file lớn liên tục để chiếm dung lượng.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: đọc công khai" on storage.objects;
create policy "avatars: đọc công khai" on storage.objects
    for select to public
    using (bucket_id = 'avatars');

drop policy if exists "avatars: tự tải ảnh của mình" on storage.objects;
create policy "avatars: tự tải ảnh của mình" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: tự xoá ảnh của mình" on storage.objects;
create policy "avatars: tự xoá ảnh của mình" on storage.objects
    for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Khách không còn được ghi vào bucket `uploads` nữa (admin vẫn ghi được nhờ các policy admin).
-- Ảnh đại diện cũ nằm trong uploads/avatars/ vẫn hiển thị bình thường.
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;

-- ---------------------------------------------------------------------------------------------
-- (B) Trang đăng ký hỏi "tên hiển thị này có ai dùng chưa". Khách chưa đăng nhập không đọc được
-- bảng profiles (RLS) nên bước kiểm tra cũ luôn trả rỗng. Hàm này chỉ trả true/false, không lộ
-- thêm thông tin nào. KHÔNG làm hàm tương tự cho email: báo "email đã đăng ký" là lộ tài khoản.
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_display_name_taken(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where lower(btrim(full_name)) = lower(btrim(p_name))
    );
$$;

revoke all on function public.is_display_name_taken(text) from public;
grant execute on function public.is_display_name_taken(text) to anon, authenticated;
