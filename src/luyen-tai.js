/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — LUYỆN TAI: ĐOÁN NỐT & HỢP ÂM (luyen-tai.js)
 * ==============================================================================
 * Game luyện tai 4 cấp độ (2 cấp nốt nhạc + 2 cấp hợp âm), tổng hợp âm thanh
 * bằng Web Audio API (không cần file audio mẫu), có giới hạn số lần nghe và
 * thời gian trả lời cho mỗi câu.
 */

import { initNavbarShrink, initMobileMenu, initHeaderOverlapFix } from './common.js'
import { initThemeToggle } from './theme-toggle.js'

initNavbarShrink()
initMobileMenu()
initThemeToggle()
initHeaderOverlapFix()

// ==========================================================================
// AUDIO ENGINE
// ==========================================================================
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

let audioCtx = null
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) audioCtx = new AudioContextClass()
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function noteFrequency(noteName, octave) {
  const semitoneFromA4 = NOTE_NAMES.indexOf(noteName) - NOTE_NAMES.indexOf('A') + (octave - 4) * 12
  return 440 * Math.pow(2, semitoneFromA4 / 12)
}

function playTone(frequency, ctx, startTime, duration = 1.1) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(frequency, startTime)

  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.28, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

function playFrequencies(frequencies) {
  const ctx = getAudioContext()
  if (!ctx) {
    document.getElementById('web-audio-unsupported')?.classList.remove('hidden')
    return
  }
  const now = ctx.currentTime + 0.02
  frequencies.forEach((freq) => playTone(freq, ctx, now))
}

// ==========================================================================
// LEVEL DEFINITIONS
// ==========================================================================
const CHORD_SHAPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
}

function chordFrequencies(rootName, shape, octave = 3) {
  return CHORD_SHAPES[shape].map((semi) => {
    const totalSemitone = NOTE_NAMES.indexOf(rootName) - NOTE_NAMES.indexOf('A') + semi + (octave - 4) * 12
    return 440 * Math.pow(2, totalSemitone / 12)
  })
}

// Cấp 1 — 6 dây buông (open strings), tên nốt kèm số dây cho rõ ràng.
const OPEN_STRINGS = [
  { label: 'Dây 6 (E)', freq: noteFrequency('E', 2) },
  { label: 'Dây 5 (A)', freq: noteFrequency('A', 2) },
  { label: 'Dây 4 (D)', freq: noteFrequency('D', 3) },
  { label: 'Dây 3 (G)', freq: noteFrequency('G', 3) },
  { label: 'Dây 2 (B)', freq: noteFrequency('B', 3) },
  { label: 'Dây 1 (E)', freq: noteFrequency('E', 4) },
]

// Cấp 3 — hợp âm cơ bản hay dùng trên guitar.
const BASIC_CHORDS = [
  { label: 'C', root: 'C', shape: 'major' },
  { label: 'D', root: 'D', shape: 'major' },
  { label: 'E', root: 'E', shape: 'major' },
  { label: 'F', root: 'F', shape: 'major' },
  { label: 'G', root: 'G', shape: 'major' },
  { label: 'A', root: 'A', shape: 'major' },
  { label: 'Am', root: 'A', shape: 'minor' },
  { label: 'Dm', root: 'D', shape: 'minor' },
  { label: 'Em', root: 'E', shape: 'minor' },
  { label: 'Bm', root: 'B', shape: 'minor' },
]

// Cấp 4 — hợp âm mở rộng/nâng cao.
const ADVANCED_CHORDS = [
  { label: 'Cmaj7', root: 'C', shape: 'maj7' },
  { label: 'Fmaj7', root: 'F', shape: 'maj7' },
  { label: 'Dm7', root: 'D', shape: 'min7' },
  { label: 'Am7', root: 'A', shape: 'min7' },
  { label: 'Em7', root: 'E', shape: 'min7' },
  { label: 'G7', root: 'G', shape: 'dom7' },
  { label: 'A7', root: 'A', shape: 'dom7' },
  { label: 'D7', root: 'D', shape: 'dom7' },
  { label: 'E7', root: 'E', shape: 'dom7' },
]

