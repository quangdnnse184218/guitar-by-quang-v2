-- Loại dữ liệu THỬ của tài khoản admin khỏi các số liệu/danh sách quản trị.
-- Chạy trong Supabase SQL Editor (một lần). An toàn khi chạy lại (CREATE OR REPLACE).
--
-- Tài khoản admin chỉ dùng để thử luồng mua/thanh toán, nên đơn, lượt mở khoá, thu hồi và
-- giao dịch gắn với tài khoản có role 'admin' KHÔNG được tính vào: đơn chờ, Tổng quan (doanh
-- thu, số đơn, số thành viên, bán chạy…), lịch sử mở khoá/thu hồi và trang Tiền về.
--
-- KHÔNG đổi: danh sách Thành viên và ô tìm khách ở Cấp quyền vẫn có tài khoản admin để bạn
-- còn tự thử cấp/thu hồi quyền; và dữ liệu thật trong bảng không bị xoá hay sửa gì — chỉ là
-- các hàm quản trị bỏ qua dòng của admin khi thống kê.
-- Mẫu điều kiện dùng ở mọi nơi:  not exists (select 1 from public.profiles _a where _a.id = X.user_id and _a.role = 'admin')

-- 1. Đơn chờ thanh toán --------------------------------------------------------------------
create or replace function public.admin_get_pending_orders()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
    result json;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền truy cập!';
    end if;

    -- Vẫn tự đóng đơn quá 3 ngày cho MỌI tài khoản (kể cả admin) để không tồn đọng.
    update public.orders
    set status = 'expired'
    where status = 'pending' and created_at < now() - interval '3 days';

    select json_agg(row_to_json(t)) into result
    from (
        select
            o.id,
            o.order_code,
            o.user_id,
            o.song_id,
            o.amount,
            o.created_at,
            o.is_hssv,
            o.hssv_status,
            coalesce(pr.email, '') as user_email,
            coalesce(pr.full_name, 'Khách vãng lai') as user_name,
            coalesce(s.title, o.song_id) as song_title,
            exists(
                select 1 from public.purchases pu
                where pu.user_id = o.user_id and pu.song_id = o.song_id
            ) as already_owns,
            round(extract(epoch from (now() - o.created_at)) / 60)::int as age_minutes
        from public.orders o
        left join public.profiles pr on o.user_id = pr.id
        left join public.songs s on o.song_id = s.id
        where o.status = 'pending'
          and not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin')
        order by o.created_at asc
    ) t;

    return coalesce(result, '[]'::json);
end;
$$;

