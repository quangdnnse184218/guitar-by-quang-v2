-- 2026-10-12 — Khoá việc khách tự CHÈN dòng vào bảng profiles.
--
-- Hiện trạng: policy "Users can insert their own profile" chỉ kiểm tra auth.uid() = id, và vai trò
-- authenticated có quyền INSERT trên MỌI cột của profiles, kể cả `role` và `is_admin`. Bình thường
-- không khai thác được vì mỗi tài khoản đã có sẵn một dòng profiles (trigger handle_new_user tạo lúc
-- đăng ký) nên chèn thêm sẽ trùng khoá chính; và UPDATE thì đã bị khoá ở mức cột (chỉ full_name,
-- avatar_url, zalo).
--
-- Kẽ hở: nếu vì lý do nào đó một tài khoản đăng nhập được mà KHÔNG có dòng profiles (dòng bị xoá tay,
-- trigger lỗi, xoá dở tài khoản thử…), người đó gọi thẳng API chèn dòng của chính mình với
-- role = 'admin' là thành quản trị viên. Kiểm tra 2026-10-12: hiện không có tài khoản nào như vậy.
--
-- Vá: không ai ngoài hệ thống được chèn vào profiles. Trang web không hề chèn (chỉ đọc và cập nhật);
-- dòng profiles vẫn do trigger handle_new_user (SECURITY DEFINER) tạo khi đăng ký nên luồng đăng ký
-- không đổi. An toàn khi chạy lại.

drop policy if exists "Users can insert their own profile" on public.profiles;

revoke insert on public.profiles from anon, authenticated;

-- Vai trò anon không bao giờ cần sửa hồ sơ; authenticated giữ nguyên quyền sửa 3 cột như cũ.
revoke update on public.profiles from anon;
