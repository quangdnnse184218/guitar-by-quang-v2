// @vitest-environment node
//
// Chạy CHÍNH supabase/functions/verify-hssv-card/index.ts với Supabase giả trong bộ nhớ
// và Gemini giả: thẻ tốt, AI lỗi, mã trùng, thiếu đồng ý, path người khác, lỗi lưu…
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

let db
const USER = 'user-1'
// Email trường mặc định của các test: chứa đúng mã SV trên thẻ mẫu (SE184218) → khớp kiểu 'id'.
const EMAIL = 'annvse184218@fpt.edu.vn'
const verifiedCode = (over = {}) => ({
  id: 'c0',
  user_id: USER,
  order_id: 'o1',
  email: EMAIL,
  code_hash: 'x',
  attempts: 0,
  created_at: new Date(Date.now() - 60_000).toISOString(),
  expires_at: new Date(Date.now() + 9 * 60_000).toISOString(),
  verified_at: new Date(Date.now() - 30_000).toISOString(),
  ...over,
})

function freshDb(over = {}) {
  return {
    authUser: { id: USER },
    secrets: { gemini_api_key: 'g-key', brevo_api_key: 'b-key' },
    codes: [verifiedCode()],
    codesFail: false,
    profiles: [{ id: USER, full_name: 'Nguyen Van An' }],
    orders: [{ id: 'o1', user_id: USER, song_id: 's1', status: 'pending', amount: 239000 }],
    songs: [{ id: 's1', discount_note: 'HSSV: 179k' }],
    verifications: [],
    removed: [],
    files: { [`${USER}/o1.jpg`]: new Blob(['x'], { type: 'image/jpeg' }) },
    saveFails: false,
    ...over,
  }
}

function fakeClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: db.authUser } }),
    },
    storage: {
      from: () => ({
        download: async (path) =>
          db.files[path]
            ? { data: db.files[path], error: null }
            : { data: null, error: { message: 'nf' } },
        remove: async (paths) => {
          db.removed.push(...paths)
          return { data: [], error: null }
        },
      }),
    },
    from(table) {
      const ctx = { eq: {}, neq: {}, op: 'select', payload: null, limit: null }
      const source = () =>
        ({
          orders: db.orders,
          songs: db.songs,
          profiles: db.profiles,
          hssv_verifications: db.verifications,
          hssv_email_codes: db.codes,
          app_secrets: Object.entries(db.secrets).map(([key, value]) => ({ key, value })),
        })[table] ?? []
      const match = () =>
        source().filter(
          (r) =>
            Object.entries(ctx.eq).every(([k, v]) => r[k] === v) &&
            Object.entries(ctx.neq).every(([k, v]) => r[k] !== v)
        )

      const run = async () => {
        if (table === 'hssv_email_codes' && db.codesFail) return { data: null, error: { message: 'relation does not exist' } }
        if (ctx.op === 'insert') {
          if (table === 'hssv_email_codes') db.codes.push({ id: 'c' + (db.codes.length + 1), ...ctx.payload })
          if (table === 'hssv_verifications') {
            if (db.saveFails) return { data: null, error: { message: 'relation does not exist' } }
            db.verifications.push({ id: 'v' + (db.verifications.length + 1), ...ctx.payload })
          }
          return { data: null, error: null }
        }
        if (ctx.op === 'update') {
          if (table === 'hssv_verifications' && db.saveFails)
            return { data: null, error: { message: 'relation does not exist' } }
          match().forEach((r) => Object.assign(r, ctx.payload))
          return { data: null, error: null }
        }
        const rows = match()
        return {
          // Supabase thật trả về BẢN SAO của dòng, không phải chính đối tượng trong bảng.
          data: ctx.single
            ? rows[0]
              ? { ...rows[0] }
              : null
            : rows.slice(0, ctx.limit ?? rows.length).map((r) => ({ ...r })),
          error: null,
        }
      }

      const api = {
        select: () => api,
        eq: (k, v) => ((ctx.eq[k] = v), api),
        neq: (k, v) => ((ctx.neq[k] = v), api),
        limit: (n) => ((ctx.limit = n), api),
        update: (p) => ((ctx.op = 'update'), (ctx.payload = p), api),
        insert: (p) => ((ctx.op = 'insert'), (ctx.payload = p), api),
        maybeSingle: () => ((ctx.single = true), run()),
        then: (res, rej) => run().then(res, rej),
      }
      return api
    },
  }
}

