-- Giảm giá HSSV v2: lưu kết quả AI đọc thẻ, cho admin duyệt lại, tự xoá ảnh.
--
-- Chạy trong Supabase SQL Editor (một lần). An toàn khi chạy lại.
-- Gồm:
--   1. profiles.zalo (khách tự điền, chỉ để liên lạc)
--   2. bảng hssv_verifications (kết quả đọc thẻ, cờ cảnh báo, mốc xoá ảnh)
--   3. quyền cho admin xem ảnh trong bucket riêng "hssv-cards"
--   4. RPC: admin_get_hssv_reviews, admin_review_hssv, admin_count_hssv_pending
--   5. admin_get_user_detail trả thêm zalo
--   6. lịch chạy hàm dọn ảnh mỗi ngày (pg_cron + pg_net)

-- 1. Zalo ---------------------------------------------------------------
alter table public.profiles add column if not exists zalo text;

alter table public.profiles drop constraint if exists profiles_zalo_len;
alter table public.profiles add constraint profiles_zalo_len check (zalo is null or char_length(zalo) <= 200);

-- Tài khoản thường chỉ được sửa full_name, avatar_url; thêm đúng cột zalo.
grant update (zalo) on public.profiles to authenticated;

-- 2. Bảng kết quả xác minh ---------------------------------------------
create table if not exists public.hssv_verifications (
    id               uuid primary key default gen_random_uuid(),
    order_id         uuid references public.orders(id) on delete set null,
    user_id          uuid not null references auth.users(id) on delete cascade,
    status           text not null default 'pending'
                     check (status in ('approved', 'pending', 'rejected', 'revoked')),
    flags            text[] not null default '{}',
    ai_reason        text,
    extracted_name   text,
    extracted_school text,
    extracted_id     text,
    extracted_expiry integer,
    card_hash        text,                      -- sha-256 của mã HS/SV đã chuẩn hoá
    image_path       text,                      -- null sau khi ảnh đã bị xoá
    consent_at       timestamptz not null default now(),
    created_at       timestamptz not null default now(),
    reviewed_at      timestamptz,
    reviewed_by      uuid references auth.users(id) on delete set null,
    purge_at         timestamptz not null default (now() + interval '30 days'),
    image_purged_at  timestamptz
);

create unique index if not exists hssv_verifications_order_uidx
    on public.hssv_verifications (order_id) where order_id is not null;
create index if not exists hssv_verifications_card_hash_idx
    on public.hssv_verifications (card_hash) where card_hash is not null;
create index if not exists hssv_verifications_purge_idx
    on public.hssv_verifications (purge_at) where image_path is not null;
create index if not exists hssv_verifications_user_idx
    on public.hssv_verifications (user_id);

alter table public.hssv_verifications enable row level security;
-- Không có policy nào: chỉ service role (Edge Function) và RPC SECURITY DEFINER
-- đọc/ghi được. Khách và admin đều KHÔNG truy cập bảng trực tiếp.

-- Đơn cũ đã có ảnh trong bucket: đưa vào bảng để cũng được dọn tự động
-- (giữ hạn 30 ngày tính từ lúc đơn tạo, tối thiểu là 1 ngày kể từ hôm nay).
insert into public.hssv_verifications
    (order_id, user_id, status, flags, ai_reason, image_path, created_at, purge_at)
select o.id,
       o.user_id,
       case o.hssv_status when 'approved' then 'approved' when 'pending' then 'pending' else 'rejected' end,
       array['legacy'],
       'Xác minh theo cách cũ, chưa đọc tên/mã.',
       o.hssv_image_path,
       o.created_at,
       greatest(o.created_at + interval '30 days', now() + interval '1 day')
from public.orders o
where o.is_hssv and o.hssv_image_path is not null
on conflict do nothing;

-- 3. Admin xem ảnh trong bucket riêng ----------------------------------
drop policy if exists "hssv_cards_select_admin" on storage.objects;
create policy "hssv_cards_select_admin" on storage.objects
    for select to authenticated
    using (
        bucket_id = 'hssv-cards'
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
        )
    );

-- 4. RPC ---------------------------------------------------------------
create or replace function public.admin_get_hssv_reviews(p_limit integer default 100)
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
        raise exception 'Bạn không có quyền xem danh sách HSSV!';
    end if;

    select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
        select v.id,
               v.status,
               v.flags,
               v.ai_reason,
               v.extracted_name,
               v.extracted_school,
               v.extracted_id,
               v.extracted_expiry,
               v.image_path,
               v.created_at,
               v.reviewed_at,
               v.purge_at,
               v.image_purged_at,
               v.user_id,
               coalesce(p.full_name, 'Học viên Guitar') as user_name,
               coalesce(p.email, '') as user_email,
               p.zalo as user_zalo,
               o.id as order_id,
               o.order_code,
               o.amount as order_amount,
               o.status as order_status,
               coalesce(s.title, o.song_id) as song_title,
               -- Còn trùng mã với tài khoản khác không (để admin thấy ngay)
               (select count(distinct v2.user_id) from public.hssv_verifications v2
                 where v.card_hash is not null and v2.card_hash = v.card_hash and v2.user_id <> v.user_id
               ) as other_accounts_same_card
        from public.hssv_verifications v
        left join public.profiles p on p.id = v.user_id
        left join public.orders o on o.id = v.order_id
        left join public.songs s on s.id = o.song_id
        order by (v.status = 'pending' and v.reviewed_at is null) desc,
                 (v.reviewed_at is null) desc,
                 v.created_at desc
        limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) t;

    return result;
end;
$$;

create or replace function public.admin_count_hssv_pending()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền!';
    end if;
    return (select count(*)::integer from public.hssv_verifications
             where status = 'pending' and reviewed_at is null);
