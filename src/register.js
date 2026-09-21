import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { getPasswordWeaknessReason, initPasswordMatchHint } from './common.js'
import { watchEmailConfirmation } from './lib/email-confirmation-watch.js'
import { redirectTo } from './lib/navigate.js'

// Supabase chỉ cho gửi lại email xác nhận sau mỗi 60 giây.
const RESEND_COOLDOWN_SECONDS = 60

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle()

  const form = document.getElementById('register-form')
  const emailInput = document.getElementById('register-email')
  const passwordInput = document.getElementById('register-password')
  const confirmPasswordInput = document.getElementById('register-confirm-password')
  const nameInput = document.getElementById('register-name')

  initPasswordMatchHint({
    passwordInputId: 'register-password',
    confirmInputId: 'register-confirm-password',
    hintElId: 'register-password-match-hint',
  })

  const submitBtn = document.getElementById('register-submit-btn')
  const btnText = document.getElementById('btn-text')
  const btnSpinner = document.getElementById('btn-spinner')

  const alertBox = document.getElementById('register-alert')
  const alertText = document.getElementById('register-alert-text')
  const alertIcon = document.getElementById('register-alert-icon')

  function showAlert(message, isSuccess = false) {
    alertBox.classList.remove('hidden')
    alertText.textContent = message

    if (isSuccess) {
      alertBox.className =
        'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5 shadow-sm'
      alertIcon.innerHTML =
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
      alertIcon.classList.replace('text-rose-500', 'text-emerald-500')
    } else {
      alertBox.className =
        'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5 shadow-sm'
      alertIcon.innerHTML =
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
      alertIcon.classList.replace('text-emerald-500', 'text-rose-500')
    }
  }

  function hideAlert() {
    alertBox.classList.add('hidden')
  }

  function isValidEmail(email) {
    // Standard RFC 5322 regex validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    return emailRegex.test(String(email).trim().toLowerCase())
  }

  function setLoading(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true
      submitBtn.classList.add('opacity-70', 'cursor-not-allowed')
      btnText.textContent = 'Đang tạo tài khoản...'
      btnSpinner.classList.remove('hidden')
    } else {
      submitBtn.disabled = false
      submitBtn.classList.remove('opacity-70', 'cursor-not-allowed')
      btnText.textContent = 'Đăng Ký Tài Khoản'
      btnSpinner.classList.add('hidden')
    }
  }

  // ---------------------------------------------------------------------------
  // CHỜ XÁC NHẬN EMAIL: đăng ký xong thì ở NGUYÊN trang này (không tự nhảy sang Đăng nhập),
  // rồi tự đăng nhập ngay khi khách bấm liên kết trong email — dù họ mở email trên điện thoại
  // hay tab khác. Xem src/lib/email-confirmation-watch.js.
  // ---------------------------------------------------------------------------
  const waitingPanel = document.getElementById('register-waiting')
  const waitingEmail = document.getElementById('waiting-email')
  const waitingSpinner = document.getElementById('waiting-spinner')
  const waitingStatusText = document.getElementById('waiting-status-text')
  const waitingFeedback = document.getElementById('waiting-feedback')
  const resendBtn = document.getElementById('waiting-resend-btn')

  let watcher = null
  let authChannel = null
  let resendTimer = null
  let waitingEmailValue = ''

  const confirmRedirectUrl = () => `${window.location.origin}/email-confirmed.html`

  function setWaitingStatus(text, { spinning = true } = {}) {
    if (waitingStatusText) waitingStatusText.textContent = text
    waitingSpinner?.classList.toggle('hidden', !spinning)
  }

  function setWaitingFeedback(message, ok = true) {
    if (!waitingFeedback) return
    waitingFeedback.classList.remove('hidden')
    waitingFeedback.textContent = message
    waitingFeedback.className =
      'text-[11px] font-semibold leading-relaxed ' +
      (ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')
  }

  function onVisible() {
    if (!document.hidden) watcher?.checkNow()
  }

  function stopWaiting() {
    watcher?.stop()
    watcher = null
    authChannel?.close()
    authChannel = null
    document.removeEventListener('visibilitychange', onVisible)
    if (resendTimer) clearInterval(resendTimer)
    resendTimer = null
  }

  function startResendCooldown() {
    if (!resendBtn) return
    let left = RESEND_COOLDOWN_SECONDS
    resendBtn.disabled = true
    resendBtn.textContent = `Gửi lại email xác nhận (${left}s)`
    if (resendTimer) clearInterval(resendTimer)
    resendTimer = setInterval(() => {
      left--
      if (left <= 0) {
        clearInterval(resendTimer)
        resendTimer = null
        resendBtn.disabled = false
        resendBtn.textContent = 'Gửi lại email xác nhận'
      } else {
        resendBtn.textContent = `Gửi lại email xác nhận (${left}s)`
      }
    }, 1000)
  }

  resendBtn?.addEventListener('click', async () => {
    if (!waitingEmailValue) return
    startResendCooldown()
    setWaitingFeedback('Đang gửi lại email…')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: waitingEmailValue,
      options: { emailRedirectTo: confirmRedirectUrl() },
    })
    if (error) {
      const msg = String(error.message || '').toLowerCase()
      const limited =
        msg.includes('rate limit') || msg.includes('seconds') || msg.includes('too many')
      setWaitingFeedback(
        limited
          ? 'Bạn vừa yêu cầu gửi thư. Vui lòng đợi ít phút rồi thử lại, và kiểm tra cả mục Spam.'
          : 'Chưa gửi lại được email. Vui lòng thử lại sau ít phút.',
        false
      )
    } else {
      setWaitingFeedback('Đã gửi lại email. Hãy kiểm tra hộp thư (cả mục Spam).')
    }
  })

  function startWaiting(email, password) {
    stopWaiting()
    waitingEmailValue = email
    form.classList.add('hidden')
    waitingPanel?.classList.remove('hidden')
    if (waitingEmail) waitingEmail.textContent = email
    waitingFeedback?.classList.add('hidden')
    setWaitingStatus('Đang chờ bạn xác nhận email…')
    startResendCooldown()

    // Mật khẩu chỉ nằm trong hàm này (bộ nhớ), không lưu ở storage; xoá khỏi ô nhập ngay.
    passwordInput.value = ''
    confirmPasswordInput.value = ''

    watcher = watchEmailConfirmation({
      signIn: () => supabase.auth.signInWithPassword({ email, password }),
      onConfirmed: () => {
        stopWaiting()
        setWaitingStatus('Đã xác nhận! Đang đưa bạn vào tài khoản…', { spinning: true })
        setTimeout(() => redirectTo('/user-dashboard.html'), 800)
      },
      onGiveUp: () => {
        setWaitingStatus(
          'Đã chờ khá lâu. Nếu bạn đã bấm xác nhận, hãy bấm "Đăng nhập tại đây" bên dưới.',
          { spinning: false }
        )
      },
      onProblem: () => {
        setWaitingStatus(
          'Chưa tự đăng nhập được. Nếu bạn đã bấm xác nhận, hãy bấm "Đăng nhập tại đây" bên dưới.',
          { spinning: false }
        )
      },
    })

    // Khách quay lại tab này (từ ứng dụng email) → kiểm tra ngay thay vì chờ lượt hỏi kế tiếp.
    document.addEventListener('visibilitychange', onVisible)
    // Mở liên kết ở CÙNG trình duyệt: trang "đã xác thực" báo tin qua kênh này → đăng nhập tức thì.
    if (typeof BroadcastChannel !== 'undefined') {
      authChannel = new BroadcastChannel('gbq-auth')
      authChannel.onmessage = (ev) => {
        if (ev.data?.type === 'email-confirmed') watcher?.checkNow()
      }
    }
  }

  // Clear alert on typing
  ;[nameInput, emailInput, passwordInput, confirmPasswordInput].forEach((input) => {
    input?.addEventListener('input', () => {
      hideAlert()
    })
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideAlert()

    const displayName = nameInput?.value?.trim() || ''
    const email = emailInput?.value?.trim() || ''
    const password = passwordInput?.value || ''
    const confirmPassword = confirmPasswordInput?.value || ''

    // 1. Kiểm tra không được để trống
    if (!displayName) {
      nameInput?.focus()
      return showAlert('Vui lòng nhập Tên hiển thị.')
    }

    if (!email) {
      emailInput?.focus()
      return showAlert('Vui lòng nhập Email.')
    }

    // 2. Kiểm tra cú pháp Email chuẩn
    if (!isValidEmail(email)) {
      emailInput?.focus()
      return showAlert(
        'Địa chỉ Email không đúng định dạng (Ví dụ đúng: tenban@gmail.com). Vui lòng kiểm tra lại.'
      )
    }

    // 2b. Kiểm tra domain email có thực sự tồn tại (chặn gõ nhầm kiểu
    // "gmlai.con" thay vì "gmail.com") — không bắt xác minh qua email,
    // chỉ tra nhanh domain có nhận được thư hay không.
    setLoading(true)
    try {
      const { data: domainCheck, error: domainCheckErr } = await supabase.functions.invoke(
        'check-email-domain',
        { body: { email } }
      )

      if (!domainCheckErr && domainCheck && domainCheck.valid === false) {
        setLoading(false)
        emailInput?.focus()
        const suggestion = domainCheck.suggestion
        return showAlert(
          suggestion
            ? `Domain email "${email.split('@')[1]}" có vẻ không tồn tại. Có phải bạn muốn nhập "${email.split('@')[0]}@${suggestion}" không?`
            : `Domain email "${email.split('@')[1]}" không tồn tại hoặc không nhận được thư. Vui lòng kiểm tra lại email.`
        )
      }
      // Nếu domainCheckErr (lỗi mạng/edge function), không chặn đăng ký —
      // fail-open để tránh chặn nhầm người dùng hợp lệ vì sự cố hạ tầng.
    } catch (domainCheckException) {
      console.warn('Lưu ý kiểm tra domain email:', domainCheckException)
    }
    setLoading(false)

    // 3. Kiểm tra Mật khẩu
    if (!password) {
      passwordInput?.focus()
      return showAlert('Vui lòng nhập Mật khẩu.')
    }

    const weaknessReason = getPasswordWeaknessReason(password)
    if (weaknessReason) {
      passwordInput?.focus()
      return showAlert(weaknessReason)
    }

    // 4. Kiểm tra Xác nhận mật khẩu
    if (!confirmPassword) {
      confirmPasswordInput?.focus()
      return showAlert('Vui lòng nhập lại Mật khẩu để xác nhận.')
    }

    if (password !== confirmPassword) {
      confirmPasswordInput?.focus()
      return showAlert('Mật khẩu nhập lại không khớp với mật khẩu đã nhập.')
    }

    setLoading(true)

    try {
      // 5. Kiểm tra trùng Tên hiển thị (DisplayName) trong bảng profiles
      try {
        const { data: existingNameProfiles } = await supabase
          .from('profiles')
          .select('id')
          .ilike('full_name', displayName)
          .limit(1)

        if (existingNameProfiles && existingNameProfiles.length > 0) {
          setLoading(false)
          nameInput?.focus()
          return showAlert(
            `Tên hiển thị "${displayName}" đã có người sử dụng. Vui lòng chọn một tên khác.`
          )
        }
      } catch (checkNameErr) {
        console.warn('Lưu ý kiểm tra tên trùng:', checkNameErr)
      }

      // 6. Kiểm tra trùng Email trong bảng profiles
      try {
        const { data: existingEmailProfiles } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', email)
          .limit(1)

        if (existingEmailProfiles && existingEmailProfiles.length > 0) {
          setLoading(false)
          emailInput?.focus()
          return showAlert(
            `Email "${email}" đã được đăng ký. Vui lòng chọn email khác hoặc bấm Đăng nhập.`
          )
        }
      } catch (checkEmailErr) {
        console.warn('Lưu ý kiểm tra email trùng:', checkEmailErr)
      }

      // 7. Thực hiện đăng ký tài khoản qua Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Liên kết trong email dẫn tới trang "đã xác thực thành công" của web mình.
          emailRedirectTo: confirmRedirectUrl(),
          data: {
            full_name: displayName,
            display_name: displayName,
            role: 'user',
          },
        },
      })

      if (error) throw error

      // Nếu email đã tồn tại trong Supabase Auth (khi bật tính năng bảo mật, Supabase trả về user với identities = [])
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setLoading(false)
        emailInput?.focus()
        return showAlert(
          `Email "${email}" đã được đăng ký từ trước. Vui lòng sử dụng email khác hoặc bấm Đăng nhập.`
        )
      }

      // Hàng 'profiles' được một trigger phía Supabase tự tạo ngay khi tài
      // khoản Auth mới được insert (copy full_name từ user_metadata và email
      // từ auth.users — xem scripts/fix-profile-email-sync.sql). Không cần
      // client tự ghi thêm nữa: trước đây có gọi upsert() ở đây nhưng luôn
      // thất bại âm thầm vì tài khoản thường không có quyền INSERT trên bảng
      // profiles (chỉ có quyền UPDATE), row đã tồn tại sẵn trước khi lệnh
      // này kịp chạy.

      // Kiểm tra xem Supabase có yêu cầu xác thực email hay không
      if (data?.user && data?.session === null) {
        // Ở nguyên trang này chờ khách xác nhận email; tự đăng nhập khi họ bấm liên kết.
        startWaiting(email, password)
      } else {
        showAlert('Đăng ký thành công! Đang chuyển hướng vào tài khoản...', true)
        setTimeout(() => {
          redirectTo('/user-dashboard.html')
        }, 1200)
      }
    } catch (error) {
      console.error('Lỗi đăng ký Supabase:', error)
      const msgLower = (error?.message || '').toLowerCase()
      let errorMsg = error?.message || 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'

      if (
        msgLower.includes('already registered') ||
        msgLower.includes('user already exists') ||
        msgLower.includes('email already in use') ||
        msgLower.includes('duplicate')
      ) {
        errorMsg = `Email "${email}" đã được đăng ký. Vui lòng sử dụng email khác hoặc bấm Đăng nhập.`
      } else if (
        msgLower.includes('password') &&
        (msgLower.includes('least') || msgLower.includes('short') || msgLower.includes('weak'))
      ) {
        errorMsg =
          'Mật khẩu chưa đủ mạnh (tối thiểu 8 ký tự, có chữ thường, chữ hoa và số). Vui lòng thử mật khẩu khác.'
      } else if (
        msgLower.includes('rate limit') ||
        msgLower.includes('too many requests') ||
        msgLower.includes('over_email_send_rate_limit')
      ) {
        errorMsg =
          'Hệ thống đang gửi quá nhiều email xác nhận. Bạn vui lòng thử lại sau ít phút, hoặc nhắn Zalo cho Quang để được hỗ trợ.'
      } else if (
        msgLower.includes('invalid email') ||
        msgLower.includes('unable to validate email')
      ) {
        errorMsg =
          'Địa chỉ email không hợp lệ. Vui lòng nhập đúng email thật (ví dụ: name@gmail.com).'
      } else if (msgLower.includes('signups not allowed') || msgLower.includes('disabled')) {
        errorMsg = 'Hệ thống đăng ký đang tạm bảo trì. Vui lòng liên hệ Admin để được hỗ trợ.'
      } else {
        errorMsg = `Lỗi hệ thống: ${error.message}`
      }

      showAlert(errorMsg)
    } finally {
      setLoading(false)
    }
  })
})
