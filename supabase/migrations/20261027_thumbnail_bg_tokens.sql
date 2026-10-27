-- Nền ảnh bìa bài hát: đổi từ chuỗi hex Tailwind sang tên nền theo bảng màu ----------------------
-- Trước: songs.thumbnail_bg lưu nguyên "from-[#C1602F] to-[#6E3B1F]" (đất nung) hoặc các cặp
-- be/xanh rêu. Sau: lưu tên nền (thumb-walnut / thumb-wine), màu thật nằm ở biến --thumb-* trong
-- src/style.css. Giao diện đã có lớp đệm (src/lib/thumb-theme.js) nên chạy đúng DÙ migration này
-- đã áp dụng hay chưa — migration chỉ làm dữ liệu gọn và khớp với giá trị trang quản trị sẽ ghi.
--
-- Dữ liệu tại thời điểm viết (đã SELECT, 25 hàng):
--   is_free = false : 'from-[#C1602F] to-[#6E3B1F]'  x 3   -> thumb-wine
--   is_free = true  : 22 hàng (14 hàng 'from-[#D8C4AC] to-[#647A6C]' + 8 hàng cặp be khác) -> thumb-walnut
-- Sau khi chạy phải còn 25 hàng, 0 hàng bắt đầu bằng 'from-': 22 hàng thumb-walnut + 3 hàng thumb-wine.
-- Chỉ động vào hàng còn mang giá trị kiểu cũ (bắt đầu bằng 'from-'); hàng đã là tên nền, hoặc
-- NULL, thì giữ nguyên. Chạy lại nhiều lần không đổi thêm gì (idempotent).
--
-- Hoàn tác: giá trị cũ không giữ lại trong bảng. Nếu cần quay về, khôi phục từ bản sao lưu
-- (scripts/backup-data.js) hoặc DATA-EXPORT.json; giao diện vẫn hiển thị đúng khi cột chứa
-- bất kỳ giá trị nào nhờ lớp đệm.

update public.songs
set thumbnail_bg = case when coalesce(is_free, false) then 'thumb-walnut' else 'thumb-wine' end
where thumbnail_bg like 'from-%';
