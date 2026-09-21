// @vitest-environment node
//
// Chạy CHÍNH supabase/functions/sepay-ipn/index.ts (hàm đang nhận tiền thật) với
// Supabase giả trong bộ nhớ và chữ ký HMAC thật. Khác với sepay-transfer.test.js
// (chỉ test hàm quyết định), file này khoá lại toàn bộ luồng: xác thực → tra đơn
// → cấp tab → ghi log giao dịch → gửi email báo.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

const SECRET = 'test-hmac-secret'

/** Trạng thái database giả — được dựng lại trước mỗi test. */
let db

function freshDb(over = {}) {
  return {
    secrets: { sepay_webhook_hmac_secret: SECRET, brevo_api_key: 'brevo-key' },
    orders: [],
    purchases: [],
    bankTransactions: [],
    logTableMissing: false,
    orderLookupError: false,
    updateReturnsNothing: false,
    ...over,
  }
}

/** Query builder giả, đủ dùng cho các lời gọi mà sepay-ipn thực hiện. */
function fakeClient() {
  return {
    from(table) {
      const ctx = { filters: {}, op: 'select', payload: null, opts: null }
      const rows = () => {
        const source = table === 'orders' ? db.orders : table === 'purchases' ? db.purchases : []
        return source.filter((r) => Object.entries(ctx.filters).every(([k, v]) => r[k] === v))
      }

      const run = async () => {
        if (table === 'app_secrets') {
          const v = db.secrets[ctx.filters.key]
          return { data: v === undefined ? null : { value: v }, error: null }
        }

        if (table === 'orders') {
          if (ctx.op === 'update') {
            if (db.updateReturnsNothing) return { data: [], error: null }
            const hit = rows()
            hit.forEach((r) => Object.assign(r, ctx.payload))
            return { data: hit.map((r) => ({ id: r.id })), error: null }
          }
          if (db.orderLookupError) return { data: null, error: { message: 'db down' } }
          return { data: rows()[0] ?? null, error: null }
        }

        if (table === 'purchases') {
          if (ctx.op === 'insert') {
            db.purchases.push({ ...ctx.payload })
            return { data: null, error: null }
          }
          return { data: rows()[0] ?? null, error: null }
        }

        if (table === 'bank_transactions') {
          if (db.logTableMissing) {
            return { data: null, error: { message: 'relation "bank_transactions" does not exist' } }
          }
          const dup =
            ctx.payload.external_id != null &&
            db.bankTransactions.some((t) => t.external_id === ctx.payload.external_id)
          if (dup && ctx.op === 'upsert' && ctx.opts?.ignoreDuplicates)
            return { data: [], error: null }
          db.bankTransactions.push({ ...ctx.payload })
          return { data: [{ id: 'tx' + db.bankTransactions.length }], error: null }
        }

        // songs / profiles (dùng cho email + Drive): không có dữ liệu.
        return { data: null, error: null }
      }

      const api = {
        select: () => api,
        eq: (k, v) => {
          ctx.filters[k] = v
          return api
        },
        update: (p) => {
          ctx.op = 'update'
          ctx.payload = p
          return api
        },
        insert: (p) => {
          ctx.op = 'insert'
          ctx.payload = p
          return api
        },
        upsert: (p, opts) => {
          ctx.op = 'upsert'
          ctx.payload = p
          ctx.opts = opts
          return api
        },
        maybeSingle: () => run(),
        then: (resolve, reject) => run().then(resolve, reject),
      }
      return api
    },
  }
}

vi.mock('jsr:@supabase/supabase-js@2', () => ({ createClient: () => fakeClient() }))
vi.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}))

let handler
const background = []
const emails = []

beforeAll(async () => {
  globalThis.Deno = {
    env: { get: () => 'x' },
    serve: (h) => {
      handler = h
    },
  }
  globalThis.EdgeRuntime = { waitUntil: (p) => background.push(p) }
  await import('../supabase/functions/sepay-ipn/index.ts')
})

beforeEach(() => {
  db = freshDb()
  background.length = 0
  emails.length = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  globalThis.fetch = vi.fn(async (url, init) => {
    if (String(url).includes('brevo')) emails.push(JSON.parse(init.body))
    return { ok: true, text: async () => 'ok' }
  })
})

