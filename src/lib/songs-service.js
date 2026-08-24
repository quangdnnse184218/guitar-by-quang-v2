import { supabase } from './supabase.js'

export const DEFAULT_SONGS = [
  {
    id: 'tab-9',
    title: 'Âm thầm bên em',
    singer: 'Sơn Tùng M-TP',
    category: 'Nhạc Việt',
    level: '6.5/10',
    level_num: 6.5,
    levelNum: 6.5,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '04:15',
    description: 'Bài này xài hợp âm chặn vừa phải, đi bass nhịp 4/4 mộc mạc. Anh em chú ý lực ngón tay trái để tiếng đàn ngân tròn trịa.',
    has_demo: false,
    hasDemo: false,
    button_type: 'link',
    target_url: 'https://youtu.be/NPWSiVFlPf0?si=ZDdTXuL7mZbhnhv2',
    tab_url: 'https://youtu.be/NPWSiVFlPf0?si=ZDdTXuL7mZbhnhv2',
    button_text: 'Link xem tab',
    thumbnail_bg: 'from-[#D8C4AC] to-[#647A6C]',
    order: 1
  },
  {
    id: 'tab-1',
    title: 'Rồi em sẽ gặp 1 chàng trai khác',
    singer: 'The Masked Singer',
    category: 'Nhạc Việt',
    level: '9/10',
    level_num: 9,
    levelNum: 9,
    is_free: false,
    isFree: false,
    price: 239000,
    price_formatted: '239k',
    priceFormatted: '239k',
    discount_note: 'HSSV: 179k',
    discountNote: 'HSSV: 179k',
    tuning: 'Standard',
    capo: 1,
    duration: '03:40',
    description: 'Fingerstyle nâng cao: nhiều đoạn hammer-on/pull-off tốc độ cao, thế tay dãn rộng và có slap kết hợp tỉa nốt. Anh em nên luyện chậm từng ô nhịp.',
    has_demo: true,
    hasDemo: true,
    video_demo: 'assets/resg1ctkdemo.mp4',
    demo_video_url: 'assets/resg1ctkdemo.mp4',
    button_type: 'buy',
    button_text: 'Mua Video Tab',
    thumbnail_bg: 'from-[#C1602F] to-[#6E3B1F]',
    target_url: '',
    tab_url: '',
    order: 2
  },
  {
    id: 'tab-8',
    title: 'Sóng gió',
    singer: 'Jack & K-ICM',
    category: 'Nhạc Việt',
    level: '7.5/10',
    level_num: 7.5,
    levelNum: 7.5,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '04:05',
    description: 'Tuyến bassline chạy liên tục, đòi hỏi tay trái bấm chắc và giữ nhịp chuẩn để không bị hụt nốt khi chuyển hợp âm.',
    has_demo: false,
    hasDemo: false,
    button_type: 'link',
    target_url: 'https://youtu.be/z28fkDnirKY?si=eLIvQpSSoxCZQaWr',
    tab_url: 'https://youtu.be/z28fkDnirKY?si=eLIvQpSSoxCZQaWr',
    button_text: 'Link xem tab',
    thumbnail_bg: 'from-[#C9AE92] to-[#8C6E8A]',
    order: 3
  },
  {
    id: 'tab-2',
    title: 'Nổi gió lên',
    singer: 'Trường Sơn',
    category: 'Nhạc Việt',
    level: '4/10',
    level_num: 4,
    levelNum: 4,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '03:15',
    description: 'Ballad cơ bản: đi bass theo nhịp 4/4 kết hợp rải ngón dây 1-2-3 đơn giản. Rất hợp cho anh em mới bắt đầu làm quen với fingerstyle.',
    has_demo: true,
    hasDemo: true,
    video_demo: 'assets/noigiolendemo.mp4',
    demo_video_url: 'assets/noigiolendemo.mp4',
    button_type: 'link',
    target_url: 'https://www.tiktok.com/@quangdnn104/video/7627688728240147732',
    tab_url: 'https://www.tiktok.com/@quangdnn104/video/7627688728240147732',
    button_text: 'Tải video tab',
    thumbnail_bg: 'from-[#CBB79E] to-[#7E9885]',
    order: 4
  },
  {
    id: 'tab-3',
    title: 'Intro tháng 4 là lời nói dối của em',
    singer: 'Hà Anh Tuấn',
    category: 'Nhạc Việt',
    level: '6/10',
    level_num: 6,
    levelNum: 6,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '01:15',
    description: 'Đoạn intro kinh điển: chú ý các nốt slide (vuốt dây) liền mạch và kỹ thuật let-ring để giữ hợp âm ngân vang đều tay.',
    has_demo: true,
    hasDemo: true,
    video_demo: 'assets/thangtudemo.mp4',
    demo_video_url: 'assets/thangtudemo.mp4',
    button_type: 'link',
    target_url: 'https://www.tiktok.com/@quangdnn104/video/7625293561130405141',
    tab_url: 'https://www.tiktok.com/@quangdnn104/video/7625293561130405141',
    button_text: 'Tải video tab (Miễn phí)',
    thumbnail_bg: 'from-[#D9C3A0] to-[#8C6E8A]',
    order: 5
  },
  {
    id: 'tab-4',
    title: 'Chắc ai đó sẽ về',
    singer: 'Sơn Tùng M-TP',
    category: 'Nhạc Việt',
    level: '4/10',
    level_num: 4,
    levelNum: 4,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '03:50',
    description: 'Vòng hợp âm quen thuộc, không có thế bấm khó. Bài này chủ yếu giữ đều nhịp rải và đổi hợp âm dứt khoát.',
    has_demo: false,
    hasDemo: false,
    button_type: 'link',
    target_url: 'https://youtu.be/z9jFiANmQTs?si=3N703CQfBFtX7Dx9',
    tab_url: 'https://youtu.be/z9jFiANmQTs?si=3N703CQfBFtX7Dx9',
    button_text: 'Link xem tab',
    thumbnail_bg: 'from-[#C7B49C] to-[#6B5844]',
    order: 6
  },
  {
    id: 'tab-5',
    title: 'Em của ngày hôm qua',
    singer: 'Sơn Tùng M-TP',
    category: 'Nhạc Việt',
    level: '7/10',
    level_num: 7,
    levelNum: 7,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '03:35',
    description: 'Tiết tấu nhanh: kết hợp slap ngón cái (bass thumb) vào phách 2 và 4 để tạo nhịp gõ thùng, đoạn điệp khúc solo nốt liền tay.',
    has_demo: false,
    hasDemo: false,
    button_type: 'link',
    target_url: 'https://youtu.be/4MQ4mfm5mDs?si=y0Wm8PhRbTjh1qrF',
    tab_url: 'https://youtu.be/4MQ4mfm5mDs?si=y0Wm8PhRbTjh1qrF',
    button_text: 'Link xem tab',
    thumbnail_bg: 'from-[#D6BE9E] to-[#7E9885]',
    order: 7
  },
  {
    id: 'tab-6',
    title: 'Bạc phận',
    singer: 'Jack & K-ICM',
    category: 'Nhạc Việt',
    level: '7.5/10',
    level_num: 7.5,
    levelNum: 7.5,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '03:40',
    description: 'Nhiều đoạn chuyển thế bấm chặn (barre chord) liên tục ở phím cao. Cần giữ lực ngón trỏ tốt để nốt không bị tịt tiếng.',
    has_demo: false,
    hasDemo: false,
    button_type: 'link',
    target_url: 'https://youtu.be/4pHsZuNtcZo?si=3XrQIwyXBBvhFCmO',
    tab_url: 'https://youtu.be/4pHsZuNtcZo?si=3XrQIwyXBBvhFCmO',
    button_text: 'Link xem tab',
    thumbnail_bg: 'from-[#BFA88E] to-[#5F4C3B]',
    order: 8
  },
  {
    id: 'tab-7',
    title: 'Golden hour',
    singer: 'JVKE',
    category: 'Nhạc Nước Ngoài',
    level: '6/10',
    level_num: 6,
    levelNum: 6,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '03:30',
    description: 'Mẫu rải arpeggio lặp lại liên tục với tốc độ đều. Anh em tập trung thả lỏng cổ tay phải để chuỗi nốt chạy thật mượt.',
    has_demo: false,
    hasDemo: false,
    button_type: 'link',
    target_url: 'https://youtu.be/83pXGn1t-94?si=a9GVYFPvRSRJBqyE',
    tab_url: 'https://youtu.be/83pXGn1t-94?si=a9GVYFPvRSRJBqyE',
    button_text: 'Link xem tab',
    thumbnail_bg: 'from-[#E0C9A6] to-[#CE9145]',
    order: 9
  },
  {
    id: 'tab-10',
    title: 'Nợ duyên',
    singer: 'Lương Bích Hữu',
    category: 'Nhạc Việt',
    level: '6/10',
    level_num: 6,
    levelNum: 6,
    is_free: true,
    isFree: true,
    price: 0,
    price_formatted: 'Miễn phí',
    priceFormatted: 'Miễn phí',
    tuning: 'Standard',
    capo: 0,
    duration: '03:10',
    description: 'Giai điệu vui tươi, nhịp điệu rộn rã. Chú ý các câu tỉa solo nốt luyến láy và các nhịp ngắt tiếng (staccato) dứt khoát.',
    has_demo: false,
    hasDemo: false,
    button_type: 'link',
    target_url: 'https://youtu.be/It3GVRIy3gs?si=KlPfcyWcCoHcQ6sp',
    tab_url: 'https://youtu.be/It3GVRIy3gs?si=KlPfcyWcCoHcQ6sp',
    button_text: 'Link xem tab',
    thumbnail_bg: 'from-[#C4AC93] to-[#6B5844]',
    order: 10
  }
]

