import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle()

  const form = document.getElementById('register-form')
  const emailInput = document.getElementById('register-email')
  const passwordInput = document.getElementById('register-password')
  const confirmPasswordInput = document.getElementById('register-confirm-password')
  const nameInput = document.getElementById('register-name')
  
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
      alertBox.className = 'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5 shadow-sm'
      alertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
      alertIcon.classList.replace('text-rose-500', 'text-emerald-500')
    } else {
      alertBox.className = 'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5 shadow-sm'
      alertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
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

  // Clear alert on typing
  ;[nameInput, emailInput, passwordInput, confirmPasswordInput].forEach(input => {
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
      return showAlert('Địa chỉ Email không đúng định dạng (Ví dụ đúng: tenban@gmail.com). Vui lòng kiểm tra lại.')
    }

    // 3. Kiểm tra Mật khẩu
    if (!password) {
      passwordInput?.focus()
      return showAlert('Vui lòng nhập Mật khẩu.')
    }

    if (password.length < 6) {
      passwordInput?.focus()
      return showAlert('Mật khẩu phải có tối thiểu 6 ký tự.')
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
          return showAlert(`Tên hiển thị "${displayName}" đã có người sử dụng. Vui lòng chọn một tên khác.`)
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
          return showAlert(`Email "${email}" đã được đăng ký. Vui lòng chọn email khác hoặc bấm Đăng nhập.`)
        }
      } catch (checkEmailErr) {
        console.warn('Lưu ý kiểm tra email trùng:', checkEmailErr)
      }

      // 7. Thực hiện đăng ký tài khoản qua Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName,
            display_name: displayName,
            role: 'user'
          }
        }
      })

      if (error) throw error

      // Nếu email đã tồn tại trong Supabase Auth (khi bật tính năng bảo mật, Supabase trả về user với identities = [])
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setLoading(false)
        emailInput?.focus()
        return showAlert(`Email "${email}" đã được đăng ký từ trước. Vui lòng sử dụng email khác hoặc bấm Đăng nhập.`)
      }

      // Tự động ghi bản ghi vào bảng 'profiles'
      if (data?.user) {
        try {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: email,
            full_name: displayName,
            avatar_url: '',
            role: 'user'
          })
        } catch (pErr) {
          console.warn('Profile insertion note:', pErr)
        }
      }

      // Kiểm tra xem Supabase có yêu cầu xác thực email hay không
      if (data?.user && data?.session === null) {
        showAlert('Đăng ký thành công! Vui lòng kiểm tra hộp thư email để kích hoạt tài khoản.', true)
        setTimeout(() => {
          window.location.href = '/login.html'
        }, 3000)
      } else {
        showAlert('Đăng ký thành công! Đang chuyển hướng vào tài khoản...', true)
        setTimeout(() => {
          window.location.href = '/user-dashboard.html'
        }, 1200)
      }

    } catch (error) {
      console.error('Lỗi đăng ký Supabase:', error)
      const msgLower = (error?.message || '').toLowerCase()
      let errorMsg = error?.message || 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'

      if (msgLower.includes('already registered') || msgLower.includes('user already exists') || msgLower.includes('email already in use') || msgLower.includes('duplicate')) {
        errorMsg = `Email "${email}" đã được đăng ký. Vui lòng sử dụng email khác hoặc bấm Đăng nhập.`
      } else if (msgLower.includes('password') && (msgLower.includes('least') || msgLower.includes('short') || msgLower.includes('weak'))) {
        errorMsg = 'Mật khẩu chưa đủ độ dài (tối thiểu 6 ký tự). Vui lòng thử mật khẩu khác.'
      } else if (msgLower.includes('rate limit') || msgLower.includes('too many requests') || msgLower.includes('over_email_send_rate_limit')) {
        errorMsg = 'Hệ thống Supabase đang giới hạn số lượt gửi email xác thực (Rate limit). Vui lòng TẮT mục "Confirm email" trong Supabase Auth Settings để đăng ký được ngay mà không bị giới hạn.'
      } else if (msgLower.includes('invalid email') || msgLower.includes('unable to validate email')) {
        errorMsg = 'Địa chỉ email không hợp lệ. Vui lòng nhập đúng email thật (ví dụ: name@gmail.com).'
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
