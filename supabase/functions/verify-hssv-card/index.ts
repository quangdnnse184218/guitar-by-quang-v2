// Edge Function: verify-hssv-card
//
// Khách tick "Tôi là Học sinh/Sinh viên", đồng ý cho dùng ảnh, rồi upload ảnh thẻ
// lên bucket riêng tư "hssv-cards" (RLS: mỗi user chỉ đọc/ghi thư mục {user_id}/ của
// mình; admin đọc được để duyệt lại). Hàm này tải ảnh bằng service role, nhờ Gemini
// ĐỌC KỸ thẻ (có phải thẻ không, tên, trường, mã HS/SV, năm hết hạn), rồi
// decideHssv() (decision.ts) chọn một trong ba kết quả:
//   approved — thẻ rõ, còn hạn, mã chưa dùng ở tài khoản khác → hạ giá đơn ngay
//   pending  — AI lỗi/ảnh mờ/thiếu mã/mã trùng tài khoản khác → chờ admin ("Duyệt HSSV")
//   rejected — chắc chắn không phải thẻ hoặc thẻ hết hạn
// Mỗi lượt được lưu vào hssv_verifications kèm mốc purge_at; hàm hssv-cleanup xoá ảnh
// khi tới hạn (3 ngày sau khi admin xem, tối đa 30 ngày từ lúc tải lên).
// Không so khuôn mặt, không lưu sinh trắc học.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { decideHssv, type CardReading } from './decision.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GEMINI_TIMEOUT_MS = 35_000
const GEMINI_ATTEMPTS = 2
const GEMINI_RETRY_DELAY_MS = 1_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// btoa(String.fromCharCode(...bytes)) sập ngay với ảnh vài MB thật từ điện
// thoại vì spread hàng triệu phần tử vượt giới hạn tham số hàm của JS — phải
// nối base64 theo từng đoạn nhỏ (32KB) thay vì truyền cả mảng một lần.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// "HSSV: 179k" -> 179000. Cùng logic quy đổi "179" -> 179k như
// formatCompactPrice ở phía client (src/kho-tab.js, src/main.js).
function parseVndAmount(text: string | null | undefined): number | null {
  if (!text) return null
  const digits = text.replace(/[^0-9]/g, '')
  if (!digits) return null
  let n = Number(digits)
  if (n > 0 && n < 1000) n *= 1000
  return n > 0 ? n : null
}

function buildPrompt(currentYear: number): string {
  return `Bạn đang xem một ảnh chụp thẻ Học sinh/Sinh viên (HSSV) tại Việt Nam. Hãy ĐỌC KỸ thẻ và trả về thông tin in trên thẻ.
KHÔNG suy đoán: thông tin nào không đọc rõ thì để null.
Các trường:
- is_student_card: true nếu là thẻ học sinh hoặc sinh viên thật (logo/tên trường, chữ "THẺ HỌC SINH"/"THẺ SINH VIÊN" hoặc tương đương); false nếu rõ ràng không phải (ảnh khác, giấy tờ khác, ảnh chụp màn hình bừa); null nếu không chắc.
- legible: false nếu ảnh quá mờ/chói/cắt mất phần, không đọc được chữ.
- full_name: họ tên in trên thẻ.
- school: tên trường.
- student_id: mã số sinh viên / mã học sinh (giữ nguyên chữ và số).
- expiry_year: năm thẻ hết hiệu lực dạng số nguyên (nếu ghi niên khóa như "2023-2027" thì lấy năm kết thúc; năm hiện tại là ${currentYear}).
- reason: một câu ngắn bằng tiếng Việt nói bạn đã thấy gì.
Trả lời DUY NHẤT bằng JSON hợp lệ, không thêm chữ nào khác:
{"is_student_card": boolean|null, "legible": boolean, "full_name": string|null, "school": string|null, "student_id": string|null, "expiry_year": number|null, "reason": string}`
}

