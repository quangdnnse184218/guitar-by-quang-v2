-- ============================================================================
-- MIGRATION: ghi lại mọi giao dịch ngân hàng + "Tiền về chưa khớp"
-- ============================================================================
-- Chạy trong Supabase SQL Editor (Dashboard → SQL Editor → New query → dán → Run).
-- Chạy lại nhiều lần được. Nên chạy TRƯỚC KHI deploy bản webhook mới, nhưng thứ
-- tự nào cũng an toàn: webhook ghi log không được thì chỉ bỏ qua, không bao giờ
-- làm hỏng việc cấp tab.
--
-- VẤN ĐỀ CẦN GIẢI QUYẾT
--   Webhook SePay trước đây chỉ console.log khi tiền về mà không khớp đơn nào
--   (thiếu mã DH, đơn đã hết hạn, chuyển thiếu tiền...). Không lưu gì vào
--   database, nên admin không có chỗ nào thấy "tiền đã về mà khách chưa nhận
--   tab". Danh sách "đơn chưa hoàn tất" chỉ là đoán mò từ phía đơn hàng.
--
-- GỒM 6 THỨ
--   1. Bảng bank_transactions       mọi giao dịch tiền vào, kèm kết quả khớp
--   2. admin_get_unmatched_transactions()  tiền chưa khớp + đơn gợi ý
--   3. admin_get_recent_transactions()     lịch sử giao dịch gần đây
--   4. admin_resolve_transaction(...)      gán vào đơn / đánh dấu đã xử lý
--   5. admin_grant_access(...)      thêm p_order_id, p_amount; cấp tay "đã nhận
--                                   tiền" mà không có đơn thì TỰ GHI doanh thu
--   6. admin_get_pending_orders()   tự hết hạn đơn chờ quá 3 ngày
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BẢNG GIAO DỊCH NGÂN HÀNG
-- ----------------------------------------------------------------------------
-- status:
--   matched    webhook tự khớp đơn và đã cấp tab
--   unmatched  tiền đã về nhưng KHÔNG khớp được đơn nào → admin cần xử lý
--   assigned   admin đã gán khoản này cho một khách/đơn
--   dismissed  admin xác nhận không cần cấp tab (hoàn tiền, chuyển nhầm...)
--   ignored    giao dịch tiền RA — không liên quan đến bán hàng
-- reason (khi unmatched):
--   no_code | order_not_found | order_already_paid | order_expired | amount_low
create table if not exists public.bank_transactions (
    id uuid primary key default gen_random_uuid(),
    -- Mã giao dịch phía SePay. UNIQUE để cùng một giao dịch bị gửi lại nhiều lần
    -- (retry) chỉ được ghi một dòng. Cho phép NULL (nhiều dòng NULL vẫn hợp lệ).
    external_id text unique,
    direction text not null default 'in' check (direction in ('in', 'out', 'unknown')),
    amount numeric not null default 0,
    content text,
    occurred_at timestamptz,
    received_at timestamptz not null default now(),
    gateway text,
    reference_code text,
    status text not null check (status in ('matched', 'unmatched', 'assigned', 'dismissed', 'ignored')),
    reason text,
    order_id uuid references public.orders(id) on delete set null,
    order_code text,
    resolved_by uuid references auth.users(id) on delete set null,
    resolved_at timestamptz,
    resolved_note text,
    raw jsonb
);

create index if not exists bank_transactions_status_idx
    on public.bank_transactions (status, received_at desc);

alter table public.bank_transactions enable row level security;
-- Không tạo policy nào: chỉ service role (webhook) và các hàm SECURITY DEFINER
-- bên dưới đọc/ghi được. Client thường không thấy dòng nào.
revoke all on public.bank_transactions from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. TIỀN VỀ CHƯA KHỚP + ĐƠN GỢI Ý
-- ----------------------------------------------------------------------------
-- Đơn gợi ý cho mỗi khoản tiền: đơn còn chờ hoặc đã hết hạn (khách trả muộn),
-- CÙNG số tiền hoặc đúng mã đơn ghi trong nội dung, được tạo trước lúc tiền về
-- (tối đa 14 ngày), và khách CHƯA sở hữu bài đó. Xếp: đúng mã trước, rồi đúng
-- số tiền, rồi đơn còn chờ trước đơn đã hết hạn, rồi đơn mới nhất.
create or replace function public.admin_get_unmatched_transactions()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
                    limit 5
                ) c
            ) as candidates
        from public.bank_transactions b
        where b.status = 'unmatched' and b.direction <> 'out'
    ) t;

    return result;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 3. LỊCH SỬ GIAO DỊCH GẦN ĐÂY (60 dòng, bỏ giao dịch tiền ra)
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_recent_transactions()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
        order by b.received_at desc
        limit 60
    ) t;

    return result;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 4. XỬ LÝ MỘT KHOẢN TIỀN CHƯA KHỚP
