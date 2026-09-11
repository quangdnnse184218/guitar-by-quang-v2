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
let audioUnlocked = false
let masterBus = null
const rawSamples = new Map()
const decodedSamples = new Map()
const sampleGains = new Map()

// Mẫu guitar trong bộ soundfont được thu rất nhỏ (đỉnh chỉ khoảng 0.12 trên
// thang 1.0, tức là tầm -18dB), phát nguyên bản thì trên loa điện thoại gần
// như không nghe thấy gì. Nên mỗi nốt được chuẩn hoá lên đỉnh NORMALIZE_PEAK,
// và tất cả đi qua một bộ nén ở cuối để không vỡ tiếng khi các nốt ngân
// chồng lên nhau.
const NORMALIZE_PEAK = 0.75
const MAX_SAMPLE_GAIN = 14
const DEFAULT_VOLUME = 0.85
const NOTE_HOLD_SEC = 1.6
const VOLUME_KEY = 'gbq_camam_volume'

function loadVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw === null) return DEFAULT_VOLUME
    const value = Number(raw)
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

// Mức âm lượng người chơi tự chỉnh, dùng lại cho lần sau. Đây là hệ số của cả
// đường ra chung nên áp dụng cho mọi tiếng: nốt đàn, chuông đúng, tiếng báo sai.
let masterVolume = loadVolume()

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) audioCtx = new AudioContextClass()
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

/** Đường ra chung: mọi tiếng đều qua bộ nén này để không vỡ khi chồng nhau. */
function getMasterBus(ctx) {
  if (masterBus) return masterBus
  const gain = ctx.createGain()
  const compressor = ctx.createDynamicsCompressor()
  gain.gain.value = masterVolume
  compressor.threshold.value = -8
  compressor.knee.value = 6
  compressor.ratio.value = 10
  compressor.attack.value = 0.004
  compressor.release.value = 0.18
  gain.connect(compressor)
  compressor.connect(ctx.destination)
  masterBus = gain
  return masterBus
}

/**
 * Đổi âm lượng chung. Dùng setTargetAtTime thay vì gán thẳng để lúc kéo thanh
 * trong khi một nốt đang ngân thì mức lớn nhỏ chuyển mượt, không nghe "rắc".
 */
function setMasterVolume(value, { persist = true } = {}) {
  masterVolume = Math.min(1, Math.max(0, value))
  if (masterBus && audioCtx) {
    masterBus.gain.setTargetAtTime(masterVolume, audioCtx.currentTime, 0.015)
  } else if (masterBus) {
    masterBus.gain.value = masterVolume
  }
  if (persist) {
    try {
      localStorage.setItem(VOLUME_KEY, String(masterVolume))
    } catch {
      // Trình duyệt chặn localStorage — vẫn chỉnh được, chỉ là không nhớ cho lần sau.
    }
  }
}

function peakOf(buffer) {
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) {
      const value = Math.abs(data[i])
      if (value > peak) peak = value
    }
  }
  return peak
}

/**
 * PHẢI gọi đồng bộ ngay trong tác vụ chạm/bấm, trước mọi await.
 *
 * Safari trên iPhone chỉ mở khoá AudioContext khi có âm thanh phát ra từ
 * chính tác vụ chạm đó. Nếu chờ tải/giải mã xong mới phát thì tiếng đầu tiên
 * rơi sang tick sau, context vẫn khoá, và cả game im ru trong khi giao diện
 * vẫn chạy bình thường — không có lỗi nào hiện ra để mà biết.
 */
/**
 * iPhone mặc định coi tiếng của Web Audio là "ambient", nên gạt nút chuông
 * sang im lặng là câm luôn — trong khi Android không bị vậy. Khai báo
 * audioSession kiểu "playback" để iOS xếp nó vào loại phát nhạc và bỏ qua
 * nút gạt đó. Hỗ trợ từ iOS 16.4; máy cũ hơn thì đành phải gạt nút chuông.
 */
function claimPlaybackSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'
  } catch {
    // Trình duyệt không có API này — bỏ qua, không ảnh hưởng gì.
  }
}

