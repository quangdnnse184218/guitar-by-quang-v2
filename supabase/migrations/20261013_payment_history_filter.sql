-- Tiền về: lịch sử đầy đủ, có lọc theo thời gian ------------------------------------------------
-- Gộp hai nguồn: (1) giao dịch ngân hàng webhook đã ghi, (2) đơn đã thanh toán từ trước khi bảng
-- bank_transactions ra đời (không có dòng ngân hàng đi kèm). Trả kèm tổng số khoản và tổng tiền
-- của cả khoảng lọc để giao diện hiện con số, không chỉ trang đang xem.
-- Các hàm admin_get_recent_transactions / admin_get_transactions_page được giữ nguyên.
create or replace function public.admin_get_payment_history(
    p_limit integer default 50,
    p_offset integer default 0,
    p_since timestamptz default null
)
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

    p_limit := least(greatest(coalesce(p_limit, 50), 1), 200);
    p_offset := greatest(coalesce(p_offset, 0), 0);

    with bank as (
        select
            b.id::text as id,
            b.amount::numeric as amount,
            b.content,
            b.status,
            b.reason,
            b.occurred_at,
            b.received_at,
            coalesce(b.occurred_at, b.received_at) as happened_at,
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
    ),
    legacy as (
        select
            o.id::text as id,
            o.amount::numeric as amount,
            null::text as content,
            'legacy'::text as status,
            null::text as reason,
            o.paid_at as occurred_at,
            o.paid_at as received_at,
            o.paid_at as happened_at,
            o.order_code,
            null::text as resolved_note,
            null::timestamptz as resolved_at,
            coalesce(pr.full_name, '') as user_name,
            coalesce(pr.email, '') as user_email,
            coalesce(s.title, '') as song_title,
            null::text as resolved_by_name
        from public.orders o
        left join public.profiles pr on pr.id = o.user_id
        left join public.songs s on s.id = o.song_id
        where o.status = 'paid'
          and o.paid_at is not null
          and not exists (select 1 from public.bank_transactions b where b.order_id = o.id)
          and not exists (select 1 from public.profiles _a where _a.id = o.user_id and _a.role = 'admin')
    ),
    allrows as (
        select * from bank
        union all
        select * from legacy
    ),
    filtered as (
        select * from allrows
        where p_since is null or happened_at >= p_since
    )
    select json_build_object(
        'total_count', (select count(*) from filtered),
        'total_amount', (select coalesce(sum(amount), 0) from filtered),
        'rows', coalesce((
            select json_agg(row_to_json(t) order by t.happened_at desc)
            from (
                select id, amount, content, status, reason, occurred_at, received_at, order_code,
                       resolved_note, resolved_at, user_name, user_email, song_title,
                       resolved_by_name, happened_at
                from filtered
                order by happened_at desc nulls last
                limit p_limit offset p_offset
            ) t
        ), '[]'::json)
    )
    into result;

    return result;
end;
$$;

revoke execute on function public.admin_get_payment_history(integer, integer, timestamptz) from public, anon;
grant execute on function public.admin_get_payment_history(integer, integer, timestamptz) to authenticated, service_role;
