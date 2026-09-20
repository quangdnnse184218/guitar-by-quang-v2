// @vitest-environment node
//
// Chạy CHÍNH supabase/functions/hssv-cleanup/index.ts: chỉ xoá ảnh đã tới hạn,
// giữ lại kết quả đọc thẻ, và chỉ nhận lời gọi có khoá bí mật.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

const SECRET = 'cleanup-secret'
const past = () => new Date(Date.now() - 3600_000).toISOString()
const future = () => new Date(Date.now() + 86400_000).toISOString()

let db

function fakeClient() {
  return {
    storage: {
      from: () => ({
        remove: async (paths) => {
          if (db.removeFails) return { data: null, error: { message: 'storage down' } }
          db.removed.push(...paths)
          return { data: [], error: null }
        },
      }),
    },
    from(table) {
      const ctx = { eq: {}, op: 'select', payload: null, notNull: null, lte: null, limit: null }
      const rows = () => {
        const src =
          table === 'hssv_verifications' ? db.verifications : table === 'orders' ? db.orders : []
        return src.filter(
          (r) =>
            Object.entries(ctx.eq).every(([k, v]) => r[k] === v) &&
            (!ctx.notNull || r[ctx.notNull] != null) &&
            (!ctx.lte || new Date(r[ctx.lte.col]) <= new Date(ctx.lte.val))
        )
      }
      const run = async () => {
        if (table === 'app_secrets') {
          const v = db.secrets[ctx.eq.key]
          return { data: v === undefined ? null : { value: v }, error: null }
        }
        if (ctx.op === 'update') {
          rows().forEach((r) => Object.assign(r, ctx.payload))
          return { data: null, error: null }
        }
        if (db.queryFails) return { data: null, error: { message: 'db' } }
        return { data: rows().slice(0, ctx.limit ?? undefined), error: null }
      }
      const api = {
        select: () => api,
        eq: (k, v) => ((ctx.eq[k] = v), api),
        not: (col) => ((ctx.notNull = col), api),
        lte: (col, val) => ((ctx.lte = { col, val }), api),
        limit: (n) => ((ctx.limit = n), api),
        update: (p) => ((ctx.op = 'update'), (ctx.payload = p), api),
        maybeSingle: () => run(),
        then: (res, rej) => run().then(res, rej),
      }
      return api
    },
  }
}

vi.mock('jsr:@supabase/supabase-js@2', () => ({ createClient: () => fakeClient() }))
vi.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}))

let handler
beforeAll(async () => {
  globalThis.Deno = { env: { get: () => 'x' }, serve: (h) => (handler = h) }
  await import('../supabase/functions/hssv-cleanup/index.ts')
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db = {
    secrets: { hssv_cleanup_secret: SECRET },
    removed: [],
    removeFails: false,
    queryFails: false,
    orders: [
      { id: 'o1', hssv_image_path: 'u/o1.jpg' },
      { id: 'o2', hssv_image_path: 'u/o2.jpg' },
    ],
    verifications: [
      {
        id: 'v1',
        order_id: 'o1',
        image_path: 'u/o1.jpg',
        purge_at: past(),
        status: 'approved',
        card_hash: 'h1',
      },
      {
        id: 'v2',
        order_id: 'o2',
        image_path: 'u/o2.jpg',
        purge_at: future(),
        status: 'pending',
        card_hash: 'h2',
      },
      {
        id: 'v3',
        order_id: null,
        image_path: null,
        purge_at: past(),
        status: 'approved',
        card_hash: 'h3',
      },
    ],
  }
})

const call = (headers = { 'x-cleanup-secret': SECRET }, method = 'POST') =>
  handler(new Request('https://x.test/hssv-cleanup', { method, headers })).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  }))

describe('hssv-cleanup', () => {
  it('xoá ảnh đã tới hạn, giữ ảnh chưa tới hạn', async () => {
    const r = await call()
    expect(r.body).toEqual({ ok: true, purged: 1, failed: 0 })
    expect(db.removed).toEqual(['u/o1.jpg'])
    expect(db.verifications.find((v) => v.id === 'v2').image_path).toBe('u/o2.jpg')
  })

  it('chỉ xoá FILE: kết quả đọc thẻ và mã băm vẫn còn, đơn được gỡ đường dẫn ảnh', async () => {
    await call()
    const v1 = db.verifications.find((v) => v.id === 'v1')
    expect(v1.image_path).toBeNull()
    expect(v1.image_purged_at).toBeTruthy()
    expect(v1.status).toBe('approved')
    expect(v1.card_hash).toBe('h1')
    expect(db.orders.find((o) => o.id === 'o1').hssv_image_path).toBeNull()
    expect(db.orders.find((o) => o.id === 'o2').hssv_image_path).toBe('u/o2.jpg')
  })

  it('xoá file lỗi → giữ nguyên dòng để lần sau thử lại, không báo là đã xoá', async () => {
    db.removeFails = true
    const r = await call()
    expect(r.body).toMatchObject({ purged: 0, failed: 1 })
    expect(db.verifications.find((v) => v.id === 'v1').image_path).toBe('u/o1.jpg')
  })

  it('chạy lần hai không làm gì thêm', async () => {
    await call()
    const r = await call()
    expect(r.body).toMatchObject({ purged: 0, failed: 0 })
    expect(db.removed).toEqual(['u/o1.jpg'])
  })

  it('sai khoá → 401, không xoá gì', async () => {
    const r = await call({ 'x-cleanup-secret': 'sai' })
    expect(r.status).toBe(401)
    expect(db.removed).toEqual([])
  })

  it('thiếu khoá → 401', async () => {
    expect((await call({})).status).toBe(401)
  })

  it('chưa cấu hình khoá trong database → 401 (không mở toang)', async () => {
    db.secrets = {}
    expect((await call({ 'x-cleanup-secret': '' })).status).toBe(401)
  })

  it('không phải POST → 405', async () => {
    const r = await handler(new Request('https://x.test/hssv-cleanup', { method: 'GET' }))
    expect(r.status).toBe(405)
  })

  it('lỗi đọc danh sách → 500', async () => {
    db.queryFails = true
    expect((await call()).status).toBe(500)
  })
})
