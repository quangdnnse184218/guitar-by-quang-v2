# MIGRATION NOTES — GIAI ĐOẠN 2 (HERO 3D & GSAP REVEAL)

Dự án đã hoàn thành Giai đoạn 2: Tích hợp thành công mô hình Guitar 3D tương tác với cuộn trang bằng Three.js và hiển thị các Bài Hát Nổi Bật, Đồ Nghề Khuyên Dùng lấy dữ liệu thật từ Supabase.

---

## 1. CÁC TÍNH NĂNG MỚI ĐÃ IMPLEMENT

- **Header Glass & Sticky**: Tự động thu nhỏ padding và tăng độ blur kính khi cuộn trang (sử dụng logic `initNavbarShrink`).
- **Hero 3D Guitar (Three.js)**:
  - Tải file `acoustic-guitar.glb` với hiệu ứng loading CSS tinh tế.
  - Xoay mượt mà theo thao tác cuộn chuột (bind với GSAP ScrollTrigger).
  - Tích hợp `HemisphereLight` và `DirectionalLight` tạo khối đẹp.
  - Tối ưu hiệu năng giới hạn độ phân giải (pixelRatio ≤ 2).
  - Có chế độ tự động Fallback SVG an toàn khi người dùng truy cập từ điện thoại (`< 480px`) hoặc khi tải file lỗi.
- **Dữ liệu thật từ Supabase**:
  - `songs-service.js`: Lấy 3 bài hát được chọn ưu tiên (dựa theo field `order`).
  - `gears-service.js`: Lấy danh sách đồ nghề (dựa theo field `order`).
- **GSAP Scroll Reveal**: 
  - Module hoá logic ở `scroll-reveal.js` để áp dụng hiệu ứng stagger fade-up mượt mà khi cuộn đến các phần tử.

---

## 2. CẤU TRÚC FILE MỚI ĐÃ THÊM

```
guitar-by-quang-v2/
├── public/
│   └── models/
│       └── acoustic-guitar.glb      # File model chính đã được đổi tên đúng chuẩn
├── src/
│   ├── animations/
│   │   └── scroll-reveal.js         # GSAP bindings và ScrollTrigger setup
│   ├── lib/
│   │   ├── songs-service.js         # Logic fetch Featured Songs từ Supabase
│   │   └── gears-service.js         # Logic fetch Gears từ Supabase
│   └── three/
│       └── guitar-scene.js          # Khởi tạo Three.js scene, camera, lights, loader, và CSS fallback
```

---

## 3. CHECKLIST KIỂM TRA CHO BẠN (USER ACTION ITEMS)

- [x] **Model 3D đã đổi tên thành `acoustic-guitar.glb`**.
- [x] **Chạy môi trường Dev và Trải nghiệm**.

---

# MIGRATION NOTES — GIAI ĐOẠN 2.5 (LIGHT/DARK MODE + REDESIGN HEADER/FOOTER + REFINED AESTHETICS)

Giai đoạn 2.5 đã hoàn thành: Bổ sung hệ thống Light/Dark Mode thông minh, nâng cấp Header/Footer chuyên nghiệp, loại bỏ cảm giác "rập khuôn AI" và tinh chỉnh hiệu ứng thị giác toàn trang.

---

## 1. NGUYÊN NHÂN BUG DỮ LIỆU & CÁCH XỬ LÝ (BƯỚC 0)
1. **Cấu trúc JSON**: File `DATA-EXPORT.json` chứa dữ liệu dạng lồng `collections.songs` và `collections.gears`, trong khi script `migrate-data.js` ban đầu đọc ở cấp root `data.songs`. Đã sửa đường dẫn truy cập thành `rawData.collections?.songs || rawData.songs`.
2. **Quyền ghi Supabase (RLS)**: Cấu hình Row-Level Security trên Supabase yêu cầu quyền Admin/Service Role để ghi. Sau khi thêm `SUPABASE_SERVICE_ROLE_KEY` vào `.env.local`, toàn bộ **10 bài hát (songs)** và **5 đồ nghề (gears)** đã được migrate thành công vào database.

---

## 2. CÁC TÍNH NĂNG VÀ NÂNG CẤP ĐÃ THỰC HIỆN

1. **Light/Dark Mode Toggle (`src/theme-toggle.js`)**:
   - Sử dụng key `gbq_theme` trong `localStorage`.
   - Tự động nhận diện `prefers-color-scheme: light` khi người dùng truy cập lần đầu.
   - Chuyển đổi CSS variables mượt mà với `transition: 0.4s`.
   - Đặt script inline chống nháy trắng/tối (theme flash) trong thẻ `<head>`.