function unlockAudio() {
  claimPlaybackSession()
  const ctx = getAudioContext()
  if (!ctx) return null
  if (!audioUnlocked) {
    const source = ctx.createBufferSource()
    // Đệm câm dài 20ms thay vì đúng 1 frame: một số bản iOS bỏ qua buffer quá
    // ngắn nên coi như chưa hề có tiếng nào phát ra, và không chịu mở khoá.
    const frames = Math.max(1, Math.floor(ctx.sampleRate * 0.02))
    source.buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    source.connect(ctx.destination)
    source.start(0)
    audioUnlocked = true
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
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

/** Safari cũ chỉ có decodeAudioData kiểu callback và trả về undefined, không phải promise. */
function decodeAudio(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const returned = ctx.decodeAudioData(arrayBuffer, resolve, reject)
    if (returned && typeof returned.then === 'function') returned.then(resolve, reject)
  })
}

async function decodeSamples() {
  const ctx = getAudioContext()
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Web Audio')
  await Promise.all(
    NOTES.map(async (note) => {
      if (decodedSamples.get(note.id)) return
      // slice() để giữ bản gốc: decodeAudioData sẽ "nuốt" mất ArrayBuffer truyền vào.
      const copy = rawSamples.get(note.id).slice(0)
      const buffer = await decodeAudio(ctx, copy)
      decodedSamples.set(note.id, buffer)
      const peak = peakOf(buffer)
      sampleGains.set(note.id, peak > 0 ? Math.min(MAX_SAMPLE_GAIN, NORMALIZE_PEAK / peak) : 1)
    })
  )
  // Không để hỏng âm thầm: thiếu nốt nào thì báo lỗi, thay vì chơi mà không kêu.
  if (NOTES.some((note) => !decodedSamples.get(note.id))) {
    throw new Error('Giải mã âm thanh thất bại')
  }
}

function playNote(noteId) {
  const ctx = getAudioContext()
  const buffer = decodedSamples.get(noteId)
  if (!ctx || !buffer) return

  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffer
  source.connect(gain)
  gain.connect(getMasterBus(ctx))

  // Mẫu gốc ngân tới hơn 3 giây, trong khi nốt kế tiếp phát sau chưa tới 1
  // giây — để nguyên thì các nốt chồng lên nhau nghe rất rối. Cho tắt dần
  // trong khoảng 1,6 giây để từng nốt nghe rõ ràng, tách bạch.
  const level = sampleGains.get(noteId) || 1
  const now = ctx.currentTime
  gain.gain.setValueAtTime(level, now)
  gain.gain.setValueAtTime(level, now + NOTE_HOLD_SEC * 0.45)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + NOTE_HOLD_SEC)
  source.start(now)
  source.stop(now + NOTE_HOLD_SEC + 0.05)
}

function playBlip(frequency, startOffset, duration, type = 'triangle', peak = 0.2) {
  const ctx = getAudioContext()
  if (!ctx) return
  const at = ctx.currentTime + startOffset
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(getMasterBus(ctx))
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
const testSoundBtn = document.getElementById('test-sound-btn')
const testSoundLabel = document.getElementById('test-sound-label')
const audioWarn = document.getElementById('audio-warn')
const audioState = document.getElementById('audio-state')

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

const volumeSlider = document.getElementById('volume-slider')
const volumeVal = document.getElementById('volume-val')
const volumeValTop = document.getElementById('volume-val-top')
const volumeIcon = document.getElementById('volume-icon')

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
let audioReady = false
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

const modeName = (which) => (which === 'see' ? 'Nhìn & Nghe' : 'Chỉ Nghe')
const otherMode = (which) => (which === 'see' ? 'hear' : 'see')

/** Ghi tên chế độ ngay trên nút bắt đầu: người bấm vội bỏ qua hai thẻ chọn
 *  ở trên thì vẫn đọc được mình sắp chơi chế độ nào, và biết là có lựa chọn. */
function updateStartLabel() {
  if (!audioReady) return
  startBtn.textContent = `Bắt Đầu · ${modeName(mode)}`
}

function setMode(next) {
  mode = next
  modeSeeBtn.setAttribute('aria-pressed', String(next === 'see'))
  modeHearBtn.setAttribute('aria-pressed', String(next === 'hear'))
  updateStartLabel()
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
  // Lớp này để CSS thu nhỏ vòng phím trên màn thấp, vì lúc làm quen có thêm
  // dải nhãn và nút bấm chiếm chỗ.
  screens.game.classList.toggle('is-warmup', active)
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
    // Gợi ý thẳng tên chế độ còn lại: nhiều người chơi hết một lượt rồi mới
    // biết là có tới hai chế độ.
    backMenuBtn.textContent = `Thử chế độ ${modeName(otherMode(mode))}`
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
    audioReady = true
    updateStartLabel()
  } catch {
    startBtn.disabled = false
    startBtn.textContent = 'Tải lại âm thanh'
  }
}

