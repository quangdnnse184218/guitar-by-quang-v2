/**
 * ==============================================================================
 * SAO LƯU DỮ LIỆU SUPABASE RA MÁY (không cần VPS, không tốn tiền)
 * ==============================================================================
 * Xuất các bảng quan trọng ra file JSON trong một thư mục RIÊNG NẰM NGOÀI kho code.
 *
 *   npm run backup
 *   npm run backup -- --dir "E:\\sao-luu-guitar" --keep 12
 *   npm run backup -- --with-secrets        (thêm bảng app_secrets — xem cảnh báo bên dưới)
 *
 * Mặc định lưu vào thư mục `guitar-by-quang-backups` nằm cạnh thư mục dự án, mỗi lần một thư
 * mục con theo giờ (VD 2026-09-22_1530), giữ 12 bản mới nhất.
 *
 * ⚠ Bản sao lưu chứa thông tin khách hàng (email, đơn hàng…). TUYỆT ĐỐI không đưa lên GitHub
 *   (kho code đang công khai) — script từ chối ghi vào bên trong thư mục dự án.
 * ⚠ `--with-secrets` ghi cả khoá bí mật (SePay, Gemini, Brevo…) dạng chữ thường: chỉ dùng khi
 *   bạn cất thư mục đó ở nơi an toàn. Không có cờ này thì bảng app_secrets KHÔNG được xuất.
 *
 * Cần SUPABASE_SERVICE_ROLE_KEY trong .env.local (chỉ dùng trên máy bạn, không đưa vào web).
 * Không sao lưu: ảnh thẻ HSSV (cố ý tự xoá sau vài ngày) và file trong bucket `uploads`
 * (video/âm thanh/ảnh — nên có bản gốc trên máy hoặc Drive của bạn).
 * Mật khẩu tài khoản không xuất được: nếu phải khôi phục, khách đặt lại mật khẩu.
 * ==============================================================================
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  fetchAllRows,
  timestampName,
  isInsideDir,
  pruneOldBackups,
  formatBytes,
} from './backup-lib.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Bảng cần sao lưu và cột dùng để sắp xếp khi đọc theo trang.
const TABLES = [
  ['profiles', 'id'],
  ['songs', 'id'],
  ['gears', 'id'],
  ['orders', 'id'],
  ['purchases', 'id'],
  ['favorites', 'id'],
  ['bank_transactions', 'id'],
  ['hssv_verifications', 'id'],
  ['access_revocations', 'id'],
  ['cam_am_players', 'player_id'],
  ['cam_am_leaderboard', 'id'],
]
const SECRET_TABLES = [['app_secrets', 'key']]

function parseArgs(argv) {
  const opts = { dir: null, keep: 12, withSecrets: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir') opts.dir = argv[++i]
    else if (a === '--keep') opts.keep = Number(argv[++i])
    else if (a === '--with-secrets') opts.withSecrets = true
    else if (a === '--help' || a === '-h') opts.help = true
    else throw new Error(`Tham số không hợp lệ: ${a}`)
  }
  return opts
}

async function fetchAuthUsers(client) {
  const users = []
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`auth.users: ${error.message}`)
    users.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        user_metadata: u.user_metadata,
      }))
    )
    if (data.users.length < 200) break
  }
  return users
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log('Dùng: npm run backup -- [--dir <thư mục>] [--keep <số bản>] [--with-secrets]')
    return
  }
  if (!Number.isInteger(opts.keep) || opts.keep < 1) throw new Error('--keep phải là số nguyên ≥ 1')

  const envLocal = path.join(repoRoot, '.env.local')
  dotenv.config({ path: fs.existsSync(envLocal) ? envLocal : undefined, quiet: true })
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local')
  }

  const baseDir = path.resolve(opts.dir || path.join(repoRoot, '..', 'guitar-by-quang-backups'))
  if (isInsideDir(baseDir, repoRoot)) {
    throw new Error(
      `Không ghi sao lưu vào bên trong thư mục dự án (${baseDir}) — kho code đang công khai. Dùng --dir trỏ ra ngoài.`
    )
  }

  const client = createClient(url, key, { auth: { persistSession: false } })
  const outDir = path.join(baseDir, timestampName())
  fs.mkdirSync(outDir, { recursive: true })

  const tables = opts.withSecrets ? [...TABLES, ...SECRET_TABLES] : TABLES
  const manifest = {
    createdAt: new Date().toISOString(),
    project: new URL(url).host,
    includesSecrets: opts.withSecrets,
    tables: {},
  }
  let totalBytes = 0
  let problems = 0

  console.log(`Đang sao lưu vào ${outDir}\n`)
  for (const [table, orderBy] of tables) {
    try {
      const rows = await fetchAllRows(client, table, { orderBy })
      const { count } = await client.from(table).select('*', { count: 'exact', head: true })
      const text = JSON.stringify(rows, null, 2)
      fs.writeFileSync(path.join(outDir, `${table}.json`), text, 'utf8')
      totalBytes += Buffer.byteLength(text)
      // Đối chiếu: số dòng đã đọc phải bằng số dòng trong database (trừ khi có người ghi giữa chừng).
      const same = count === null || count === rows.length
      if (!same) problems++
      manifest.tables[table] = { rows: rows.length, rowsInDatabase: count }
      console.log(
        `  ${same ? '✓' : '⚠'} ${table.padEnd(20)} ${String(rows.length).padStart(6)} dòng` +
          (same ? '' : `  (database đang có ${count} — thử chạy lại)`)
      )
    } catch (err) {
      problems++
      manifest.tables[table] = { error: err.message }
      console.log(`  ✗ ${table.padEnd(20)} LỖI: ${err.message}`)
    }
  }

  try {
    const users = await fetchAuthUsers(client)
    const text = JSON.stringify(users, null, 2)
    fs.writeFileSync(path.join(outDir, 'auth_users.json'), text, 'utf8')
    totalBytes += Buffer.byteLength(text)
    manifest.tables.auth_users = { rows: users.length }
    console.log(`  ✓ ${'auth_users'.padEnd(20)} ${String(users.length).padStart(6)} tài khoản`)
  } catch (err) {
    problems++
    manifest.tables.auth_users = { error: err.message }
    console.log(`  ✗ ${'auth_users'.padEnd(20)} LỖI: ${err.message}`)
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  const removed = pruneOldBackups(fs, baseDir, opts.keep)
  console.log(`\nXong: ${formatBytes(totalBytes)} tại ${outDir}`)
  if (removed.length)
    console.log(`Đã xoá ${removed.length} bản cũ (giữ ${opts.keep} bản mới nhất).`)
  console.log(
    'Nhớ: thư mục này chứa dữ liệu khách hàng — đừng đưa lên GitHub, nên chép thêm ra ổ ngoài/Drive riêng tư.'
  )
  if (problems > 0) {
    console.log(`\n⚠ Có ${problems} mục lỗi hoặc lệch số dòng — xem phía trên.`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`\nLỗi: ${err.message}`)
  process.exit(1)
})