const LEVELS = [
  {
    id: 'notes-basic',
    order: 1,
    name: 'Cấp 1 — Nốt Cơ Bản',
    desc: 'Đoán tên 6 dây buông (E-A-D-G-B-E)',
    icon: '🎸',
    colorClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    maxReplays: 3,
    timeLimitSec: 12,
    questionCount: 10,
    buildOptions: () => OPEN_STRINGS.map((s) => s.label),
    pickQuestion: () => {
      const item = OPEN_STRINGS[Math.floor(Math.random() * OPEN_STRINGS.length)]
      return { answer: item.label, frequencies: [item.freq] }
    },
  },
  {
    id: 'notes-advanced',
    order: 2,
    name: 'Cấp 2 — Nốt Nâng Cao',
    desc: 'Đoán tên nốt bất kỳ trên cần đàn (12 nốt)',
    icon: '🎵',
    colorClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    maxReplays: 3,
    timeLimitSec: 15,
    questionCount: 10,
    buildOptions: () => NOTE_NAMES.slice(),
    pickQuestion: () => {
      const noteName = NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)]
      const octave = Math.random() < 0.5 ? 3 : 4
      return { answer: noteName, frequencies: [noteFrequency(noteName, octave)] }
    },
  },
  {
    id: 'chords-basic',
    order: 3,
    name: 'Cấp 3 — Hợp Âm Cơ Bản',
    desc: 'Đoán tên hợp âm trưởng/thứ phổ biến',
    icon: '🎶',
    colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    maxReplays: 3,
    timeLimitSec: 15,
    questionCount: 10,
    buildOptions: () => BASIC_CHORDS.map((c) => c.label),
    pickQuestion: () => {
      const chord = BASIC_CHORDS[Math.floor(Math.random() * BASIC_CHORDS.length)]
      return { answer: chord.label, frequencies: chordFrequencies(chord.root, chord.shape) }
    },
  },
  {
    id: 'chords-advanced',
    order: 4,
    name: 'Cấp 4 — Hợp Âm Nâng Cao',
    desc: 'Đoán hợp âm mở rộng (7, maj7, m7...)',
    icon: '🔥',
    colorClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    maxReplays: 4,
    timeLimitSec: 20,
    questionCount: 10,
    buildOptions: () => ADVANCED_CHORDS.map((c) => c.label),
    pickQuestion: () => {
      const chord = ADVANCED_CHORDS[Math.floor(Math.random() * ADVANCED_CHORDS.length)]
      return { answer: chord.label, frequencies: chordFrequencies(chord.root, chord.shape) }
    },
  },
]

// ==========================================================================
// LOCAL STORAGE — BEST SCORE
// ==========================================================================
const BEST_SCORE_KEY_PREFIX = 'gbq_luyen_tai_best_'

function getBestScore(levelId) {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY_PREFIX + levelId)
    return raw ? parseInt(raw, 10) || 0 : 0
  } catch {
    return 0
  }
}

function saveBestScore(levelId, score) {
  try {
    const current = getBestScore(levelId)
    if (score > current) localStorage.setItem(BEST_SCORE_KEY_PREFIX + levelId, String(score))
  } catch {
    // localStorage không khả dụng (chế độ ẩn danh nghiêm ngặt) — bỏ qua, không chặn game
  }
}

// ==========================================================================
// DOM ELEMENTS
// ==========================================================================
const levelSelectScreen = document.getElementById('level-select-screen')
const gameplayScreen = document.getElementById('gameplay-screen')
const resultScreen = document.getElementById('result-screen')
const levelCardsContainer = document.getElementById('level-cards')

const backToLevelsBtn = document.getElementById('back-to-levels-btn')
const gameLevelLabel = document.getElementById('game-level-label')
const gameProgressLabel = document.getElementById('game-progress-label')
const gameScoreBadge = document.getElementById('game-score-badge')

const timerBar = document.getElementById('lt-timer-bar')
const playBtn = document.getElementById('lt-play-btn')
const replayDotsContainer = document.getElementById('lt-replay-dots')
const maxReplaysLabel = document.getElementById('lt-max-replays')
const optionsGrid = document.getElementById('lt-options-grid')
const feedbackEl = document.getElementById('lt-feedback')

