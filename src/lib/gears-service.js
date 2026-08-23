import { supabase } from './supabase.js'

export async function fetchAllGears() {
  try {
    const { data, error } = await supabase
      .from('gears')
      .select('*')
      .order('order', { ascending: true })
      
    if (error) {
      console.error('[gears-service] Lỗi Supabase khi tải danh sách gear:', error.message, error)
      return []
    }
    
    return data || []
  } catch (err) {
    console.error('[gears-service] Ngoại lệ khi tải danh sách gear:', err.message, err)
    return []
  }
}

/**
 * Update order for all gears in given array of IDs
 */
export async function reorderAllGears(orderedGearIds) {
  try {
    if (!orderedGearIds || !orderedGearIds.length) {
      return { success: false, error: 'Danh sách gear không hợp lệ.' }
    }

    const updates = orderedGearIds.map((id, index) => 
      supabase.from('gears').update({ order: index + 1 }).eq('id', id)
    )

    await Promise.all(updates)
    return { success: true }
  } catch (error) {
    console.error('[gears-service] Lỗi khi cập nhật thứ tự gear:', error)
    return { success: false, error: error.message || 'Lỗi khi cập nhật thứ tự' }
  }
}