async function sign(rawBody, timestamp = '1700000000') {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`))
  return (
    'sha256=' +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  )
}

async function deliver(payload, { badSignature = false } = {}) {
  const raw = JSON.stringify(payload)
  const req = new Request('https://x.test/sepay-ipn', {
    method: 'POST',
    headers: {
      'x-sepay-timestamp': '1700000000',
      'x-sepay-signature': badSignature ? 'sha256=deadbeef' : await sign(raw),
    },
    body: raw,
  })
  const res = await handler(req)
  await Promise.all(background)
  return { status: res.status, body: await res.json() }
}

const pendingOrder = (over = {}) => ({
  id: 'o1',
  order_code: 'DH123456',
  user_id: 'u1',
  song_id: 's1',
  amount: 239000,
  status: 'pending',
  ...over,
})

const bank = (over = {}) => ({
  id: 9001,
  gateway: 'Vietcombank',
  transactionDate: '2026-09-19 14:02:37',
  content: 'DH123456 mua tab',
  transferType: 'in',
  transferAmount: 239000,
  accumulated: 5000000, // số dư tài khoản — SePay gửi kèm, KHÔNG được lưu lại
  accountNumber: '03970202801',
  subAccount: null,
  ...over,
})

describe('sepay-ipn — luồng khớp đơn (hành vi gốc)', () => {
  it('đơn đang chờ + đủ tiền → đánh dấu đã trả, cấp tab, ghi log matched', async () => {
    db.orders.push(pendingOrder())
    const r = await deliver(bank())

    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ success: true, matched: true, orderCode: 'DH123456' })
    expect(db.orders[0].status).toBe('paid')
    expect(db.purchases).toEqual([expect.objectContaining({ user_id: 'u1', song_id: 's1' })])
    expect(db.bankTransactions).toEqual([
      expect.objectContaining({
        external_id: '9001',
        status: 'matched',
        order_code: 'DH123456',
        amount: 239000,
      }),
    ])
  })

  it('khách đã có tab từ trước thì không thêm dòng purchases thứ hai', async () => {
    db.orders.push(pendingOrder())
    db.purchases.push({ user_id: 'u1', song_id: 's1' })
    await deliver(bank())
    expect(db.purchases).toHaveLength(1)
  })

  it('yêu cầu trùng đồng thời (update không trúng dòng nào) → không cấp tab lần hai', async () => {
    db.orders.push(pendingOrder())
    db.updateReturnsNothing = true
    const r = await deliver(bank())
    expect(r.body).toMatchObject({ matched: false, reason: 'already_processed' })
    expect(db.purchases).toHaveLength(0)
  })
})

describe('sepay-ipn — tiền về mà không khớp phải được LƯU và BÁO', () => {
  it('thiếu tiền → không cấp tab, lưu unmatched/amount_low, gửi email cho admin', async () => {
    db.orders.push(pendingOrder())
    const r = await deliver(bank({ transferAmount: 100000 }))

    expect(r.body).toMatchObject({ matched: false, reason: 'amount_low' })
    expect(db.orders[0].status).toBe('pending')
    expect(db.purchases).toHaveLength(0)
    expect(db.bankTransactions[0]).toMatchObject({
      status: 'unmatched',
      reason: 'amount_low',
      order_code: 'DH123456',
    })
    expect(emails).toHaveLength(1)
    expect(emails[0].subject).toContain('Tiền về chưa khớp đơn')
  })

  it('nội dung không có mã đơn → BỎ QUA hoàn toàn: không lưu, không email, trả 200', async () => {
    const r = await deliver(bank({ content: 'chuyen tien an trua' }))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ success: true, matched: false, reason: 'unrelated' })
    expect(db.bankTransactions).toHaveLength(0)
    expect(emails).toHaveLength(0)
    expect(db.purchases).toHaveLength(0)
  })

  it('tiền cá nhân không có mã đơn không để lại dấu vết trong log của hàm', async () => {
    await deliver(bank({ content: 'chuyen tien an trua BI MAT' }))
    const logged = [console.log, console.warn, console.error]
      .flatMap((fn) => fn.mock.calls)
      .flat()
      .map(String)
      .join(' ')
    expect(logged).not.toContain('BI MAT')
    expect(logged).not.toContain('5000000')
  })

  it('khoản CÓ mã đơn nhưng không tồn tại đơn → vẫn lưu và báo (order_not_found)', async () => {
    const r = await deliver(bank({ content: 'DH999999 mua tab' }))
    expect(r.body.reason).toBe('order_not_found')
    expect(db.bankTransactions[0]).toMatchObject({ status: 'unmatched', reason: 'order_not_found' })
    expect(emails).toHaveLength(1)
  })

  it('không lưu số dư, số tài khoản vào database (cả khoản khớp lẫn không khớp)', async () => {
    db.orders.push(pendingOrder())
    await deliver(bank({ id: 1, content: 'DH123456' })) // khớp
    await deliver(bank({ id: 2, content: 'DH999999' })) // không khớp
    expect(db.bankTransactions).toHaveLength(2)
    for (const t of db.bankTransactions) {
      expect(t.raw).not.toHaveProperty('accumulated')
      expect(t.raw).not.toHaveProperty('accountNumber')
      expect(t.raw).not.toHaveProperty('subAccount')
      expect(t.raw).toHaveProperty('transferAmount')
    }
  })

  it('log của hàm cho khoản có mã đơn cũng không chứa số dư hay số tài khoản', async () => {
    db.orders.push(pendingOrder())
    await deliver(bank({ content: 'DH123456' }))
    const logged = [console.log, console.warn, console.error]
      .flatMap((fn) => fn.mock.calls)
      .flat()
      .map(String)
      .join(' ')
    expect(logged).toContain('DH123456')
    expect(logged).not.toContain('5000000')
    expect(logged).not.toContain('03970202801')
  })

  it('email báo tiền chưa khớp trỏ đúng địa chỉ web đang chạy', async () => {
    await deliver(bank({ content: 'DH999999' }))
    expect(emails[0].htmlContent).toContain(
      'https://guitar-by-quang-v2.vercel.app/admin-dashboard.html#/tien-ve'
    )
  })

  it('đơn đã hết hạn (khách trả muộn) → KHÔNG tự cấp tab, lưu để admin xử lý', async () => {
    db.orders.push(pendingOrder({ status: 'expired' }))
    await deliver(bank())
    expect(db.purchases).toHaveLength(0)
    expect(db.orders[0].status).toBe('expired')
    expect(db.bankTransactions[0]).toMatchObject({ status: 'unmatched', reason: 'order_expired' })
  })

  it('đơn đã trả mà tiền về thêm khoản nữa → order_already_paid', async () => {
    db.orders.push(pendingOrder({ status: 'paid' }))
    await deliver(bank({ id: 9002 }))
    expect(db.bankTransactions[0].reason).toBe('order_already_paid')
  })

  it('SePay gửi lại đúng giao dịch đó → chỉ một dòng log và chỉ một email', async () => {
    await deliver(bank({ content: 'DH999999 chuyen khoan' }))
    await deliver(bank({ content: 'DH999999 chuyen khoan' }))
    expect(db.bankTransactions).toHaveLength(1)
    expect(emails).toHaveLength(1)
  })

  it('email không bị chèn HTML từ nội dung chuyển khoản do khách tự gõ', async () => {
    await deliver(bank({ content: 'DH999999 <img src=x onerror=alert(1)>' }))
    const html = emails[0].htmlContent
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})

describe('sepay-ipn — an toàn', () => {
  it('tiền RA có chứa mã đơn hợp lệ KHÔNG được coi là thanh toán', async () => {
    db.orders.push(pendingOrder())
    await deliver(bank({ transferType: 'out' }))
    expect(db.orders[0].status).toBe('pending')
    expect(db.purchases).toHaveLength(0)
    // Tiền ra là chi tiêu cá nhân của chủ tài khoản: không lưu vào database, không báo email.
    expect(db.bankTransactions).toHaveLength(0)
    expect(emails).toHaveLength(0)
  })

  it('chữ ký sai → 401, không đụng vào dữ liệu', async () => {
    db.orders.push(pendingOrder())
    const r = await deliver(bank(), { badSignature: true })
    expect(r.status).toBe(401)
    expect(db.orders[0].status).toBe('pending')
    expect(db.bankTransactions).toHaveLength(0)
  })

  it('ghi log lỗi (chưa chạy SQL) KHÔNG làm hỏng việc cấp tab', async () => {
    db.orders.push(pendingOrder())
    db.logTableMissing = true
    const r = await deliver(bank())
    expect(r.body.matched).toBe(true)
    expect(db.orders[0].status).toBe('paid')
    expect(db.purchases).toHaveLength(1)
  })

  it('ghi log lỗi vẫn báo email khi tiền không khớp — không bỏ sót tiền về', async () => {
    db.logTableMissing = true
    await deliver(bank({ content: 'DH999999 khong co don' }))
    expect(emails).toHaveLength(1)
  })

  it('lỗi database khi tra đơn → 500 để SePay gửi lại, không ghi nhận nhầm là không khớp', async () => {
    db.orders.push(pendingOrder())
    db.orderLookupError = true
    const r = await deliver(bank())
    expect(r.status).toBe(500)
    expect(db.bankTransactions).toHaveLength(0)
  })
})
