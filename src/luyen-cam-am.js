/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — GAME LUYỆN CẢM ÂM (luyen-cam-am.js)
 * ==============================================================================
 * Máy phát một chuỗi nốt guitar, người chơi bấm lặp lại đúng thứ tự; lặp đúng
 * thì chuỗi dài thêm một nốt.
 *
 * Bảy phím là trọn quãng tám Đồ - Rê - Mi - Fa - Sol - La - Si, xếp quanh vòng
 * tròn theo cao độ tăng dần cùng chiều kim đồng hồ.
 *
 * Trang này cố tình KHÔNG import common.js: nó có thanh điều hướng riêng, mà
 * common.js chạy initAuthHeader() như một side effect trên mọi trang import nó.
 */

import { initThemeToggle } from './theme-toggle.js'

initThemeToggle()

const NOTES = [
  { id: 'do', sample: 'C4', label: 'Đồ', sub: 'C' },
  { id: 're', sample: 'D4', label: 'Rê', sub: 'D' },
  { id: 'mi', sample: 'E4', label: 'Mi', sub: 'E' },
  { id: 'fa', sample: 'F4', label: 'Fa', sub: 'F' },
  { id: 'sol', sample: 'G4', label: 'Sol', sub: 'G' },
  { id: 'la', sample: 'A4', label: 'La', sub: 'A' },
  { id: 'si', sample: 'B4', label: 'Si', sub: 'B' },
]

const SAMPLE_DIR = '/assets/audio/guitar-steel'
const START_LENGTH = 2
const BASE_GAP_MS = 620
const MIN_GAP_MS = 400
const GAP_STEP_MS = 18
const LIT_MS = 340
const BEST_KEY_PREFIX = 'gbq_camam_best_'

// ==========================================================================
// ÂM THANH
// ==========================================================================
let audioCtx = null
const rawSamples = new Map()
const decodedSamples = new Map()

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) audioCtx = new AudioContextClass()
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

async function fetchSamples() {
  await Promise.all(
    NOTES.map(async (note) => {
      const res = await fetch(`${SAMPLE_DIR}/${note.sample}.mp3`)
      if (!res.ok) throw new Error(`Không tải được ${note.sample}`)
      rawSamples.set(note.id, await res.arrayBuffer())
    })
  )
}

async function decodeSamples() {
  const ctx = getAudioContext()
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Web Audio')
  await Promise.all(
    NOTES.map(async (note) => {
      if (decodedSamples.has(note.id)) return
      // slice() để giữ bản gốc: decodeAudioData sẽ "nuốt" mất ArrayBuffer truyền vào.
      const copy = rawSamples.get(note.id).slice(0)
      decodedSamples.set(note.id, await ctx.decodeAudioData(copy))
    })
  )
}

function playNote(noteId) {
  const ctx = getAudioContext()
  const buffer = decodedSamples.get(noteId)
  if (!ctx || !buffer) return

  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffer
  source.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(0.85, ctx.currentTime)
  source.start()
}

function playBlip(frequency, startOffset, duration, type = 'triangle', peak = 0.2) {
  const ctx = getAudioContext()
  if (!ctx) return
  const at = ctx.currentTime + startOffset
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(frequency, at)
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.start(at)
  osc.stop(at + duration + 0.02)
}

function playSuccessChime() {
  playBlip(784, 0, 0.16)
  playBlip(1175, 0.09, 0.24)
}

function playErrorBuzz() {
  playBlip(150, 0, 0.32, 'sawtooth', 0.16)
  playBlip(96, 0.06, 0.4, 'sawtooth', 0.16)
}

// ==========================================================================
// KỶ LỤC (localStorage)
// ==========================================================================
function getBest(modeName) {
  try {
    return Number(localStorage.getItem(BEST_KEY_PREFIX + modeName)) || 0
  } catch {
    return 0
  }
}

