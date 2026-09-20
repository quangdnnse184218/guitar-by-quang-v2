// Edge Function: hssv-cleanup
//
// Xoá ảnh thẻ HSSV đã tới hạn (hssv_verifications.purge_at): 3 ngày sau khi admin
// bấm "Đã xem", hoặc tối đa 30 ngày kể từ lúc khách tải lên. Chỉ xoá FILE — kết quả
// đọc thẻ, trạng thái và mã băm vẫn giữ để chặn dùng lại một thẻ ở nhiều tài khoản.
//
// Được pg_cron gọi mỗi ngày qua pg_net (xem migration 20260921). Không có JWT,
// xác thực bằng khoá bí mật riêng `hssv_cleanup_secret` trong app_secrets
// (header x-cleanup-secret), so sánh timing-safe. File thật phải xoá bằng Storage
// API — xoá dòng SQL trong storage.objects sẽ để lại file mồ côi.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BATCH = 200

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const len = Math.max(x.length, y.length)
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: secretRow } = await admin
    .from('app_secrets')
    .select('value')
    .eq('key', 'hssv_cleanup_secret')
    .maybeSingle()

  const expected = secretRow?.value
  const provided = req.headers.get('x-cleanup-secret') ?? ''
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const { data: due, error: dueErr } = await admin
    .from('hssv_verifications')
    .select('id, order_id, image_path')
    .not('image_path', 'is', null)
    .lte('purge_at', new Date().toISOString())
    .limit(BATCH)

  if (dueErr) {
    console.error('hssv-cleanup: không đọc được danh sách:', dueErr)
    return json({ error: 'query_failed' }, 500)
  }

  let purged = 0
  let failed = 0

  for (const row of due ?? []) {
    const { error: removeErr } = await admin.storage.from('hssv-cards').remove([row.image_path])
    if (removeErr) {
      // Giữ nguyên dòng để lần chạy sau thử lại; không đánh dấu là đã xoá.
      console.error('hssv-cleanup: xoá file lỗi:', removeErr)
      failed++
      continue
    }

    await admin
      .from('hssv_verifications')
      .update({ image_path: null, image_purged_at: new Date().toISOString() })
      .eq('id', row.id)

    if (row.order_id) {
      await admin.from('orders').update({ hssv_image_path: null }).eq('id', row.order_id)
    }
    purged++
  }

  return json({ ok: true, purged, failed })
})
