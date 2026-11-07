// @vitest-environment node
/**
 * Phản hồi Apps Script khi cấp quyền Drive: luôn là HTTP 200, nên chỉ {"success":true} mới
 * được tính là đã chia sẻ. Sai secret hay lỗi Drive mà báo "đã chia sẻ" thì admin sẽ không
 * biết phải vào Drive chia sẻ tay — khách trả tiền rồi mà không xem được tab.
 */
import { describe, expect, it } from 'vitest'
import { parseDriveGrantResponse } from '../supabase/functions/admin-grant-access/drive.ts'

describe('parseDriveGrantResponse', () => {
  it('{"success":true} → đã chia sẻ', () => {
    expect(parseDriveGrantResponse(200, '{"success":true}')).toEqual({ ok: true })
  })

  it('sai secret (HTTP 200 kèm error) → KHÔNG tính là đã chia sẻ', () => {
    const r = parseDriveGrantResponse(200, '{"error":"unauthorized"}')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('unauthorized')
  })

  it('lỗi Drive (không phải chủ file) → thất bại, giữ lý do để admin đọc', () => {
    const r = parseDriveGrantResponse(200, '{"error":"Exception: No item with the given ID could be found."}')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('No item')
  })

  it('trang HTML lạ (vd trang đăng nhập Google) → thất bại', () => {
    expect(parseDriveGrantResponse(200, '<html>Sign in</html>').ok).toBe(false)
  })

  it('HTTP lỗi → thất bại kể cả thân phản hồi nói success', () => {
    expect(parseDriveGrantResponse(500, '{"success":true}').ok).toBe(false)
  })

  it('success không phải true thật (chuỗi "true") → thất bại', () => {
    expect(parseDriveGrantResponse(200, '{"success":"true"}').ok).toBe(false)
  })
})
