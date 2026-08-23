if (Test-Path "src\theme-toggle.js") { Write-Host "[OK]    theme-toggle.js tồn tại" -ForegroundColor Green }
else { Write-Host "[THIẾU] theme-toggle.js" -ForegroundColor Red }

$style = Get-Content "src\style.css" -Raw
if ($style -match '\[data-theme="light"\]') { Write-Host "[OK]    style.css có block light mode" -ForegroundColor Green }
else { Write-Host "[LỖI]   style.css thiếu block [data-theme=`"light`"]" -ForegroundColor Red }

$themeJs = Get-Content "src\theme-toggle.js" -Raw
if ($themeJs -match 'gbq_theme' -and $themeJs -match 'prefers-color-scheme') {
  Write-Host "[OK]    theme-toggle.js dùng đúng key localStorage + check system preference" -ForegroundColor Green
} else {
  Write-Host "[LỖI]   theme-toggle.js thiếu logic cần thiết" -ForegroundColor Red
}

$sceneJs = Get-Content "src\three\guitar-scene.js" -Raw
if ($sceneJs -match 'updateSceneLighting') { Write-Host "[OK]    guitar-scene.js có updateSceneLighting" -ForegroundColor Green }
else { Write-Host "[LỖI]   guitar-scene.js thiếu updateSceneLighting" -ForegroundColor Red }

$indexHtml = Get-Content "index.html" -Raw
if ($indexHtml -match 'theme-toggle' -or $indexHtml -match 'id="theme-toggle-btn"') {
  Write-Host "[OK]    index.html có nút theme toggle" -ForegroundColor Green
} else {
  Write-Host "[CẢNH BÁO] Không tìm thấy nút toggle rõ ràng trong index.html — kiểm tra thủ công" -ForegroundColor Yellow
}

Write-Host "`n=== HOÀN TẤT KIỂM TRA GIAI ĐOẠN 2.5 ===" -ForegroundColor Cyan
