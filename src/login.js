import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { initForgotPasswordModal } from './common.js'

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle()

  // Login Elements
  const form = document.getElementById('login-form')
  const emailInput = document.getElementById('login-email')
  const passwordInput = document.getElementById('login-password')

  const submitBtn = document.getElementById('login-submit-btn')
  const btnText = document.getElementById('btn-text')
  const btnSpinner = document.getElementById('btn-spinner')

  const alertBox = document.getElementById('login-alert')
  const alertText = document.getElementById('login-alert-text')
  const alertIcon = document.getElementById('login-alert-icon')

  initForgotPasswordModal({
    prefillEmailInputId: 'login-email',
    redirectPath: '/reset-password.html',
    successMessage:
      'Nếu email này tồn tại trong hệ thống, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).',
    emptyEmailMessage: 'Vui lòng nhập địa chỉ email của bạn.',
    logPrefix: '[login]',
  })

  function showAlert(message, isSuccess = false) {
    if (!alertBox || !alertText) return
    alertBox.classList.remove('hidden')
    alertText.textContent = message

    if (isSuccess) {
      alertBox.className =
        'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML =
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
        alertIcon.classList.replace('text-rose-500', 'text-emerald-500')
      }
    } else {
      alertBox.className =
        'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML =
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
        alertIcon.classList.replace('text-emerald-500', 'text-rose-500')
      }
    }
  }

  function hideAlert() {
    if (alertBox) alertBox.classList.add('hidden')
  }

  function setLoading(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true
      submitBtn.classList.add('opacity-70', 'cursor-not-allowed')
      btnText.textContent = 'Đang đăng nhập...'
      btnSpinner.classList.remove('hidden')
    } else {
      submitBtn.disabled = false
      submitBtn.classList.remove('opacity-70', 'cursor-not-allowed')
      btnText.textContent = 'Đăng Nhập Ngay'
      btnSpinner.classList.add('hidden')
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideAlert()

    const email = emailInput.value.trim()
    const password = passwordInput.value

    if (!email || !password) {
      return showAlert('Vui lòng điền đầy đủ Email và Mật khẩu.')
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data?.session && data?.user) {
        // Kiểm tra quyền: CHẶN TÀI KHOẢN ADMIN KHÔNG CHO ĐĂNG NHẬP Ở CỔNG THÀNH VIÊN
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single()

          if (profile?.role === 'admin') {
            await supabase.auth.signOut()
            // Dùng chung message với nhánh sai mật khẩu (không phải message
            // riêng như "tài khoản không tồn tại") — để không tạo tín hiệu
            // phân biệt giữa 2 trường hợp, tránh lộ danh tính admin nếu
            // mật khẩu admin từng bị lộ và ai đó thử đăng nhập ở cổng member.
            showAlert('Sai email hoặc mật khẩu. Vui lòng kiểm tra lại.')
            setLoading(false)
            return
          }
        } catch (profErr) {
          console.warn('Could not fetch profile role:', profErr)
        }

        const params = new URLSearchParams(window.location.search)
        const redirectParam = params.get('redirect')
        const targetUrl =
          redirectParam && redirectParam.startsWith('/') ? redirectParam : '/user-dashboard.html'

        showAlert('Đăng nhập thành công! Đang chuyển hướng...', true)

        setTimeout(() => {
          window.location.href = targetUrl
        }, 800)
      }
    } catch (error) {
      console.error('Lỗi đăng nhập:', error)
      let errorMsg = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'
      if (error.message.includes('Invalid login credentials')) {
        errorMsg = 'Sai email hoặc mật khẩu. Vui lòng kiểm tra lại.'
      }
      showAlert(errorMsg)
    } finally {
      setLoading(false)
    }
  })
})
