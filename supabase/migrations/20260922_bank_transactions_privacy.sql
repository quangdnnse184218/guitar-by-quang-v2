-- Dọn dữ liệu tài chính cá nhân đã lỡ lưu trong bank_transactions.
-- Chạy trong Supabase SQL Editor (một lần). An toàn khi chạy lại.
--
-- Từ 2026-09-22 webhook sepay-ipn BỎ QUA hoàn toàn tiền vào không có mã đơn DH… (bạn bè chuyển
-- tiền cá nhân…) và tiền ra, và không còn lưu số dư / số tài khoản. Dữ liệu CŨ lưu trước đó thì
-- vẫn còn: file này xoá nó đi.

-- 1. Xoá các khoản "không có mã đơn" (không liên quan tới bán tab) — hiện là tiền cá nhân.
--    Khoản có mã đơn (order_not_found, order_expired, amount_low…) và khoản đã khớp được GIỮ.
delete from public.bank_transactions
where reason = 'no_code'
   or direction = 'out';

-- 2. Với các dòng còn lại: bỏ số dư tài khoản, số tài khoản và tài khoản ảo khỏi bản sao payload gốc.
update public.bank_transactions
set raw = raw - 'accumulated' - 'accountNumber' - 'subAccount'
where raw ?| array['accumulated', 'accountNumber', 'subAccount'];

-- Kiểm tra sau khi chạy (mong đợi 0 và 0):
--   select count(*) from public.bank_transactions where reason = 'no_code' or direction = 'out';
--   select count(*) from public.bank_transactions where raw ?| array['accumulated', 'accountNumber', 'subAccount'];
