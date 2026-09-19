-- ============================================================================
-- MIGRATION: chi tiết thành viên + nhật ký thu hồi quyền
-- ============================================================================
-- Chạy toàn bộ file này trong Supabase SQL Editor (Dashboard → SQL Editor →
-- New query → dán → Run). Script viết theo kiểu chạy lại được nhiều lần
-- (idempotent), không làm mất dữ liệu đang có.
--
-- Cung cấp 3 thứ cho bảng quản trị:
--   1. public.access_revocations  — lưu lại mọi lần admin thu hồi quyền xem tab
--   2. admin_revoke_access(...)   — thêm lý do/ghi chú, trả dữ liệu để Edge
--                                   Function gỡ luôn quyền Google Drive
--   3. admin_get_user_detail(...) — toàn bộ thông tin của 1 thành viên trong
--                                   đúng 1 lần gọi (cho trang chi tiết user)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BẢNG NHẬT KÝ THU HỒI QUYỀN
-- ----------------------------------------------------------------------------
-- Trước đây admin_revoke_access chỉ DELETE khỏi purchases: sau khi thu hồi
-- không còn dấu vết nào về việc ai thu hồi, khi nào, vì sao. Khi thu hồi đồng
-- thời gỡ luôn quyền Google Drive thì thao tác này ảnh hưởng thật tới khách,
-- nên phải lưu lại lịch sử.
-- ----------------------------------------------------------------------------
create table if not exists public.access_revocations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    song_id text not null,
    revoked_by uuid,
    revoked_at timestamptz not null default now(),
    reason text,
    note text,
    drive_removed boolean
);

create index if not exists access_revocations_user_idx on public.access_revocations (user_id);
create index if not exists access_revocations_time_idx on public.access_revocations (revoked_at desc);

alter table public.access_revocations enable row level security;

-- Cố tình KHÔNG tạo policy nào: bảng chỉ được đọc/ghi qua các hàm
-- SECURITY DEFINER (admin_*) và service role trong Edge Function. RLS bật mà
-- không có policy = client thường không đọc được dòng nào.
revoke all on public.access_revocations from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. THU HỒI QUYỀN — thêm lý do/ghi chú + trả dữ liệu để gỡ quyền Drive
-- ----------------------------------------------------------------------------
-- Phải DROP bản cũ trước: nếu chỉ thêm tham số có DEFAULT thì lời gọi 2 tham
-- số sẽ khớp cả hai overload và Postgres báo lỗi nhập nhằng.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_revoke_access(uuid, text);

