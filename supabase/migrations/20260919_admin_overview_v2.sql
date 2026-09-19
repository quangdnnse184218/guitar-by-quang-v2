-- ============================================================================
-- MIGRATION: số liệu Tổng quan v2
-- ============================================================================
-- Chạy trong Supabase SQL Editor (Dashboard → SQL Editor → New query → dán → Run).
-- Chạy lại nhiều lần được. Yêu cầu đã chạy file 20260919_admin_user_detail_and_
-- revoke_audit.sql trước (dùng bảng access_revocations).
--
-- Thay hàm admin_get_overview_stats(): giữ NGUYÊN mọi khoá cũ, chỉ THÊM khoá
-- mới để trang Tổng quan có thể so sánh với kỳ trước và cảnh báo việc cần xử lý:
--   revenue_yesterday               doanh thu hôm qua
--   revenue_prev_month_to_date      doanh thu tháng trước, tính đến đúng ngày
--                                   này của tháng (so sánh công bằng: 19 ngày
--                                   đầu tháng này với 19 ngày đầu tháng trước)
--   orders_paid_prev_month_to_date  số đơn đã trả, cùng kỳ tháng trước
--   users_new_month                 thành viên mới 30 ngày qua
--   revenue_last_30_days            doanh thu + số đơn từng ngày, 30 ngày gần nhất
--   top_songs[].revenue             doanh thu của từng bài bán chạy
--   paid_songs_missing_drive        số bài có phí CHƯA có link Drive (khách mua
--                                   xong sẽ không nhận được file)
--   revocations_drive_failed_30d    số lượt thu hồi 30 ngày qua chưa gỡ được Drive
--
-- Đơn chờ xử lý KHÔNG tính ở đây: giao diện lấy từ admin_get_pending_orders để
-- loại các đơn của khách đã sở hữu tab đó.
-- ============================================================================

create or replace function public.admin_get_overview_stats()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    )
    select json_build_object(
        -- ---- các khoá cũ (giữ nguyên) ----
        'revenue_today', (select coalesce(sum(amount), 0) from paid where d = v_today),
        'revenue_month', (select coalesce(sum(amount), 0) from paid where d >= v_month_start),
        'revenue_total', (select coalesce(sum(amount), 0) from public.orders where status = 'paid'),
        'orders_paid_total', (select count(*) from public.orders where status = 'paid'),
        'orders_paid_month', (select count(*) from paid where d >= v_month_start),
        'orders_pending_total', (select count(*) from public.orders where status = 'pending'),
        'orders_pending_recent', (
            select count(*) from public.orders
            where status = 'pending' and created_at >= now() - interval '24 hours'
        ),
        'users_total', (select count(*) from public.profiles),
        'users_new_week', (
            select count(*) from public.profiles where created_at >= now() - interval '7 days'
        ),
        'songs_total', (select count(*) from public.songs),
        'songs_paid', (select count(*) from public.songs where is_free is not true),
        'grants_manual_total', (select count(*) from public.purchases where granted_by is not null),
        'purchases_total', (select count(*) from public.purchases),

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
            select count(*) from public.profiles where created_at >= now() - interval '30 days'
        ),
        'paid_songs_missing_drive', (
            select count(*) from public.songs
            where is_free is not true and coalesce(trim(target_url), '') = ''
        ),
        'revocations_drive_failed_30d', (
            select count(*) from public.access_revocations
            where drive_removed = false and revoked_at >= now() - interval '30 days'
        ),

        'top_songs', (
            select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
                select coalesce(s.title, pu.song_id) as song_title,
                       count(*) as sold_count,
                       coalesce((select sum(p.amount) from paid p where p.song_id = pu.song_id), 0) as revenue
                from public.purchases pu
                left join public.songs s on s.id = pu.song_id
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
$function$;
