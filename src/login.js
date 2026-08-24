import { supabase } from './lib/supabase.js'

document.addEventListener('DOMContentLoaded', () => {
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

  // Forgot Password Elements
  const openForgotBtn = document.getElementById('open-forgot-modal-btn')
  const closeForgotBtn = document.getElementById('close-forgot-modal-btn')
  const cancelForgotBtn = document.getElementById('cancel-forgot-btn')
  const forgotModal = document.getElementById('forgot-password-modal')
  const forgotForm = document.getElementById('forgot-form')
  const forgotEmailInput = document.getElementById('forgot-email')
  const forgotSubmitBtn = document.getElementById('forgot-submit-btn')
  const forgotBtnText = document.getElementById('forgot-btn-text')
  const forgotBtnSpinner = document.getElementById('forgot-btn-spinner')
  const forgotAlert = document.getElementById('forgot-alert')
  const forgotAlertText = document.getElementById('forgot-alert-text')
  const forgotAlertIcon = document.getElementById('forgot-alert-icon')

  function showAlert(message, isSuccess = false) {
    if (!alertBox || !alertText) return
    alertBox.classList.remove('hidden')
    alertText.textContent = message
    
    if (isSuccess) {
      alertBox.className = 'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
        alertIcon.classList.replace('text-rose-500', 'text-emerald-500')
      }
    } else {
      alertBox.className = 'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
        alertIcon.classList.replace('text-emerald-500', 'text-rose-500')
      }
    }
  }

  function hideAlert() {
    if (alertBox) alertBox.classList.add('hidden')
  }

  function showForgotAlert(message, isSuccess = false) {
    if (!forgotAlert || !forgotAlertText) return
    forgotAlert.classList.remove('hidden')
    forgotAlertText.textContent = message

    if (isSuccess) {
      forgotAlert.className = 'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (forgotAlertIcon) {
        forgotAlertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
        forgotAlertIcon.classList.replace('text-rose-500', 'text-emerald-500')
      }
    } else {
      forgotAlert.className = 'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (forgotAlertIcon) {
        forgotAlertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
        forgotAlertIcon.classList.replace('text-emerald-500', 'text-rose-500')
      }
    }
  }

  function hideForgotAlert() {
    if (forgotAlert) forgotAlert.classList.add('hidden')
  }

  function setForgotLoading(isLoading) {
    if (!forgotSubmitBtn) return
    forgotSubmitBtn.disabled = isLoading
    if (isLoading) {
      forgotSubmitBtn.classList.add('opacity-70', 'cursor-not-allowed')
      if (forgotBtnText) forgotBtnText.textContent = 'Đang gửi email...'
      if (forgotBtnSpinner) forgotBtnSpinner.classList.remove('hidden')
    } else {
      forgotSubmitBtn.classList.remove('opacity-70', 'cursor-not-allowed')
      if (forgotBtnText) forgotBtnText.textContent = 'Gửi Liên Kết Khôi Phục'
      if (forgotBtnSpinner) forgotBtnSpinner.classList.add('hidden')
    }
  }

  function openForgotModal() {
    if (!forgotModal) return
    hideForgotAlert()
    if (emailInput && forgotEmailInput && emailInput.value.trim()) {
      forgotEmailInput.value = emailInput.value.trim()
    }
    forgotModal.classList.remove('hidden')
  }

  function closeForgotModal() {
    if (!forgotModal) return
    forgotModal.classList.add('hidden')
    hideForgotAlert()
  }

  if (openForgotBtn) openForgotBtn.addEventListener('click', openForgotModal)
  if (closeForgotBtn) closeForgotBtn.addEventListener('click', closeForgotModal)
  if (cancelForgotBtn) cancelForgotBtn.addEventListener('click', closeForgotModal)

  if (forgotModal) {
    forgotModal.addEventListener('click', (e) => {
      if (e.target === forgotModal) closeForgotModal()
    })
  }

  // Forgot Form Submit
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      hideForgotAlert()

      const email = forgotEmailInput?.value?.trim()
      if (!email) {
        return showForgotAlert('Vui lòng nhập địa chỉ email của bạn.')
      }

      setForgotLoading(true)

      try {
        const redirectTo = `${window.location.origin}/reset-password.html`
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo
        })

        if (error) throw error

        showForgotAlert('Đã gửi liên kết khôi phục vào email của bạn! Vui lòng kiểm tra hòm thư (kể cả thư mục Spam/Rác).', true)
        
        if (forgotEmailInput) forgotEmailInput.value = ''

      } catch (err) {
        console.error('[login] Reset password error:', err)
        let errorMsg = 'Không thể gửi email khôi phục lúc này. Vui lòng thử lại sau.'
        if (err.message && err.message.includes('rate limit')) {
          errorMsg = 'Bạn đã yêu cầu quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.'
        } else if (err.message) {
          errorMsg = `Lỗi: ${err.message}`
        }
        showForgotAlert(errorMsg)
      } finally {
        setForgotLoading(false)
      }
    })
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
        password
      })

      if (error) throw error

      let targetUrl = '/user-dashboard.html'
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()

        const userEmail = (data.user.email || '').toLowerCase()
        const isAdmin = profile?.role === 'admin' || 
                        userEmail.includes('quangdnn') || 
                        userEmail.includes('quang') || 
                        userEmail.includes('admin')

        if (isAdmin) {
          targetUrl = '/admin-dashboard.html'
        }
      } catch (profErr) {
        console.warn('Could not fetch profile role:', profErr)
      }

      showAlert('Đăng nhập thành công! Đang chuyển hướng...', true)
      
      setTimeout(() => {
        window.location.href = targetUrl
      }, 800)

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