-- 2. Tổng quan ----------------------------------------------------------------------------
create or replace function public.admin_get_overview_stats()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
    result json;
    v_now_local timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
    v_today date := v_now_local::date;
    v_month_start date := date_trunc('month', v_now_local)::date;
    v_prev_month_start date := (date_trunc('month', v_now_local) - interval '1 month')::date;
    v_day_of_month int := extract(day from v_now_local)::int;
    -- Cùng số ngày đã trôi qua của tháng trước, không vượt quá đầu tháng này
    -- (ví dụ hôm nay 31 mà tháng trước chỉ có 30 ngày).
    v_prev_same_end date;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền truy cập!';
    end if;

    v_prev_same_end := least(v_prev_month_start + v_day_of_month, v_month_start);

    with paid as (
        select o.amount,
               o.song_id,
               (o.paid_at at time zone 'Asia/Ho_Chi_Minh')::date as d
        from public.orders o
        where o.status = 'paid' and o.paid_at is not null
          and not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin')
    )
    select json_build_object(
        -- ---- các khoá cũ (giữ nguyên tên) ----
        'revenue_today', (select coalesce(sum(amount), 0) from paid where d = v_today),
        'revenue_month', (select coalesce(sum(amount), 0) from paid where d >= v_month_start),
        'revenue_total', (
            select coalesce(sum(o.amount), 0) from public.orders o
            where o.status = 'paid'
              and not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin')
        ),
        'orders_paid_total', (
            select count(*) from public.orders o
            where o.status = 'paid'
              and not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin')
        ),
        'orders_paid_month', (select count(*) from paid where d >= v_month_start),
        'orders_pending_total', (
            select count(*) from public.orders o
            where o.status = 'pending'
              and not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin')
        ),
        'orders_pending_recent', (
            select count(*) from public.orders o
            where o.status = 'pending' and o.created_at >= now() - interval '24 hours'
              and not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin')
        ),
        'users_total', (select count(*) from public.profiles where role is distinct from 'admin'),
        'users_new_week', (
            select count(*) from public.profiles
            where role is distinct from 'admin' and created_at >= now() - interval '7 days'
        ),
        'songs_total', (select count(*) from public.songs),
        'songs_paid', (select count(*) from public.songs where is_free is not true),
        'grants_manual_total', (
            select count(*) from public.purchases pu
            where pu.granted_by is not null
              and not exists (select 1 from public.profiles _a where _a.id = pu.user_id and _a.role = 'admin')
        ),
        'purchases_total', (
            select count(*) from public.purchases pu
            where not exists (select 1 from public.profiles _a where _a.id = pu.user_id and _a.role = 'admin')
        ),

        -- ---- khoá mới ----
        'revenue_yesterday', (select coalesce(sum(amount), 0) from paid where d = v_today - 1),
        'revenue_prev_month_to_date', (
            select coalesce(sum(amount), 0) from paid
            where d >= v_prev_month_start and d < v_prev_same_end
        ),
        'orders_paid_prev_month_to_date', (
            select count(*) from paid where d >= v_prev_month_start and d < v_prev_same_end
        ),
        'users_new_month', (
            select count(*) from public.profiles
            where role is distinct from 'admin' and created_at >= now() - interval '30 days'
        ),
        'paid_songs_missing_drive', (
            select count(*) from public.songs
            where is_free is not true and coalesce(trim(target_url), '') = ''
        ),
        'revocations_drive_failed_30d', (
            select count(*) from public.access_revocations r
            where r.drive_removed = false and r.revoked_at >= now() - interval '30 days'
              and not exists (select 1 from public.profiles _a where _a.id = r.user_id and _a.role = 'admin')
        ),

        'top_songs', (
            select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
                select coalesce(s.title, pu.song_id) as song_title,
                       count(*) as sold_count,
                       coalesce((select sum(p.amount) from paid p where p.song_id = pu.song_id), 0) as revenue
                from public.purchases pu
                left join public.songs s on s.id = pu.song_id
                where not exists (select 1 from public.profiles _a where _a.id = pu.user_id and _a.role = 'admin')
                group by pu.song_id, s.title
                order by count(*) desc, revenue desc
                limit 5
            ) t
        ),

        -- 7 ngày giữ lại cho giao diện cũ; giao diện mới dùng 30 ngày.
        'revenue_last_7_days', (
            select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from (
                select g::date as day,
                       to_char(g::date, 'DD/MM') as label,
                       coalesce((select sum(p.amount) from paid p where p.d = g::date), 0) as revenue
                from generate_series((v_today - 6)::timestamp, v_today::timestamp, interval '1 day') g
            ) d
        ),
        'revenue_last_30_days', (
            select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from (
                select g::date as day,
                       to_char(g::date, 'DD/MM') as label,
                       coalesce((select sum(p.amount) from paid p where p.d = g::date), 0) as revenue,
                       (select count(*) from paid p where p.d = g::date) as orders
                from generate_series((v_today - 29)::timestamp, v_today::timestamp, interval '1 day') g
            ) d
        )
    ) into result;

    return result;
end;
$$;

-- 3. Lịch sử mở khoá -----------------------------------------------------------------------
create or replace function public.admin_get_recent_purchases()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
    result json;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền truy cập!';
    end if;

    select json_agg(row_to_json(t)) into result
    from (
        select
            pu.id,
            pu.user_id,
            coalesce(pr.email, 'Chưa có email') as user_email,
            coalesce(pr.full_name, 'Khách vãng lai') as user_name,
            pu.song_id,
            coalesce(s.title, pu.song_id) as song_title,
            pu.purchased_at,
            pu.granted_by,
            pu.grant_reason,
            pu.grant_note,
            (pu.granted_by is not null) as is_manual,
            coalesce(ad.full_name, ad.email, '') as granted_by_name
        from public.purchases pu
        left join public.profiles pr on pu.user_id = pr.id
        left join public.songs s on pu.song_id = s.id
        left join public.profiles ad on pu.granted_by = ad.id
        where not exists (select 1 from public.profiles _a where _a.id = pu.user_id and _a.role = 'admin')
        order by pu.purchased_at desc
        limit 50
    ) t;

    return coalesce(result, '[]'::json);
end;
$$;

