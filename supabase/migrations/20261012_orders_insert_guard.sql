-- 2026-10-12 — Siết policy tạo đơn: khách chỉ được tạo đơn Ở TRẠNG THÁI BAN ĐẦU.
--
-- Policy cũ "users insert own orders" chỉ kiểm tra đúng chủ đơn và đúng giá bài:
--     auth.uid() = user_id AND amount = songs.price
-- nên một tài khoản thường có thể gọi thẳng API để chèn đơn với status = 'paid' (kèm paid_at),
-- hoặc is_hssv / hssv_status tự đặt. Việc đó KHÔNG mở được tab (quyền xem nằm ở bảng purchases,
-- khách không ghi được), nhưng làm bẩn số liệu: doanh thu ở Tổng quan đếm theo đơn 'paid'.
--
-- Bản mới buộc mọi đơn do khách tạo phải là đơn chờ thanh toán "sạch". Luồng thật không đổi:
-- checkout-order.js chỉ gửi order_code, user_id, song_id, amount; các cột còn lại lấy mặc định.
-- Webhook SePay, Edge Function và RPC admin dùng service role / SECURITY DEFINER nên không bị
-- policy này ràng buộc.
-- An toàn khi chạy lại.

drop policy if exists "users insert own orders" on public.orders;

create policy "users insert own orders"
    on public.orders
    for insert
    to authenticated
    with check (
        auth.uid() = user_id
        and amount = (select s.price from public.songs s where s.id = orders.song_id)::numeric
        and status = 'pending'
        and paid_at is null
        and coalesce(is_hssv, false) = false
        and hssv_status is null
        and hssv_image_path is null
    );
