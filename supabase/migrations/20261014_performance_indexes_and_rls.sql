-- Hiệu năng: chỉ mục cho khoá ngoại + bọc auth.uid() trong chính sách RLS --------------------------
-- Dữ liệu hiện còn nhỏ (vài chục dòng) nên chưa thấy chậm ở tầng DB, nhưng hai việc này là khuyến nghị
-- của Supabase advisor và rẻ để làm ngay, đỡ phải nhớ khi dữ liệu lớn dần:
--
-- 1. Chỉ mục cho khoá ngoại hay được lọc theo: purchases/orders/favorites theo user, purchases theo bài,
--    bank_transactions theo đơn. Không có chúng thì mỗi truy vấn "của tôi" và mỗi lần xoá tài khoản
--    phải quét cả bảng.
-- 2. Chính sách RLS gọi auth.uid() trực tiếp bị Postgres tính lại cho TỪNG dòng. Bọc thành
--    (select auth.uid()) để tính một lần cho cả truy vấn. Ý nghĩa của chính sách không đổi.

create index if not exists purchases_user_id_idx on public.purchases (user_id);
create index if not exists purchases_song_id_idx on public.purchases (song_id);
create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists favorites_song_id_idx on public.favorites (song_id);
create index if not exists bank_transactions_order_id_idx on public.bank_transactions (order_id);

do $$
declare
    pol record;
    new_using text;
    new_check text;
begin
    for pol in
        select schemaname, tablename, policyname, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and ((qual ~ 'auth\.uid\(\)' and qual !~* 'select auth\.uid\(\)')
            or (with_check ~ 'auth\.uid\(\)' and with_check !~* 'select auth\.uid\(\)'))
    loop
        new_using := case when pol.qual is null then null
                          else regexp_replace(pol.qual, 'auth\.uid\(\)', '(select auth.uid())', 'g') end;
        new_check := case when pol.with_check is null then null
                          else regexp_replace(pol.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g') end;

        -- format() với tham số NULL ra chuỗi rỗng chứ không phải NULL, nên phải rẽ nhánh bằng CASE.
        execute format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename)
            || case when new_using is not null then format(' using (%s)', new_using) else '' end
            || case when new_check is not null then format(' with check (%s)', new_check) else '' end;
    end loop;
end;
$$;
