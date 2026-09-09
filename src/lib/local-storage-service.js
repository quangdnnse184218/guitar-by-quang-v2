/**
 * GUITAR BY QUANG — Local Storage Service Layer
 *
 * Quản lý tính năng cá nhân hóa phía client không cần tài khoản:
 * 1. Bài hát Đã học xong (Completed ✓) — key: 'gbq_completed'
 *
 * Yêu thích (Favorites) KHÔNG nằm ở đây nữa — đó là tính năng của tài
 * khoản, lưu thẳng vào bảng `favorites` trên Supabase (xem kho-tab.js /
 * user-dashboard.js). Không có fallback localStorage cho khách vãng lai.
 */

const COMPLETED_KEY = 'gbq_completed'

function getArrayFromStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn(`[LocalStorageService] Lỗi khi đọc key "${key}":`, error)
    return []
  }
}

function saveArrayToStorage(key, array) {
  try {
    localStorage.setItem(key, JSON.stringify(array))
    return true
  } catch (error) {
    console.warn(`[LocalStorageService] Lỗi khi lưu key "${key}":`, error)
    return false
  }
}

// ============================================================
// ĐÃ HỌC XONG (Completed)
// ============================================================

export function getCompleted() {
  return getArrayFromStorage(COMPLETED_KEY)
}

export function isCompleted(songId) {
  if (!songId) return false
  const list = getCompleted()
  return list.includes(String(songId))
}

export function toggleCompleted(songId) {
  if (!songId) return false
  const strId = String(songId)
  let list = getCompleted()
  let nextState = false

  if (list.includes(strId)) {
    list = list.filter((id) => id !== strId)
    nextState = false
  } else {
    list.push(strId)
    nextState = true
  }

  saveArrayToStorage(COMPLETED_KEY, list)
  return nextState
}

// Alias for compatibility
export const getCompletedIds = getCompleted
