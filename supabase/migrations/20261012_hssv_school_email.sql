-- 2026-10-12 — Giảm giá sinh viên: bắt buộc kèm EMAIL TRƯỜNG đã xác nhận bằng mã,
--              và cho admin áp giá HSSV bằng tay cho khách nhắn Zalo (học sinh / SV không có email).
--
-- Chạy file này TRƯỚC khi deploy Edge Function verify-hssv-card bản mới và trước khi đưa
-- giao diện mới lên (bản mới gọi tới bảng/cột/hàm tạo ở đây).
-- An toàn khi chạy lại: mọi lệnh đều "if not exists" / "create or replace".

-- 1. Mã xác nhận email trường ---------------------------------------------
-- Mỗi dòng là một mã 6 số đã gửi. Chỉ lưu MÃ BĂM (sha-256 của "đơn:email:mã"), không lưu mã gốc.
create table if not exists public.hssv_email_codes (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    order_id    uuid not null references public.orders(id) on delete cascade,
    email       text not null,
    code_hash   text not null,
    attempts    integer not null default 0,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null,
    verified_at timestamptz
);

create index if not exists hssv_email_codes_user_idx  on public.hssv_email_codes (user_id, created_at desc);
create index if not exists hssv_email_codes_order_idx on public.hssv_email_codes (order_id);

alter table public.hssv_email_codes enable row level security;
-- Không có policy nào: chỉ service role (Edge Function verify-hssv-card) đọc/ghi.
revoke all on table public.hssv_email_codes from anon, authenticated;

-- 2. Lượt xác minh: lưu email trường + mã băm email -------------------------
alter table public.hssv_verifications add column if not exists school_email      text;
alter table public.hssv_verifications add column if not exists email_hash        text;  -- sha-256 của email (chữ thường)
alter table public.hssv_verifications add column if not exists email_verified_at timestamptz;

create index if not exists hssv_verifications_email_hash_idx
    on public.hssv_verifications (email_hash) where email_hash is not null;

-- 3. Dọn mã cũ mỗi ngày (mã chỉ sống 10 phút, giữ 2 ngày để tính giới hạn tần suất) ----
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        if exists (select 1 from cron.job where jobname = 'hssv-email-codes-cleanup') then
            perform cron.unschedule('hssv-email-codes-cleanup');
        end if;
        perform cron.schedule(
            'hssv-email-codes-cleanup',
            '27 20 * * *',
            $job$delete from public.hssv_email_codes where created_at < now() - interval '2 days'$job$
        );
    end if;
end;
$$;

-- 4. Danh sách duyệt HSSV: thêm email trường và số tài khoản khác dùng cùng email -----
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
               v.school_email,
               v.email_verified_at,
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
               -- Còn trùng mã thẻ / email trường với tài khoản khác không (để admin thấy ngay)
               (select count(distinct v2.user_id) from public.hssv_verifications v2
                 where v.card_hash is not null and v2.card_hash = v.card_hash and v2.user_id <> v.user_id
               ) as other_accounts_same_card,
               (select count(distinct v3.user_id) from public.hssv_verifications v3
                 where v.email_hash is not null and v3.email_hash = v.email_hash and v3.user_id <> v.user_id
               ) as other_accounts_same_email
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

revoke all on function public.admin_get_hssv_reviews(integer) from public, anon;
grant execute on function public.admin_get_hssv_reviews(integer) to authenticated;

-- 5. Áp giá HSSV bằng tay theo MÃ ĐƠN -----------------------------------------
-- Dành cho học sinh và sinh viên không có email trường: khách nhắn Zalo kèm ảnh thẻ + mã đơn,
-- admin xem bằng mắt rồi gọi hàm này. Đơn phải còn "pending"; số tiền đổi sang giá HSSV của bài
-- (songs.discount_note). Ghi một lượt vào hssv_verifications (cờ manual_zalo, không có ảnh) để
-- trang Duyệt HSSV còn dấu vết ai đã duyệt, lúc nào.
create or replace function public.admin_apply_hssv_price(p_order_code text, p_note text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    caller_role text;
    v_code text := upper(regexp_replace(coalesce(p_order_code, ''), '\s', '', 'g'));
    v_order record;
    v_digits text;
    v_discount numeric;
begin
    select role into caller_role from public.profiles where id = auth.uid();
    if caller_role is null or caller_role <> 'admin' then
        raise exception 'Bạn không có quyền áp giá HSSV!';
    end if;
    if v_code = '' then
        raise exception 'Chưa nhập mã đơn.';
    end if;

    select o.id, o.user_id, o.status, o.amount, o.order_code, s.title, s.price, s.discount_note
      into v_order
      from public.orders o
      left join public.songs s on s.id = o.song_id
     where upper(o.order_code) = v_code
     for update of o;
    if not found then
        raise exception 'Không tìm thấy đơn %.', v_code;
    end if;
    if v_order.status <> 'pending' then
        raise exception 'Đơn % không còn chờ thanh toán (trạng thái: %).', v_code, v_order.status;
    end if;

    v_digits := regexp_replace(coalesce(v_order.discount_note, ''), '[^0-9]', '', 'g');
    if v_digits = '' then
        raise exception 'Bài "%" chưa đặt giá HSSV.', coalesce(v_order.title, '?');
    end if;
    v_discount := v_digits::numeric;
    if v_discount > 0 and v_discount < 1000 then v_discount := v_discount * 1000; end if;
    if v_discount <= 0 then
        raise exception 'Giá HSSV của bài không hợp lệ.';
    end if;

    update public.orders
       set amount = v_discount, is_hssv = true, hssv_status = 'approved'
     where id = v_order.id;

    -- Mỗi đơn chỉ có một lượt xác minh (chỉ mục duy nhất theo order_id): có rồi thì cập nhật.
    if exists (select 1 from public.hssv_verifications where order_id = v_order.id) then
        update public.hssv_verifications
           set status = 'approved',
               flags = (select array_agg(distinct f) from unnest(flags || array['manual_zalo']) f),
               ai_reason = coalesce(nullif(trim(p_note), ''), ai_reason),
               reviewed_at = now(),
               reviewed_by = auth.uid(),
               purge_at = least(purge_at, now() + interval '3 days')
         where order_id = v_order.id;
    else
        insert into public.hssv_verifications
            (order_id, user_id, status, flags, ai_reason, image_path, reviewed_at, reviewed_by)
        values
            (v_order.id, v_order.user_id, 'approved', array['manual_zalo'],
             coalesce(nullif(trim(p_note), ''), 'Admin duyệt tay qua Zalo.'), null, now(), auth.uid());
    end if;

    return json_build_object(
        'ok', true,
        'order_code', v_order.order_code,
        'song_title', v_order.title,
        'old_amount', v_order.amount,
        'new_amount', v_discount
    );
end;
$$;

revoke all on function public.admin_apply_hssv_price(text, text) from public, anon;
grant execute on function public.admin_apply_hssv_price(text, text) to authenticated;
