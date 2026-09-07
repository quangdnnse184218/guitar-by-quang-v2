# guitar-by-quang-v2

Website học guitar tiếng Việt: kho tab, công cụ, metronome, tài khoản người dùng
và trang quản trị (admin dashboard). Backend dùng Supabase (auth + Postgres).

## Stack
- **Build**: Vite — đây là **multi-page app** (không phải SPA), mỗi trang là
  một cặp `*.html` + `src/*.js` riêng, khai báo entry trong [vite.config.js](vite.config.js).
- **UI**: Tailwind CSS ([tailwind.config.js](tailwind.config.js)), vanilla JS (không framework).
- **3D/Animation**: Three.js (`src/three/`), GSAP + ScrollTrigger (`src/animations/`).
- **Backend**: Supabase — client init trong `src/lib/`, dùng `VITE_SUPABASE_URL`
  và `VITE_SUPABASE_ANON_KEY` (xem `.env.local.example`).

## Lệnh thường dùng
```bash
npm run dev       # dev server (Vite)
npm run build     # build production vào dist/
npm run preview   # preview bản build
```

## Cấu trúc trang (HTML ↔ JS)
| Trang | JS tương ứng | Ghi chú |
|---|---|---|
| `index.html` | `src/main.js` | Trang chủ, hero 3D guitar |
| `login.html` / `register.html` | `src/login.js` / `src/register.js` | Auth người dùng |
| `admin-login.html` | `src/admin-login.js` | Auth riêng cho admin |
| `user-dashboard.html` | `src/user-dashboard.js` | Dashboard người dùng |
| `admin-dashboard.html` | `src/admin-dashboard.js` | Quản trị songs/gears/users |
| `kho-tab.html` | `src/kho-tab.js` | Kho tab bài hát |
| `cong-cu.html` | `src/cong-cu.js` | Công cụ (tools) |
| `metronome.html` | `src/metronome.js` | Metronome |
| `reset-password.html` / `admin-reset-password.html` | tương ứng | Reset mật khẩu user/admin |

## Bảo mật — lưu ý quan trọng
Lịch sử commit cho thấy dự án đã từng vá các lỗi bảo mật cụ thể, cần giữ nguyên
tinh thần đó khi sửa code liên quan đến auth:
- **Chống user enumeration (CWE-204)**: thông báo lỗi ở flow forgot-password
  (cả user & admin) phải giống nhau dù email tồn tại hay không.
- **Ẩn danh tính admin**: không được để lộ việc một tài khoản là admin qua
  login/forgot-password của member.
- **Admin không đăng nhập được qua cổng member.**

Khi sửa các file `*login*`, `*reset-password*`, hoặc `admin-dashboard.js`, kiểm
tra lại các bất biến trên trước khi commit.

## Biến môi trường
- `.env.local` (không commit) chứa `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  và có thể có `SUPABASE_SERVICE_ROLE_KEY` (dùng cho script migrate, KHÔNG được
  bundle vào client code vì đây là secret key thật sự — chỉ anon key mới an toàn
  để lộ ra client).
- `scripts/migrate-data.js` đọc `DATA-EXPORT.json` để nạp dữ liệu songs/gears
  vào Supabase — xem [MIGRATION-NOTES.md](MIGRATION-NOTES.md) để hiểu format dữ liệu
  (`collections.songs` / `collections.gears`, không phải root-level).

## Quy ước
- Không dùng framework (React/Vue) — giữ vanilla JS theo đúng kiến trúc hiện tại.
- Mỗi trang HTML tự quản lý JS riêng, tránh tạo global state dùng chung giữa
  các trang trừ khi thực sự cần thiết.
- Không có tài khoản: `/cua-toi.html` đã bị xoá (2026-09) — nút "Trang Của Tôi"
  cho khách chưa đăng nhập trỏ thẳng tới `/login.html`.

## Header/Nav — PHẢI giữ đồng bộ giữa các trang
`index.html`, `kho-tab.html`, `cong-cu.html`, `metronome.html` dùng **chung một
khối header** (copy-paste, không phải component — dự án không dùng framework):
logo ảnh avatar + tagline, nav 5 mục, và 2 container quan trọng:
- `#desktop-auth-container` / `#mobile-auth-container`: chứa nút Đăng ký/Đăng
  nhập mặc định (guest). `src/common.js` (`initAuthHeader`, tự chạy khi
  `DOMContentLoaded`) sẽ tự thay nội dung 2 container này bằng dropdown avatar
  khi người dùng đã đăng nhập — **KHÔNG xoá hay đổi id của 2 container này**,
  nếu không trang sẽ không hiện được trạng thái đăng nhập.
- `#main-nav`, `#desktop-nav`, `#mobile-menu-btn/-backdrop/-drawer/-close`:
  cần cho `initNavbarShrink`/`initMobileMenu` trong `common.js`.

Khi thêm trang mới hoặc sửa header, copy nguyên khối từ `kho-tab.html` rồi chỉ
đổi `class="nav-link active"` sang mục tương ứng — tránh lặp lại lỗi từng xảy
ra ở `cong-cu.html`/`metronome.html` (header cũ, thiếu nút đăng nhập, logo
lệch thương hiệu) đã được đồng bộ lại vào 2026-09.
