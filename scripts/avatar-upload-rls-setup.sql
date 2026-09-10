-- ==============================================================================
-- CHO PHÉP THÀNH VIÊN TỰ UPLOAD ẢNH ĐẠI DIỆN CỦA CHÍNH HỌ
-- ==============================================================================
-- scripts/storage-rls-setup.sql (đã chạy trước đó) chỉ cho phép tài khoản
-- role='admin' insert/update/delete trong bucket `uploads` — dùng cho admin
-- upload video/ảnh bài hát & gear. Tính năng đổi ảnh đại diện ở Trang Của Tôi
-- (user-dashboard.js) cần MỌI thành viên đã đăng nhập được phép tự upload,
-- nhưng chỉ trong đúng thư mục avatar CỦA CHÍNH HỌ — không được đụng vào file
-- của người khác hay các thư mục songs/gears.
--
-- Ảnh đại diện được lưu theo đường dẫn: uploads/avatars/<user_id>/avatar-<ts>.<ext>
-- nên policy dưới đây so khớp segment thứ 2 của đường dẫn (storage.foldername)
-- với chính auth.uid() của người gọi.
--
-- Chạy file này 1 lần trong Supabase Dashboard > SQL Editor.
-- ==============================================================================

create policy "Users can upload their own avatar"
on storage.objects for insert
with check (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Users can update their own avatar"
on storage.objects for update
using (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "Users can delete their own avatar"
on storage.objects for delete
using (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);
