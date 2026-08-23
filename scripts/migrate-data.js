/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — DATA MIGRATION SCRIPT
 * ==============================================================================
 * 
 * HƯỚNG DẪN SỬ DỤNG:
 * 1. Chạy trên môi trường Node.js (Terminal): node scripts/migrate-data.js
 * 2. Điền SUPABASE_SERVICE_ROLE_KEY (khuyên dùng để bypass RLS) hoặc VITE_SUPABASE_ANON_KEY
 *    và VITE_SUPABASE_URL vào file .env.local ở thư mục gốc.
 * 3. Đặt file DATA-EXPORT.json vào thư mục gốc của dự án.
 * ==============================================================================
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Tải biến môi trường từ .env.local trước, sau đó fallback sang .env
const envLocalPath = path.resolve(process.cwd(), '.env.local')
const envPath = path.resolve(process.cwd(), '.env')

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
} else {
  dotenv.config()
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

console.log('--- BẮT ĐẦU QUY TRÌNH MIGRATE DỮ LIỆU ---')

if (!supabaseUrl || !supabaseKey) {
  console.error('\n[LỖI] Thiếu cấu hình Supabase URL hoặc Key.')
  console.error('Vui lòng kiểm tra file .env.local với các biến:')
  console.error('  - VITE_SUPABASE_URL=...')
  console.error('  - SUPABASE_SERVICE_ROLE_KEY=... (hoặc VITE_SUPABASE_ANON_KEY=...)\n')
  process.exit(1)
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[CẢNH BÁO] Đang sử dụng anon key. Nếu có cấu hình RLS chặn write, vui lòng dùng SUPABASE_SERVICE_ROLE_KEY trong .env.local.')
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
})

// Chuyển camelCase sang snake_case
function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase()
}

// Convert object keys từ camelCase sang snake_case
function convertObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj
  }
  const newObj = {}
  for (const [key, value] of Object.entries(obj)) {
    const newKey = toSnakeCase(key)
    newObj[newKey] = value
  }
  return newObj
}

// Chuẩn hóa bản ghi Song
function normalizeSong(song) {
  const converted = convertObjectKeys(song)
  
  // Mapping tường minh các trường quan trọng theo thiết kế đã chốt
  const explicitMapping = {
    level_num: song.levelNum ?? converted.level_num,
    is_free: song.isFree ?? converted.is_free,
    price_formatted: song.priceFormatted ?? converted.price_formatted,
    has_demo: song.hasDemo ?? converted.has_demo,
    video_demo: song.videoDemo ?? converted.video_demo,
    button_type: song.buttonType ?? converted.button_type,
    button_text: song.buttonText ?? converted.button_text,
    thumbnail_bg: song.thumbnailBg ?? converted.thumbnail_bg,
    target_url: song.targetUrl ?? converted.target_url,
    discount_note: song.discountNote ?? converted.discount_note,
    footer_text: song.footerText ?? converted.footer_text,
    buy_url: song.buyUrl ?? converted.buy_url,
    buy_text: song.buyText ?? converted.buy_text,
    order: song.order ?? converted.order,
  }

  for (const [k, v] of Object.entries(explicitMapping)) {
    if (v !== undefined) {
      converted[k] = v
    }
  }

  return converted
}

// Chuẩn hóa bản ghi Gear
function normalizeGear(gear) {
  const converted = convertObjectKeys(gear)
  
  const explicitMapping = {
    target_url: gear.targetUrl ?? converted.target_url,
    thumbnail_bg: gear.thumbnailBg ?? converted.thumbnail_bg,
    order: gear.order ?? converted.order,
    buy_url: gear.buyUrl ?? converted.buy_url,
    buy_text: gear.buyText ?? converted.buy_text,
  }

  for (const [k, v] of Object.entries(explicitMapping)) {
    if (v !== undefined) {
      converted[k] = v
    }
  }

  return converted
}

async function runMigration() {
  const exportFilePath = path.resolve(process.cwd(), 'DATA-EXPORT.json')

  if (!fs.existsSync(exportFilePath)) {
    console.error(`\n[LỖI] Không tìm thấy file dữ liệu: ${exportFilePath}`)
    console.error('Vui lòng copy file DATA-EXPORT.json vào thư mục gốc dự án và chạy lại lệnh:')
    console.error('  node scripts/migrate-data.js\n')
    process.exit(1)
  }

  let rawData
  try {
    const fileContent = fs.readFileSync(exportFilePath, 'utf-8')
    rawData = JSON.parse(fileContent)
  } catch (err) {
    console.error(`[LỖI] Đọc hoặc parse file JSON thất bại: ${err.message}`)
    process.exit(1)
  }

  let songsList = []
  let gearsList = []

  if (Array.isArray(rawData)) {
    // Nếu là 1 mảng tổng hợp có phân loại type/collection
    songsList = rawData.filter(item => item.collection === 'songs' || item.type === 'song' || item.level || item.artist)
    gearsList = rawData.filter(item => item.collection === 'gears' || item.type === 'gear' || item.category)
  } else if (typeof rawData === 'object' && rawData !== null) {
    songsList = rawData.collections?.songs || rawData.songs || rawData.tabs || []
    gearsList = rawData.collections?.gears || rawData.gears || rawData.tools || []
  }

  console.log(`\n[INFO] Đã đọc từ file: ${songsList.length} bài hát (songs), ${gearsList.length} đồ nghề (gears).`)

  // 1. MIGRATE SONGS
  if (songsList.length > 0) {
    const normalizedSongs = songsList.map(normalizeSong)
    console.log(`\n[MIGRATE] Đang upsert ${normalizedSongs.length} bài hát vào bảng 'songs'...`)
    
    const { data, error } = await supabase
      .from('songs')
      .upsert(normalizedSongs, { onConflict: 'id' })
      .select()

    if (error) {
      console.error(`[LỖI SONGS] Upsert thất bại: ${error.message}`)
    } else {
      console.log(`[THÀNH CÔNG SONGS] Đã migrate thành công ${data ? data.length : normalizedSongs.length} bài hát.`)
    }
  } else {
    console.log('[BỎ QUA] Không có bản ghi songs để migrate.')
  }

  // 2. MIGRATE GEARS
  if (gearsList.length > 0) {
    const normalizedGears = gearsList.map(normalizeGear)
    console.log(`\n[MIGRATE] Đang upsert ${normalizedGears.length} đồ nghề vào bảng 'gears'...`)
    
    const { data, error } = await supabase
      .from('gears')
      .upsert(normalizedGears, { onConflict: 'id' })
      .select()

    if (error) {
      console.error(`[LỖI GEARS] Upsert thất bại: ${error.message}`)
    } else {
      console.log(`[THÀNH CÔNG GEARS] Đã migrate thành công ${data ? data.length : normalizedGears.length} đồ nghề.`)
    }
  } else {
    console.log('[BỎ QUA] Không có bản ghi gears để migrate.')
  }

  console.log('\n=== HOÀN TẤT TIẾN TRÌNH MIGRATE DỮ LIỆU ===\n')
}

runMigration().catch(err => {
  console.error(`[LỖI KHÔNG MONG MUỐN] ${err.stack || err.message}`)
  process.exit(1)
})