vi.mock('jsr:@supabase/supabase-js@2', () => ({ createClient: () => fakeClient() }))
vi.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}))

let handler
let geminiReply // () => Response-like
let mails // thân các yêu cầu gửi tới Brevo
let brevoOk

beforeAll(async () => {
  globalThis.Deno = {
    env: { get: () => 'x' },
    serve: (h) => {
      handler = h
    },
  }
  await import('../supabase/functions/verify-hssv-card/index.ts')
})

const goodCard = (over = {}) => ({
  is_student_card: true,
  legible: true,
  full_name: 'Nguyen Van An',
  school: 'ĐH Bách Khoa',
  student_id: 'SE184218',
  expiry_year: new Date().getFullYear() + 2,
  reason: 'Thẻ rõ.',
  ...over,
})

const asGemini = (obj) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
})

beforeEach(() => {
  db = freshDb()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  geminiReply = () => asGemini(goodCard())
  mails = []
  brevoOk = true
  globalThis.fetch = vi.fn(async (url, init) => {
    if (String(url).includes('api.brevo.com')) {
      mails.push(JSON.parse(init.body))
      return { ok: brevoOk, status: brevoOk ? 201 : 400, json: async () => ({}), text: async () => '' }
    }
    return geminiReply()
  })
})

async function call(body = {}) {
  const req = new Request('https://x.test/verify-hssv-card', {
    method: 'POST',
    headers: { Authorization: 'Bearer t' },
    body: JSON.stringify({ orderId: 'o1', imagePath: `${USER}/o1.jpg`, consent: true, email: EMAIL, ...body }),
  })
  const res = await handler(req)
  return { status: res.status, body: await res.json() }
}