function getLocalSongs() {
  const local = localStorage.getItem('gbq_songs')
  if (local) {
    try {
      const parsed = JSON.parse(local)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => (a.order || 99) - (b.order || 99))
      }
    } catch (e) {
      console.warn('[songs-service] Lỗi parse gbq_songs:', e)
    }
  }
  return DEFAULT_SONGS
}

function setLocalSongs(songs) {
  try {
    localStorage.setItem('gbq_songs', JSON.stringify(songs))
  } catch (e) {
    console.warn('[songs-service] Lỗi lưu gbq_songs:', e)
  }
}

/**
 * Fetch 4 featured songs for Home page
 */
export async function fetchFeaturedSongs() {
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('order', { ascending: true })
      .limit(4)
      
    if (error || !data || data.length === 0) {
      const fallback = getLocalSongs()
      return fallback.slice(0, 4)
    }
    
    return data
  } catch (err) {
    console.error('[songs-service] Ngoại lệ khi tải bài hát nổi bật:', err.message, err)
    const fallback = getLocalSongs()
    return fallback.slice(0, 4)
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
      
    if (error || !data || data.length === 0) {
      return getLocalSongs()
    }
    
    setLocalSongs(data)
    return data
  } catch (err) {
    console.error('[songs-service] Ngoại lệ khi tải tất cả bài hát:', err.message, err)
    return getLocalSongs()
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
      
    if (error || !data) {
      const all = getLocalSongs()
      return all.find(s => String(s.id) === String(id)) || null
    }
    
    return data
  } catch (err) {
    console.error(`[songs-service] Ngoại lệ khi tải bài hát ${id}:`, err.message, err)
    const all = getLocalSongs()
    return all.find(s => String(s.id) === String(id)) || null
  }
}

