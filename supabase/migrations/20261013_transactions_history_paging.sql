-- Tiền về: xem toàn bộ lịch sử, lật trang -----------------------------------------------------
-- Hàm cũ admin_get_recent_transactions() chỉ trả 60 dòng gần nhất và được giữ nguyên để bản
-- giao diện đang chạy không bị gãy. Hàm mới này cho phép lật từng trang qua hết lịch sử.
create or replace function public.admin_get_transactions_page(p_limit integer default 50, p_offset integer default 0)
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
        limit p_limit offset p_offset
    ) t;

    return result;
end;
$$;

revoke execute on function public.admin_get_transactions_page(integer, integer) from public, anon;
grant execute on function public.admin_get_transactions_page(integer, integer) to authenticated, service_role;
