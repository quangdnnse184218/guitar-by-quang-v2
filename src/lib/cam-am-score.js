/**
 * Nộp điểm game Luyện cảm âm lên bảng xếp hạng.
 *
 * Trước đây trình duyệt tự báo điểm (chỉ bị chặn ≤ 999), ai mở console gọi RPC là lên top. Giờ mỗi
 * ván phải "mở lượt chơi" trên máy chủ (cam_am_start_run) lúc bắt đầu, và chỉ nộp điểm được cho
 * đúng lượt đó, một lần, khi thời gian thật đã trôi qua đủ để chơi tới số điểm ấy (máy chủ tự đo
 * bằng đồng hồ của nó — xem supabase/migrations/20261107_cam_am_score_runs.sql).
 *
 * Tương thích: khi SQL mới CHƯA chạy, hàm cam_am_start_run chưa có → không có mã lượt → nộp theo
 * kiểu cũ. Chạy SQL xong thì kiểu cũ bị xoá, chỉ còn đường có mã lượt.
 */

// PostgREST báo không tìm thấy hàm với đúng bộ tham số này.
function isMissingFunction(error) {
  return error?.code === 'PGRST202' || /could not find the function/i.test(String(error?.message || ''))
}

/** Mở lượt chơi; trả mã lượt, hoặc null nếu không mở được (mất mạng, SQL chưa chạy…). */
export async function startScoreRun(supabase, { playerId, secret, mode }) {
  try {
    const { data, error } = await supabase.rpc('cam_am_start_run', {
      p_player_id: playerId,
      p_secret: secret,
      p_mode: mode,
    })
    if (error || !data) return null
    return String(data)
  } catch {
    return null
  }
}

/**
 * Nộp điểm. Có mã lượt thì nộp kèm; máy chủ chưa có bản mới (thiếu hàm) thì thử lại kiểu cũ.
 * Trả true nếu máy chủ nhận.
 */
export async function submitScore(supabase, { playerId, secret, mode, name, score, runId }) {
  const base = { p_player_id: playerId, p_secret: secret, p_mode: mode, p_name: name, p_score: score }
  try {
    if (runId) {
      const { error } = await supabase.rpc('cam_am_submit_score', { ...base, p_run_id: runId })
      if (!error) return true
      if (!isMissingFunction(error)) return false
    }
    const { error } = await supabase.rpc('cam_am_submit_score', base)
    return !error
  } catch {
    return false
  }
}