export function extractYoutubeId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return ''
  const trimmed = urlOrId.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed
  
  const matchBe = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (matchBe) return matchBe[1]

  const matchWatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (matchWatch) return matchWatch[1]

  const matchEmbed = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (matchEmbed) return matchEmbed[1]

  const matchShorts = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
  if (matchShorts) return matchShorts[1]

  return ''
}

const VALID_SONG_COLUMNS = [
  'id', 'title', 'singer', 'category', 'level', 'level_num', 'is_free',
  'price', 'price_formatted', 'discount_note', 'tuning',
  'duration', 'description', 'has_demo', 'video_demo', 'demo_video_url',
  'youtube_id', 'tab_url', 'target_url', 'pdf_url', 'thumbnail_bg',
  'button_type', 'button_text', 'capo', 'tempo', 'order', 'is_featured', 'created_at'
]

function sanitizeSongPayload(payload) {
  const clean = {}
  for (const key of VALID_SONG_COLUMNS) {
    if (payload[key] !== undefined) {
      clean[key] = payload[key]
    }
  }
  return clean
}

/**
 * Helper to write to Supabase with automatic retry when non-existent columns are encountered
 */
async function writeSongToSupabase(payload, isEdit, songId) {
  let attemptPayload = { ...payload }

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      if (isEdit && songId) {
        const { data, error } = await supabase
          .from('songs')
          .update(attemptPayload)
          .eq('id', songId)
          .select()

        if (!error) {
          return { data: (data && data[0]) || attemptPayload, error: null }
        }

        console.warn(`[songs-service] Update attempt ${attempt + 1} warning:`, error.message)

        // Check if error is due to an unknown column
        const colMatch = error.message?.match(/column "([^"]+)" of relation "songs" does not exist/i) ||
                         error.message?.match(/Could not find the '([^']+)' column/i)
        if (colMatch && colMatch[1] && attemptPayload[colMatch[1]] !== undefined) {
          delete attemptPayload[colMatch[1]]
          continue
        }
        return { data: null, error }
      } else {
        const { data, error } = await supabase
          .from('songs')
          .insert([attemptPayload])
          .select()

        if (!error) {
          return { data: (data && data[0]) || attemptPayload, error: null }
        }

        console.warn(`[songs-service] Insert attempt ${attempt + 1} warning:`, error.message)

        const colMatch = error.message?.match(/column "([^"]+)" of relation "songs" does not exist/i) ||
                         error.message?.match(/Could not find the '([^']+)' column/i)
        if (colMatch && colMatch[1] && attemptPayload[colMatch[1]] !== undefined) {
          delete attemptPayload[colMatch[1]]
          continue
        }
        return { data: null, error }
      }
    } catch (err) {
      console.error('[songs-service] Exception writing to Supabase:', err)
      return { data: null, error: err }
    }
  }

  return { data: null, error: new Error('Đã thử nhiều lần nhưng không thể ghi vào bảng songs.') }
}