function saveBest(modeName, score) {
  try {
    localStorage.setItem(BEST_KEY_PREFIX + modeName, String(score))
  } catch {
    // Trình duyệt chặn localStorage — vẫn chơi được, chỉ là không lưu kỷ lục.
  }
}

// ==========================================================================
// DOM
// ==========================================================================
const screens = {
  start: document.getElementById('screen-start'),
  game: document.getElementById('screen-game'),
  over: document.getElementById('screen-over'),
}

const modeSeeBtn = document.getElementById('mode-see')
const modeHearBtn = document.getElementById('mode-hear')
const bestSeeLabel = document.getElementById('best-see')
const bestHearLabel = document.getElementById('best-hear')
const startBtn = document.getElementById('start-btn')

const turntable = document.getElementById('turntable')
const hub = document.getElementById('hub')
const hubLabel = document.getElementById('hub-label')
const pads = Array.from(document.querySelectorAll('.pad'))
const statusEl = document.getElementById('status')
const progressDots = document.getElementById('progress-dots')
const hud = document.getElementById('hud')
const hudRound = document.getElementById('hud-round')
const hudBest = document.getElementById('hud-best')
const hudMode = document.getElementById('hud-mode')
const replayRow = document.getElementById('replay-row')
const replayBtn = document.getElementById('replay-btn')
const replayLabel = document.getElementById('replay-label')

const warmupBar = document.getElementById('warmup-bar')
const warmupCount = document.getElementById('warmup-count')
const warmupActions = document.getElementById('warmup-actions')
const playNowBtn = document.getElementById('play-now-btn')
const skipWarmupBtn = document.getElementById('skip-warmup-btn')

const overEmoji = document.getElementById('over-emoji')
const overSub = document.getElementById('over-sub')
const overScore = document.getElementById('over-score')
const overBest = document.getElementById('over-best')
const newBestTag = document.getElementById('new-best')
const againBtn = document.getElementById('again-btn')
const backMenuBtn = document.getElementById('back-menu-btn')

// ==========================================================================
// TRẠNG THÁI GAME
// ==========================================================================
let mode = 'see'
let sequence = []
let playerIndex = 0
let longest = 0
let replayUsed = false
let phase = 'idle' // 'idle' | 'playing' | 'input'
let playToken = 0

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name
  })
}

function setStatus(text, tone = '') {
  statusEl.textContent = text
  statusEl.className = 'status' + (tone ? ' ' + tone : '')
}

function refreshBestLabels() {
  bestSeeLabel.textContent = `Kỷ lục: ${getBest('see')} nốt`
  bestHearLabel.textContent = `Kỷ lục: ${getBest('hear')} nốt`
}

function setMode(next) {
  mode = next
  modeSeeBtn.setAttribute('aria-pressed', String(next === 'see'))
  modeHearBtn.setAttribute('aria-pressed', String(next === 'hear'))
}

function setPadsEnabled(enabled) {
  pads.forEach((pad) => {
    pad.disabled = !enabled
  })
}

function litPad(noteId) {
  const pad = pads.find((p) => p.dataset.note === noteId)
  if (!pad) return
  pad.classList.add('lit')
  setTimeout(() => pad.classList.remove('lit'), LIT_MS)
}

function pulseHub() {
  hub.classList.remove('pulse')
  // Ép trình duyệt tính lại layout để animation chạy lại được từ đầu.
  void hub.offsetWidth
  hub.classList.add('pulse')
}

hub.addEventListener('animationend', (event) => {
  if (event.animationName === 'pulse-ring') hub.classList.remove('pulse')
})

function setHubLabel(noteId) {
  if (!noteId) {
    hubLabel.textContent = ''
    return
  }
  const note = NOTES.find((n) => n.id === noteId)
  hubLabel.innerHTML = note ? `${note.label}<small>${note.sub}</small>` : ''
}

function renderProgressDots() {
  progressDots.innerHTML = sequence
    .map((_, index) => `<span class="progress-dot${index < playerIndex ? ' done' : ''}"></span>`)
    .join('')
}

