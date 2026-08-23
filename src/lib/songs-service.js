import { supabase } from './supabase.js'

/**
 * Fetch 3 featured songs for Home page
 */
export async function fetchFeaturedSongs() {
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('order', { ascending: true })
      .limit(3)
      
    if (error) {
      console.error('[songs-service] Lỗi Supabase khi tải bài hát nổi bật:', error.message, error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('[songs-service] Ngoại lệ khi tải bài hát nổi bật:', err.message, err)
    return []
  }
}

/**
 * Fetch all songs for Kho Tab page ordered by 'order' ascending
 */
export async function fetchAllSongs() {
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('order', { ascending: true })
      
    if (error) {
      console.error('[songs-service] Lỗi Supabase khi tải tất cả bài hát:', error.message, error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('[songs-service] Ngoại lệ khi tải tất cả bài hát:', err.message, err)
    return []
  }
}

/**
 * Fetch a single song by ID
 */
export async function fetchSongById(id) {
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('id', id)
      .single()
      
    if (error) {
      console.error(`[songs-service] Lỗi Supabase khi tải bài hát ${id}:`, error.message, error)
      return null
    }
    
    return data || null
  } catch (err) {
    console.error(`[songs-service] Ngoại lệ khi tải bài hát ${id}:`, err.message, err)
    return null
  }
}

/**
 * Update order for all songs in given array of IDs
 */
export async function reorderAllSongs(orderedSongIds) {
  try {
    if (!orderedSongIds || !orderedSongIds.length) {
      return { success: false, error: 'Danh sách bài hát không hợp lệ.' }
    }

    const updates = orderedSongIds.map((id, index) => 
      supabase.from('songs').update({ order: index + 1 }).eq('id', id)
    )

    await Promise.all(updates)
    return { success: true }
  } catch (error) {
    console.error('[songs-service] Lỗi khi cập nhật thứ tự bài hát:', error)
    return { success: false, error: error.message || 'Lỗi khi cập nhật thứ tự' }
  }
}

