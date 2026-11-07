/**
 * Lượt ping giữ Supabase hoạt động — bản DỰ PHÒNG chạy trên Vercel Cron (xem "crons" trong vercel.json).
 *
 * Supabase gói miễn phí tự tạm dừng project sau khoảng 7 ngày không có hoạt động. Lượt ping chính là
 * GitHub Actions (.github/workflows/keep-alive.yml, 3 ngày một lần), nhưng nó dừng hẳn khi tài khoản
 * GitHub gặp sự cố (2026-11-07: tài khoản bị khoá vì vấn đề thanh toán, mọi workflow không chạy).
 * Bản này chạy mỗi ngày một lần trên Vercel nên không phụ thuộc GitHub.
 *
 * Chỉ đọc một dòng `songs` (bảng công khai) bằng khoá anon — khoá này vốn đã nằm trong mã trang web.
 * Ai gọi đường dẫn này cũng chỉ làm được đúng việc đó.
 */
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    res.status(500).json({ ok: false, error: 'missing_supabase_env' })
    return
  }

  try {
    const response = await fetch(`${url}/rest/v1/songs?select=id&limit=1`, {
      headers: { apikey: key },
    })
    res.status(response.ok ? 200 : 502).json({ ok: response.ok, status: response.status })
  } catch {
    res.status(502).json({ ok: false, error: 'supabase_unreachable' })
  }
}
