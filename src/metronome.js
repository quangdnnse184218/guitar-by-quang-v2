/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — METRONOME ENGINE (metronome.js)
 * ==============================================================================
 * High-precision Web Audio API Lookahead Scheduler.
 * Guarantees zero-drift timing across background tabs and devices.
 */

import { initNavbarShrink, initMobileMenu } from './common.js'
import { initThemeToggle } from './theme-toggle.js'

initNavbarShrink()
initMobileMenu()
initThemeToggle()

// ==========================================================================
// CONSTANTS & TEMPO MARKINGS
// ==========================================================================
const BPM_MIN = 40
const BPM_MAX = 208
const BPM_DEFAULT = 100
const SCHEDULE_INTERVAL_MS = 25
const LOOKAHEAD_SEC = 0.1
const CLICK_DURATION_SEC = 0.04
const CLICK_FREQ_BEAT = 1000
const CLICK_FREQ_ACCENT = 1450
const TAP_MAX_HISTORY = 6
const TAP_RESET_MS = 2500

const TEMPO_MARKINGS = [
  { min: 40, max: 59, label: 'Largo (Rất chậm, trang nghiêm)' },
  { min: 60, max: 65, label: 'Larghetto (Chậm vừa)' },
  { min: 66, max: 75, label: 'Adagio (Chậm rãi, êm đềm)' },
  { min: 76, max: 107, label: 'Andante (Thong thả, tự nhiên)' },
  { min: 108, max: 119, label: 'Moderato (Vừa phải)' },
  { min: 120, max: 139, label: 'Allegro (Nhanh, vui tươi)' },
  { min: 140, max: 167, label: 'Vivace (Rất nhanh, sôi nổi)' },
  { min: 168, max: 208, label: 'Presto (Cực nhanh, dồn dập)' }
]

// ==========================================================================
// STATE
// ==========================================================================
let bpm = BPM_DEFAULT
let isPlaying = false
let audioCtx = null
let nextNoteTime = 0
let scheduleTimerID = null
let currentBeat = 0
let beatsPerBar = 4
let timeSignature = '4/4'
let tapTimes = []
let lastTapTime = 0

// ==========================================================================
// DOM ELEMENTS
// ==========================================================================
const bpmDisplay = document.getElementById('bpm-display')
const bpmSlider = document.getElementById('bpm-slider')
const bpmMinus = document.getElementById('bpm-minus')
const bpmPlus = document.getElementById('bpm-plus')
const playBtn = document.getElementById('play-btn')
const playIcon = document.getElementById('play-icon')
const pauseIcon = document.getElementById('pause-icon')
const playLabel = document.getElementById('play-label')
const tapBtn = document.getElementById('tap-btn')
const beatFlash = document.getElementById('beat-flash')
const beatDots = document.getElementById('beat-dots')
const timeSignatureSelect = document.getElementById('time-signature-select')
const tempoMarkingLabel = document.getElementById('tempo-marking-label')
const webAudioUnsupported = document.getElementById('web-audio-unsupported')

// ==========================================================================
// AUDIO ENGINE: Web Audio API Lookahead
// ==========================================================================

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function scheduleClick(time, isAccent) {
  if (!audioCtx) return

  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.connect(gain)
  gain.connect(audioCtx.destination)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(isAccent ? CLICK_FREQ_ACCENT : CLICK_FREQ_BEAT, time)

  gain.gain.setValueAtTime(0, time)
  gain.gain.linearRampToValueAtTime(isAccent ? 0.95 : 0.65, time + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.001, time + CLICK_DURATION_SEC)

  osc.start(time)
  osc.stop(time + CLICK_DURATION_SEC + 0.005)
}

function secondsPerBeat() {
  return 60.0 / bpm
}

function triggerVisualBeat(beatIndex, isAccent) {
  requestAnimationFrame(() => {
    if (beatFlash) {
      beatFlash.className = `metro-pulse w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner cursor-default ${
        isAccent ? 'metro-flash-accent' : 'metro-flash-active'
      }`
      setTimeout(() => {
        if (beatFlash) {
          beatFlash.className = 'metro-pulse w-14 h-14 rounded-2xl bg-black/10 dark:bg-white/10 border border-glass-border flex items-center justify-center shadow-inner cursor-default'
        }
      }, 100)
    }

    if (beatDots) {
      const dots = beatDots.querySelectorAll('.metro-dot')
      dots.forEach((dot, idx) => {
        if (idx === beatIndex) {
          dot.className = `metro-dot w-2.5 h-2.5 rounded-full transition-all duration-75 ${
            isAccent ? 'bg-amber-400 shadow-md shadow-amber-400/50 scale-125' : 'metro-dot-active'
          }`
        } else {
          dot.className = 'metro-dot w-2 h-2 rounded-full bg-black/20 dark:bg-white/20 transition-all duration-75'
        }
      })
    }
  })
}

function scheduleNote() {
  const ctx = getAudioContext()
  if (!ctx) return

  while (nextNoteTime < ctx.currentTime + LOOKAHEAD_SEC) {
    const isAccent = (currentBeat === 0)
    scheduleClick(nextNoteTime, isAccent)
    
    // Schedule visual sync precisely
    const timeDiffMs = Math.max(0, (nextNoteTime - ctx.currentTime) * 1000)
    const scheduledBeat = currentBeat
    setTimeout(() => {
      if (isPlaying) {
        triggerVisualBeat(scheduledBeat, scheduledBeat === 0)
      }
    }, timeDiffMs)

    nextNoteTime += secondsPerBeat()
    currentBeat = (currentBeat + 1) % beatsPerBar
  }
}

