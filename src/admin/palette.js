/**
 * ==============================================================================
 * ADMIN DASHBOARD — TÌM NHANH (Ctrl/⌘ + K, hoặc phím /)
 * ==============================================================================
 * Một ô tìm duy nhất cho cả bảng quản trị: gõ vài chữ là nhảy tới trang cần mở,
 * hoặc mở thẳng hồ sơ một thành viên (tên, email hay một phần mã khách). Không
 * gõ gì thì liệt kê các trang để chọn bằng phím mũi tên. Danh sách thành viên
 * nạp một lần khi mở lần đầu, dùng lại `state.usersList` nếu trang Thành viên
 * đã nạp trước đó.
 */
import { supabase } from '../lib/supabase.js'
import { state } from './state.js'
import { ROUTES, navigate } from './router.js'
import { escapeHtml } from './format.js'

const MAX_USERS = 6

/** Bỏ dấu, hạ chữ thường: "Tiền về" khớp với "tien ve". */
export function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

/** Mọi từ trong truy vấn đều phải xuất hiện trong chuỗi đích. */
export function matches(query, haystack) {
  const target = fold(haystack)
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => target.includes(word))
}

const ICON_SEARCH =
  '<svg class="w-4 h-4" aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>'
const ICON_ARROW =
  '<svg class="w-3.5 h-3.5" aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>'

function pageItems() {
  return Object.entries(ROUTES)
    .filter(([, r]) => !r.hidden)
    .map(([key, r]) => ({
      kind: 'page',
      label: r.title,
      hint: r.subtitle,
      search: `${r.title} ${r.subtitle}`,
      run: () => navigate(key),
    }))
}

function actionItems() {
  return [
    {
      kind: 'action',
      label: 'Đổi giao diện sáng / tối',
      hint: 'Chuyển nhanh giữa hai chế độ màu',
      search: 'doi giao dien sang toi theme dark light',
      run: () => document.getElementById('theme-toggle-btn')?.click(),
    },
    {
      kind: 'action',
      label: 'Xem website',
      hint: 'Mở trang chủ ở tab mới',
      search: 'xem website trang chu',
      run: () => window.open('/', '_blank', 'noopener'),
    },
  ]
}

function userItems(query) {
  if (!query.trim()) return []
  return state.usersList
    .filter((u) => matches(query, `${u.full_name || ''} ${u.email || ''} ${u.id || ''}`))
    .slice(0, MAX_USERS)
    .map((u) => ({
      kind: 'user',
      label: u.full_name || u.email || 'Thành viên',
      hint: u.email || '',
      run: () => navigate('thanh-vien-chi-tiet', u.id),
    }))
}

const GROUP_LABEL = { user: 'Thành viên', page: 'Trang', action: 'Thao tác' }

let root = null
let inputEl = null
let listEl = null
let items = []
let active = 0
let usersRequested = false
let returnFocus = null

function build() {
  root = document.createElement('div')
  root.id = 'admin-palette'
  root.className = 'admin-palette'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Tìm nhanh')
  root.hidden = true
  root.innerHTML = `
    <div class="admin-palette-panel">
      <label class="admin-palette-field">
        <span class="admin-palette-ico">${ICON_SEARCH}</span>
        <input type="text" id="admin-palette-input" autocomplete="off" spellcheck="false"
          placeholder="Tìm trang hoặc thành viên…" aria-controls="admin-palette-list" />
        <kbd class="admin-kbd">Esc</kbd>
      </label>
      <div id="admin-palette-list" class="admin-palette-list" role="listbox"></div>
      <div class="admin-palette-foot">
        <span><kbd class="admin-kbd">↑</kbd> <kbd class="admin-kbd">↓</kbd> chọn</span>
        <span><kbd class="admin-kbd">Enter</kbd> mở</span>
      </div>
    </div>`
  document.body.appendChild(root)
  inputEl = root.querySelector('#admin-palette-input')
  listEl = root.querySelector('#admin-palette-list')

  root.addEventListener('mousedown', (e) => {
    if (e.target === root) close()
  })
  inputEl.addEventListener('input', () => {
    active = 0
    render()
  })
  inputEl.addEventListener('keydown', onKey)
  listEl.addEventListener('mousemove', (e) => {
    const row = e.target.closest('[data-idx]')
    if (row && Number(row.dataset.idx) !== active) setActive(Number(row.dataset.idx))
  })
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('[data-idx]')
    if (row) choose(Number(row.dataset.idx))
  })
}