/**
 * Save (Insert or Update) a song with full Supabase & LocalStorage sync
 */
export async function saveSong(payload, isEdit = false, songId = null) {
  const all = getLocalSongs()

  // Ensure ID is generated for new records
  const targetId = songId || payload.id || `tab-${Date.now()}`
  payload.id = targetId

  const cleanPayload = sanitizeSongPayload(payload)
  if (!isEdit && !cleanPayload.order) {
    cleanPayload.order = all.length + 1
  }
  cleanPayload.created_at = cleanPayload.created_at || new Date().toISOString()

  // 1. Write to Supabase first
  const { data: savedRecord, error: supabaseError } = await writeSongToSupabase(cleanPayload, isEdit, songId)

  if (supabaseError) {
    console.error('[songs-service] Không thể lưu vào Supabase:', supabaseError.message || supabaseError)
    return {
      success: false,
      supabaseSaved: false,
      error: supabaseError.message || 'Lỗi không xác định khi lưu vào Supabase. Vui lòng kiểm tra quyền (RLS) của bảng songs.'
    }
  }

  // 2. Only sync to LocalStorage when Supabase write succeeds
  const fullRecord = { ...payload, ...(savedRecord || {}), id: targetId }
  if (isEdit && songId) {
    const idx = all.findIndex(s => String(s.id) === String(songId))
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...fullRecord }
    } else {
      all.push(fullRecord)
    }
  } else {
    all.push(fullRecord)
  }

  setLocalSongs(all)

  return {
    success: true,
    savedLocally: true,
    supabaseSaved: true,
    record: fullRecord
  }
}

/**
 * Delete a song from Supabase and LocalStorage
 */
export async function removeSong(songId) {
  let supabaseError = null
  try {
    const { error } = await supabase.from('songs').delete().eq('id', songId)
    if (error) supabaseError = error
  } catch (e) {
    supabaseError = e
    console.warn('[songs-service] Supabase delete warning:', e)
  }

  const all = getLocalSongs().filter(s => String(s.id) !== String(songId))
  setLocalSongs(all)
  return { success: true, warning: supabaseError?.message }
}

/**
 * Update order for all songs in given array of IDs
 */
export async function reorderAllSongs(orderedSongIds) {
  try {
    if (!orderedSongIds || !orderedSongIds.length) {
      return { success: false, error: 'Danh sách bài hát không hợp lệ.' }
    }

    // 1. Update Supabase
    try {
      const updates = orderedSongIds.map((id, index) => 
        supabase.from('songs').update({ order: index + 1 }).eq('id', id)
      )
      await Promise.all(updates)
    } catch (e) {
      console.warn('[songs-service] Supabase reorder warning:', e)
    }

    // 2. Update LocalStorage
    const all = getLocalSongs()
    const songMap = new Map(all.map(s => [String(s.id), s]))
    const newOrderedList = []

    orderedSongIds.forEach((id, idx) => {
      const s = songMap.get(String(id))
      if (s) {
        s.order = idx + 1
        newOrderedList.push(s)
      }
    })

    // Add any remaining songs not in orderedSongIds
    all.forEach(s => {
      if (!orderedSongIds.includes(s.id)) {
        s.order = newOrderedList.length + 1
        newOrderedList.push(s)
      }
    })

    setLocalSongs(newOrderedList)
    return { success: true }
  } catch (error) {
    console.error('[songs-service] Lỗi khi cập nhật thứ tự bài hát:', error)
    return { success: false, error: error.message || 'Lỗi khi cập nhật thứ tự' }
  }
}



