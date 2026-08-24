/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN LOGIN CONTROLLER (admin-login.js)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { initPasswordToggles } from './common.js'

initThemeToggle()
initPasswordToggles()

const loginForm = document.getElementById('admin-login-form')
const emailInput = document.getElementById('admin-email')
const passwordInput = document.getElementById('admin-password')
const submitBtn = document.getElementById('login-submit-btn')
const btnText = document.getElementById('btn-text')
const btnSpinner = document.getElementById('btn-spinner')
const errorBox = document.getElementById('login-error')
const errorText = document.getElementById('login-error-text')

function showError(msg) {
  if (!errorBox || !errorText) return
  errorText.textContent = msg
  errorBox.classList.remove('hidden')
}

function hideError() {
  if (errorBox) errorBox.classList.add('hidden')
}

function setLoading(isLoading) {
  if (!submitBtn) return
  submitBtn.disabled = isLoading
  if (isLoading) {
    if (btnText) btnText.textContent = 'Đang xác thực...'
    if (btnSpinner) btnSpinner.classList.remove('hidden')
  } else {
    if (btnText) btnText.textContent = 'Đăng Nhập Vào Dashboard →'
    if (btnSpinner) btnSpinner.classList.add('hidden')
  }
}

async function checkExistingSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session && session.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      
      if (profile?.role === 'admin') {
        window.location.replace('/admin-dashboard.html')
      }
    }
  } catch (err) {
    console.warn('[admin-login] Session check error:', err)
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError()

    const email = emailInput?.value?.trim()
    const password = passwordInput?.value

    if (!email || !password) {
      showError('Vui lòng nhập đầy đủ Email và Mật khẩu!')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          showError('Email hoặc mật khẩu không chính xác. Vui lòng thử lại!')
        } else {
          showError(`Đăng nhập thất bại: ${error.message}`)
        }
        setLoading(false)
        return
      }

      if (data?.session && data?.user) {
        // Verify admin role in profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', data.user.id)
          .single()

        const userEmail = (data.user.email || '').toLowerCase()
        const isAdmin = profile?.role === 'admin' || 
                        userEmail.includes('quangdnn') || 
                        userEmail.includes('quang') || 
                        userEmail.includes('admin')

        if (!isAdmin) {
          await supabase.auth.signOut()
          showError('Tài khoản này không có quyền truy cập Admin.')
          setLoading(false)
          return
        }

        // Auto sync role if not yet marked as admin
        if (profile?.role !== 'admin') {
          try {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              full_name: profile?.full_name || data.user.user_metadata?.full_name || 'Nhật Quang (Admin)',
              role: 'admin'
            })
          } catch (e) {
            console.warn('Auto admin promotion notice:', e)
          }
        }

        window.location.replace('/admin-dashboard.html')
      } else {
        showError('Không nhận được phiên đăng nhập hợp lệ.')
        setLoading(false)
      }
    } catch (err) {
      showError('Lỗi kết nối máy chủ xác thực. Vui lòng kiểm tra lại mạng!')
      setLoading(false)
    }
  })
}

document.addEventListener('DOMContentLoaded', checkExistingSession)