2. **Three.js Scene Lighting Adaptation (`src/three/guitar-scene.js`)**:
   - Thêm hàm `updateSceneLighting(isDark)` điều chỉnh `HemisphereLight` và `DirectionalLight` tăng độ sáng khi chuyển sang nền Light mode, giúp model guitar hiển thị rõ ràng, không bị chìm.
3. **Redesign Header (`index.html` & `src/style.css`)**:
   - Bổ sung biểu tượng Logo Pick đàn Guitar (SVG mark) cạnh thương hiệu.
   - Nav links với animated underline pill indicator khi hover/active.
   - Header luôn giữ lớp kính nổi (`border-b border-glass-border backdrop-blur-xl`) ngay từ đầu trang.
   - Thêm nút chuyển đổi giao diện Sun/Moon ở ngoài cùng bên phải.
   - Bổ sung Mobile Drawer navigation (mở trượt từ phải với hiệu ứng kính mờ).
4. **Redesign Footer (`index.html` & `src/style.css`)**:
   - Bố cục 3 cột có chiều sâu: Cột Brand + Socials, Cột Khám Phá, Cột Liên Hệ & Hỗ Trợ.
   - Hiệu ứng Ambient Glow mờ phía trên chân trang.
   - Dòng bản quyền và chính sách tách biệt phía dưới.
5. **Tinh chỉnh Hero & Card thẩm mỹ**:
   - Chữ Hero: Thay gradient toàn bộ thành gradient 2 màu tinh tế chỉ trên từ khóa "Fingerstyle", các chữ còn lại dùng solid `--text-primary`.
   - Badge "Phiên bản 2.0": Viền mỏng, chữ nhỏ gọn, letter-spacing thoáng hơn và hiệu ứng pulsing dot.
   - Cards: Thêm hiệu ứng "ánh sáng quét qua" (light sweep shimmer `::before`) khi hover + bóng đổ nổi sâu hơn.
   - Thống nhất hệ thống bo góc (`radius-btn: 12px`, `radius-card: 20px`, `radius-container: 28px`).

---

## 3. DANH SÁCH FILE ĐÃ TẠO MỚI / CHỈNH SỬA

- `src/theme-toggle.js` *(MỚI)*: Module quản lý theme dùng chung.
- `src/style.css` *(CẬP NHẬT)*: Thêm bộ token `[data-theme="light"]`, smooth transitions, card shimmer, footer & header CSS.
- `tailwind.config.js` *(CẬP NHẬT)*: Chuyển toàn bộ màu sắc sang CSS Custom Properties `var(...)` để tự động đổi màu theo theme.
- `index.html` *(CẬP NHẬT)*: Cấu trúc Header mới, Hero mới, Footer 3 cột và mobile drawer.
- `src/common.js` *(CẬP NHẬT)*: Cập nhật `initNavbarShrink` và thêm `initMobileMenu`.
- `src/main.js` *(CẬP NHẬT)*: Khởi tạo theme toggle, mobile menu, kết nối scene lighting.
- `src/three/guitar-scene.js` *(CẬP NHẬT)*: Thêm hàm `updateSceneLighting`.
- `src/lib/songs-service.js` & `src/lib/gears-service.js` *(CẬP NHẬT)*: Cung cấp log lỗi chi tiết khi truy vấn Supabase.
- `scripts/migrate-data.js` *(CẬP NHẬT)*: Đọc đúng cấu trúc `collections.songs` và `collections.gears`.

---

## 4. CÁC PLACEHOLDER CẦN BẠN ĐIỀN THẬT (USER ACTION ITEMS)

Bạn có thể mở `index.html` để thay đổi các liên kết và thông tin sau khi có thông tin chính thức:
- [ ] **Social Links** (trong Footer `index.html`):
  - Facebook: `href="#"` -> Đổi thành link Fanpage/Trang cá nhân thật.
  - YouTube: `href="#"` -> Đổi thành link kênh YouTube thật.
  - TikTok: `href="#"` -> Đổi thành link kênh TikTok thật.
- [ ] **Thông tin Liên Hệ** (trong Footer `index.html`):
  - Email: `contact@guitarbyquang.com` -> Đổi thành email thật.
  - Số Hotline / Zalo: `098x xxx xxx` -> Đổi thành số Zalo thật.
- [ ] **Trang Điều Khoản & Chính Sách**: `href="#"` ở chân trang.

---

# MIGRATION NOTES — GIAI ĐOẠN 3 (TRANG KHO TAB, SEARCH/FILTER, MODAL MIỄN PHÍ & THANH TOÁN)

