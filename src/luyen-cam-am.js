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
/** Trần tim cộng từ mốc chuỗi. Chỉ Cơ Hội Cuối mới đẩy được lên HEART_CAP. */
const MILESTONE_HEART_CAP = 3
const HEART_CAP = 5
/** Cứ qua mốc chuỗi bội số của số này thì được thêm một tim. */
const MILESTONE_EVERY = 5

/**
 * Thang leo của Cơ Hội Cuối. Thời gian lo phần kịch tính, còn số lượt bấm thử
 * mới là thứ quyết định độ khó: bỏ giới hạn lượt thì người chơi quét sạch cả
 * bảy phím là thắng chắc, thang leo mất hết ý nghĩa.
 */
const LC_LEVELS = [
  { seconds: 12, probes: 4 },
  { seconds: 10, probes: 4 },
  { seconds: 8, probes: 3 },
  { seconds: 7, probes: 3 },
  { seconds: 6, probes: 2 },
]
/** Chu vi vòng đồng hồ bán kính 25 trong viewBox 100 = 2·π·25 */
const RING_CIRCUMFERENCE = 157.08

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

/**
 * Thang ngũ cung từ C6 trở lên. Mỗi vòng qua được thì tiếng thưởng leo lên một
 * bậc — tai muốn nghe nốt tiếp theo, mà muốn nghe thì phải qua thêm một vòng
 * nữa. Ngũ cung nên leo bao nhiêu bậc cũng không bao giờ nghịch tai.
 */
const STREAK_SCALE = [
  1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02, 3135.96, 3520, 4186.01, 4698.64,
]

function playStreakNote(step) {
  const index = Math.min(Math.max(step, 0), STREAK_SCALE.length - 1)
  const freq = STREAK_SCALE[index]
  playBlip(freq, 0, 0.22, 'triangle', 0.17)
  playBlip(freq * 2, 0.014, 0.13, 'sine', 0.05)
}

/** Chuỗi âm leo mãi cuối cùng được giải quyết: rải hợp âm kết về quãng tám. */
function playMilestoneChord() {
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

// Tiếng ù nền của Cơ Hội Cuối, dâng cao dần theo bậc leo.
let droneNodes = null

function startDrone(level = 0) {
  const ctx = getAudioContext()
  if (!ctx) return
  stopDrone()
  const t = ctx.currentTime
  const freq = 55 * Math.pow(2, (level * 2) / 12)
  const osc = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.value = freq
  osc2.type = 'sine'
  osc2.frequency.value = freq * 2
  filter.type = 'lowpass'
  filter.frequency.value = 340
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(0.1, t + 0.55)
  osc.connect(filter)
  osc2.connect(filter)
  filter.connect(gain)
  gain.connect(getMasterBus(ctx))
  osc.start(t)
  osc2.start(t)
  droneNodes = { osc, osc2, gain }
}

function setDroneVolume(volume) {
  if (!droneNodes || !audioCtx) return
  droneNodes.gain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.12)
}