function compute() {
  const q = inputEl.value
  const pages = pageItems().filter((p) => !q.trim() || matches(q, p.search))
  const actions = actionItems().filter((a) => !q.trim() || matches(q, a.search))
  // Thành viên lên đầu khi đang gõ: người ta gõ tên khách nhiều hơn tên trang.
  return [...userItems(q), ...pages, ...actions]
}

function rowHtml(item, idx) {
  const lead =
    item.kind === 'user'
      ? `<span class="admin-palette-initial">${escapeHtml((item.label[0] || '?').toUpperCase())}</span>`
      : `<span class="admin-palette-initial is-page">${ICON_ARROW}</span>`
  return `
    <div class="admin-palette-row${idx === active ? ' is-active' : ''}" role="option" data-idx="${idx}" aria-selected="${idx === active}">
      ${lead}
      <span class="min-w-0 flex-1">
        <span class="block truncate font-bold text-[13px]">${escapeHtml(item.label)}</span>
        ${item.hint ? `<span class="block truncate text-[11px] sm:text-xs text-text-muted">${escapeHtml(item.hint)}</span>` : ''}
      </span>
    </div>`
}

function render() {
  items = compute()
  if (items.length === 0) {
    listEl.innerHTML = `<div class="admin-palette-empty">Không tìm thấy “${escapeHtml(inputEl.value.trim())}”</div>`
    return
  }
  let html = ''
  let lastKind = null
  items.forEach((item, idx) => {
    if (item.kind !== lastKind) {
      html += `<div class="admin-palette-group">${GROUP_LABEL[item.kind]}</div>`
      lastKind = item.kind
    }
    html += rowHtml(item, idx)
  })
  listEl.innerHTML = html
}

function setActive(idx) {
  active = Math.max(0, Math.min(items.length - 1, idx))
  listEl.querySelectorAll('[data-idx]').forEach((row) => {
    const on = Number(row.dataset.idx) === active
    row.classList.toggle('is-active', on)
    row.setAttribute('aria-selected', on ? 'true' : 'false')
    if (on) row.scrollIntoView({ block: 'nearest' })
  })
}

function choose(idx) {
  const item = items[idx]
  if (!item) return
  close()
  item.run()
}

function onKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    setActive(active + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    setActive(active - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    choose(active)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

async function ensureUsers() {
  if (usersRequested || state.usersList.length > 0) return
  usersRequested = true
  try {
    const { data, error } = await supabase.rpc('admin_get_users')
    if (error) throw error
    if (state.usersList.length === 0) state.usersList = data || []
    if (root && !root.hidden) render()
  } catch (err) {
    // Không có danh sách thành viên thì vẫn tìm được trang; cho phép thử lại lần mở sau.
    console.error('Palette: không nạp được thành viên', err)
    usersRequested = false
  }
}

export function openPalette() {
  if (!root) build()
  if (!root.hidden) return
  returnFocus = document.activeElement
  root.hidden = false
  document.body.classList.add('admin-palette-open')
  inputEl.value = ''
  active = 0
  render()
  inputEl.focus()
  ensureUsers()
}

export function close() {
  if (!root || root.hidden) return
  root.hidden = true
  document.body.classList.remove('admin-palette-open')
  returnFocus?.focus?.()
}

function isTyping(el) {
  return (
    el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  )
}

export function initPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (root && !root.hidden) close()
      else openPalette()
    } else if (e.key === '/' && !isTyping(document.activeElement) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      openPalette()
    }
  })
  document.getElementById('admin-palette-btn')?.addEventListener('click', openPalette)
}