// Model "thinking" đôi khi trả nhiều phần tử trong parts[] (suy luận nội bộ + trả lời
// cuối) — lấy đúng phần có "text" và không đánh dấu thought:true.
function parseReading(geminiJson: unknown): CardReading | null {
  const parts: Array<{ text?: string; thought?: boolean }> =
    (geminiJson as any)?.candidates?.[0]?.content?.parts ?? []
  const rawText = parts.find((p) => p.text && !p.thought)?.text ?? parts[0]?.text
  if (!rawText) return null
  try {
    const parsed = JSON.parse(rawText)
    return parsed && typeof parsed === 'object' ? (parsed as CardReading) : null
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ approved: false, error: 'method_not_allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
    } = await userClient.auth.getUser()

    if (!user) return json({ approved: false, error: 'unauthorized' }, 401)

    const { orderId, imagePath, consent } = await req.json()
    if (!orderId || !imagePath) return json({ approved: false, error: 'missing_params' }, 400)
    if (consent !== true) return json({ approved: false, error: 'consent_required' }, 400)

    // Chặn IDOR: path upload phải nằm đúng thư mục của chính user gọi hàm này.
    if (!String(imagePath).startsWith(`${user.id}/`) || String(imagePath).includes('..')) {
      return json({ approved: false, error: 'path_mismatch' }, 403)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Ảnh vừa tải lên mà hàm dừng trước khi ghi nhận lượt xác minh thì không ai theo dõi
    // hạn xoá của nó nữa — xoá ngay (best-effort) để không có ảnh nằm lại ngoài kiểm soát.
    const discardUpload = async () => {
      try {
        await admin.storage.from('hssv-cards').remove([imagePath])
      } catch (e) {
        console.error('Không xoá được ảnh vừa tải:', e)
      }
    }

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, user_id, song_id, status')
      .eq('id', orderId)
      .maybeSingle()

    if (orderErr || !order || order.user_id !== user.id) {
      await discardUpload()
      return json({ approved: false, error: 'order_not_found' }, 404)
    }
    if (order.status === 'paid') {
      await discardUpload()
      return json({ approved: false, error: 'already_paid' })
    }

    const { data: fileBlob, error: downloadErr } = await admin.storage
      .from('hssv-cards')
      .download(imagePath)

    if (downloadErr || !fileBlob) {
      return json({ approved: false, error: 'image_download_failed' }, 500)
    }

    const { data: secretRow } = await admin
      .from('app_secrets')
      .select('value')
      .eq('key', 'gemini_api_key')
      .maybeSingle()

    const geminiKey = secretRow?.value
    if (!geminiKey) {
      await discardUpload()
      return json({ approved: false, error: 'ai_not_configured' }, 500)
    }

    const base64 = arrayBufferToBase64(await fileBlob.arrayBuffer())
    const mimeType = fileBlob.type || 'image/jpeg'
    const currentYear = new Date().getFullYear()

    // Gemini đôi khi chậm bất thường (đã đo được 30–90 giây) hoặc trả lỗi thoáng qua
    // (429/5xx). Giới hạn thời gian chờ để khách không đứng nhìn vòng quay mãi, và thử
    // lại MỘT lần với lỗi tạm thời. Hết cách thì để admin duyệt (không từ chối oan).
    let reading: CardReading | null = null
    const geminiBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildPrompt(currentYear) },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    })
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`

    for (let attempt = 0; attempt < GEMINI_ATTEMPTS && !reading; attempt++) {
      try {
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: geminiBody,
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        })
        if (geminiRes.ok) {
          reading = parseReading(await geminiRes.json())
          break // trả lời được rồi thì thôi, dù đọc không ra JSON cũng không hỏi lại
        }
        console.error('Gemini API error:', geminiRes.status, 'lần', attempt + 1)
        const transient = geminiRes.status === 429 || geminiRes.status >= 500
        if (!transient) break
      } catch (e) {
        // Quá thời gian chờ hoặc lỗi mạng: không thử lại để khách không phải chờ gấp đôi.
        console.error('Gemini request failed:', e)
        break
      }
      if (attempt + 1 < GEMINI_ATTEMPTS)
        await new Promise((r) => setTimeout(r, GEMINI_RETRY_DELAY_MS))
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    // Một thẻ — một tài khoản: cùng mã HS/SV đã được tài khoản KHÁC dùng thì không
    // tự duyệt. (Cùng tài khoản dùng lại thẻ cho bài khác thì bình thường.)
    let cardHash: string | null = null
    let duplicateOnOtherAccount = false
    const idForHash = reading ? String(reading.student_id ?? '') : ''
    const normalizedId = idForHash.toUpperCase().replace(/[^0-9A-Z]/g, '')
    if (normalizedId.length >= 4) {
      cardHash = await sha256Hex(normalizedId)
      const { data: dupRows } = await admin
        .from('hssv_verifications')
        .select('id')
        .eq('card_hash', cardHash)
        .neq('user_id', user.id)
        .neq('status', 'rejected')
        .limit(1)
      duplicateOnOtherAccount = (dupRows?.length ?? 0) > 0
    }

    const decision = decideHssv({
      reading,
      currentYear,
      accountName: profile?.full_name ?? null,
      duplicateOnOtherAccount,
    })

    let newAmount: number | null = null
    if (decision.status === 'approved') {
      const { data: song } = await admin
        .from('songs')
        .select('discount_note')
        .eq('id', order.song_id)
        .maybeSingle()
      newAmount = parseVndAmount(song?.discount_note)
    }

    // Lưu lượt xác minh (một dòng cho mỗi đơn; tải lại ảnh thì cập nhật dòng đó).
    const record = {
      order_id: orderId,
      user_id: user.id,
      status: decision.status,
      flags: decision.flags,
      ai_reason: reading?.reason ?? null,
      extracted_name: reading?.full_name ?? null,
      extracted_school: reading?.school ?? null,
      extracted_id: decision.studentId,
      extracted_expiry: decision.expiryYear,
      card_hash: cardHash,
      image_path: imagePath,
      consent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      purge_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      image_purged_at: null,
    }

    const { data: existing } = await admin
      .from('hssv_verifications')
      .select('id, image_path')
      .eq('order_id', orderId)
      .maybeSingle()

    const { error: saveErr } = existing
      ? await admin.from('hssv_verifications').update(record).eq('id', existing.id)
      : await admin.from('hssv_verifications').insert(record)

    if (saveErr) {
      // Chưa chạy SQL hoặc lỗi ghi: dừng để KHÔNG hạ giá mà admin không thấy được lượt này.
      console.error('Không lưu được hssv_verifications:', saveErr)
      await discardUpload()
      return json({ approved: false, error: 'save_failed' }, 500)
    }

    // Khách gửi ảnh khác cho cùng đơn: ảnh cũ không còn được lượt xác minh nào trỏ tới,
    // xoá luôn (nếu không sẽ nằm lại vĩnh viễn, không có hạn xoá).
    if (existing?.image_path && existing.image_path !== imagePath) {
      try {
        await admin.storage.from('hssv-cards').remove([existing.image_path])
      } catch (e) {
        console.error('Không xoá được ảnh cũ:', e)
      }
    }

    await admin
      .from('orders')
      .update({
        is_hssv: true,
        hssv_image_path: imagePath,
        hssv_status: decision.status,
        ...(newAmount ? { amount: newAmount } : {}),
      })
      .eq('id', orderId)

    return json({
      approved: decision.status === 'approved',
      status: decision.status,
      newAmount,
      reason: decision.message,
    })
  } catch (err) {
    console.error('verify-hssv-card error:', err)
    return json({ approved: false, error: 'internal_error' }, 500)
  }
})