function stopDrone() {
  if (!droneNodes) return
  const { osc, osc2, gain } = droneNodes
  droneNodes = null
  if (!audioCtx) return
  const t = audioCtx.currentTime
  try {
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    osc.stop(t + 0.3)
    osc2.stop(t + 0.3)
  } catch {
    // Nguồn đã dừng từ trước — không sao.
  }
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
const volumeValTop = document.getElementById('volume-val-top')
const volumeIcon = document.getElementById('volume-icon')

const warmupBar = document.getElementById('warmup-bar')
const warmupCount = document.getElementById('warmup-count')
const warmupActions = document.getElementById('warmup-actions')
const playNowBtn = document.getElementById('play-now-btn')
const skipWarmupBtn = document.getElementById('skip-warmup-btn')

const lcBar = document.getElementById('lc-bar')
const lcLevelEl = document.getElementById('lc-level')
const lcNote = document.getElementById('lc-note')
const lcRing = document.getElementById('lc-ring')
const lcRingFill = document.getElementById('lc-ring-fill')
const lcProbe = document.getElementById('lc-probe')
const lcProbeDots = document.getElementById('lc-probe-dots')
const lcActions = document.getElementById('lc-actions')
const lcCommitBtn = document.getElementById('lc-commit-btn')
const lcChoice = document.getElementById('lc-choice')
const lcStake = document.getElementById('lc-stake')
const lcStopBtn = document.getElementById('lc-stop-btn')
const lcNextBtn = document.getElementById('lc-next-btn')
const lcVignette = document.getElementById('lc-vignette')

const flashEl = document.getElementById('flash')
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
let lcPicked = null
let lcProbesLeft = 0
let lcTimeoutId = null
let lcTickId = null
let lcDeadline = 0

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const noteLabel = (id) => (NOTES.find((n) => n.id === id) || {}).label || ''

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

function randomNoteId(exclude) {
  let candidates = NOTES.map((n) => n.id)
  // Tránh lặp lại ngay nốt vừa phát: hai nốt giống hệt liền nhau rất khó đếm bằng tai.
  if (exclude) candidates = candidates.filter((id) => id !== exclude)
  return candidates[Math.floor(Math.random() * candidates.length)]
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
  // Nếu dùng thẳng Math.min(cap, ...) thì ai ăn đủ 5 tim ở Cơ Hội Cuối rồi chạm
  // mốc chuỗi (trần 3) sẽ bị tụt từ 5 xuống 3, mà số tim vẽ trên màn hình vẫn
  // là 5 — trạng thái và giao diện lệch nhau.
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
// HIỆU ỨNG HÌNH
// ==========================================================================
/** Chuỗi càng dài, vòng phím càng "nóng" lên. */
function updateGlow() {
  ttGlow.style.opacity = String(Math.min(1, streak / 8) * 0.85)
}

function flashScreen() {
  flashEl.classList.remove('go')
  void flashEl.offsetWidth
  flashEl.classList.add('go')
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

function burstConfetti() {
  const colors = ['#f5c044', '#f49a45', '#ee7b6e', '#d97bae', '#9c8be8', '#4fc2ac', '#a8c554']
  for (let i = 0; i < 46; i++) {
    const bit = document.createElement('i')
    bit.style.left = `${Math.random() * 100}%`
    bit.style.background = colors[i % colors.length]
    bit.style.animationDuration = `${1.9 + Math.random() * 1.4}s`
    bit.style.animationDelay = `${Math.random() * 0.5}s`
    confettiEl.appendChild(bit)
    setTimeout(() => bit.remove(), 4400)
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
  sequence.push(randomNoteId(sequence[sequence.length - 1]))
  playerIndex = 0
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
  hudBest.textContent = String(getBest(mode))
  hudMode.textContent = modeName(mode)
  showScreen('game')

  for (let i = 0; i < START_LENGTH - 1; i++) {
    sequence.push(randomNoteId(sequence[sequence.length - 1]))
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
  playStreakNote(streak - 1)

  const reachedMilestone = sequence.length % MILESTONE_EVERY === 0
  if (reachedMilestone) {
    celebrateMilestone()
    setTimeout(startRound, 1500)
  } else {
    setStatus('Chuẩn luôn!', 'good')
    setTimeout(startRound, 900)
  }
}

function celebrateMilestone() {
  flashScreen()
  ripplePads()
  playMilestoneChord()
  vibrate([30, 50, 30])

  const gained = gainHeart(1, MILESTONE_HEART_CAP)
  if (gained > 0) {
    playHeartThump(0.55, 0.24)
    playHeartThump(0.74, 0.16)
    setStatus(`Mốc ${sequence.length} nốt — thêm một tim!`, 'good')
  } else {
    setStatus(`Mốc ${sequence.length} nốt — tim đã đầy!`, 'good')
  }
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
  lcRing.hidden = !active
  lcProbe.hidden = !active
  lcActions.hidden = !active
  lcChoice.hidden = true
  hud.hidden = active
  gameNav.hidden = active
  if (keyHint) keyHint.hidden = active
  progressDots.hidden = active

  // Tai nghe ở giữa thành nút bấm để nghe lại nốt ẩn.
  if (active) {
    hub.setAttribute('role', 'button')
    hub.setAttribute('tabindex', '0')
    hub.setAttribute('title', 'Nghe lại nốt ẩn')
  } else {
    hub.removeAttribute('role')
    hub.removeAttribute('tabindex')
    hub.removeAttribute('title')
    setHubLabel('')
    clearPicked()
    stopLcTimer()
  }
}

function clearPicked() {
  pads.forEach((pad) => pad.classList.remove('picked'))
}

function renderProbeDots() {
  const total = LC_LEVELS[lcLevel].probes
  let html = ''
  for (let i = 0; i < total; i++) {
    html += `<span class="probe-dot${i >= lcProbesLeft ? ' used' : ''}"></span>`
  }
  lcProbeDots.innerHTML = html
}

function resetRing() {
  lcRingFill.classList.remove('danger')
  lcRingFill.style.transition = 'none'
  lcRingFill.style.strokeDashoffset = '0'
}

function startLcTimer(seconds) {
  stopLcTimer()
  lcDeadline = performance.now() + seconds * 1000

  // Vòng sáng chạy quanh tai nghe: nhìn vòng teo dần căng hơn đọc số đếm lùi,
  // mà mắt không phải rời khỏi chỗ cần bấm.
  lcRingFill.style.transition = 'none'
  lcRingFill.style.strokeDashoffset = '0'
  void lcRingFill.getBoundingClientRect()
  lcRingFill.style.transition = `stroke-dashoffset ${seconds}s linear`
  lcRingFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE)

  scheduleClockTick()
  lcTimeoutId = setTimeout(handleLcTimeout, seconds * 1000)
}

function scheduleClockTick() {
  const remain = lcDeadline - performance.now()
  if (remain <= 80) return
  // Ba giây cuối: nhanh gấp đôi, cao hơn, to hơn, kèm màn rung nhẹ.
  const urgent = remain <= 3000
  playClockTick(urgent)
  if (urgent) {
    lcRingFill.classList.add('danger')
    shakeTick()
    vibrate([15])
  }
  lcTickId = setTimeout(scheduleClockTick, urgent ? 470 : 1000)
}

function stopLcTimer() {
  clearTimeout(lcTimeoutId)
  clearTimeout(lcTickId)
  lcTimeoutId = null
  lcTickId = null
  // Đóng băng vòng sáng đúng chỗ nó đang chạy tới.
  const current = getComputedStyle(lcRingFill).strokeDashoffset
  lcRingFill.style.transition = 'none'
  lcRingFill.style.strokeDashoffset = current
}

async function startLastChance() {
  lastChanceUsed = true
  lcLevel = 0
  lcPending = 0
  const token = ++playToken

  setLastChanceUI(true)
  startDrone(0)
  await wait(350)
  if (token !== playToken) return
  runLastChanceLevel()
}

async function runLastChanceLevel() {
  const token = ++playToken
  const config = LC_LEVELS[lcLevel]

  phase = 'lc-listen'
  lcSecret = NOTES[Math.floor(Math.random() * NOTES.length)].id
  lcPicked = null
  lcProbesLeft = config.probes

  lcLevelEl.textContent = `Bậc ${lcLevel + 1} / ${LC_LEVELS.length}`
  lcNote.innerHTML =
    lcLevel === 0
      ? 'Nghe nốt ẩn rồi bấm thử các phím để so bằng tai — <strong>không có gợi ý cao thấp</strong>.'
      : `Đang giữ <strong>${lcPending} tim</strong> — sai là mất sạch.`
  lcChoice.hidden = true
  lcActions.hidden = false
  lcProbe.hidden = false
  lcCommitBtn.disabled = true
  lcCommitBtn.textContent = 'Chọn một phím rồi chốt'
  clearPicked()
  renderProbeDots()
  resetRing()
  setPadsEnabled(false)
  setHubLabel('Nghe<small>nốt ẩn</small>')
  setStatus('Nghe kỹ nốt ẩn…')

  await wait(400)
  if (token !== playToken) return
  hub.classList.add('playing')
  playNote(lcSecret)
  pulseHub()

  // Đồng hồ chỉ bắt đầu chạy SAU khi nốt ẩn phát xong, nếu không thì mọi con
  // số thời gian trong LC_LEVELS đều lệch mất gần hai giây.
  await wait(NOTE_HOLD_SEC * 1000 + 150)
  if (token !== playToken) return

  hub.classList.remove('playing')
  setHubLabel('Nghe lại')
  phase = 'lc-input'
  setPadsEnabled(true)
  setStatus('Bấm thử để so, rồi CHỐT!', 'turn')
  startLcTimer(config.seconds)
}

function replaySecret() {
  if (phase !== 'lc-input' || !lcSecret) return
  playNote(lcSecret)
  pulseHub()
}

function handleLastChancePad(noteId) {
  lcPicked = noteId
  pads.forEach((pad) => pad.classList.toggle('picked', pad.dataset.note === noteId))
  lcCommitBtn.disabled = false
  lcCommitBtn.textContent = `CHỐT: ${noteLabel(noteId)}`

  if (lcProbesLeft > 0) {
    lcProbesLeft -= 1
    renderProbeDots()
    playNote(noteId)
    litPad(noteId)
  } else {
    // Hết lượt nghe thử: phím im tiếng nhưng vẫn chọn được, để người chơi luôn
    // chốt được đáp án mình muốn.
    playPadTick()
    litPad(noteId)
  }
}

function handleLcCommit() {
  if (phase !== 'lc-input' || !lcPicked) return
  stopLcTimer()
  phase = 'idle'
  setPadsEnabled(false)
  lcCommitBtn.disabled = true
  if (lcPicked === lcSecret) onLcWin()
  else onLcLose('Sai rồi')
}

function handleLcTimeout() {
  if (phase !== 'lc-input') return
  stopLcTimer()
  phase = 'idle'
  setPadsEnabled(false)
  lcCommitBtn.disabled = true
  onLcLose('Hết giờ')
}

function onLcWin() {
  lcPending += 1
  playHeartGain()
  vibrate([25, 60, 25])
  litPad(lcSecret)
  clearPicked()
  setStatus(`Chuẩn! Đúng là nốt ${noteLabel(lcSecret)}`, 'good')

  const isTop = lcLevel >= LC_LEVELS.length - 1
  if (isTop) {
    // Kịch trần rồi thì không hỏi nữa, tự dừng.
    setTimeout(() => finishLastChance(), 1100)
    return
  }

  setTimeout(() => {
    phase = 'lc-choice'
    lcActions.hidden = true
    lcProbe.hidden = true
    lcChoice.hidden = false
    lcStake.textContent = `${lcPending} tim`
    const next = LC_LEVELS[lcLevel + 1]
    lcNextBtn.textContent = `Đi tiếp · ${next.seconds}s · ${next.probes} lượt`
    setStatus('Ăn non hay liều thêm?', 'turn')
    // Tiếng ù hạ xuống, chỉ còn nhịp tim chậm: im ắng, căng, không hối thúc.
    setDroneVolume(0.035)
    startHeartbeatLoop()
  }, 1000)
}

function onLcLose(reason) {
  stopHeartbeatLoop()
  lcPending = 0
  // Dọn luôn hàng chấm lượt dò và nút chốt: lượt này đã xong, để lại chỉ gây rối.
  lcProbe.hidden = true
  lcActions.hidden = true
  lcChoice.hidden = true
  playFatalBreak()
  vibrate([150])
  clearPicked()
  setStatus(`${reason} — đó là nốt ${noteLabel(lcSecret)}`, 'bad')
  revealCorrectPad(lcSecret)
  turntable.classList.add('shake')
  setTimeout(() => turntable.classList.remove('shake'), 450)

  // Phát lại nốt đúng để người chơi so — biến cú thua thành bài học.
  setTimeout(() => playNote(lcSecret), 520)

  setTimeout(() => {
    stopDrone()
    setLastChanceUI(false)
    endGame()
  }, 2000)
}

function finishLastChance() {
  stopHeartbeatLoop()
  stopDrone()
  const won = lcPending
  lcPending = 0
  setLastChanceUI(false)
  gainHeart(won, HEART_CAP)
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
  // Tiếng ù dâng cao lên theo bậc: tai tự biết mình đang liều tới đâu.
  startDrone(lcLevel)
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
  stopDrone()
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
  stopDrone()
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

lcCommitBtn.addEventListener('click', handleLcCommit)
// Cả hai nút chỉ có nghĩa khi đang đứng ở ngã ba. Không chặn theo phase thì
// một cú bấm lọt vào lúc đang xử lý thua sẽ "cứu" người chơi với 0 tim và cho
// chơi tiếp, dù ván đáng lẽ đã kết thúc.
lcStopBtn.addEventListener('click', () => {
  if (phase !== 'lc-choice') return
  finishLastChance()
})
lcNextBtn.addEventListener('click', goToNextLcLevel)

hub.addEventListener('click', replaySecret)
hub.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    replaySecret()
  }
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