function schedulerLoop() {
  scheduleNote()
  scheduleTimerID = setTimeout(schedulerLoop, SCHEDULE_INTERVAL_MS)
}

// ==========================================================================
// METRONOME CONTROLS
// ==========================================================================

export function startMetronome() {
  const ctx = getAudioContext()
  if (!ctx) {
    if (webAudioUnsupported) webAudioUnsupported.classList.remove('hidden')
    return
  }

  isPlaying = true
  currentBeat = 0
  nextNoteTime = ctx.currentTime + 0.05

  schedulerLoop()
  updatePlayButtonUI(true)
}

export function stopMetronome() {
  isPlaying = false
  if (scheduleTimerID) {
    clearTimeout(scheduleTimerID)
    scheduleTimerID = null
  }
  updatePlayButtonUI(false)
  resetBeatVisuals()
}

export function toggleMetronome() {
  if (isPlaying) {
    stopMetronome()
  } else {
    startMetronome()
  }
}

function updatePlayButtonUI(active) {
  if (!playBtn) return
  if (active) {
    playBtn.className = 'flex-1 py-3.5 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2'
    if (playIcon) playIcon.classList.add('hidden')
    if (pauseIcon) pauseIcon.classList.remove('hidden')
    if (playLabel) playLabel.textContent = 'Dừng Lại'
  } else {
    playBtn.className = 'flex-1 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2'
    if (playIcon) playIcon.classList.remove('hidden')
    if (pauseIcon) pauseIcon.classList.add('hidden')
    if (playLabel) playLabel.textContent = 'Bắt Đầu Gõ'
  }
}

function resetBeatVisuals() {
  if (beatFlash) {
    beatFlash.className = 'metro-pulse w-14 h-14 rounded-2xl bg-black/10 dark:bg-white/10 border border-glass-border flex items-center justify-center shadow-inner cursor-default'
  }
  if (beatDots) {
    const dots = beatDots.querySelectorAll('.metro-dot')
    dots.forEach(dot => {
      dot.className = 'metro-dot w-2 h-2 rounded-full bg-black/20 dark:bg-white/20 transition-all duration-75'
    })
  }
}

export function setBpm(newBpm) {
  const clamped = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(newBpm)))
  bpm = clamped

  if (bpmDisplay) bpmDisplay.textContent = bpm
  if (bpmSlider) bpmSlider.value = bpm

  // Update tempo label
  const marking = TEMPO_MARKINGS.find(m => bpm >= m.min && bpm <= m.max)
  if (tempoMarkingLabel && marking) {
    tempoMarkingLabel.textContent = marking.label
  }
}

function handleTapTempo() {
  const now = performance.now()
  if (lastTapTime && (now - lastTapTime > TAP_RESET_MS)) {
    tapTimes = []
  }

  tapTimes.push(now)
  lastTapTime = now

  if (tapTimes.length > TAP_MAX_HISTORY) {
    tapTimes.shift()
  }

  if (tapTimes.length >= 2) {
    const intervals = []
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1])
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const calculatedBpm = Math.round(60000 / avgInterval)
    setBpm(calculatedBpm)
  }

  if (tapBtn) {
    tapBtn.classList.add('scale-95', 'bg-accent-primary/20')
    setTimeout(() => {
      tapBtn.classList.remove('scale-95', 'bg-accent-primary/20')
    }, 120)
  }
}

function renderBeatDots() {
  if (!beatDots) return
  beatDots.innerHTML = Array.from({ length: beatsPerBar })
    .map(() => '<span class="metro-dot w-2 h-2 rounded-full bg-black/20 dark:bg-white/20 transition-all duration-75"></span>')
    .join('')
}

function handleTimeSignatureChange(value) {
  timeSignature = value
  switch (value) {
    case '2/4':
      beatsPerBar = 2
      break
    case '3/4':
      beatsPerBar = 3
      break
    case '6/8':
      beatsPerBar = 6
      break
    case '4/4':
    default:
      beatsPerBar = 4
      break
  }
  currentBeat = 0
  renderBeatDots()
}

// ==========================================================================
// EVENT LISTENERS & INITIALIZATION
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  renderBeatDots()
  setBpm(BPM_DEFAULT)

  if (playBtn) playBtn.addEventListener('click', toggleMetronome)
  if (tapBtn) tapBtn.addEventListener('click', handleTapTempo)

  if (bpmMinus) {
    bpmMinus.addEventListener('click', () => setBpm(bpm - 1))
  }
  if (bpmPlus) {
    bpmPlus.addEventListener('click', () => setBpm(bpm + 1))
  }

  if (bpmSlider) {
    bpmSlider.addEventListener('input', (e) => setBpm(Number(e.target.value)))
  }

  if (timeSignatureSelect) {
    timeSignatureSelect.addEventListener('change', (e) => handleTimeSignatureChange(e.target.value))
  }

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore when user typing in input fields
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return

    if (e.code === 'Space') {
      e.preventDefault()
      toggleMetronome()
    } else if (e.code === 'KeyT') {
      e.preventDefault()
      handleTapTempo()
    } else if (e.code === 'ArrowUp') {
      e.preventDefault()
      setBpm(bpm + 1)
    } else if (e.code === 'ArrowDown') {
      e.preventDefault()
      setBpm(bpm - 1)
    }
  })
})
