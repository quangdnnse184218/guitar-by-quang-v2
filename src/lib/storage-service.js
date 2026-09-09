/**
 * GUITAR BY QUANG — Supabase Storage upload helper
 *
 * Single public bucket `uploads`, organized by folder:
 *   uploads/songs/<songId>-<field>-<timestamp>.<ext>
 *   uploads/gears/<timestamp>.<ext>
 *
 * Free-tier Supabase caps every upload at 50MB project-wide — validated
 * client-side here so the admin gets an immediate, clear error instead of a
 * raw network failure.
 */
import { supabase } from './supabase.js'

const BUCKET = 'uploads'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50MB — Supabase free-tier hard cap

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${Math.round(bytes / 1024)}KB`
}

function sanitizeExt(filename) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename || '')
  return match ? match[1].toLowerCase() : 'bin'
}

/**
 * Uploads a file to the shared `uploads` bucket and returns its public URL.
 * Throws with a Vietnamese, user-facing message on failure (including the
 * 50MB size check) so callers can show it directly in a toast.
 */
export async function uploadToStorage(file, folder, namePrefix) {
  if (!file) throw new Error('Không có file nào được chọn.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File quá lớn (${formatBytes(file.size)}). Gói Supabase miễn phí chỉ cho phép tối đa 50MB/file — hãy nén nhỏ lại hoặc nâng cấp gói Pro.`
    )
  }

  const ext = sanitizeExt(file.name)
  const path = `${folder}/${namePrefix}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined })

  if (error) {
    throw new Error(`Tải file lên thất bại: ${error.message}`)
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Deletes a previously-uploaded file given its public URL, if (and only if)
 * that URL actually points at our `uploads` bucket — external/YouTube URLs
 * are silently ignored. Best-effort: failures are logged, never thrown,
 * since a missing/already-deleted object shouldn't block the caller's save.
 */
export async function removeFromStorageByUrl(url) {
  if (!url || typeof url !== 'string') return
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return

  const path = decodeURIComponent(url.slice(idx + marker.length))
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) {
    console.warn('[storage-service] Không thể xoá file cũ:', path, error.message)
  }
}
