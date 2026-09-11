/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — GAME LUYỆN CẢM ÂM VÀ TRÍ NHỚ (luyen-cam-am.js)
 * ==============================================================================
 * Máy phát một chuỗi nốt guitar, người chơi bấm lặp lại đúng thứ tự; lặp đúng
 * thì chuỗi dài thêm một nốt.
 *
 * Bảy phím là trọn quãng tám Đồ - Rê - Mi - Fa - Sol - La - Si, xếp quanh vòng
 * tròn theo cao độ tăng dần cùng chiều kim đồng hồ.
 *
 * Bấm sai không chết ngay: mất một tim, được nghe lại chuỗi và làm lại đúng
 * vòng đó. Hết tim thì mở Cơ Hội Cuối — dò một nốt ẩn bằng tai để được cứu,
 * ăn được tim nào thì có quyền dừng lại hoặc liều đi tiếp ăn thêm.
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
// LUẬT CHƠI — mấy con số này là thứ cần vặn nhiều nhất khi chơi thử
// ==========================================================================
const START_HEARTS = 1
const HEART_CAP = 5

/**
 * Cơ Hội Cuối: nghe nốt ẩn đúng MỘT lần, không được nghe lại, không được bấm
 * thử — bấm phím nào là chốt đáp án đó ngay, đúng/sai biết liền. Vòng 1 rộng
 * rãi 3 giây để làm quen, các vòng sau siết còn 2 giây vì độ khó lúc này
 * chủ yếu tới từ số tim đang cược (dừng lại hay liều đi tiếp), không phải
 * từ bài toán tự nó khó hơn.
 */
const LC_TOTAL_LEVELS = 5
const LC_SECONDS_FIRST = 3
const LC_SECONDS_LATER = 2
const secondsForLevel = (level) => (level === 0 ? LC_SECONDS_FIRST : LC_SECONDS_LATER)

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
// đường ra chung nên áp dụng cho mọi tiếng: nốt đàn, tiếng thưởng, tiếng báo sai.
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

/**
 * PHẢI gọi đồng bộ ngay trong tác vụ chạm/bấm, trước mọi await.
 *
 * Safari trên iPhone chỉ mở khoá AudioContext khi có âm thanh phát ra từ
 * chính tác vụ chạm đó. Nếu chờ tải/giải mã xong mới phát thì tiếng đầu tiên
 * rơi sang tick sau, context vẫn khoá, và cả game im ru trong khi giao diện
 * vẫn chạy bình thường — không có lỗi nào hiện ra để mà biết.
 */
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