describe('verify-hssv-card — kết quả xác minh', () => {
  it('thẻ tốt → tự duyệt, hạ giá đơn, lưu lượt kèm mốc xoá ảnh', async () => {
    const r = await call()
    expect(r.body).toMatchObject({ approved: true, status: 'approved', newAmount: 179000 })
    expect(db.orders[0]).toMatchObject({ amount: 179000, hssv_status: 'approved', is_hssv: true })
    expect(db.verifications).toHaveLength(1)
    expect(db.verifications[0]).toMatchObject({
      status: 'approved',
      extracted_id: 'SE184218',
      image_path: `${USER}/o1.jpg`,
      reviewed_at: null,
    })
    expect(db.verifications[0].card_hash).toMatch(/^[0-9a-f]{64}$/)
    // Hạn giữ ảnh tối đa ~30 ngày
    const days = (new Date(db.verifications[0].purge_at) - Date.now()) / 86400000
    expect(days).toBeGreaterThan(29)
    expect(days).toBeLessThanOrEqual(30)
  })

  it('không lưu mã thẻ dạng chữ thường, chỉ lưu băm (mã băm không chứa mã gốc)', async () => {
    await call()
    expect(db.verifications[0].card_hash).not.toContain('SE184218')
  })

  it('Gemini lỗi HTTP → chờ admin, KHÔNG bị từ chối và KHÔNG hạ giá', async () => {
    geminiReply = () => ({ ok: false, status: 503, json: async () => ({}) })
    const r = await call()
    expect(r.body).toMatchObject({ approved: false, status: 'pending' })
    expect(db.orders[0]).toMatchObject({ amount: 239000, hssv_status: 'pending' })
    expect(db.verifications[0].flags).toContain('ai_unavailable')
  })

  const modelOf = (call) => String(call[0]).match(/models\/([^:]+):/)[1]

  it('model đầu quá tải (503) → sang model dự phòng ngay và vẫn duyệt được', async () => {
    let n = 0
    geminiReply = () =>
      ++n === 1 ? { ok: false, status: 503, json: async () => ({}) } : asGemini(goodCard())
    const r = await call()
    expect(n).toBe(2)
    expect(r.body).toMatchObject({ approved: true, status: 'approved' })
    expect(globalThis.fetch.mock.calls.map(modelOf)).toEqual([
      'gemini-3.6-flash',
      'gemini-3-flash-preview',
    ])
  })

  it('model bị ngừng cấp (404) hay hết quota (429) cũng chuyển sang model kế', async () => {
    let n = 0
    geminiReply = () =>
      ++n === 1
        ? { ok: false, status: 404, json: async () => ({}) }
        : n === 2
          ? { ok: false, status: 429, json: async () => ({}) }
          : asGemini(goodCard())
    const r = await call()
    expect(n).toBe(3)
    expect(r.body.status).toBe('approved')
  })

  it('cả chuỗi model đều lỗi → thử đúng từng model một lần rồi chuyển admin', async () => {
    let n = 0
    geminiReply = () => (n++, { ok: false, status: 503, json: async () => ({}) })
    const r = await call()
    expect(n).toBe(3)
    expect(r.body.status).toBe('pending')
    expect(db.verifications[0].flags).toContain('ai_unavailable')
    expect(db.orders[0].amount).toBe(239000)
  })

  it('quá thời gian chờ ở model đầu → thử model kế, không treo khách', async () => {
    let n = 0
    globalThis.fetch = vi.fn(async () => {
      if (++n === 1) throw new DOMException('signal timed out', 'TimeoutError')
      return geminiReply()
    })
    const r = await call()
    expect(n).toBe(2)
    expect(r.body.status).toBe('approved')
  })

  it('tổng thời gian chờ AI có trần: hết ngân sách thì dừng, không gọi tiếp model còn lại', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    let n = 0
    globalThis.fetch = vi.fn(async () => {
      n++
      vi.setSystemTime(Date.now() + 30_000) // mỗi lần gọi "tốn" 30 giây rồi hết hạn
      throw new DOMException('signal timed out', 'TimeoutError')
    })
    const r = await call()
    vi.useRealTimers()
    expect(n).toBe(2) // 30s + 30s > 40s nên model thứ ba không được gọi
    expect(r.body.status).toBe('pending')
  })

  it('thời gian chờ mỗi lần gọi bị kẹp theo phần ngân sách còn lại (25s rồi ≤10s)', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    vi.useFakeTimers({ toFake: ['Date'] })
    globalThis.fetch = vi.fn(async () => {
      vi.setSystemTime(Date.now() + 30_000)
      throw new DOMException('signal timed out', 'TimeoutError')
    })
    await call()
    vi.useRealTimers()
    const args = timeoutSpy.mock.calls.map((c) => c[0])
    timeoutSpy.mockRestore()
    expect(args[0]).toBe(25_000)
    expect(args[1]).toBeLessThanOrEqual(10_000)
  })

  it('mỗi lần gọi Gemini đều có giới hạn thời gian chờ', async () => {
    await call()
    const [, init] = globalThis.fetch.mock.calls[0]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('gọi Gemini tắt bước suy nghĩ (nhanh hơn) và dùng model chính đầu tiên', async () => {
    await call()
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(modelOf([url])).toBe('gemini-3.6-flash')
    expect(JSON.parse(init.body).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it('Gemini trả rác không phải JSON → chờ admin', async () => {
    geminiReply = () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'xin lỗi tôi không thể' }] } }],
      }),
    })
    const r = await call()
    expect(r.body.status).toBe('pending')
  })

  it('không phải thẻ → từ chối, giá giữ nguyên', async () => {
    geminiReply = () => asGemini(goodCard({ is_student_card: false, reason: 'Ảnh mèo.' }))
    const r = await call()
    expect(r.body).toMatchObject({ approved: false, status: 'rejected' })
    expect(db.orders[0]).toMatchObject({ amount: 239000, hssv_status: 'rejected' })
  })

  it('thẻ đã dùng ở tài khoản khác → từ chối luôn và báo rõ, giá giữ nguyên', async () => {
    await call() // lần 1 cho user-1
    // tài khoản khác dùng lại đúng mã
    db.authUser = { id: 'user-2' }
    db.profiles.push({ id: 'user-2', full_name: 'Nguyen Van An' })
    db.orders.push({
      id: 'o2',
      user_id: 'user-2',
      song_id: 's1',
      status: 'pending',
      amount: 239000,
    })
    db.files['user-2/o2.jpg'] = new Blob(['y'], { type: 'image/jpeg' })
    const email2 = 'annv2se184218@fpt.edu.vn'
    db.codes.push(verifiedCode({ id: 'c2', user_id: 'user-2', order_id: 'o2', email: email2 }))

    const r = await call({ orderId: 'o2', imagePath: 'user-2/o2.jpg', email: email2 })
    expect(r.body).toMatchObject({ approved: false, status: 'rejected' })
    expect(r.body.reason).toMatch(/tài khoản khác/)
    expect(db.orders.find((o) => o.id === 'o2').amount).toBe(239000)
    expect(db.verifications.find((v) => v.order_id === 'o2').flags).toContain('duplicate_id')
  })

  it('cùng tài khoản dùng lại thẻ cho bài khác thì vẫn được duyệt', async () => {
    await call()
    db.orders.push({ id: 'o3', user_id: USER, song_id: 's1', status: 'pending', amount: 239000 })
    db.files[`${USER}/o3.jpg`] = new Blob(['z'], { type: 'image/jpeg' })
    // xác minh theo TỪNG ĐƠN: đơn mới phải xác nhận email lại (cùng email, cùng tài khoản thì được)
    db.codes.push(verifiedCode({ id: 'c3', order_id: 'o3' }))
    const r = await call({ orderId: 'o3', imagePath: `${USER}/o3.jpg` })
    expect(r.body.status).toBe('approved')
  })

  it('lượt cũ bị từ chối không chặn người khác dùng mã đó', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('SE184218'))
    const sameCardHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    db.verifications.push({
      id: 'old',
      user_id: 'someone',
      status: 'rejected',
      card_hash: sameCardHash,
    })
    const r = await call()
    expect(r.body.status).toBe('approved')
  })

  it('tải lại ảnh cho cùng một đơn thì cập nhật lượt cũ, không sinh dòng thứ hai', async () => {
    geminiReply = () => asGemini(goodCard({ legible: false }))
    await call()
    geminiReply = () => asGemini(goodCard())
    const r = await call()
    expect(r.body.status).toBe('approved')
    expect(db.verifications).toHaveLength(1)
    expect(db.verifications[0].status).toBe('approved')
  })

  it('đổi sang ảnh mới (tên file khác): lượt trỏ sang ảnh mới và ảnh cũ bị xoá', async () => {
    geminiReply = () => asGemini(goodCard({ is_student_card: false }))
    await call() // ảnh đầu không phải thẻ → từ chối
    db.files[`${USER}/o1-2.jpg`] = new Blob(['thẻ thật'], { type: 'image/jpeg' })
    geminiReply = () => asGemini(goodCard())

    const r = await call({ imagePath: `${USER}/o1-2.jpg` })

    expect(r.body).toMatchObject({ approved: true, status: 'approved', newAmount: 179000 })
    expect(db.verifications).toHaveLength(1)
    expect(db.verifications[0].image_path).toBe(`${USER}/o1-2.jpg`)
    expect(db.orders[0]).toMatchObject({ amount: 179000, hssv_image_path: `${USER}/o1-2.jpg` })
    expect(db.removed).toEqual([`${USER}/o1.jpg`])
  })

  it('gửi lại đúng ảnh cũ (cùng đường dẫn) thì KHÔNG xoá mất ảnh đang dùng', async () => {
    await call()
    await call()
    expect(db.removed).toEqual([])
  })
})

