/**
 * Nộp điểm Luyện cảm âm theo lượt chơi (src/lib/cam-am-score.js): điểm phải gắn với một lượt
 * mở trên máy chủ; máy chủ chưa chạy SQL mới thì vẫn nộp được theo kiểu cũ.
 */
import { describe, expect, it, vi } from 'vitest'
import { startScoreRun, submitScore } from '../src/lib/cam-am-score.js'

const PLAYER = { playerId: 'p1', secret: 's'.repeat(32) }

describe('startScoreRun', () => {
  it('mở lượt bằng đúng người chơi + secret + chế độ, trả mã lượt', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'run-1', error: null })
    expect(await startScoreRun({ rpc }, { ...PLAYER, mode: 'hear' })).toBe('run-1')
    expect(rpc).toHaveBeenCalledWith('cam_am_start_run', {
      p_player_id: 'p1',
      p_secret: PLAYER.secret,
      p_mode: 'hear',
    })
  })

  it('lỗi hoặc mất mạng thì trả null, không làm vỡ ván chơi', async () => {
    expect(await startScoreRun({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } }) }, { ...PLAYER, mode: 'see' })).toBeNull()
    expect(await startScoreRun({ rpc: vi.fn().mockRejectedValue(new Error('offline')) }, { ...PLAYER, mode: 'see' })).toBeNull()
  })
})

describe('submitScore', () => {
  const args = { ...PLAYER, mode: 'see', name: 'Quang', score: 12 }

  it('có mã lượt thì nộp kèm p_run_id', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    expect(await submitScore({ rpc }, { ...args, runId: 'run-1' })).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_score: 12, p_mode: 'see', p_run_id: 'run-1' })
  })

  it('máy chủ từ chối (vd điểm quá nhanh) thì KHÔNG thử lại kiểu cũ không kèm lượt', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: 'P0001', message: 'score_too_fast' } })
    expect(await submitScore({ rpc }, { ...args, runId: 'run-1' })).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('máy chủ chưa có bản mới (thiếu hàm 6 tham số) thì nộp lại kiểu cũ', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'Could not find the function' } })
      .mockResolvedValueOnce({ error: null })
    expect(await submitScore({ rpc }, { ...args, runId: 'run-1' })).toBe(true)
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_run_id')
  })

  it('không có mã lượt thì nộp kiểu cũ (máy chủ đã chạy SQL mới sẽ tự từ chối)', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: 'PGRST202' } })
    expect(await submitScore({ rpc }, { ...args, runId: null })).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_run_id')
  })
})