// --------------------------------------------------------------------------
// Tiếng không cao độ
//
// Nguyên tắc xuyên suốt: hiệu ứng KHÔNG được lấn vào vùng cao độ của bảy nốt
// (C4–B4, tức 261–494 Hz). Tiếng nào cũng hoặc là nhiễu không cao độ, hoặc
// bay hẳn lên từ C6 trở lên — nếu không, tai người chơi bị nhiễu và không còn
// phân biệt nổi đâu là nốt cần nhớ, đâu là tiếng của game.
// --------------------------------------------------------------------------
let noiseBuffer = null
function getNoiseBuffer(ctx) {
  if (noiseBuffer) return noiseBuffer
  const length = Math.floor(ctx.sampleRate * 0.4)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

function playNoise({ at = 0, duration = 0.08, peak = 0.2, filterType = 'bandpass', freq = 1800, q = 1 } = {}) {
  const ctx = getAudioContext()
  if (!ctx) return
  const t = ctx.currentTime + at
  const source = ctx.createBufferSource()
  source.buffer = getNoiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = freq
  filter.Q.value = q
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(peak, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(getMasterBus(ctx))
  source.start(t)
  source.stop(t + duration + 0.03)
}

/** Qua mỗi vòng: rải một hợp âm sáng về quãng tám, đúng kiểu tiếng "chuẩn luôn". */
function playRoundChord() {
  const chord = [1046.5, 1318.51, 1567.98, 2093]
  chord.forEach((freq, i) => playBlip(freq, i * 0.075, 0.55, 'triangle', 0.15))
  playBlip(2093, 0.34, 0.7, 'sine', 0.09)
}

/** Hai nhịp "thụp" trầm như tim đập — buộc trái tim vào một âm thanh sinh học. */
function playHeartThump(at = 0, peak = 0.32) {
  const ctx = getAudioContext()
  if (!ctx) return
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(94, t)
  osc.frequency.exponentialRampToValueAtTime(46, t + 0.13)
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(peak, t + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  osc.connect(gain)
  gain.connect(getMasterBus(ctx))
  osc.start(t)
  osc.stop(t + 0.22)
}

/** Nhận tim: sóng dâng lên, hợp âm sáng bung ra, rồi tim đập trở lại. */
function playHeartGain() {
  const ctx = getAudioContext()
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(523.25, t)
  osc.frequency.exponentialRampToValueAtTime(1046.5, t + 0.24)
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(0.17, t + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
  osc.connect(gain)
  gain.connect(getMasterBus(ctx))
  osc.start(t)
  osc.stop(t + 0.46)

  playBlip(1318.51, 0.18, 0.36, 'triangle', 0.11)
  playBlip(1567.98, 0.22, 0.36, 'triangle', 0.09)
  playHeartThump(0.44)
  playHeartThump(0.64, 0.22)
}

/** Mất một tim nhưng còn cứu được: nứt vỡ ngắn gọn, dứt khoát. */
function playHeartBreak() {
  playNoise({ duration: 0.09, peak: 0.3, freq: 2600, q: 0.8 })
  playNoise({ at: 0.06, duration: 0.17, peak: 0.19, freq: 1250, q: 0.7 })
  const ctx = getAudioContext()
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(210, t)
  osc.frequency.exponentialRampToValueAtTime(68, t + 0.34)
  gain.gain.setValueAtTime(0.13, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36)
  osc.connect(gain)
  gain.connect(getMasterBus(ctx))
  osc.start(t)
  osc.stop(t + 0.4)
}

/** Mất tim cuối: trầm hơn, dài hơn, rồi im bặt — phải nghe ra ngay là "xong rồi". */
function playFatalBreak() {
  playNoise({ duration: 0.13, peak: 0.33, freq: 2100, q: 0.7 })
  const ctx = getAudioContext()
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(175, t)
  osc.frequency.exponentialRampToValueAtTime(36, t + 0.78)
  gain.gain.setValueAtTime(0.2, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.82)
  osc.connect(gain)
  gain.connect(getMasterBus(ctx))
  osc.start(t)
  osc.stop(t + 0.88)
}

/** Khẽ tới mức gần như không để ý — chỉ để tạo cảm giác chạm vào vật thật. */
function playPadTick() {
  playNoise({ duration: 0.022, peak: 0.05, filterType: 'highpass', freq: 5200 })
}

/** Tíc tắc đồng hồ. Không cao độ, vì người chơi đang giữ một cao độ trong đầu. */
function playClockTick(urgent = false) {
  playNoise({
    duration: urgent ? 0.05 : 0.04,
    peak: urgent ? 0.22 : 0.12,
    freq: urgent ? 2700 : 1500,
    q: urgent ? 3 : 2.4,
  })
}

/** Phá kỷ lục: phải khác hẳn mọi tiếng thưởng khác, vì đây là sự kiện hiếm nhất. */
function playRecordFanfare() {
  const rise = [1046.5, 1318.51, 1567.98, 2093, 2637.02]
  rise.forEach((freq, i) => playBlip(freq, i * 0.1, 0.55, 'triangle', 0.15))
  ;[1046.5, 1318.51, 1567.98, 2093].forEach((freq) => playBlip(freq, 0.54, 1, 'sine', 0.1))
}

// Nhịp tim chậm ở bước chọn "dừng hay đi tiếp": im ắng, căng, không hối thúc.
let heartbeatId = null
function startHeartbeatLoop() {
  stopHeartbeatLoop()
  const beat = () => {
    playHeartThump(0, 0.16)
    playHeartThump(0.21, 0.11)
    heartbeatId = setTimeout(beat, 1450)
  }
  beat()
}
function stopHeartbeatLoop() {
  clearTimeout(heartbeatId)
  heartbeatId = null
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern)
  } catch {
    // Máy không hỗ trợ rung — bỏ qua.
  }
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

const topbarHomeLink = document.getElementById('topbar-home-link')

const modeSeeBtn = document.getElementById('mode-see')
const modeHearBtn = document.getElementById('mode-hear')
const bestSeeLabel = document.getElementById('best-see')
const bestHearLabel = document.getElementById('best-hear')
const startBtn = document.getElementById('start-btn')

const turntable = document.getElementById('turntable')
const ttGlow = document.getElementById('tt-glow')
const hub = document.getElementById('hub')
const hubLabel = document.getElementById('hub-label')
const pads = Array.from(document.querySelectorAll('.pad'))
const statusEl = document.getElementById('status')
const progressDots = document.getElementById('progress-dots')
const hud = document.getElementById('hud')
const hudRound = document.getElementById('hud-round')
const hudBest = document.getElementById('hud-best')
const hudMode = document.getElementById('hud-mode')
const heartsEl = document.getElementById('hearts')
const gameNav = document.getElementById('game-nav')
const keyHint = document.querySelector('.key-hint')
const backModesBtn = document.getElementById('back-modes-btn')
const restartBtn = document.getElementById('restart-btn')

const volumeSlider = document.getElementById('volume-slider')
const volumeVal = document.getElementById('volume-val')
const volumeIcon = document.getElementById('volume-icon')

const warmupBar = document.getElementById('warmup-bar')
const warmupCount = document.getElementById('warmup-count')
const warmupActions = document.getElementById('warmup-actions')
const playNowBtn = document.getElementById('play-now-btn')
const skipWarmupBtn = document.getElementById('skip-warmup-btn')

const lcBar = document.getElementById('lc-bar')
const lcLevelEl = document.getElementById('lc-level')
const lcNote = document.getElementById('lc-note')
const lcTimerBar = document.getElementById('lc-timerbar')
const lcTimerFill = document.getElementById('lc-timerbar-fill')
const lcStartBtn = document.getElementById('lc-start-btn')
const lcChoice = document.getElementById('lc-choice')
const lcStake = document.getElementById('lc-stake')
const lcStopBtn = document.getElementById('lc-stop-btn')
const lcNextBtn = document.getElementById('lc-next-btn')
const lcVignette = document.getElementById('lc-vignette')

const confettiEl = document.getElementById('confetti')

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
let hearts = START_HEARTS
let streak = 0
let lastChanceUsed = false
let phase = 'idle' // idle | playing | input | warmup | warmup-done | lc-listen | lc-input | lc-choice
let playToken = 0

// Trạng thái riêng của Cơ Hội Cuối
let lcLevel = 0
let lcPending = 0
let lcSecret = null
let lcTimeoutId = null
let lcTickId = null
let lcDeadline = 0

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const noteLabel = (id) => (NOTES.find((n) => n.id === id) || {}).label || ''

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name
  })
  // Lúc đang chơi đã có nút "Quay lại" riêng trong màn chơi rồi, thêm lối
  // thoát "Trang chủ" nữa ở thanh trên dễ gây rối (2 nút cùng ý nghĩa thoát ra).
  topbarHomeLink.hidden = name === 'game'
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

function setHubLabel(text) {
  hubLabel.innerHTML = text || ''
}

function setHubNoteLabel(noteId) {
  const note = NOTES.find((n) => n.id === noteId)
  setHubLabel(note ? `${note.label}<small>${note.sub}</small>` : '')
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

/**
 * Chọn nốt kế tiếp cho chuỗi. Hai luật:
 * 1. Không lặp lại ngay nốt vừa phát — hai nốt giống hệt liền nhau rất khó
 *    đếm bằng tai.
 * 2. Kiểu đổi qua đổi lại giữa hai nốt (A-B-A) chỉ được phép đúng một lần:
 *    nếu ba nốt cuối đã là A-B-A rồi thì nốt thứ tư không được là A hay B
 *    nữa, bắt buộc phải là một nốt khác hẳn — tránh kiểu "đô rê đô rê đô fa"
 *    quá dễ đoán và không công bằng.
 */
function pickNextNote(sequence) {
  const ids = NOTES.map((n) => n.id)
  const last = sequence[sequence.length - 1]
  const prev = sequence[sequence.length - 2]
  const prev2 = sequence[sequence.length - 3]

  const exclude = new Set()
  if (last) exclude.add(last)
  if (prev2 !== undefined && prev !== undefined && prev2 === last && prev !== last) {
    exclude.add(prev)
  }

  const candidates = ids.filter((id) => !exclude.has(id))
  const pool = candidates.length > 0 ? candidates : ids.filter((id) => id !== last)
  return pool[Math.floor(Math.random() * pool.length)]
}

// ==========================================================================
// TIM
// ==========================================================================
const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'

function liveHearts() {
  return Array.from(heartsEl.querySelectorAll('.heart:not(.lost)'))
}

/** Chỉ trái tim cuối cùng mới đập — lời nhắc rằng đang đi trên dây. */
function updateLastHeartPulse() {
  const list = liveHearts()
  list.forEach((el) => el.classList.remove('last'))
  if (list.length === 1) list[0].classList.add('last')
}

function addHeartEl(animate) {
  const el = document.createElement('span')
  el.className = 'heart' + (animate ? ' gained' : '')
  el.innerHTML = HEART_SVG
  heartsEl.appendChild(el)
  if (animate) {
    el.addEventListener('animationend', () => el.classList.remove('gained'), { once: true })
  }
  updateLastHeartPulse()
}

function removeHeartEl() {
  const list = liveHearts()
  const el = list[list.length - 1]
  if (!el) return
  el.classList.remove('last')
  el.classList.add('lost')
  setTimeout(() => {
    el.remove()
    updateLastHeartPulse()
  }, 520)
}

function resetHearts(count) {
  hearts = count
  heartsEl.innerHTML = ''
  for (let i = 0; i < count; i++) addHeartEl(false)
}

function gainHeart(amount = 1, cap = HEART_CAP) {
  const before = hearts
  // Trần chỉ chặn việc cộng thêm, tuyệt đối không được cắt bớt số tim đang có.
  hearts = Math.max(before, Math.min(cap, before + amount))
  for (let i = 0; i < hearts - before; i++) addHeartEl(true)
  return hearts - before
}

function loseHeart() {
  if (hearts <= 0) return
  hearts -= 1
  removeHeartEl()
}

// ==========================================================================
// ĐIỂM
// ==========================================================================
/** Ghi điểm và nháy sáng con số — phản hồi tức thì đúng lúc vừa qua một vòng. */
function setPoints(value) {
  hudRound.textContent = String(value)
  hudRound.classList.remove('score-flash')
  void hudRound.offsetWidth
  hudRound.classList.add('score-flash')
}

// ==========================================================================
// HIỆU ỨNG HÌNH
// ==========================================================================
/** Chuỗi càng dài, vòng phím càng "nóng" lên. */
function updateGlow() {
  ttGlow.style.opacity = String(Math.min(1, streak / 8) * 0.85)
}

/** Bảy phím sáng lần lượt vòng quanh, như pháo hoa. */
function ripplePads() {
  pads.forEach((pad, i) => setTimeout(() => litPad(pad.dataset.note), i * 70))
}

function revealCorrectPad(noteId) {
  const pad = pads.find((p) => p.dataset.note === noteId)
  if (!pad) return
  pad.classList.add('reveal')
  setTimeout(() => pad.classList.remove('reveal'), 1800)
}

function shakeTick() {
  turntable.classList.remove('tick-shake')
  void turntable.offsetWidth
  turntable.classList.add('tick-shake')
}

/** Pháo hoa ruy băng: nổ toả tròn từ tâm màn hình rồi rơi nhẹ xuống, thay vì
 *  rơi thẳng từ trên như confetti thường — đúng chất "pháo hoa" hơn. */
function burstConfetti() {
  const colors = ['#f5c044', '#f49a45', '#ee7b6e', '#d97bae', '#9c8be8', '#4fc2ac', '#a8c554']
  const count = 60
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i')
    const angle = Math.random() * Math.PI * 2
    const dist = 90 + Math.random() * 210
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist + 60 // trọng lực kéo lệch xuống một chút
    bit.style.setProperty('--dx', `${dx}px`)
    bit.style.setProperty('--dy', `${dy}px`)
    bit.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`)
    bit.style.background = colors[i % colors.length]
    bit.style.animationDuration = `${0.9 + Math.random() * 0.7}s`
    bit.style.animationDelay = `${Math.random() * 0.18}s`
    confettiEl.appendChild(bit)
    setTimeout(() => bit.remove(), 2300)
  }
}

// ==========================================================================
// LUỒNG CHƠI CHÍNH
// ==========================================================================
async function playSequence() {
  const token = ++playToken
  phase = 'playing'
  setPadsEnabled(false)
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
  setStatus('Tới lượt bạn!', 'turn')
}

function startRound() {
  sequence.push(pickNextNote(sequence))
  playerIndex = 0
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
  gameNav.hidden = active
  if (keyHint) keyHint.hidden = active
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
    setHubNoteLabel(note.id)
    litPad(note.id)
    playNote(note.id)
    await wait(760)
  }

  if (token !== playToken) return

  hub.classList.remove('playing')
  setHubLabel('')
  phase = 'warmup-done'
  playNowBtn.hidden = false
  skipWarmupBtn.hidden = true
  setStatus('Xong! Bấm thử phím nào cũng được, sẵn sàng thì vào chơi.', 'good')
}

function beginPlaying() {
  playToken += 1
  hub.classList.remove('playing')
  setHubLabel('')
  setWarmupUI(false)
  setLastChanceUI(false)

  sequence = []
  longest = 0
  playerIndex = 0
  streak = 0
  lastChanceUsed = false
  updateGlow()
  resetHearts(START_HEARTS)
  hudRound.textContent = '0'
  hudRound.classList.remove('score-flash')
  hudBest.textContent = String(getBest(mode))
  hudMode.textContent = modeName(mode)
  showScreen('game')

  for (let i = 0; i < START_LENGTH - 1; i++) {
    sequence.push(pickNextNote(sequence))
  }
  startRound()
}

function handlePadPress(noteId) {
  // Trong lúc nghe làm quen, bấm phím chỉ để nghe lại nốt đó, không tính gì cả.
  if (phase === 'warmup' || phase === 'warmup-done') {
    playNote(noteId)
    litPad(noteId)
    setHubNoteLabel(noteId)
    return
  }

  if (phase === 'lc-input') {
    handleLastChancePad(noteId)
    return
  }

  if (phase !== 'input') return

  playNote(noteId)
  playPadTick()
  litPad(noteId)

  if (noteId !== sequence[playerIndex]) {
    handleMistake()
    return
  }

  playerIndex += 1
  renderProgressDots()
  if (playerIndex < sequence.length) return

  completeRound()
}

function completeRound() {
  phase = 'idle'
  longest = sequence.length
  streak += 1
  setPadsEnabled(false)
  updateGlow()
  // Điểm = số vòng đã qua trót lọt, ghi và nháy sáng ngay lúc vừa ghi được —
  // không đợi tới lúc bắt đầu vòng kế mới cập nhật. +1 vì sequence.length -
  // START_LENGTH đếm số nốt CHUỖI ĐÃ DÀI RA, còn vòng vừa qua (từ độ dài
  // START_LENGTH) cũng phải tính là một vòng đã hoàn thành.
  setPoints(sequence.length - START_LENGTH + 1)
  celebrateRound()
  setStatus('Chuẩn luôn!', 'good')
  setTimeout(startRound, 1400)
}

/** Sau mỗi vòng qua được: pháo hoa bảy phím sáng vòng quanh, kèm hợp âm kết. */
function celebrateRound() {
  ripplePads()
  playRoundChord()
  vibrate([30, 50, 30])
}

function handleMistake() {
  const correctId = sequence[playerIndex]
  phase = 'idle'
  setPadsEnabled(false)
  streak = 0
  updateGlow()
  turntable.classList.add('shake')
  setTimeout(() => turntable.classList.remove('shake'), 450)

  loseHeart()

  if (hearts > 0) {
    // Còn tim: mất một tim, được nghe lại chuỗi và làm lại chính vòng đó.
    playHeartBreak()
    vibrate([90])
    setStatus('Sai rồi — mất một tim. Nghe lại nhé!', 'bad')
    if (mode === 'see') revealCorrectPad(correctId)
    setTimeout(() => {
      playerIndex = 0
      renderProgressDots()
      playSequence()
    }, 1600)
    return
  }

  // Hết tim.
  playFatalBreak()
  vibrate([150])
  setStatus('Hết tim!', 'bad')
  if (mode === 'see') revealCorrectPad(correctId)

  if (!lastChanceUsed) {
    // Tiếng vỡ dứt ở khoảng 0,85s; chờ tới 1,5s để có đúng một khoảng im lặng
    // trước khi tiếng ù của Cơ Hội Cuối dâng lên. Khoảng lặng đó chính là hiệu
    // ứng mạnh nhất của cả màn này.
    setTimeout(startLastChance, 1500)
  } else {
    setTimeout(endGame, 1400)
  }
}

// ==========================================================================
// CƠ HỘI CUỐI
// ==========================================================================
function setLastChanceUI(active) {
  screens.game.classList.toggle('is-lastchance', active)
  lcBar.hidden = !active
  lcVignette.hidden = !active
  lcChoice.hidden = true
  hud.hidden = active
  gameNav.hidden = active
  if (keyHint) keyHint.hidden = active
  progressDots.hidden = active

  if (!active) {
    setHubLabel('')
    stopLcTimer()
    lcTimerBar.hidden = true
    lcStartBtn.hidden = true
  }
}

/**
 * Đồng hồ 3 giây phẳng cho cả 5 vòng. Thanh đèn xanh lá tuột dần từ đầy về
 * hết dựa trên một lcDeadline duy nhất, nên luôn khớp chính xác với thời
 * điểm hết giờ thật.
 */
function startLcTimer(seconds) {
  stopLcTimer()
  lcDeadline = performance.now() + seconds * 1000

  lcTimerBar.hidden = false
  lcTimerFill.style.transition = 'none'
  lcTimerFill.style.width = '100%'
  void lcTimerFill.getBoundingClientRect()
  lcTimerFill.style.transition = `width ${seconds}s linear`
  lcTimerFill.style.width = '0%'

  scheduleClockTick()
  lcTimeoutId = setTimeout(handleLcTimeout, seconds * 1000)
}

function scheduleClockTick() {
  const remain = lcDeadline - performance.now()
  if (remain <= 80) return
  // Đồng hồ chỉ 3 giây nên toàn bộ quãng đó đã là "gấp" — tíc tắc nhanh, kèm
  // màn rung nhẹ theo từng nhịp cho thấy rõ đang chạy nước rút.
  playClockTick(true)
  shakeTick()
  vibrate([12])
  lcTickId = setTimeout(scheduleClockTick, 480)
}

function stopLcTimer() {
  clearTimeout(lcTimeoutId)
  clearTimeout(lcTickId)
  lcTimeoutId = null
  lcTickId = null
  // Đóng băng thanh đèn đúng chỗ nó đang tuột tới.
  const current = getComputedStyle(lcTimerFill).width
  lcTimerFill.style.transition = 'none'
  lcTimerFill.style.width = current
}

/**
 * Trước khi vào vòng 1, dừng lại ở màn hình luật chơi (chữ "Bắt Đầu") để
 * người chơi đọc kỹ trước khi bấm — tránh vào thẳng mà chưa hiểu luật.
 */
async function startLastChance() {
  lastChanceUsed = true
  lcLevel = 0
  lcPending = 0
  const token = ++playToken

  setLastChanceUI(true)
  await wait(350)
  if (token !== playToken) return

  phase = 'lc-intro'
  lcLevelEl.textContent = `Vòng 1 / ${LC_TOTAL_LEVELS}`
  lcNote.innerHTML = `Mỗi vòng nghe một nốt ẩn — chỉ nghe được đúng <strong>1 lần</strong>, không được nghe lại. Bấm phím nào là chốt đáp án đó ngay: thắng một vòng là nhận <strong>1 tim</strong>. Vòng 1 có <strong>${LC_SECONDS_FIRST} giây</strong>, các vòng sau còn <strong>${LC_SECONDS_LATER} giây</strong>.`
  lcTimerBar.hidden = true
  lcStartBtn.hidden = false
  setHubLabel('')
  setStatus('Đọc kỹ luật rồi bấm Bắt Đầu', 'turn')
}

/**
 * Nghe nốt ẩn đúng MỘT lần — không được nghe lại, không được bấm thử. Bấm
 * phím nào là chốt đáp án đó ngay lập tức, đúng/sai biết liền.
 */
async function runLastChanceLevel() {
  const token = ++playToken

  phase = 'lc-listen'
  lcSecret = NOTES[Math.floor(Math.random() * NOTES.length)].id

  const seconds = secondsForLevel(lcLevel)
  lcLevelEl.textContent = `Vòng ${lcLevel + 1} / ${LC_TOTAL_LEVELS}`
  lcNote.innerHTML =
    lcLevel === 0
      ? `Nghe kỹ nốt ẩn nhé…`
      : `Đang giữ <strong>${lcPending} tim</strong> — bấm đúng phím trong ${seconds} giây, sai là mất sạch.`
  lcChoice.hidden = true
  lcTimerBar.hidden = true
  setPadsEnabled(false)
  setHubLabel('Nghe<small>nốt ẩn</small>')
  setStatus('Nghe kỹ nốt ẩn…')

  await wait(400)
  if (token !== playToken) return
  hub.classList.add('playing')
  playNote(lcSecret)
  pulseHub()

  // Đồng hồ chỉ bắt đầu chạy SAU khi nốt ẩn phát xong, nếu không thì 3 giây
  // quảng cáo sẽ bị ngốn gần hết bởi chính thời gian phát nốt.
  await wait(NOTE_HOLD_SEC * 1000 + 150)
  if (token !== playToken) return

  hub.classList.remove('playing')
  setHubLabel('?')
  phase = 'lc-input'
  setPadsEnabled(true)
  setStatus('Bấm đúng phím ngay!', 'turn')
  startLcTimer(seconds)
}

function handleLastChancePad(noteId) {
  stopLcTimer()
  phase = 'idle'
  setPadsEnabled(false)
  playNote(noteId)
  litPad(noteId)
  if (noteId === lcSecret) onLcWin()
  else onLcLose('Sai rồi')
}

function handleLcTimeout() {
  if (phase !== 'lc-input') return
  phase = 'idle'
  setPadsEnabled(false)
  onLcLose('Hết giờ')
}

function onLcWin() {
  lcPending += 1
  playHeartGain()
  vibrate([25, 60, 25])
  setHubLabel('')
  setStatus(`Chuẩn! Đúng là nốt ${noteLabel(lcSecret)}`, 'good')

  const isTop = lcLevel >= LC_TOTAL_LEVELS - 1
  if (isTop) {
    // Kịch trần rồi thì không hỏi nữa, tự dừng.
    setTimeout(() => finishLastChance(), 1100)
    return
  }

  setTimeout(() => {
    phase = 'lc-choice'
    lcChoice.hidden = false
    lcStake.textContent = `${lcPending} tim`
    lcNextBtn.textContent = `Đi tiếp · vòng ${lcLevel + 2}`
    setStatus('Dừng lại hay liều thêm?', 'turn')
    startHeartbeatLoop()
  }, 1000)
}

function onLcLose(reason) {
  stopHeartbeatLoop()
  lcPending = 0
  lcChoice.hidden = true
  playFatalBreak()
  vibrate([150])
  setHubLabel('')
  setStatus(`${reason} — đó là nốt ${noteLabel(lcSecret)}`, 'bad')
  revealCorrectPad(lcSecret)
  turntable.classList.add('shake')
  setTimeout(() => turntable.classList.remove('shake'), 450)

  // Phát lại nốt đúng để người chơi so — biến cú thua thành bài học.
  setTimeout(() => playNote(lcSecret), 520)

  setTimeout(() => {
    setLastChanceUI(false)
    endGame()
  }, 2000)
}

function finishLastChance() {
  stopHeartbeatLoop()
  const won = lcPending
  lcPending = 0
  setLastChanceUI(false)
  gainHeart(won)
  phase = 'idle'
  setStatus(won === 1 ? 'Được cứu — chơi tiếp!' : `Được cứu với ${won} tim — chơi tiếp!`, 'good')
  setTimeout(() => {
    playerIndex = 0
    renderProgressDots()
    playSequence()
  }, 1300)
}

function goToNextLcLevel() {
  if (phase !== 'lc-choice') return
  stopHeartbeatLoop()
  lcLevel += 1
  lcChoice.hidden = true
  runLastChanceLevel()
}

// ==========================================================================
// KẾT THÚC VÁN
// ==========================================================================
function endGame() {
  playToken += 1
  phase = 'idle'
  setPadsEnabled(false)
  stopHeartbeatLoop()
  hub.classList.remove('playing')
  streak = 0
  updateGlow()

  const previousBest = getBest(mode)
  const isNewBest = longest > previousBest
  if (isNewBest) saveBest(mode, longest)

  setTimeout(() => {
    overScore.textContent = String(longest)
    overBest.textContent = String(Math.max(previousBest, longest))
    newBestTag.hidden = !isNewBest
    overEmoji.textContent = longest >= 10 ? '🏆' : longest >= 6 ? '🎧' : '🎸'
    overSub.textContent =
      longest === 0
        ? 'Chưa lặp được nốt nào — thử lại nhé!'
        : `Bạn lặp lại đúng chuỗi ${longest} nốt`
    // Gợi ý thẳng tên chế độ còn lại: nhiều người chơi hết một lượt rồi mới
    // biết là có tới hai chế độ.
    backMenuBtn.textContent = `Thử chế độ ${modeName(otherMode(mode))}`
    refreshBestLabels()
    showScreen('over')

    if (isNewBest) {
      playRecordFanfare()
      burstConfetti()
      vibrate([40, 60, 40, 60, 90])
    }
  }, 900)
}

/** Thoát khỏi ván đang chơi, dọn sạch mọi thứ đang chạy. */
function abortGame() {
  playToken += 1
  phase = 'idle'
  stopHeartbeatLoop()
  stopLcTimer()
  setLastChanceUI(false)
  setWarmupUI(false)
  setPadsEnabled(false)
  hub.classList.remove('playing')
  setHubLabel('')
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
  unlockAudio()

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
    runWarmup()
  } catch {
    startBtn.textContent = 'Không phát được âm thanh'
    startBtn.disabled = false
  }
})

/** Cập nhật con số, phần tô của thanh trượt và biểu tượng loa theo mức hiện tại. */
function renderVolumeUI() {
  const percent = Math.round(masterVolume * 100)
  volumeSlider.value = String(percent)
  volumeSlider.style.setProperty('--fill', `${percent}%`)
  volumeVal.textContent = `${percent}%`

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
  if (phase === 'playing' || phase === 'input' || phase === 'lc-listen' || phase === 'lc-input') return
  if (masterVolume > 0 && decodedSamples.size > 0) playNote('do')
})

modeSeeBtn.addEventListener('click', () => setMode('see'))
modeHearBtn.addEventListener('click', () => setMode('hear'))

pads.forEach((pad) => {
  pad.addEventListener('click', () => handlePadPress(pad.dataset.note))
})

playNowBtn.addEventListener('click', beginPlaying)
skipWarmupBtn.addEventListener('click', beginPlaying)

// Cả hai nút chỉ có nghĩa khi đang đứng ở ngã ba. Không chặn theo phase thì
// một cú bấm lọt vào lúc đang xử lý thua sẽ "cứu" người chơi với 0 tim và cho
// chơi tiếp, dù ván đáng lẽ đã kết thúc.
lcStopBtn.addEventListener('click', () => {
  if (phase !== 'lc-choice') return
  finishLastChance()
})
lcNextBtn.addEventListener('click', goToNextLcLevel)

lcStartBtn.addEventListener('click', () => {
  if (phase !== 'lc-intro') return
  lcStartBtn.hidden = true
  runLastChanceLevel()
})

// Hai lối thoát ngay trong lúc chơi, thay cho việc phải chơi cho tới chết.
backModesBtn.addEventListener('click', () => {
  abortGame()
  refreshBestLabels()
  showScreen('start')
})

restartBtn.addEventListener('click', () => {
  abortGame()
  beginPlaying()
})

// Chơi lại thì vào thẳng, không bắt nghe làm quen lần nữa.
againBtn.addEventListener('click', beginPlaying)

// Bấm nút này là đổi luôn sang chế độ còn lại rồi quay về màn chọn, để người
// chơi thấy tận mắt là có hai chế độ và mình đang ở chế độ nào.
backMenuBtn.addEventListener('click', () => {
  abortGame()
  setMode(otherMode(mode))
  refreshBestLabels()
  showScreen('start')
})

// Phím 1-7 cho người chơi trên máy tính.
document.addEventListener('keydown', (event) => {
  if (phase !== 'input' && phase !== 'lc-input') return
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
resetHearts(START_HEARTS)
updateGlow()
bootstrapAudio()
