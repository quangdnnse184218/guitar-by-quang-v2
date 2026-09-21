// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  fetchAllRows,
  timestampName,
  isInsideDir,
  pruneOldBackups,
  formatBytes,
} from '../scripts/backup-lib.js'

/** Supabase giả: bảng `t` có n dòng, chỉ trả tối đa `pageSize` dòng mỗi lần như PostgREST. */
function fakeClient(total, { failAt = null } = {}) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }))
  const calls = []
  return {
    calls,
    from(table) {
      const ctx = { table }
      const api = {
        select: () => api,
        range: (a, b) => ((ctx.a = a), (ctx.b = b), api),
        order: (col) => ((ctx.order = col), api),
        then: (res, rej) => {
          calls.push({ ...ctx })
          if (failAt === ctx.a)
            return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej)
          return Promise.resolve({ data: all.slice(ctx.a, ctx.b + 1), error: null }).then(res, rej)
        },
      }
      return api
    },
  }
}

describe('fetchAllRows', () => {
  it('đọc hết bảng nhiều hơn một trang, đúng thứ tự và không sót/trùng', async () => {
    const client = fakeClient(2500)
    const rows = await fetchAllRows(client, 't', { orderBy: 'id', pageSize: 1000 })
    expect(rows).toHaveLength(2500)
    expect(rows[0].id).toBe(1)
    expect(rows[2499].id).toBe(2500)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2500)
    expect(client.calls.map((c) => [c.a, c.b])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    expect(client.calls.every((c) => c.order === 'id')).toBe(true)
  })

  it('bảng đúng bằng một trang vẫn hỏi trang kế để chắc là hết', async () => {
    const client = fakeClient(1000)
    const rows = await fetchAllRows(client, 't', { pageSize: 1000 })
    expect(rows).toHaveLength(1000)
    expect(client.calls).toHaveLength(2)
  })

  it('bảng rỗng trả về mảng rỗng', async () => {
    expect(await fetchAllRows(fakeClient(0), 't')).toEqual([])
  })

  it('lỗi ở giữa chừng thì báo lỗi kèm tên bảng, không trả dữ liệu thiếu', async () => {
    await expect(
      fetchAllRows(fakeClient(2500, { failAt: 1000 }), 'orders', { pageSize: 1000 })
    ).rejects.toThrow(/orders: boom/)
  })
})

describe('timestampName', () => {
  it('định dạng YYYY-MM-DD_HHMM có đệm số 0', () => {
    expect(timestampName(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05_0703')
  })
})

describe('isInsideDir', () => {
  const root = path.resolve('/du-an/guitar')
  it('nhận ra thư mục con và chính nó', () => {
    expect(isInsideDir(path.join(root, 'backups'), root)).toBe(true)
    expect(isInsideDir(root, root)).toBe(true)
  })
  it('thư mục anh em hoặc bên ngoài thì không', () => {
    expect(isInsideDir(path.resolve('/du-an/guitar-backups'), root)).toBe(false)
    expect(isInsideDir(path.resolve('/khac'), root)).toBe(false)
    expect(isInsideDir(path.resolve('/du-an'), root)).toBe(false)
  })
})

describe('pruneOldBackups', () => {
  function makeDir(names, extra = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gbq-backup-'))
    names.forEach((n) => fs.mkdirSync(path.join(dir, n)))
    extra.forEach((n) => fs.writeFileSync(path.join(dir, n), 'x'))
    return dir
  }

  it('giữ N bản mới nhất, xoá bản cũ hơn', () => {
    const dir = makeDir([
      '2026-09-01_1000',
      '2026-09-03_1000',
      '2026-09-02_1000',
      '2026-09-04_1000',
    ])
    const removed = pruneOldBackups(fs, dir, 2)
    expect(removed.sort()).toEqual(['2026-09-01_1000', '2026-09-02_1000'])
    expect(fs.readdirSync(dir).sort()).toEqual(['2026-09-03_1000', '2026-09-04_1000'])
    fs.rmSync(dir, { recursive: true })
  })

  it('KHÔNG bao giờ động vào thư mục/file có tên khác mẫu', () => {
    const dir = makeDir(
      ['2026-09-01_1000', '2026-09-02_1000', 'anh-cuoi', 'Documents'],
      ['ghi-chu.txt']
    )
    pruneOldBackups(fs, dir, 1)
    expect(fs.readdirSync(dir).sort()).toEqual([
      '2026-09-02_1000',
      'Documents',
      'anh-cuoi',
      'ghi-chu.txt',
    ])
    fs.rmSync(dir, { recursive: true })
  })

  it('không xoá gì khi số bản chưa vượt mức giữ', () => {
    const dir = makeDir(['2026-09-01_1000'])
    expect(pruneOldBackups(fs, dir, 5)).toEqual([])
    expect(fs.readdirSync(dir)).toHaveLength(1)
    fs.rmSync(dir, { recursive: true })
  })

  it('giá trị keep sai (0, âm, không nguyên) thì không xoá gì', () => {
    const dir = makeDir(['2026-09-01_1000', '2026-09-02_1000'])
    for (const k of [0, -1, 1.5, NaN, undefined]) expect(pruneOldBackups(fs, dir, k)).toEqual([])
    expect(fs.readdirSync(dir)).toHaveLength(2)
    fs.rmSync(dir, { recursive: true })
  })
})

describe('formatBytes', () => {
  it('đổi đơn vị dễ đọc', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