const resultLevelName = document.getElementById('result-level-name')
const resultScore = document.getElementById('result-score')
const resultBest = document.getElementById('result-best')
const resultEmoji = document.getElementById('result-emoji')
const resultReplayBtn = document.getElementById('result-replay-btn')
const resultBackBtn = document.getElementById('result-back-btn')

// ==========================================================================
// GAME STATE
// ==========================================================================
let currentLevel = null
let currentQuestionIndex = 0
let currentQuestion = null
let currentReplaysUsed = 0
let correctCount = 0
let answered = false
let timerInterval = null
let timeLeft = 0

function showScreen(screen) {
  ;[levelSelectScreen, gameplayScreen, resultScreen].forEach((s) => s.classList.add('hidden'))
  screen.classList.remove('hidden')
}

// ==========================================================================
// LEVEL SELECT RENDERING
// ==========================================================================
function renderLevelCards() {
  levelCardsContainer.innerHTML = LEVELS.map((level) => {
    const best = getBestScore(level.id)
    return `
      <button data-level-id="${level.id}" class="lt-level-card group text-left glass-card card-interactive rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-glass-border shadow-sm flex items-center gap-3.5 sm:gap-4 cursor-pointer">
        <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl ${level.colorClass} flex items-center justify-center text-2xl sm:text-3xl flex-shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-300">
          ${level.icon}
        </div>
        <div class="flex-grow min-w-0">
          <h3 class="text-sm sm:text-base font-extrabold text-text-primary group-hover:text-accent-primary transition-colors">${level.name}</h3>
          <p class="text-xs text-text-muted font-medium leading-snug mt-0.5">${level.desc}</p>
          <p class="text-[11px] text-text-faint font-mono font-bold mt-1.5">Kỷ lục: ${best}/${level.questionCount}</p>
        </div>
        <svg class="w-4 h-4 text-text-faint group-hover:text-accent-primary group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" /></svg>
      </button>
    `
  }).join('')

  levelCardsContainer.querySelectorAll('.lt-level-card').forEach((card) => {
    card.addEventListener('click', () => {
      const level = LEVELS.find((l) => l.id === card.dataset.levelId)
      if (level) startLevel(level)
    })
  })
}

// ==========================================================================
// GAMEPLAY FLOW
// ==========================================================================
function startLevel(level) {
  currentLevel = level
  currentQuestionIndex = 0
  correctCount = 0
  showScreen(gameplayScreen)
  gameLevelLabel.textContent = level.name
  maxReplaysLabel.textContent = String(level.maxReplays)
  nextQuestion()
}

function nextQuestion() {
  if (currentQuestionIndex >= currentLevel.questionCount) {
    finishLevel()
    return
  }
  currentQuestionIndex += 1
  currentQuestion = currentLevel.pickQuestion()
  currentReplaysUsed = 0
  answered = false

  gameProgressLabel.textContent = `Câu ${currentQuestionIndex} / ${currentLevel.questionCount}`
  gameScoreBadge.textContent = `⭐ ${correctCount}`
  feedbackEl.textContent = ''
  feedbackEl.className = 'min-h-[1.5rem] text-center text-sm font-bold'

  renderReplayDots()
  renderOptions()
  stopTimer()
  resetTimerBar()
  playBtn.disabled = false
  playBtn.classList.remove('lt-option-disabled')
}

function renderReplayDots() {
  replayDotsContainer.innerHTML = Array.from({ length: currentLevel.maxReplays })
    .map((_, i) => `<span class="lt-replay-dot w-2.5 h-2.5 rounded-full ${i < currentLevel.maxReplays - currentReplaysUsed ? 'bg-accent-primary' : 'bg-glass-border opacity-40'}"></span>`)
    .join('')
}

function renderOptions() {
  const options = shuffle(currentLevel.buildOptions())
  optionsGrid.innerHTML = options
    .map(
      (opt) =>
        `<button data-answer="${opt}" class="lt-option-btn lt-answer-btn py-2.5 sm:py-3 px-2 rounded-xl bg-glass-bg hover:bg-glass-bg-hover border border-glass-border text-text-primary font-bold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer">${opt}</button>`
    )
    .join('')

  optionsGrid.querySelectorAll('.lt-answer-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleAnswer(btn.dataset.answer, btn))
  })
}

