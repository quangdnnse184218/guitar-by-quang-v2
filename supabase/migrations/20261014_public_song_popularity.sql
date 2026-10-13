-- Kho tab: số lượt mở khoá của từng bài, để gắn nhãn "Bán chạy" ----------------------------------
-- Khách và người chưa đăng nhập không đọc được bảng purchases (RLS), nên cần một hàm riêng chỉ trả
-- đúng hai thứ: mã bài và số lượt. Không có thông tin người mua; lượt của tài khoản admin (chỉ dùng
-- để thử mua) không tính, giống mọi số liệu khác ở trang quản trị.
create or replace function public.public_song_popularity()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
    select coalesce(json_agg(json_build_object('song_id', t.song_id, 'buys', t.buys)), '[]'::json)
    from (
        select pu.song_id, count(*)::int as buys
        from public.purchases pu
        where not exists (select 1 from public.profiles a where a.id = pu.user_id and a.role = 'admin')
        group by pu.song_id
    ) t;
$$;

revoke execute on function public.public_song_popularity() from public;
grant execute on function public.public_song_popularity() to anon, authenticated, service_role;
