// @vitest-environment node
//
// Chạy CHÍNH supabase/functions/verify-hssv-card/index.ts với Supabase giả trong bộ nhớ
// và Gemini giả: thẻ tốt, AI lỗi, mã trùng, thiếu đồng ý, path người khác, lỗi lưu…
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

let db
const USER = 'user-1'

function freshDb(over = {}) {
  return {
    authUser: { id: USER },
    secrets: { gemini_api_key: 'g-key' },
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
          app_secrets: Object.entries(db.secrets).map(([key, value]) => ({ key, value })),
        })[table] ?? []
      const match = () =>
        source().filter(
          (r) =>
            Object.entries(ctx.eq).every(([k, v]) => r[k] === v) &&
            Object.entries(ctx.neq).every(([k, v]) => r[k] !== v)
        )

      const run = async () => {
        if (ctx.op === 'insert') {
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
            : rows.slice(0, ctx.limit ?? rows.length),
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
  globalThis.fetch = vi.fn(async () => geminiReply())
})

async function call(body = {}) {
  const req = new Request('https://x.test/verify-hssv-card', {
    method: 'POST',
    headers: { Authorization: 'Bearer t' },
    body: JSON.stringify({ orderId: 'o1', imagePath: `${USER}/o1.jpg`, consent: true, ...body }),
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

  it('Gemini lỗi tạm thời (503) lần đầu rồi ổn → thử lại và vẫn duyệt được', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    let n = 0
    geminiReply = () =>
      ++n === 1 ? { ok: false, status: 503, json: async () => ({}) } : asGemini(goodCard())
    const pending = call()
    await vi.advanceTimersByTimeAsync(2000)
    const r = await pending
    vi.useRealTimers()
    expect(n).toBe(2)
    expect(r.body).toMatchObject({ approved: true, status: 'approved' })
  })

  it('Gemini lỗi 503 cả hai lần → chỉ thử đúng 2 lần rồi chuyển admin', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    let n = 0
    geminiReply = () => (n++, { ok: false, status: 503, json: async () => ({}) })
    const pending = call()
    await vi.advanceTimersByTimeAsync(5000)
    const r = await pending
    vi.useRealTimers()
    expect(n).toBe(2)
    expect(r.body.status).toBe('pending')
    expect(db.verifications[0].flags).toContain('ai_unavailable')
  })

  it('Gemini lỗi không tạm thời (400) → không thử lại', async () => {
    let n = 0
    geminiReply = () => (n++, { ok: false, status: 400, json: async () => ({}) })
    const r = await call()
    expect(n).toBe(1)
    expect(r.body.status).toBe('pending')
  })

  it('quá thời gian chờ / lỗi mạng → chuyển admin ngay, không thử lại, không treo khách', async () => {
    let n = 0
    globalThis.fetch = vi.fn(async () => {
      n++
      throw new DOMException('signal timed out', 'TimeoutError')
    })
    const r = await call()
    expect(n).toBe(1)
    expect(r.body).toMatchObject({ approved: false, status: 'pending' })
    expect(db.orders[0].amount).toBe(239000)
  })

  it('mỗi lần gọi Gemini đều có giới hạn thời gian chờ', async () => {
    await call()
    const [, init] = globalThis.fetch.mock.calls[0]
    expect(init.signal).toBeInstanceOf(AbortSignal)
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

  it('thẻ đã dùng ở tài khoản khác → chờ admin, giá giữ nguyên', async () => {
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

    const r = await call({ orderId: 'o2', imagePath: 'user-2/o2.jpg' })
    expect(r.body).toMatchObject({ approved: false, status: 'pending' })
    expect(db.orders.find((o) => o.id === 'o2').amount).toBe(239000)
    expect(db.verifications.find((v) => v.order_id === 'o2').flags).toContain('duplicate_id')
  })

  it('cùng tài khoản dùng lại thẻ cho bài khác thì vẫn được duyệt', async () => {
    await call()
    db.orders.push({ id: 'o3', user_id: USER, song_id: 's1', status: 'pending', amount: 239000 })
    db.files[`${USER}/o3.jpg`] = new Blob(['z'], { type: 'image/jpeg' })
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
