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

export function normalizeImagePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '/assets/avatar.jpg'
  let clean = rawPath.trim().replace(/\\/g, '/')

  // If it's a full web URL or data URL, return directly
  if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:')) {
    return clean
  }

  // Remove public prefix if user entered full path containing /public/
  const publicIdx = clean.toLowerCase().indexOf('/public/')
  if (publicIdx !== -1) {
    clean = clean.substring(publicIdx + '/public'.length)
  } else {
    const pubIdx2 = clean.toLowerCase().indexOf('public/')
    if (pubIdx2 !== -1) {
      clean = clean.substring(pubIdx2 + 'public'.length)
    }
  }

  // Handle Windows drive paths like D:/...
  if (/^[a-zA-Z]:\//.test(clean)) {
    const assetsIdx = clean.toLowerCase().indexOf('/assets/')
    if (assetsIdx !== -1) {
      clean = clean.substring(assetsIdx)
    } else {
      const parts = clean.split('/')
      clean = '/assets/' + parts[parts.length - 1]
    }
  }

  if (!clean.startsWith('/')) {
    clean = '/' + clean
  }

  return clean
}

const VALID_GEAR_COLUMNS = [
  'id', 'category', 'title', 'image', 'description',
  'buy_url', 'buy_text', 'footer_text', 'order', 'created_at'
]

function sanitizeGearPayload(payload) {
  const clean = {}
  
  // Normalization mappings
  const rawTitle = payload.title || payload.name || ''
  const rawImage = normalizeImagePath(payload.image || payload.image_url || 'assets/avatar.jpg')
  const rawBuyUrl = payload.buy_url || payload.link || payload.buyUrl || ''
  const rawFooter = payload.footer_text || payload.price || ''
  const rawBuyText = payload.buy_text || payload.buyText || 'Mua ngay'

  const normalized = {
    ...payload,
    title: rawTitle,
    name: rawTitle,
    image: rawImage,
    image_url: rawImage,
    buy_url: rawBuyUrl,
    link: rawBuyUrl,
    footer_text: rawFooter,
    price: rawFooter,
    buy_text: rawBuyText
  }

  for (const key of VALID_GEAR_COLUMNS) {
    if (normalized[key] !== undefined) {
      clean[key] = normalized[key]
    }
  }
  return clean
}

async function writeGearToSupabase(payload, isEdit, gearId) {
  let attemptPayload = { ...payload }

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      if (isEdit && gearId) {
        const { data, error } = await supabase
          .from('gears')
          .update(attemptPayload)
          .eq('id', gearId)
          .select()

        if (!error) return { data: (data && data[0]) || attemptPayload, error: null }

        console.warn(`[gears-service] Update attempt ${attempt + 1} warning:`, error.message)
        const colMatch = error.message?.match(/column "([^"]+)" of relation "gears" does not exist/i) ||
                         error.message?.match(/Could not find the '([^']+)' column/i)
        if (colMatch && colMatch[1] && attemptPayload[colMatch[1]] !== undefined) {
          delete attemptPayload[colMatch[1]]
          continue
        }
        return { data: null, error }
      } else {
        const { data, error } = await supabase
          .from('gears')
          .insert([attemptPayload])
          .select()

        if (!error) return { data: (data && data[0]) || attemptPayload, error: null }

        console.warn(`[gears-service] Insert attempt ${attempt + 1} warning:`, error.message)
        const colMatch = error.message?.match(/column "([^"]+)" of relation "gears" does not exist/i) ||
                         error.message?.match(/Could not find the '([^']+)' column/i)
        if (colMatch && colMatch[1] && attemptPayload[colMatch[1]] !== undefined) {
          delete attemptPayload[colMatch[1]]
          continue
        }
        return { data: null, error }
      }
    } catch (err) {
      return { data: null, error: err }
    }
  }
  return { data: null, error: new Error('Không thể lưu vào bảng gears trên Supabase.') }
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

  // Ensure ID is set
  const targetId = gearId || payload.id || `gear-${Date.now()}`
  payload.id = targetId

  const cleanPayload = sanitizeGearPayload(payload)
  if (!isEdit && !cleanPayload.order) {
    cleanPayload.order = all.length + 1
  }
  cleanPayload.created_at = cleanPayload.created_at || new Date().toISOString()

  // 1. Write to Supabase first
  const { data: savedRecord, error: supabaseError } = await writeGearToSupabase(cleanPayload, isEdit, gearId)

  if (supabaseError) {
    console.error('[gears-service] Không thể lưu vào Supabase:', supabaseError.message || supabaseError)
    return {
      success: false,
      supabaseSaved: false,
      error: supabaseError.message || 'Lỗi không xác định khi lưu vào Supabase.'
    }
  }

  // 2. Sync to LocalStorage
  const fullRecord = { ...payload, ...(savedRecord || {}), id: targetId }
  if (isEdit && gearId) {
    const idx = all.findIndex(g => String(g.id) === String(gearId))
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...fullRecord }
    } else {
      all.push(fullRecord)
    }
  } else {
    all.push(fullRecord)
  }

  localStorage.setItem('gbq_gears', JSON.stringify(all))

  return {
    success: true,
    savedLocally: true,
    supabaseSaved: true,
    record: fullRecord
  }
}

/**
 * Delete a gear from Supabase and LocalStorage
 */
export async function removeGear(gearId) {
  let supabaseError = null
  try {
    const { error } = await supabase.from('gears').delete().eq('id', gearId)
    if (error) supabaseError = error
  } catch (e) {
    supabaseError = e
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
  return { success: true, warning: supabaseError?.message }
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


