import { supabase } from './supabase.js'

export const DEFAULT_GEARS = [
  {
    id: 'gear-clover-914c',
    category: 'GUITAR CHÍNH',
    name: 'Clover 914c Custom',
    title: 'Clover 914c Custom',
    image: '/assets/clover.jpg',
    image_url: '/assets/clover.jpg',
    description: 'Mặt Sitka Spruce, lưng hông Rosewood. Tiếng mộc dày, âm bass ấm và action được căn rất êm tay.',
    price: 'Liên hệ',
    buyUrl: '',
    buy_url: '',
    link: '',
    buyText: 'Tư vấn',
    footerText: 'Cần mua đàn nhắn mình tư vấn giá ưu đãi nhé.',
    order: 1
  },
  {
    id: 'gear-akg-ara',
    category: 'MICROPHONE THU ÂM',
    name: 'AKG Ara C22 USB',
    title: 'AKG Ara C22 USB',
    image: '/assets/akg.jpg',
    image_url: '/assets/akg.jpg',
    description: 'Mic thu cắm cổng USB trực tiếp vào máy tính, thu âm mộc qua Audacity, chỉ chỉnh âm lượng chứ không can thiệp hiệu ứng.',
    price: '2.500.000đ',
    buyUrl: 'https://s.shopee.vn/3VjbUzpuHA',
    buy_url: 'https://s.shopee.vn/3VjbUzpuHA',
    link: 'https://s.shopee.vn/3VjbUzpuHA',
    buyText: 'Mua trên Shopee',
    footerText: '',
    order: 2
  },
  {
    id: 'gear-elixir-bronze',
    category: 'DÂY ĐÀN & PHỤ KIỆN',
    name: 'Elixir Bronze (11-52)',
    title: 'Elixir Bronze (11-52)',
    image: '/assets/elixer.jpg',
    image_url: '/assets/elixer.jpg',
    description: 'Dây phủ nanoweb bấm êm tay, lâu rỉ. Kẹp kèm Capo Shubb C1B bằng đồng chống phô nốt.',
    price: '420.000đ',
    buyUrl: 'https://s.shopee.vn/gPQ7oVDzX',
    buy_url: 'https://s.shopee.vn/gPQ7oVDzX',
    link: 'https://s.shopee.vn/gPQ7oVDzX',
    buyText: 'Mua trên Shopee',
    footerText: '',
    order: 3
  },
  {
    id: 'gear-guitar-pro-8',
    category: 'PHẦN MỀM SOẠN TAB',
    name: 'Guitar Pro 8',
    title: 'Guitar Pro 8',
    image: '/assets/gp8.jpg',
    image_url: '/assets/gp8.jpg',
    description: 'Phần mềm để mình viết tab, xuất file nhạc và căn chỉnh nhịp phách chi tiết trước khi quay video.',
    price: 'Bản quyền',
    buyUrl: '',
    buy_url: '',
    link: '',
    buyText: 'Xem hướng dẫn',
    footerText: 'Lên YouTube tìm cách tải Guitar Pro 8 là có nhé.',
    order: 4
  }
]

export async function fetchAllGears() {
  try {
    const { data, error } = await supabase
      .from('gears')
      .select('*')
      .order('order', { ascending: true })
      
    if (error || !data || data.length === 0) {
      // Check local storage fallback
      const local = localStorage.getItem('gbq_gears')
      if (local) {
        try {
          const parsed = JSON.parse(local)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed.sort((a, b) => (a.order || 99) - (b.order || 99))
        } catch (e) {
          console.warn('[gears-service] Error parsing local gears:', e)
        }
      }
      return DEFAULT_GEARS
    }
    
    // Save to local cache
    localStorage.setItem('gbq_gears', JSON.stringify(data))
    return data
  } catch (err) {
    console.error('[gears-service] Ngoại lệ khi tải danh sách gear:', err.message, err)
    const local = localStorage.getItem('gbq_gears')
    if (local) {
      try {
        const parsed = JSON.parse(local)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.sort((a, b) => (a.order || 99) - (b.order || 99))
      } catch (e) {}
    }
    return DEFAULT_GEARS
  }
}