Giai đoạn 3 đã hoàn thành: Xây dựng hoàn chỉnh trang `kho-tab.html` với công cụ tìm kiếm chuẩn tiếng Việt, bộ lọc bài hát động, hiệu ứng Glassmorphism đồng bộ, và 2 modal riêng biệt cho bài Miễn phí và Trả phí.

---

## 1. CÁC TÍNH NĂNG VÀ NÂNG CẤP ĐÃ THỰC HIỆN

1. **Bộ lọc & Tìm kiếm (`src/kho-tab.js`)**:
   - **Search Bar**: Debounce 200ms, hàm `normalizeVietnameseStr` loại bỏ dấu tiếng Việt giúp tìm kiếm linh hoạt không dấu (ví dụ: gõ "thang tu" vẫn ra "Intro tháng 4 là lời nói dối của em"). Hỗ trợ nút xóa nhanh tìm kiếm.
   - **3 Filter Pills**: "Tất cả" / "Trả phí" / "Miễn phí" với hiệu ứng pill active màu `--accent-primary`. Lọc trực tiếp theo trường `is_free`.
   - **Skeleton Loading & Empty State**: Hiệu ứng pulse glass loading khi đang fetch và giao diện empty state thân thiện kèm nút reset bộ lọc khi không có kết quả.
2. **Card bài hát 2 biến thể**:
   - **Card Trả phí**: Hiển thị giá nổi bật (`price_formatted`), Level, Tuning, thời lượng, ghi chú ưu đãi (HSSV). Click mở `#checkout-modal`.
   - **Card Miễn phí**: Thiết kế tối giản, badge "MIỄN PHÍ" xanh ngọc (`--success`), Level, Tuning. Click mở `#free-tab-modal`.
   - Cả 2 đều dùng `.glass-card` + hiệu ứng ánh sáng quét khi hover và Scroll Reveal của GSAP.
3. **Modal Tab Miễn Phí (`#free-tab-modal`)**:
   - Viền và ánh sáng tỏa màu xanh lá (`--success`).
   - Tự động hiển thị `<video controls>` nếu có `has_demo === true` và có file `video_demo` trong `public/assets/`, hoặc hiển thị khối hướng dẫn fallback nếu chưa có file video.
   - Nút dẫn trực tiếp tới link xem/tải tab (`target_url`).
4. **Modal Tab Trả Phí / Chuyển Khoản (`#checkout-modal`)**:
   - Viền và ánh sáng tỏa màu hổ phách (`--accent-primary`).
   - Hiển thị giá tiền, ưu đãi HSSV, thông tin chuyển khoản ngân hàng (MB Bank).
   - Nút Copy nhanh số tài khoản & Cú pháp chuyển khoản kèm Toast thông báo.
   - Nút "Xác nhận qua Zalo" để hoàn tất đơn hàng.
5. **Hệ thống Toast Notification**:
   - Hiển thị thông báo góc dưới màn hình khi người dùng sao chép STK hoặc cú pháp.

---

## 2. DANH SÁCH FILE ĐÃ TẠO MỚI / CHỈNH SỬA

- `kho-tab.html` *(CẬP NHẬT)*: Chuyển từ placeholder sang trang hoàn chỉnh đầy đủ Header/Footer, Search, Filter, 2 Modal, Toast.
- `src/kho-tab.js` *(MỚI)*: Toàn bộ logic tìm kiếm, lọc, render danh sách, xử lý modal và clipboard.
- `src/lib/songs-service.js` *(CẬP NHẬT)*: Bổ sung 2 hàm `fetchAllSongs()` và `fetchSongById(id)`.
- `src/style.css` *(CẬP NHẬT)*: Bổ sung class `.glass-input`, `.filter-pill`, `.modal-open`, `.skeleton-pulse`.

---

## 3. CHECKLIST DÀNH CHO BẠN (USER ACTION ITEMS)

- [ ] **Thông tin Chuyển Khoản** (trong `kho-tab.html` và `src/kho-tab.js`):
  - Số tài khoản MB Bank: Đang để placeholder `0987654321` (ở HTML và hàm copy trong JS). Hãy đổi thành STK thật của bạn.
  - Tên chủ tài khoản: Đang để placeholder `NGUYEN VAN QUANG`.
- [ ] **Link Zalo** (trong `kho-tab.html`):
  - Đang để `href="https://zalo.me/placeholder"`. Hãy đổi thành số điện thoại Zalo của bạn (ví dụ `https://zalo.me/098xxxxxxx`).
- [ ] **Kiểm tra Video Demo trong `public/assets/`**:
  - Đảm bảo các file video (`resg1ctkdemo.mp4`, `noigiolendemo.mp4`, `thangtudemo.mp4`, ...) đã nằm trong `public/assets/` để modal phát video mượt mà.