create or replace function public.admin_revoke_access(
    p_user_id uuid,
    p_song_id text,
    p_reason text default null,
    p_note text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    caller_role text;
    v_deleted int;
    v_audit_id uuid;
    v_email text;
    v_target_url text;
    v_song_title text;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền thực hiện thao tác này!';
    end if;

    delete from public.purchases where user_id = p_user_id and song_id = p_song_id;
    get diagnostics v_deleted = row_count;

    if v_deleted = 0 then
        raise exception 'Không tìm thấy quyền nào của user này với bài hát đó để thu hồi.';
    end if;

    insert into public.access_revocations (user_id, song_id, revoked_by, reason, note)
    values (p_user_id, p_song_id, auth.uid(), nullif(p_reason, ''), nullif(p_note, ''))
    returning id into v_audit_id;

    select email into v_email from public.profiles where id = p_user_id;
    select title, target_url into v_song_title, v_target_url
    from public.songs where id = p_song_id;

    -- target_url + email trả về để Edge Function gỡ quyền xem file Drive của
    -- đúng email đó, không phải truy vấn lại bằng service role.
    return json_build_object(
        'success', true,
        'deleted', v_deleted,
        'audit_id', v_audit_id,
        'user_email', v_email,
        'song_title', v_song_title,
        'song_target_url', v_target_url
    );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 3. ĐÁNH DẤU ĐÃ GỠ QUYỀN DRIVE CHO MỘT LƯỢT THU HỒI
-- ----------------------------------------------------------------------------
-- Edge Function gọi hàm này sau khi Apps Script phản hồi, để nhật ký ghi rõ
-- lượt thu hồi đó có gỡ được Drive hay không — khi thất bại admin còn biết là
-- phải vào Drive bỏ chia sẻ tay.
-- ----------------------------------------------------------------------------
create or replace function public.admin_mark_revocation_drive(
    p_audit_id uuid,
    p_drive_removed boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    update public.access_revocations
    set drive_removed = p_drive_removed
    where id = p_audit_id;
end;
$function$;

revoke all on function public.admin_mark_revocation_drive(uuid, boolean) from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. CHI TIẾT MỘT THÀNH VIÊN
-- ----------------------------------------------------------------------------
-- Gom toàn bộ thông tin admin cần khi bấm vào một thành viên vào đúng 1 lần
-- gọi: hồ sơ, số liệu tổng, danh sách tab đang sở hữu (kèm nguồn: tự động hay
-- admin cấp tay), lịch sử đơn hàng, danh sách yêu thích, các lần bị thu hồi.
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_user_detail(p_user_id uuid)
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
        raise exception 'Bạn không có quyền xem chi tiết thành viên!';
    end if;

    select json_build_object(
        'profile', (
            select json_build_object(
                'id', p.id,
                'email', coalesce(p.email, ''),
                'full_name', coalesce(p.full_name, 'Học viên Guitar'),
                'avatar_url', coalesce(p.avatar_url, ''),
                'role', coalesce(p.role, 'user'),
                'created_at', p.created_at,
                'last_sign_in_at', au.last_sign_in_at,
                'email_confirmed_at', au.email_confirmed_at
            )
            from public.profiles p
            left join auth.users au on au.id = p.id
            where p.id = p_user_id
        ),
        'stats', json_build_object(
            'purchases_count', (select count(*) from public.purchases where user_id = p_user_id),
            'favorites_count', (select count(*) from public.favorites where user_id = p_user_id),
            'orders_total', (select count(*) from public.orders where user_id = p_user_id),
            'orders_paid', (select count(*) from public.orders where user_id = p_user_id and status = 'paid'),
            'orders_pending', (select count(*) from public.orders where user_id = p_user_id and status = 'pending'),
            'total_spent', (select coalesce(sum(amount), 0) from public.orders where user_id = p_user_id and status = 'paid'),
            'manual_grants', (select count(*) from public.purchases where user_id = p_user_id and granted_by is not null),
            'revocations_count', (select count(*) from public.access_revocations where user_id = p_user_id)
        ),
        'purchases', (
            select coalesce(json_agg(row_to_json(t) order by t.purchased_at desc), '[]'::json) from (
                select pu.song_id,
                       coalesce(s.title, pu.song_id) as song_title,
                       s.singer,
                       s.price,
                       s.is_free,
                       (s.target_url is not null and s.target_url <> '') as has_drive_link,
                       pu.purchased_at,
                       (pu.granted_by is not null) as is_manual,
                       pu.grant_reason,
                       pu.grant_note,
                       gp.full_name as granted_by_name
                from public.purchases pu
                left join public.songs s on s.id = pu.song_id
                left join public.profiles gp on gp.id = pu.granted_by
                where pu.user_id = p_user_id
            ) t
        ),
        'orders', (
            select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
                select o.order_code,
                       o.song_id,
                       coalesce(s.title, o.song_id) as song_title,
                       o.amount,
                       o.status,
                       o.created_at,
                       o.paid_at,
                       o.is_hssv,
                       o.hssv_status
                from public.orders o
                left join public.songs s on s.id = o.song_id
                where o.user_id = p_user_id
                order by o.created_at desc
                limit 50
            ) t
        ),
        'favorites', (
            select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
                select f.song_id,
                       coalesce(s.title, f.song_id) as song_title,
                       s.is_free,
                       f.created_at
                from public.favorites f
                left join public.songs s on s.id = f.song_id
                where f.user_id = p_user_id
            ) t
        ),
        'revocations', (
            select coalesce(json_agg(row_to_json(t) order by t.revoked_at desc), '[]'::json) from (
                select r.song_id,
                       coalesce(s.title, r.song_id) as song_title,
                       r.revoked_at,
                       r.reason,
                       r.note,
                       r.drive_removed,
                       rp.full_name as revoked_by_name
                from public.access_revocations r
                left join public.songs s on s.id = r.song_id
                left join public.profiles rp on rp.id = r.revoked_by
                where r.user_id = p_user_id
            ) t
        )
    ) into result;

    if result is null or (result -> 'profile') is null then
        raise exception 'Không tìm thấy thành viên này.';
    end if;

    return result;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 5. LỊCH SỬ THU HỒI GẦN ĐÂY (cho trang Lịch sử của admin)
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_recent_revocations()
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
        order by r.revoked_at desc
        limit 100
    ) t;

    return result;
end;
$function$;
