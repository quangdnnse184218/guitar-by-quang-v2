// Edge Function: verify-hssv-card
//
// Khách tick "Tôi là Học sinh/Sinh viên", đồng ý cho dùng ảnh, rồi upload ảnh thẻ
// lên bucket riêng tư "hssv-cards" (RLS: mỗi user chỉ đọc/ghi thư mục {user_id}/ của
// mình; admin đọc được để duyệt lại). Hàm này tải ảnh bằng service role, nhờ Gemini
// ĐỌC KỸ thẻ (có phải thẻ không, tên, trường, mã HS/SV, năm hết hạn), rồi
// decideHssv() (decision.ts) chọn một trong ba kết quả:
//   approved — thẻ rõ, còn hạn, mã chưa dùng ở tài khoản khác → hạ giá đơn ngay
//   pending  — AI lỗi/ảnh mờ/thiếu mã hoặc hạn → chờ admin ("Duyệt HSSV")
//   rejected — không phải thẻ, thẻ hết hạn, hoặc mã đã dùng ở tài khoản khác
// Mỗi lượt được lưu vào hssv_verifications kèm mốc purge_at; hàm hssv-cleanup xoá ảnh
// khi tới hạn (3 ngày sau khi admin xem, tối đa 30 ngày từ lúc tải lên).
// Không so khuôn mặt, không lưu sinh trắc học.
//
// Từ 2026-10: sinh viên phải kèm EMAIL TRƯỜNG (.edu.vn) đã xác nhận bằng mã 6 số gửi về hộp thư,
// và AI so email với thẻ (mã SV / họ tên). Ba thao tác, phân biệt bằng `action` trong body:
//   send_code  — gửi mã về email trường (có giới hạn tần suất)
//   check_code — khách nhập mã; đúng thì email được tính là đã xác nhận trong 1 giờ
//   (mặc định) — đọc thẻ + so với email đã xác nhận → approved / pending / rejected
// Học sinh, và sinh viên không có email trường, không đi qua hàm này: nhắn Zalo, admin duyệt tay
// (RPC admin_apply_hssv_price). Logic thuần về email nằm ở email.ts.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { decideHssv, type CardReading } from './decision.ts'
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  activeCode,
  canSendCode,
  emailMatchesCard,
  isEmailVerified,
  normalizeSchoolEmail,
  timingSafeEqualHex,
  type CodeRow,
} from './email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Chuỗi model: thử lần lượt, model nào lỗi (quá tải 503, hết quota 429, ngừng cấp 404…) thì
// sang model kế tiếp NGAY (mỗi model có hạn mức và tình trạng quá tải riêng). Đã đo trên thẻ
// thật: 3.6-flash ~3.7s, 3-flash-preview ~2.7s, 3.7-flash ~5s (khi tắt "suy nghĩ").
// Không đưa vào: 3.8-flash (hay quá tải), 3.5-flash (~8s), *-lite (đọc sai/không nhận thinkingConfig).
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3.7-flash']
const GEMINI_TOTAL_BUDGET_MS = 40_000 // tổng thời gian tối đa khách phải chờ AI
const GEMINI_ATTEMPT_TIMEOUT_MS = 25_000
const GEMINI_MIN_ATTEMPT_MS = 3_000 // còn ít hơn mức này thì không bắt đầu lần gọi mới