function shuffle(array) {
  const copy = array.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function handlePlay() {
  if (answered) return
  if (currentReplaysUsed >= currentLevel.maxReplays) return

  currentReplaysUsed += 1
  renderReplayDots()
  playFrequencies(currentQuestion.frequencies)

  if (currentReplaysUsed === 1) {
    startTimer()
  }

  if (currentReplaysUsed >= currentLevel.maxReplays) {
    playBtn.disabled = true
    playBtn.classList.add('lt-option-disabled')
  }
}

function startTimer() {
  timeLeft = currentLevel.timeLimitSec
  updateTimerBar()
  timerInterval = setInterval(() => {
    timeLeft -= 0.2
    updateTimerBar()
    if (timeLeft <= 0) {
      stopTimer()
      handleTimeout()
    }
  }, 200)
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

function resetTimerBar() {
  timerBar.style.width = '100%'
  timerBar.style.backgroundColor = ''
  timerBar.classList.remove('bg-rose-500', 'bg-amber-500')
  timerBar.classList.add('bg-emerald-500')
}

function updateTimerBar() {
  const pct = Math.max(0, (timeLeft / currentLevel.timeLimitSec) * 100)
  timerBar.style.width = pct + '%'
  timerBar.classList.remove('bg-emerald-500', 'bg-amber-500', 'bg-rose-500')
  if (pct > 50) timerBar.classList.add('bg-emerald-500')
  else if (pct > 20) timerBar.classList.add('bg-amber-500')
  else timerBar.classList.add('bg-rose-500')
}

function handleTimeout() {
  if (answered) return
  answered = true
  revealAnswer(null)
  feedbackEl.textContent = `⏱️ Hết giờ! Đáp án đúng: ${currentQuestion.answer}`
  feedbackEl.classList.add('text-rose-500')
  advanceAfterDelay()
}

function handleAnswer(selected, btnEl) {
  if (answered) return
  answered = true
  stopTimer()

  const isCorrect = selected === currentQuestion.answer
  if (isCorrect) {
    correctCount += 1
    btnEl.classList.add('lt-option-correct')
    feedbackEl.textContent = '✅ Chính xác!'
    feedbackEl.classList.add('text-emerald-500')
  } else {
    btnEl.classList.add('lt-option-wrong')
    feedbackEl.textContent = `❌ Sai rồi! Đáp án đúng: ${currentQuestion.answer}`
    feedbackEl.classList.add('text-rose-500')
  }

  revealAnswer(btnEl)
  gameScoreBadge.textContent = `⭐ ${correctCount}`
  advanceAfterDelay()
}

function revealAnswer(clickedBtnEl) {
  optionsGrid.querySelectorAll('.lt-answer-btn').forEach((btn) => {
    btn.classList.add('lt-option-disabled')
    if (btn !== clickedBtnEl && btn.dataset.answer === currentQuestion.answer) {
      btn.classList.add('lt-option-correct')
    }
  })
  playBtn.disabled = true
  playBtn.classList.add('lt-option-disabled')
}

function advanceAfterDelay() {
  setTimeout(() => {
    nextQuestion()
  }, 1400)
}

function finishLevel() {
  stopTimer()
  saveBestScore(currentLevel.id, correctCount)
  const best = getBestScore(currentLevel.id)

  resultLevelName.textContent = currentLevel.name
  resultScore.textContent = `${correctCount}/${currentLevel.questionCount}`
  resultBest.textContent = `${best}/${currentLevel.questionCount}`

  const ratio = correctCount / currentLevel.questionCount
  resultEmoji.textContent = ratio >= 0.8 ? '🎉' : ratio >= 0.5 ? '👍' : '💪'

  showScreen(resultScreen)
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================
playBtn.addEventListener('click', handlePlay)

backToLevelsBtn.addEventListener('click', () => {
  stopTimer()
  renderLevelCards()
  showScreen(levelSelectScreen)
})

resultReplayBtn.addEventListener('click', () => {
  startLevel(currentLevel)
})

resultBackBtn.addEventListener('click', () => {
  renderLevelCards()
  showScreen(levelSelectScreen)
})

document.addEventListener('DOMContentLoaded', () => {
  renderLevelCards()
})