-- ----------------------------------------------------------------------------
-- 'assign'  gọi SAU KHI đã cấp quyền (Edge Function admin-grant-access làm việc
--           đó rồi mới gọi hàm này). Chỉ đổi trạng thái khoản tiền.
-- 'dismiss' khoản này không cần cấp tab (hoàn tiền, chuyển nhầm...).
-- Chỉ xử lý được khoản đang 'unmatched' — bấm lần hai sẽ báo lỗi thay vì ghi đè.
create or replace function public.admin_resolve_transaction(
    p_transaction_id uuid,
    p_action text,
    p_order_id uuid default null,
    p_note text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_role text;
    v_count int;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền thực hiện thao tác này!';
    end if;

    if p_action not in ('assign', 'dismiss') then
        raise exception 'Hành động không hợp lệ.';
    end if;

    update public.bank_transactions
    set status = case when p_action = 'assign' then 'assigned' else 'dismissed' end,
        order_id = case when p_action = 'assign' then p_order_id else order_id end,
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolved_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_transaction_id and status = 'unmatched';
    get diagnostics v_count = row_count;

    if v_count = 0 then
        raise exception 'Khoản tiền này đã được xử lý trước đó hoặc không tồn tại.';
    end if;

    return json_build_object('success', true);
end;
$function$;

-- ----------------------------------------------------------------------------
-- 5. CẤP QUYỀN THỦ CÔNG: gán đúng đơn + tự ghi doanh thu
-- ----------------------------------------------------------------------------
-- Thêm 2 tham số (đều có mặc định, lời gọi cũ 4 tham số vẫn chạy):
--   p_order_id  đóng đúng đơn này (đang chờ HOẶC đã hết hạn — khách trả muộn)
--               thay vì tự đoán "đơn chờ mới nhất".
--   p_amount    số tiền thực nhận, dùng khi phải TẠO đơn ghi doanh thu.
--
-- Lỗ hổng doanh thu được vá: lý do "đã nhận tiền" (chuyển khoản sai nội dung /
-- thanh toán ngoài SePay) mà khách KHÔNG có đơn nào để đóng thì trước đây doanh
-- thu không được ghi. Giờ hàm tự tạo một đơn đã thanh toán mã "TAY…" với số tiền
-- thực nhận (mặc định là giá bài), nên tiền mặt cũng nằm trong báo cáo.
--
-- Phải DROP bản 4 tham số cũ: nếu chỉ thêm tham số có DEFAULT thì lời gọi 4 tham
-- số khớp cả hai overload và Postgres báo lỗi nhập nhằng.
drop function if exists public.admin_grant_access(uuid, text, text, text);

create or replace function public.admin_grant_access(
    p_user_id uuid,
    p_song_id text,
    p_reason text default 'other',
    p_note text default null,
    p_order_id uuid default null,
    p_amount numeric default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_role text;
    caller_id uuid;
    target_exists boolean;
    already_purchased boolean;
    v_reason text := coalesce(p_reason, 'other');
    v_paid boolean;
    v_order_id uuid;
    v_new_order_status text;
    v_price numeric;
    v_created_code text;
begin
    caller_id := auth.uid();
    select role into caller_role from public.profiles where id = caller_id;
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền thực hiện thao tác này!';
    end if;

    select exists(select 1 from public.profiles where id = p_user_id) into target_exists;
    if not target_exists then
        raise exception 'Không tìm thấy user với mã UUID này, vui lòng kiểm tra lại!';
    end if;

    select exists(
        select 1 from public.purchases where user_id = p_user_id and song_id = p_song_id
    ) into already_purchased;
    if already_purchased then
        raise exception 'User này đã được cấp quyền bài hát này từ trước rồi!';
    end if;

    -- Chỉ tính là "đã thanh toán" khi lý do cho thấy CÓ nhận được tiền; tặng /
    -- đền bù đánh dấu đơn là hết hạn để không thổi phồng doanh thu.
    v_paid := v_reason in ('bank_wrong_note', 'offline_payment');
    v_new_order_status := case when v_paid then 'paid' else 'expired' end;

    if p_order_id is not null then
        select id into v_order_id
        from public.orders
        where id = p_order_id
          and user_id = p_user_id
          and song_id = p_song_id
          and status in ('pending', 'expired');
        if v_order_id is null then
            raise exception 'Đơn hàng đã chọn không khớp với khách và bài hát này, hoặc đã được xử lý rồi.';
        end if;
    else
        select id into v_order_id
        from public.orders
        where user_id = p_user_id and song_id = p_song_id and status = 'pending'
        order by created_at desc
        limit 1;
    end if;

    insert into public.purchases (user_id, song_id, purchased_at, granted_by, grant_reason, grant_note)
    values (p_user_id, p_song_id, now(), caller_id, v_reason, nullif(trim(coalesce(p_note, '')), ''));

    if v_order_id is not null then
        update public.orders
        set status = v_new_order_status,
            paid_at = case when v_new_order_status = 'paid' then now() else paid_at end
        where id = v_order_id;
    elsif v_paid then
        select coalesce(price, 0) into v_price from public.songs where id = p_song_id;
        v_created_code := 'TAY'
            || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDDHH24MISS')
            || substr(md5(random()::text), 1, 3);
        insert into public.orders (order_code, user_id, song_id, amount, status, created_at, paid_at, is_hssv)
        values (v_created_code, p_user_id, p_song_id, coalesce(p_amount, v_price), 'paid', now(), now(), false);
    end if;

    return json_build_object(
        'success', true,
        'message', 'Cấp quyền thành công!',
        'closed_order_id', v_order_id,
        'closed_order_status', case when v_order_id is null then null else v_new_order_status end,
        'created_order_code', v_created_code
    );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 6. TỰ HẾT HẠN ĐƠN CHỜ QUÁ 3 NGÀY
-- ----------------------------------------------------------------------------
-- Trước đây admin phải bấm nút "Dọn đơn cũ". Giờ mỗi lần mở danh sách đơn chờ,
-- đơn quá 3 ngày tự chuyển sang hết hạn (không cần bật pg_cron). Khách trả muộn
-- vẫn xử lý được vì trang Tiền về gợi ý cả đơn đã hết hạn.
create or replace function public.admin_get_pending_orders()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_role text;
    result json;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền truy cập!';
    end if;

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
        order by o.created_at asc
    ) t;

    return coalesce(result, '[]'::json);
end;
$function$;