-- 4. Lịch sử thu hồi -----------------------------------------------------------------------
create or replace function public.admin_get_recent_revocations()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
    result json;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền truy cập!';
    end if;

    select coalesce(json_agg(row_to_json(t) order by t.revoked_at desc), '[]'::json)
    into result
    from (
        select r.id,
               r.user_id,
               r.song_id,
               coalesce(p.full_name, 'Học viên') as user_name,
               p.email as user_email,
               coalesce(s.title, r.song_id) as song_title,
               r.revoked_at,
               r.reason,
               r.note,
               r.drive_removed,
               rp.full_name as revoked_by_name
        from public.access_revocations r
        left join public.profiles p on p.id = r.user_id
        left join public.songs s on s.id = r.song_id
        left join public.profiles rp on rp.id = r.revoked_by
        where not exists (select 1 from public.profiles _a where _a.id = r.user_id and _a.role = 'admin')
        order by r.revoked_at desc
        limit 100
    ) t;

    return result;
end;
$$;

-- 5. Tiền về: giao dịch gần đây -------------------------------------------------------------
create or replace function public.admin_get_recent_transactions()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
    result json;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền truy cập!';
    end if;

    select coalesce(json_agg(row_to_json(t) order by t.received_at desc), '[]'::json)
    into result
    from (
        select
            b.id,
            b.amount,
            b.content,
            b.status,
            b.reason,
            b.occurred_at,
            b.received_at,
            b.order_code,
            b.resolved_note,
            b.resolved_at,
            coalesce(pr.full_name, '') as user_name,
            coalesce(pr.email, '') as user_email,
            coalesce(s.title, '') as song_title,
            rp.full_name as resolved_by_name
        from public.bank_transactions b
        left join public.orders o on o.id = b.order_id
        left join public.profiles pr on pr.id = o.user_id
        left join public.songs s on s.id = o.song_id
        left join public.profiles rp on rp.id = b.resolved_by
        where b.direction <> 'out' and b.status <> 'ignored'
          and (o.user_id is null
               or not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin'))
        order by b.received_at desc
        limit 60
    ) t;

    return result;
end;
$$;

-- 6. Tiền về: chưa khớp đơn --------------------------------------------------------------
create or replace function public.admin_get_unmatched_transactions()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
    result json;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền truy cập!';
    end if;

    select coalesce(json_agg(row_to_json(t) order by t.received_at desc), '[]'::json)
    into result
    from (
        select
            b.id,
            b.amount,
            b.content,
            b.occurred_at,
            b.received_at,
            b.gateway,
            b.reference_code,
            b.reason,
            b.order_code,
            (
                select coalesce(json_agg(row_to_json(c) order by c.rank_key), '[]'::json)
                from (
                    select
                        row_number() over (
                            order by coalesce(o.order_code = b.order_code, false) desc,
                                     (o.amount = b.amount) desc,
                                     (o.status = 'pending') desc,
                                     o.created_at desc
                        ) as rank_key,
                        o.id as order_id,
                        o.order_code,
                        o.user_id,
                        o.song_id,
                        o.amount,
                        o.status,
                        o.created_at,
                        o.is_hssv,
                        coalesce(pr.full_name, 'Khách vãng lai') as user_name,
                        coalesce(pr.email, '') as user_email,
                        coalesce(s.title, o.song_id) as song_title,
                        coalesce(o.order_code = b.order_code, false) as code_match,
                        (o.amount = b.amount) as amount_match
                    from public.orders o
                    left join public.profiles pr on pr.id = o.user_id
                    left join public.songs s on s.id = o.song_id
                    where o.status in ('pending', 'expired')
                      and (o.order_code = b.order_code or o.amount = b.amount)
                      and o.created_at <= coalesce(b.occurred_at, b.received_at) + interval '5 minutes'
                      and o.created_at >= coalesce(b.occurred_at, b.received_at) - interval '14 days'
                      and not exists (
                          select 1 from public.purchases pu
                          where pu.user_id = o.user_id and pu.song_id = o.song_id
                      )
                      -- đơn thử của tài khoản admin không phải ứng viên để gán tiền
                      and not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin')
                    limit 5
                ) c
            ) as candidates
        from public.bank_transactions b
        where b.status = 'unmatched' and b.direction <> 'out'
          -- khoản tiền gắn với đơn của tài khoản admin (thử) cũng không hiện
          and not exists (
              select 1 from public.orders ao
              join public.profiles ap on ap.id = ao.user_id
              where ao.id = b.order_id and ap.role = 'admin'
          )
    ) t;

    return result;
end;
$$;

-- Quyền gọi giữ nguyên (CREATE OR REPLACE không đổi quyền). Kiểm tra sau khi chạy: đăng nhập admin,
-- mục Đơn chờ chỉ còn đơn của khách thật; Tổng quan không còn tính đơn/thành viên/tab của admin.