// Địa chỉ gửi đi của Brevo (đã xác minh trong tài khoản Brevo — cùng địa chỉ sepay-ipn đang dùng).
const MAIL_SENDER = { name: 'Guitar By Quang', email: 'quanggg104204@gmail.com' }

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Mã 6 chữ số từ bộ sinh số ngẫu nhiên mật mã (không dùng Math.random). */
function randomCode(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

// Mã băm gắn với đúng đơn + email, nên mã của đơn này không dùng được cho đơn/email khác.
const codeHashOf = (orderId: string, email: string, code: string) => sha256Hex(`${orderId}:${email}:${code}`)

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

/**
 * send_code / check_code. Trả 200 kèm { ok:false, error } cho lỗi do khách (sai mã, gửi quá nhanh…)
 * để giao diện đọc được lý do; chỉ dùng mã 4xx/5xx cho yêu cầu hỏng hoặc lỗi hệ thống.
 */
async function handleEmailCode(action: string, body: any, userId: string): Promise<Response> {
  const orderId = body?.orderId
  if (!orderId) return json({ ok: false, error: 'missing_params' }, 400)
  if (body?.consent !== true) return json({ ok: false, error: 'consent_required' }, 400)

  const email = normalizeSchoolEmail(body?.email)
  if (!email) return json({ ok: false, error: 'invalid_email' })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, user_id, status')
    .eq('id', orderId)
    .maybeSingle()
  if (orderErr || !order || order.user_id !== userId) return json({ ok: false, error: 'order_not_found' }, 404)
  if (order.status === 'paid') return json({ ok: false, error: 'already_paid' })

  const { data: userRowsRaw, error: rowsErr } = await admin
    .from('hssv_email_codes')
    .select('id, order_id, email, code_hash, attempts, created_at, expires_at, verified_at')
    .eq('user_id', userId)
    .limit(200)
  if (rowsErr) {
    // Chưa chạy SQL tạo bảng: báo lỗi hệ thống, không giả vờ đã gửi mã.
    console.error('Không đọc được hssv_email_codes:', rowsErr)
    return json({ ok: false, error: 'not_ready' }, 500)
  }
  const userRows = (userRowsRaw ?? []) as Array<CodeRow & { order_id: string }>
  const orderRows = userRows.filter((r) => r.order_id === orderId)
  const now = Date.now()

  if (action === 'send_code') {
    const emailHash = await sha256Hex(email)
    const { data: dup } = await admin
      .from('hssv_verifications')
      .select('id')
      .eq('email_hash', emailHash)
      .neq('user_id', userId)
      .neq('status', 'rejected')
      .limit(1)
    if ((dup?.length ?? 0) > 0) return json({ ok: false, error: 'email_used' })

    const gate = canSendCode({ now, userRows, orderRows })
    if (!gate.ok) return json({ ok: false, error: gate.error, retryAfterSec: gate.retryAfterSec })

    const { data: secretRow } = await admin.from('app_secrets').select('value').eq('key', 'brevo_api_key').maybeSingle()
    const brevoKey = secretRow?.value
    if (!brevoKey) return json({ ok: false, error: 'mail_not_configured' }, 500)

    const code = randomCode()
    const { error: insertErr } = await admin.from('hssv_email_codes').insert({
      user_id: userId,
      order_id: orderId,
      email,
      code_hash: await codeHashOf(orderId, email, code),
      attempts: 0,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + CODE_TTL_MS).toISOString(),
      verified_at: null,
    })
    if (insertErr) {
      console.error('Không lưu được mã email:', insertErr)
      return json({ ok: false, error: 'not_ready' }, 500)
    }

    let sent = false
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': brevoKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: MAIL_SENDER,
          to: [{ email }],
          subject: `${code} là mã xác nhận email trường của bạn — Guitar By Quang`,
          htmlContent: `<div style="font-family: sans-serif; font-size: 15px; color: #1f1812; line-height: 1.6;">
  <p>Chào bạn,</p>
  <p>Mã xác nhận email trường để nhận giá sinh viên ở Guitar By Quang:</p>
  <p style="font-size: 30px; font-weight: 700; letter-spacing: 6px; margin: 18px 0;">${escapeHtml(code)}</p>
  <p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, cứ bỏ qua email — không ai dùng được email của bạn khi không có mã.</p>
</div>`,
        }),
        signal: AbortSignal.timeout(15_000),
      })
      sent = res.ok
      if (!res.ok) console.error('Brevo từ chối gửi mã:', res.status)
    } catch (e) {
      console.error('Gửi mã email lỗi:', e)
    }
    if (!sent) return json({ ok: false, error: 'send_failed' }, 502)

    return json({ ok: true, expiresInSec: CODE_TTL_MS / 1000 })
  }

  // check_code
  const code = String(body?.code ?? '').replace(/[^0-9]/g, '')
  if (code.length !== 6) return json({ ok: false, error: 'wrong_code' })

  const row = activeCode(orderRows, email, now)
  if (!row) return json({ ok: false, error: 'code_expired' })
  if (row.attempts >= CODE_MAX_ATTEMPTS) return json({ ok: false, error: 'too_many_attempts' })

  const matches = timingSafeEqualHex(row.code_hash, await codeHashOf(orderId, email, code))
  if (!matches) {
    const attempts = row.attempts + 1
    await admin.from('hssv_email_codes').update({ attempts }).eq('id', row.id)
    return json({ ok: false, error: 'wrong_code', attemptsLeft: Math.max(0, CODE_MAX_ATTEMPTS - attempts) })
  }

  await admin.from('hssv_email_codes').update({ verified_at: new Date(now).toISOString() }).eq('id', row.id)
  return json({ ok: true })
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

    const body = await req.json()
    const { orderId, imagePath, consent } = body
    const action = String(body?.action ?? 'verify')

    if (action === 'send_code' || action === 'check_code') {
      return await handleEmailCode(action, body, user.id)
    }

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

    // Email trường phải hợp lệ VÀ đã được xác nhận bằng mã cho đúng đơn này. Kiểm tra trước khi
    // gọi AI: không tốn lượt Gemini cho yêu cầu bỏ qua bước email.
    const schoolEmail = normalizeSchoolEmail(body?.email)
    if (!schoolEmail) {
      await discardUpload()
      return json({ approved: false, error: 'invalid_email' }, 400)
    }
    const { data: codeRows } = await admin
      .from('hssv_email_codes')
      .select('id, email, code_hash, attempts, created_at, expires_at, verified_at')
      .eq('order_id', orderId)
      .eq('user_id', user.id)
    if (!isEmailVerified((codeRows ?? []) as CodeRow[], schoolEmail, Date.now())) {
      await discardUpload()
      return json({ approved: false, error: 'email_not_verified' }, 400)
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

    // Gemini đôi khi chậm bất thường (đo được 30–94s) hoặc quá tải/hết quota. Đọc chữ trên thẻ
    // không cần "suy nghĩ" (thinkingBudget 0: nhanh hơn ~40%, đọc vẫn đúng), và có chuỗi model
    // dự phòng trong một ngân sách thời gian cố định. Hết cách thì để admin duyệt (không từ chối oan).
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
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    const startedAt = Date.now()
    for (const model of GEMINI_MODELS) {
      const timeLeft = GEMINI_TOTAL_BUDGET_MS - (Date.now() - startedAt)
      if (timeLeft < GEMINI_MIN_ATTEMPT_MS) break
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: geminiBody,
            signal: AbortSignal.timeout(Math.min(GEMINI_ATTEMPT_TIMEOUT_MS, timeLeft)),
          }
        )
        if (geminiRes.ok) {
          reading = parseReading(await geminiRes.json())
          break // model đã trả lời thì thôi, dù không đọc ra JSON cũng không hỏi model khác
        }
        console.error('Gemini API error:', model, geminiRes.status)
      } catch (e) {
        console.error('Gemini request failed:', model, e)
      }
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    // Một thẻ — một tài khoản: cùng mã HS/SV đã được tài khoản KHÁC dùng thì từ chối.
    // (Cùng tài khoản dùng lại thẻ cho bài khác thì bình thường.)
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

    // Một email trường — một tài khoản (so bằng mã băm, giống mã thẻ).
    const emailHash = await sha256Hex(schoolEmail)
    const { data: emailDupRows } = await admin
      .from('hssv_verifications')
      .select('id')
      .eq('email_hash', emailHash)
      .neq('user_id', user.id)
      .neq('status', 'rejected')
      .limit(1)

    const decision = decideHssv({
      reading,
      currentYear,
      accountName: profile?.full_name ?? null,
      duplicateOnOtherAccount,
      emailMatch: reading
        ? emailMatchesCard(schoolEmail, { studentId: reading.student_id, fullName: reading.full_name })
        : null,
      emailUsedByOtherAccount: (emailDupRows?.length ?? 0) > 0,
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
      school_email: schoolEmail,
      email_hash: emailHash,
      email_verified_at: new Date().toISOString(),
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