end;
$$;

-- p_action: 'seen'    = đã xem, giữ nguyên kết quả (ảnh xoá sau 3 ngày)
--           'approve' = duyệt lượt đang chờ, hạ giá đơn nếu đơn còn chờ thanh toán
--           'revoke'  = thu hồi giảm giá; đơn còn chờ thanh toán thì trả về giá gốc.
--                       Đơn ĐÃ trả thì chỉ đánh dấu, admin dùng "Thu hồi tab" hoặc liên hệ khách.
create or replace function public.admin_review_hssv(p_id uuid, p_action text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
    v_status text;
    v_order_id uuid;
    v_order_code text;
    v_order_status text;
    v_song_price numeric;
    v_discount_note text;
    v_digits text;
    v_discount numeric;
    v_order_paid boolean := false;
    v_new_amount numeric;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền duyệt HSSV!';
    end if;
    if p_action not in ('seen', 'approve', 'revoke') then
        raise exception 'Thao tác không hợp lệ.';
    end if;

    select status, order_id into v_status, v_order_id
      from public.hssv_verifications where id = p_id for update;
    if not found then
        raise exception 'Không tìm thấy lượt xác minh này.';
    end if;

    if v_order_id is not null then
        select o.order_code, o.status, s.price, s.discount_note
          into v_order_code, v_order_status, v_song_price, v_discount_note
          from public.orders o
          left join public.songs s on s.id = o.song_id
         where o.id = v_order_id
         for update of o;
        if not found then
            v_order_id := null;
        else
            v_order_paid := (v_order_status = 'paid');
        end if;
    end if;

    if p_action = 'approve' then
        if v_status <> 'pending' then
            raise exception 'Chỉ duyệt được lượt đang chờ.';
        end if;
        update public.hssv_verifications set status = 'approved' where id = p_id;
        if v_order_id is not null and v_order_status = 'pending' then
            v_digits := regexp_replace(coalesce(v_discount_note, ''), '[^0-9]', '', 'g');
            if v_digits <> '' then
                v_discount := v_digits::numeric;
                if v_discount > 0 and v_discount < 1000 then v_discount := v_discount * 1000; end if;
                update public.orders set amount = v_discount, is_hssv = true, hssv_status = 'approved'
                 where id = v_order_id;
                v_new_amount := v_discount;
            end if;
        elsif v_order_id is not null then
            update public.orders set hssv_status = 'approved' where id = v_order_id;
        end if;
    elsif p_action = 'revoke' then
        update public.hssv_verifications set status = 'revoked' where id = p_id;
        if v_order_id is not null then
            update public.orders set hssv_status = 'rejected' where id = v_order_id;
            if v_order_status = 'pending' and v_song_price is not null and v_song_price > 0 then
                update public.orders set amount = v_song_price where id = v_order_id;
                v_new_amount := v_song_price;
            end if;
        end if;
    end if;

    -- Mọi thao tác đều tính là "admin đã xem": ảnh sẽ bị xoá sau 3 ngày.
    update public.hssv_verifications
       set reviewed_at = coalesce(reviewed_at, now()),
           reviewed_by = coalesce(reviewed_by, auth.uid()),
           purge_at = least(purge_at, now() + interval '3 days')
     where id = p_id;

    return json_build_object(
        'ok', true,
        'action', p_action,
        'order_paid', v_order_paid,
        'order_code', v_order_code,
        'new_amount', v_new_amount
    );
end;
$$;

revoke all on function public.admin_get_hssv_reviews(integer) from public, anon;
revoke all on function public.admin_count_hssv_pending() from public, anon;
revoke all on function public.admin_review_hssv(uuid, text) from public, anon;
grant execute on function public.admin_get_hssv_reviews(integer) to authenticated;
grant execute on function public.admin_count_hssv_pending() to authenticated;
grant execute on function public.admin_review_hssv(uuid, text) to authenticated;

-- 5. Chi tiết thành viên: thêm zalo ---------------------------------------
create or replace function public.admin_get_user_detail(p_user_id uuid)
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
        raise exception 'Bạn không có quyền xem chi tiết thành viên!';
    end if;

    select json_build_object(
        'profile', (
            select json_build_object(
                'id', p.id,
                'email', coalesce(p.email, ''),
                'full_name', coalesce(p.full_name, 'Học viên Guitar'),
                'avatar_url', coalesce(p.avatar_url, ''),
                'zalo', coalesce(p.zalo, ''),
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
$$;

-- 6. Lịch dọn ảnh mỗi ngày -------------------------------------------------
-- Xoá file thật phải đi qua Storage API (xoá dòng SQL trong storage.objects sẽ
-- để lại file mồ côi), nên cron gọi Edge Function `hssv-cleanup`. Hàm chỉ nhận
-- lời gọi có khoá bí mật riêng, sinh ngẫu nhiên ngay trong database dưới đây
-- (không hiển thị ở đâu cả, không nằm trong git).
create extension if not exists pg_net;
create extension if not exists pg_cron;

insert into public.app_secrets (key, value)
values ('hssv_cleanup_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

do $$
begin
    if exists (select 1 from cron.job where jobname = 'hssv-cleanup-daily') then
        perform cron.unschedule('hssv-cleanup-daily');
    end if;
end $$;

select cron.schedule(
    'hssv-cleanup-daily',
    '17 20 * * *',  -- 20:17 UTC = 03:17 giờ Việt Nam
    $job$
    select net.http_post(
        url := 'https://covzjzcqerldfssxasax.supabase.co/functions/v1/hssv-cleanup',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cleanup-secret', (select value from public.app_secrets where key = 'hssv_cleanup_secret')
        ),
        body := '{}'::jsonb
    );
    $job$
);