describe('verify-hssv-card — an toàn', () => {
  it('thiếu đồng ý → 400, không gọi AI, không lưu gì', async () => {
    const r = await call({ consent: false })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('consent_required')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(db.verifications).toHaveLength(0)
  })

  it('chưa đăng nhập → 401', async () => {
    db.authUser = null
    expect((await call()).status).toBe(401)
  })

  it('path nằm trong thư mục của người khác → 403 (chống IDOR)', async () => {
    const r = await call({ imagePath: 'user-9/o1.jpg' })
    expect(r.status).toBe(403)
    expect(db.verifications).toHaveLength(0)
  })

  it('path chứa ".." → 403', async () => {
    const r = await call({ imagePath: `${USER}/../user-9/o1.jpg` })
    expect(r.status).toBe(403)
  })

  it('đơn của người khác → 404', async () => {
    db.orders[0].user_id = 'user-9'
    expect((await call()).status).toBe(404)
  })

  it('đơn đã trả thì không xác minh nữa', async () => {
    db.orders[0].status = 'paid'
    const r = await call()
    expect(r.body.error).toBe('already_paid')
    expect(db.orders[0].amount).toBe(239000)
  })

  it('lưu lượt xác minh lỗi (chưa chạy SQL) → 500 và KHÔNG hạ giá', async () => {
    db.saveFails = true
    const r = await call()
    expect(r.status).toBe(500)
    expect(db.orders[0].amount).toBe(239000)
  })

  it('lưu lỗi → ảnh vừa tải bị xoá, không để ảnh nằm lại không ai quản', async () => {
    db.saveFails = true
    await call()
    expect(db.removed).toEqual([`${USER}/o1.jpg`])
  })

  it('đơn đã trả → ảnh vừa tải bị xoá', async () => {
    db.orders[0].status = 'paid'
    await call()
    expect(db.removed).toEqual([`${USER}/o1.jpg`])
  })

  it('path của người khác bị chặn và TUYỆT ĐỐI không được xoá file của họ', async () => {
    db.files['user-9/o1.jpg'] = new Blob(['x'], { type: 'image/jpeg' })
    const r = await call({ imagePath: 'user-9/o1.jpg' })
    expect(r.status).toBe(403)
    expect(db.removed).toEqual([])
  })
})

