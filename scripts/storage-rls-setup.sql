-- Cho phép ai cũng xem được file trong bucket 'uploads' (video/ảnh/audio công khai)
create policy "Public read access - uploads bucket"
on storage.objects for select
using ( bucket_id = 'uploads' );

-- Chỉ tài khoản có role='admin' trong bảng profiles mới được upload file mới
create policy "Admin insert - uploads bucket"
on storage.objects for insert
with check (
  bucket_id = 'uploads'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

-- Chỉ admin mới được cập nhật (ghi đè) file
create policy "Admin update - uploads bucket"
on storage.objects for update
using (
  bucket_id = 'uploads'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

-- Chỉ admin mới được xoá file (khi thay ảnh/video mới hoặc xoá bài hát/gear)
create policy "Admin delete - uploads bucket"
on storage.objects for delete
using (
  bucket_id = 'uploads'
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);