/**
 * Save (Insert or Update) a gear item with full Supabase & LocalStorage sync
 */
export async function saveGear(payload, isEdit = false, gearId = null) {
  let all = []
  const local = localStorage.getItem('gbq_gears')
  if (local) {
    try { all = JSON.parse(local) } catch (e) {}
  }
  if (!all || all.length === 0) all = [...DEFAULT_GEARS]

  let savedRecord = null
  let supabaseError = null

  // 1. Try Supabase write
  try {
    if (isEdit && gearId) {
      const { data, error } = await supabase
        .from('gears')
        .update(payload)
        .eq('id', gearId)
        .select()
        
      if (error) {
        supabaseError = error
      } else if (data && data.length > 0) {
        savedRecord = data[0]
      }
    } else {
      const { data, error } = await supabase
        .from('gears')
        .insert([payload])
        .select()
        
      if (error) {
        supabaseError = error
      } else if (data && data.length > 0) {
        savedRecord = data[0]
      }
    }
  } catch (e) {
    supabaseError = e
  }

  // 2. Sync to LocalStorage
  if (isEdit && gearId) {
    const idx = all.findIndex(g => String(g.id) === String(gearId))
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...payload, id: gearId }
    }
  } else {
    const newId = savedRecord?.id || `gear-${Date.now()}`
    all.push({ ...payload, id: newId, order: payload.order || (all.length + 1) })
  }

  localStorage.setItem('gbq_gears', JSON.stringify(all))
  return { success: true, record: savedRecord, warning: supabaseError?.message }
}

/**
 * Delete a gear from Supabase and LocalStorage
 */
export async function removeGear(gearId) {
  try {
    await supabase.from('gears').delete().eq('id', gearId)
  } catch (e) {
    console.warn('[gears-service] Supabase delete warning:', e)
  }

  let all = []
  const local = localStorage.getItem('gbq_gears')
  if (local) {
    try { all = JSON.parse(local) } catch (e) {}
  }
  if (!all || all.length === 0) all = [...DEFAULT_GEARS]

  all = all.filter(g => String(g.id) !== String(gearId))
  localStorage.setItem('gbq_gears', JSON.stringify(all))
  return { success: true }
}

/**
 * Update order for all gears in given array of IDs
 */
export async function reorderAllGears(orderedGearIds) {
  try {
    if (!orderedGearIds || !orderedGearIds.length) {
      return { success: false, error: 'Danh sách gear không hợp lệ.' }
    }

    // 1. Update Supabase
    try {
      const updates = orderedGearIds.map((id, index) => 
        supabase.from('gears').update({ order: index + 1 }).eq('id', id)
      )
      await Promise.all(updates)
    } catch (e) {
      console.warn('[gears-service] Supabase reorder warning:', e)
    }

    // 2. Update LocalStorage
    let all = []
    const local = localStorage.getItem('gbq_gears')
    if (local) {
      try { all = JSON.parse(local) } catch (e) {}
    }
    if (!all || all.length === 0) all = [...DEFAULT_GEARS]

    const gearMap = new Map(all.map(g => [String(g.id), g]))
    const newOrderedList = []

    orderedGearIds.forEach((id, idx) => {
      const g = gearMap.get(String(id))
      if (g) {
        g.order = idx + 1
        newOrderedList.push(g)
      }
    })

    all.forEach(g => {
      if (!orderedGearIds.includes(g.id)) {
        g.order = newOrderedList.length + 1
        newOrderedList.push(g)
      }
    })

    localStorage.setItem('gbq_gears', JSON.stringify(newOrderedList))
    return { success: true }
  } catch (error) {
    console.error('[gears-service] Lỗi khi cập nhật thứ tự gear:', error)
    return { success: false, error: error.message || 'Lỗi khi cập nhật thứ tự' }
  }
}