startBtn.addEventListener('click', async () => {
  // Mở khoá trước tiên, trong cùng tác vụ bấm này — xem chú thích ở unlockAudio().
  const ctx = unlockAudio()

  if (rawSamples.size < NOTES.length) {
    bootstrapAudio()
    return
  }
  startBtn.disabled = true
  startBtn.textContent = 'Đang chuẩn bị…'
  try {
    await decodeSamples()
    audioReady = true
    updateStartLabel()
    startBtn.disabled = false
    audioWarn.hidden = ctx ? ctx.state === 'running' : false
    startGame()
  } catch {
    startBtn.textContent = 'Không phát được âm thanh'
    startBtn.disabled = false
    audioWarn.hidden = false
  }
})

/** Cho người chơi thử loa trước khi vào game — cách nhanh nhất để biết máy mình có tiếng hay không. */
testSoundBtn.addEventListener('click', async () => {
  const ctx = unlockAudio()
  testSoundBtn.disabled = true
  try {
    if (rawSamples.size < NOTES.length) await fetchSamples()
    await decodeSamples()
    playNote('do')
    testSoundLabel.textContent = 'Vừa phát nốt Đồ — nghe thấy chứ?'
    // Trạng thái này giúp phân biệt "trình duyệt chặn" với "máy đang để im lặng":
    // nếu ở đây báo đang chạy mà vẫn không nghe gì thì gần như chắc chắn do
    // nút gạt chuông hoặc âm lượng, chứ không phải lỗi trang web.
    audioState.textContent = ctx ? `Trạng thái âm thanh: ${ctx.state}` : 'Trình duyệt không hỗ trợ Web Audio'
    audioWarn.hidden = false
  } catch (error) {
    testSoundLabel.textContent = 'Không phát được âm thanh'
    audioState.textContent = `Lỗi: ${error.message}`
    audioWarn.hidden = false
  }
  testSoundBtn.disabled = false
})

/** Cập nhật con số, phần tô của thanh trượt và biểu tượng loa theo mức hiện tại. */
function renderVolumeUI() {
  const percent = Math.round(masterVolume * 100)
  volumeSlider.value = String(percent)
  volumeSlider.style.setProperty('--fill', `${percent}%`)
  volumeVal.textContent = `${percent}%`
  volumeValTop.textContent = `${percent}%`

  const muted = percent === 0
  volumeIcon.querySelectorAll('.volume-wave').forEach((el) => {
    el.toggleAttribute('hidden', muted)
  })
  volumeIcon.querySelector('.volume-cross').toggleAttribute('hidden', !muted)
}

volumeSlider.addEventListener('input', () => {
  setMasterVolume(Number(volumeSlider.value) / 100)
  renderVolumeUI()
})

// Thả tay ra thì phát thử một nốt để nghe ngay mức vừa chỉnh. Chỉ phát khi máy
// không đang phát chuỗi và không đến lượt người chơi bấm — nếu không, ở chế độ
// Chỉ Nghe người chơi sẽ tưởng đó là một nốt trong chuỗi cần nhớ.
volumeSlider.addEventListener('change', () => {
  if (phase === 'playing' || phase === 'input') return
  if (masterVolume > 0 && decodedSamples.size > 0) playNote('do')
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

// Bấm nút này là đổi luôn sang chế độ còn lại rồi quay về màn chọn, để người
// chơi thấy tận mắt là có hai chế độ và mình đang ở chế độ nào.
backMenuBtn.addEventListener('click', () => {
  playToken += 1
  phase = 'idle'
  setWarmupUI(false)
  setMode(otherMode(mode))
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

// Lưới an toàn: nếu vì lý do nào đó âm thanh vẫn bị treo ở trạng thái tạm
// dừng, mọi lần chạm tiếp theo trên trang đều thử đánh thức lại.
document.addEventListener(
  'pointerdown',
  () => {
    if (audioCtx && audioCtx.state !== 'running') {
      claimPlaybackSession()
      audioCtx.resume()
    }
  },
  { passive: true }
)

claimPlaybackSession()
refreshBestLabels()
renderVolumeUI()
bootstrapAudio()