function gapForRound() {
  const round = sequence.length - START_LENGTH + 1
  return Math.max(MIN_GAP_MS, BASE_GAP_MS - (round - 1) * GAP_STEP_MS)
}

function randomNoteId() {
  const last = sequence[sequence.length - 1]
  let candidates = NOTES.map((n) => n.id)
  // Tránh lặp lại ngay nốt vừa phát: hai nốt giống hệt liền nhau rất khó đếm bằng tai.
  if (last) candidates = candidates.filter((id) => id !== last)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// ==========================================================================
// LUỒNG CHƠI
// ==========================================================================
async function playSequence() {
  const token = ++playToken
  phase = 'playing'
  setPadsEnabled(false)
  replayBtn.disabled = true
  setStatus('Nghe kỹ nhé…')
  hub.classList.add('playing')

  const gap = gapForRound()
  await wait(520)

  for (const noteId of sequence) {
    if (token !== playToken) return
    playNote(noteId)
    if (mode === 'see') litPad(noteId)
    else pulseHub()
    await wait(gap)
  }

  if (token !== playToken) return

  hub.classList.remove('playing')
  phase = 'input'
  playerIndex = 0
  renderProgressDots()
  setPadsEnabled(true)
  replayBtn.disabled = replayUsed
  setStatus('Tới lượt bạn!', 'turn')
}

function startRound() {
  sequence.push(randomNoteId())
  replayUsed = false
  playerIndex = 0
  replayLabel.textContent = 'Nghe lại (1 lần)'
  hudRound.textContent = String(sequence.length - START_LENGTH + 1)
  renderProgressDots()
  playSequence()
}

function setWarmupUI(active) {
  warmupBar.hidden = !active
  warmupActions.hidden = !active
  hud.hidden = active
  replayRow.hidden = active
  progressDots.hidden = active
}

/**
 * Nghe qua lần lượt cả 7 nốt từ Đồ đến Si trước khi vào chơi. Giai đoạn này
 * có dải nhãn màu riêng, ghi rõ "chưa tính điểm", và tên nốt hiện ngay giữa
 * tai nghe theo từng nốt — để không ai nhầm nó với một vòng chơi thật.
 */
async function runWarmup() {
  const token = ++playToken
  phase = 'warmup'
  showScreen('game')
  setWarmupUI(true)
  playNowBtn.hidden = true
  skipWarmupBtn.hidden = false
  setPadsEnabled(true)
  setStatus('Đang cho bạn nghe qua từng nốt…')
  hub.classList.add('playing')

  for (let i = 0; i < NOTES.length; i++) {
    if (token !== playToken) return
    const note = NOTES[i]
    warmupCount.textContent = `${i + 1} / ${NOTES.length}`
    setHubLabel(note.id)
    litPad(note.id)
    playNote(note.id)
    await wait(760)
  }

  if (token !== playToken) return

  hub.classList.remove('playing')
  setHubLabel(null)
  phase = 'warmup-done'
  playNowBtn.hidden = false
  skipWarmupBtn.hidden = true
  setStatus('Xong! Bấm thử phím nào cũng được, sẵn sàng thì vào chơi.', 'good')
}

function beginPlaying() {
  playToken += 1
  hub.classList.remove('playing')
  setHubLabel(null)
  setWarmupUI(false)

  sequence = []
  longest = 0
  playerIndex = 0
  hudBest.textContent = String(getBest(mode))
  hudMode.textContent = mode === 'see' ? 'Nhìn & Nghe' : 'Chỉ Nghe'
  showScreen('game')

  for (let i = 0; i < START_LENGTH - 1; i++) sequence.push(randomNoteId())
  startRound()
}

function startGame() {
  runWarmup()
}

function handlePadPress(noteId) {
  // Trong lúc nghe làm quen, bấm phím chỉ để nghe lại nốt đó, không tính gì cả.
  if (phase === 'warmup' || phase === 'warmup-done') {
    playNote(noteId)
    litPad(noteId)
    setHubLabel(noteId)
    return
  }

  if (phase !== 'input') return

  playNote(noteId)
  litPad(noteId)

  if (noteId !== sequence[playerIndex]) {
    endGame()
    return
  }

  playerIndex += 1
  renderProgressDots()
  if (playerIndex < sequence.length) return

  // Lặp lại trọn chuỗi của vòng này.
  phase = 'idle'
  longest = sequence.length
  setPadsEnabled(false)
  replayBtn.disabled = true
  setStatus('Chuẩn luôn!', 'good')
  playSuccessChime()
  setTimeout(startRound, 900)
}

function endGame() {
  playToken += 1
  phase = 'idle'
  setPadsEnabled(false)
  replayBtn.disabled = true
  hub.classList.remove('playing')
  setStatus('Sai rồi!', 'bad')
  playErrorBuzz()

  turntable.classList.add('shake')
  setTimeout(() => turntable.classList.remove('shake'), 450)

  const previousBest = getBest(mode)
  const isNewBest = longest > previousBest
  if (isNewBest) saveBest(mode, longest)

  setTimeout(() => {
    overScore.textContent = String(longest)
    overBest.textContent = String(Math.max(previousBest, longest))
    newBestTag.hidden = !isNewBest
    overEmoji.textContent = longest >= 10 ? '🏆' : longest >= 6 ? '🎧' : '🎸'
    overSub.textContent = longest === 0
      ? 'Chưa lặp được nốt nào — thử lại nhé!'
      : `Bạn lặp lại đúng chuỗi ${longest} nốt`
    refreshBestLabels()
    showScreen('over')
  }, 900)
}

function handleReplay() {
  if (phase !== 'input' || replayUsed) return
  replayUsed = true
  replayLabel.textContent = 'Đã dùng lượt nghe lại'
  playSequence()
}

// ==========================================================================
// NẠP ÂM THANH & SỰ KIỆN
// ==========================================================================
async function bootstrapAudio() {
  startBtn.disabled = true
  startBtn.textContent = 'Đang tải âm thanh…'
  try {
    await fetchSamples()
    startBtn.disabled = false
    startBtn.textContent = 'Bắt Đầu Chơi'
  } catch {
    startBtn.disabled = false
    startBtn.textContent = 'Tải lại âm thanh'
  }
}

startBtn.addEventListener('click', async () => {
  if (rawSamples.size < NOTES.length) {
    bootstrapAudio()
    return
  }
  startBtn.disabled = true
  startBtn.textContent = 'Đang chuẩn bị…'
  try {
    await decodeSamples()
    startBtn.textContent = 'Bắt Đầu Chơi'
    startBtn.disabled = false
    startGame()
  } catch {
    startBtn.textContent = 'Không phát được âm thanh'
    startBtn.disabled = false
  }
})

modeSeeBtn.addEventListener('click', () => setMode('see'))
modeHearBtn.addEventListener('click', () => setMode('hear'))

pads.forEach((pad) => {
  pad.addEventListener('click', () => handlePadPress(pad.dataset.note))
})

replayBtn.addEventListener('click', handleReplay)
playNowBtn.addEventListener('click', beginPlaying)
skipWarmupBtn.addEventListener('click', beginPlaying)

// Chơi lại thì vào thẳng, không bắt nghe làm quen lần nữa.
againBtn.addEventListener('click', beginPlaying)

backMenuBtn.addEventListener('click', () => {
  playToken += 1
  phase = 'idle'
  setWarmupUI(false)
  refreshBestLabels()
  showScreen('start')
})

// Phím 1-7 cho người chơi trên máy tính.
document.addEventListener('keydown', (event) => {
  if (phase !== 'input') return
  const index = Number(event.key) - 1
  if (Number.isInteger(index) && index >= 0 && index < pads.length) {
    event.preventDefault()
    handlePadPress(pads[index].dataset.note)
  }
})

refreshBestLabels()
bootstrapAudio()