// ====================================================================================
// Email trường: gửi mã, kiểm mã, và so email với thẻ
// ====================================================================================
const geminiCalls = () => globalThis.fetch.mock.calls.filter(([u]) => String(u).includes('generativelanguage')).length
const sentCode = () => (mails.at(-1)?.subject.match(/^(\d{6}) /) || [])[1]

describe('verify-hssv-card — gửi mã về email trường', () => {
  beforeEach(() => {
    db.codes = []
  })

  it('email .edu.vn hợp lệ → gửi đúng tới địa chỉ đó, lưu mã BĂM (không lưu mã gốc), hạn 10 phút', async () => {
    const r = await call({ action: 'send_code' })
    expect(r.body).toMatchObject({ ok: true, expiresInSec: 600 })
    expect(mails).toHaveLength(1)
    expect(mails[0].to).toEqual([{ email: EMAIL }])
    const code = sentCode()
    expect(code).toMatch(/^\d{6}$/)
    expect(db.codes).toHaveLength(1)
    expect(db.codes[0].code_hash).not.toContain(code)
    expect(db.codes[0].code_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(db.codes[0].verified_at).toBeNull()
    expect(Date.parse(db.codes[0].expires_at) - Date.parse(db.codes[0].created_at)).toBe(600_000)
    expect(geminiCalls()).toBe(0)
  })

  it('chuẩn hoá email (hoa/thường, khoảng trắng) trước khi gửi và lưu', async () => {
    await call({ action: 'send_code', email: '  AnNVse184218@FPT.edu.vn ' })
    expect(mails[0].to).toEqual([{ email: EMAIL }])
    expect(db.codes[0].email).toBe(EMAIL)
  })

  it.each(['an@gmail.com', 'an@fpt.edu', 'an@edu.vn.evil.com', 'khong-phai-email', '', 'a b@fpt.edu.vn'])(
    'email không phải của trường (%s) → từ chối, không gửi gì',
    async (email) => {
      const r = await call({ action: 'send_code', email })
      expect(r.body).toMatchObject({ ok: false, error: 'invalid_email' })
      expect(mails).toHaveLength(0)
      expect(db.codes).toHaveLength(0)
    }
  )

  it('thiếu đồng ý → 400, không gửi', async () => {
    const r = await call({ action: 'send_code', consent: false })
    expect(r.status).toBe(400)
    expect(mails).toHaveLength(0)
  })

  it('đơn của người khác → 404, không gửi', async () => {
    db.orders[0].user_id = 'someone-else'
    const r = await call({ action: 'send_code' })
    expect(r.status).toBe(404)
    expect(mails).toHaveLength(0)
  })

  it('xin lại mã cho cùng đơn trong vòng 60 giây → báo chờ, không gửi thêm', async () => {
    await call({ action: 'send_code' })
    const r = await call({ action: 'send_code' })
    expect(r.body.ok).toBe(false)
    expect(r.body.error).toBe('wait')
    expect(r.body.retryAfterSec).toBeGreaterThan(0)
    expect(mails).toHaveLength(1)
  })

  it('một tài khoản xin quá 5 mã trong một giờ → chặn', async () => {
    db.codes = Array.from({ length: 5 }, (_, i) =>
      verifiedCode({ id: 'old' + i, order_id: 'khac-' + i, verified_at: null, created_at: new Date(Date.now() - (i + 2) * 120_000).toISOString() })
    )
    const r = await call({ action: 'send_code' })
    expect(r.body).toMatchObject({ ok: false, error: 'too_many' })
    expect(mails).toHaveLength(0)
  })

  it('email đã gắn với tài khoản khác → báo ngay, không gửi mã', async () => {
    const hash = await sha256(EMAIL)
    db.verifications.push({ id: 'v9', user_id: 'user-khac', status: 'approved', email_hash: hash })
    const r = await call({ action: 'send_code' })
    expect(r.body).toMatchObject({ ok: false, error: 'email_used' })
    expect(mails).toHaveLength(0)
  })

  it('Brevo từ chối gửi → 502, khách biết là chưa gửi được', async () => {
    brevoOk = false
    const r = await call({ action: 'send_code' })
    expect(r.status).toBe(502)
    expect(r.body).toMatchObject({ ok: false, error: 'send_failed' })
  })

  it('chưa chạy SQL tạo bảng mã → 500, không giả vờ đã gửi', async () => {
    db.codesFail = true
    const r = await call({ action: 'send_code' })
    expect(r.status).toBe(500)
    expect(mails).toHaveLength(0)
  })
})

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('verify-hssv-card — kiểm mã', () => {
  let code
  beforeEach(async () => {
    db.codes = []
    await call({ action: 'send_code' })
    code = sentCode()
  })

  it('nhập đúng mã → email được đánh dấu đã xác nhận', async () => {
    const r = await call({ action: 'check_code', code })
    expect(r.body).toEqual({ ok: true })
    expect(db.codes[0].verified_at).toBeTruthy()
  })

  it('nhập sai → báo sai, tăng số lần thử, chưa xác nhận', async () => {
    const wrong = code === '000000' ? '111111' : '000000'
    const r = await call({ action: 'check_code', code: wrong })
    expect(r.body).toMatchObject({ ok: false, error: 'wrong_code', attemptsLeft: 4 })
    expect(db.codes[0].attempts).toBe(1)
    expect(db.codes[0].verified_at).toBeNull()
  })

  it('sai 5 lần thì khoá mã đó, kể cả khi lần thứ 6 nhập đúng', async () => {
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await call({ action: 'check_code', code: wrong })
    const r = await call({ action: 'check_code', code })
    expect(r.body).toMatchObject({ ok: false, error: 'too_many_attempts' })
    expect(db.codes[0].verified_at).toBeNull()
  })

  it('mã hết hạn → không nhận', async () => {
    db.codes[0].expires_at = new Date(Date.now() - 1000).toISOString()
    const r = await call({ action: 'check_code', code })
    expect(r.body).toMatchObject({ ok: false, error: 'code_expired' })
  })

  it('mã của email này không dùng được cho email khác', async () => {
    const r = await call({ action: 'check_code', code, email: 'nguoikhac@fpt.edu.vn' })
    expect(r.body.ok).toBe(false)
    expect(db.codes[0].verified_at).toBeNull()
  })

  it('mã của đơn này không dùng được cho đơn khác của cùng tài khoản', async () => {
    db.orders.push({ id: 'o2', user_id: USER, song_id: 's1', status: 'pending', amount: 239000 })
    const r = await call({ action: 'check_code', code, orderId: 'o2' })
    expect(r.body.ok).toBe(false)
    expect(db.codes[0].verified_at).toBeNull()
  })
})

describe('verify-hssv-card — thẻ phải đi kèm email trường đã xác nhận', () => {
  it('chưa xác nhận email → 400, KHÔNG gọi AI, không hạ giá, ảnh vừa tải bị xoá', async () => {
    db.codes = [verifiedCode({ verified_at: null })]
    const r = await call()
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('email_not_verified')
    expect(geminiCalls()).toBe(0)
    expect(db.orders[0].amount).toBe(239000)
    expect(db.removed).toContain(`${USER}/o1.jpg`)
  })

  it('xác nhận email quá 1 giờ trước → phải xác nhận lại', async () => {
    db.codes = [verifiedCode({ verified_at: new Date(Date.now() - 61 * 60_000).toISOString() })]
    const r = await call()
    expect(r.body.error).toBe('email_not_verified')
  })

  it('xác nhận email A rồi gửi thẻ kèm email B → không được', async () => {
    const r = await call({ email: 'nguoikhac@fpt.edu.vn' })
    expect(r.body.error).toBe('email_not_verified')
    expect(geminiCalls()).toBe(0)
  })

  it('không gửi email (bản giao diện cũ) → 400', async () => {
    const r = await call({ email: undefined })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('invalid_email')
  })

  it('email chứa mã SV trên thẻ → duyệt, lưu email + mã băm email', async () => {
    const r = await call()
    expect(r.body.status).toBe('approved')
    expect(db.verifications[0].school_email).toBe(EMAIL)
    expect(db.verifications[0].email_hash).toBe(await sha256(EMAIL))
    expect(db.verifications[0].flags).not.toContain('email_mismatch')
  })

  it('email không mang mã SV lẫn tên trên thẻ → CHỜ admin (không từ chối), giá giữ nguyên', async () => {
    const other = 'tranthib2101999@hcmut.edu.vn'
    db.codes = [verifiedCode({ email: other })]
    const r = await call({ email: other })
    expect(r.body.status).toBe('pending')
    expect(db.verifications[0].flags).toContain('email_mismatch')
    expect(db.orders[0].amount).toBe(239000)
  })

  it('email đã dùng ở tài khoản khác → từ chối và báo rõ', async () => {
    db.verifications.push({ id: 'v9', user_id: 'user-khac', status: 'approved', email_hash: await sha256(EMAIL) })
    const r = await call()
    expect(r.body.status).toBe('rejected')
    expect(r.body.reason).toMatch(/Email trường này đã được dùng/)
    expect(db.orders[0].amount).toBe(239000)
  })

  it('AI lỗi thì vẫn chỉ chờ admin — không vì thiếu kết quả so email mà từ chối', async () => {
    geminiReply = () => ({ ok: false, status: 500, json: async () => ({}) })
    const r = await call()
    expect(r.body.status).toBe('pending')
  })
})
