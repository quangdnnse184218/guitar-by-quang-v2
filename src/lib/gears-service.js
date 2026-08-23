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
