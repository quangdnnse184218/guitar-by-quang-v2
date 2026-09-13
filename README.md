# Guitar By Quang

Nền tảng học guitar fingerstyle tiếng Việt: kho video tab, công cụ luyện tập và
hệ thống bán tab **tự động hoá hoàn toàn** — từ lúc khách quét mã QR chuyển
khoản đến lúc khách xem được video tab trên Google Drive, không cần một thao
tác thủ công nào của quản trị viên.

🔗 **Đang chạy tại:** [quang-v2.vercel.app](https://quang-v2.vercel.app)

---

## Mục lục

- [Điểm đáng chú ý về kỹ thuật](#điểm-đáng-chú-ý-về-kỹ-thuật)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Luồng thanh toán tự động](#luồng-thanh-toán-tự-động)
- [Xác minh thẻ học sinh/sinh viên bằng AI](#xác-minh-thẻ-học-sinhsinh-viên-bằng-ai)
- [Bảo mật](#bảo-mật)
- [Kiến trúc](#kiến-trúc)
- [Chạy dự án ở máy local](#chạy-dự-án-ở-máy-local)
- [Các quyết định kỹ thuật và lý do](#các-quyết-định-kỹ-thuật-và-lý-do)

---

## Điểm đáng chú ý về kỹ thuật

| | |
|---|---|
| **Thanh toán tự động** | Webhook ngân hàng (SePay) xác thực bằng HMAC-SHA256, chống replay, tự cấp quyền xem file Google Drive và gửi email báo đơn |
| **Bảo mật chủ động** | Row-Level Security ở tầng database, chống user enumeration, chống XSS lưu trữ, chống dò tài khoản qua thời gian phản hồi |
| **Kiểm thử bất biến bảo mật** | 17 test tự động khoá lại các quy tắc bảo mật quan trọng, chạy trong CI mỗi lần push |
| **AI có kiểm soát** | Xác minh ảnh thẻ HSSV bằng Gemini để tự động giảm giá, có chống IDOR và kiểm tra quyền sở hữu đơn hàng |
| **Tối ưu mobile-first** | Toàn bộ giao diện thiết kế cho người Việt dùng điện thoại, mạng yếu — không SPA, không hydration |

---

## Công nghệ sử dụng

**Frontend**
- Vite (multi-page application — 13 trang HTML độc lập, không phải SPA)
- Vanilla JavaScript (ES Modules), không framework
- Tailwind CSS
- Three.js (mô hình guitar 3D ở trang chủ), GSAP + ScrollTrigger (animation)

**Backend & hạ tầng**
- Supabase: PostgreSQL, Authentication, Row-Level Security, Storage, Edge Functions (Deno)
- Google Apps Script (cấp quyền Google Drive tự động)
- SePay (webhook biến động số dư ngân hàng)
- Brevo (email giao dịch)
- Google Gemini (xác minh ảnh thẻ HSSV)
- Vercel (hosting + CI/CD)

**Chất lượng code**
- Vitest + jsdom (unit test)
- ESLint + Prettier
- GitHub Actions: lint → test → build mỗi lần push

---

## Luồng thanh toán tự động

Đây là phần phức tạp nhất của dự án. Toàn bộ quy trình dưới đây diễn ra trong
vài giây và **không cần quản trị viên can thiệp**:

```mermaid
sequenceDiagram
    participant K as Khách hàng
    participant W as Website
    participant DB as Supabase
    participant NH as Ngân hàng / SePay
    participant EF as Edge Function<br/>sepay-ipn
    participant GAS as Google Apps Script
    participant M as Email admin

    K->>W: Bấm mua một bản tab
    W->>DB: Tạo đơn hàng (mã DH######, trạng thái "chờ")
    W->>K: Hiện mã QR VietQR + nội dung chuyển khoản
    K->>NH: Quét QR và chuyển khoản
    NH->>EF: Webhook "biến động số dư"
    EF->>EF: Xác thực chữ ký HMAC-SHA256<br/>(so sánh timing-safe)
    EF->>DB: Tìm đơn "chờ" khớp mã + đối chiếu số tiền
    EF->>DB: Đánh dấu đã thanh toán (compare-and-set, chống replay)
    EF->>DB: Ghi quyền sở hữu vào bảng purchases
    par Chạy nền sau khi đã trả lời webhook
        EF->>GAS: Cấp quyền xem file Drive cho email khách
    and
        EF->>M: Gửi email báo đơn mới
    end
    K->>W: Tải lại trang — tab đã mở khoá
```

**Các vấn đề đã xử lý trong luồng này:**

- **Chống giả mạo webhook:** mọi request phải có chữ ký HMAC-SHA256 hợp lệ,
  so sánh bằng thuật toán timing-safe để không lộ thông tin qua thời gian xử lý.
- **Chống xử lý trùng (replay):** việc đánh dấu đơn đã thanh toán dùng
  compare-and-set trên trạng thái `pending`, nên webhook bị gửi lại nhiều lần
  cũng chỉ cấp quyền đúng một lần.
- **Chống gian lận số tiền:** số tiền của đơn hàng được ràng buộc ở tầng
  database phải khớp đúng giá bài hát, khách không thể tự tạo đơn giá rẻ.
- **Không chặn phản hồi webhook:** việc cấp quyền Drive và gửi email chạy nền
  bằng `EdgeRuntime.waitUntil` sau khi đã trả lời SePay, tránh timeout.
- **Có đường lùi thủ công:** nếu khách chuyển khoản sai nội dung, quản trị viên
  có hàng đợi "đơn chưa hoàn tất" để xử lý bằng một cú bấm, kèm ghi lại lý do
  và người thực hiện.

---

## Xác minh thẻ học sinh/sinh viên bằng AI

Khách là học sinh/sinh viên được giảm giá. Thay vì bắt quản trị viên duyệt tay
từng ảnh thẻ, hệ thống tự xử lý:

1. Khách tải ảnh thẻ lên bucket riêng tư, mỗi người chỉ ghi/đọc được đúng thư
   mục mang ID của mình.
2. Edge Function kiểm tra **ảnh có đúng nằm trong thư mục của người gọi không**
   (chống IDOR) và **đơn hàng có đúng của người đó không**.
3. Gemini đọc ảnh, trả về JSON: có phải thẻ HSSV thật không, năm hiệu lực còn
   hạn không.
4. Nếu đạt, hệ thống tự hạ số tiền của đơn xuống mức giá HSSV để webhook ngân
   hàng đối chiếu đúng số tiền thấp hơn.

Giới hạn đã biết và chấp nhận có chủ đích: hệ thống chỉ xác minh *thẻ hợp lệ*,
không đối chiếu danh tính chủ thẻ với người mua. Rủi ro tài chính tối đa là
phần chênh lệch giảm giá của một đơn, nên không đáng đánh đổi bằng eKYC.

---

## Bảo mật

Dự án được tự kiểm thử xâm nhập và vá các lỗ hổng tìm được. Một số ví dụ:

| Lỗ hổng | Cách khai thác | Cách vá |
|---|---|---|
| **Ghi đè dữ liệu** | RLS chỉ kiểm tra "đã đăng nhập", nên bất kỳ tài khoản thường nào cũng gọi được API sửa giá bài hát | Policy yêu cầu đúng vai trò admin |
| **Gian lận giá** | Client tự gửi số tiền khi tạo đơn → mua tab 239k với giá 1k | Ràng buộc số tiền phải khớp giá trong bảng `songs` |
| **XSS lưu trữ** | Đặt tên hiển thị là `<img onerror=...>` → chạy mã khi người khác mở menu | Escape toàn bộ dữ liệu người dùng trước khi render |
| **Lộ tài khoản hợp lệ** | Trang đăng nhập admin trả thông báo khác nhau cho "sai mật khẩu" và "đúng mật khẩu nhưng không phải admin" → dùng để dò danh sách rò rỉ | Gộp về một thông báo chung duy nhất |
| **Dò qua thời gian phản hồi** | Nhánh bị chặn mất nhiều lệnh gọi hơn nên phản hồi chậm hơn, dù thông báo giống nhau | Đệm mọi nhánh thất bại về cùng một mốc thời gian tối thiểu |

**Các bất biến bảo mật được khoá bằng test tự động** (chạy trong CI):

- Tài khoản admin không đăng nhập được qua cổng thành viên, và thông báo từ
  chối phải **giống hệt** thông báo sai mật khẩu.
- Luồng quên mật khẩu luôn trả về cùng một thông báo dù email có tồn tại hay
  không (chống user enumeration — CWE-204).
- Tài khoản thường bị từ chối ở cổng quản trị mà không để lộ lý do.

Ngoài ra: khoá bí mật (API key, secret webhook) lưu trong bảng chỉ service role
đọc được, không nhúng vào mã nguồn client; toàn bộ bảng đều bật Row-Level
Security với policy theo từng người dùng.

---

## Kiến trúc

```
├── *.html                  13 trang độc lập (multi-page, mỗi trang một entry Vite)
├── src/
│   ├── main.js             Trang chủ (hero 3D, bài nổi bật)
│   ├── kho-tab.js          Kho video tab: tìm kiếm, lọc, yêu thích, thanh toán
│   ├── user-dashboard.js   Trang cá nhân: tab đã mua, yêu thích, hồ sơ
│   ├── admin-dashboard.js  Điều phối trang quản trị
│   ├── luyen-cam-am.js     Game luyện cảm âm có bảng xếp hạng
│   ├── metronome.js        Máy gõ nhịp
│   ├── common.js           Header, menu, modal quên mật khẩu dùng chung
│   ├── admin/              Module quản trị tách nhỏ (songs, gears, users, tổng quan)
│   └── lib/                Tầng truy cập dữ liệu + tiện ích dùng chung
├── supabase/functions/     4 Edge Function (Deno)
│   ├── sepay-ipn/          Webhook ngân hàng → cấp quyền tự động
│   ├── verify-hssv-card/   Xác minh thẻ HSSV bằng AI
│   ├── admin-grant-access/ Cấp quyền thủ công + cấp Drive
│   └── check-email-domain/ Kiểm tra domain email tồn tại khi đăng ký
└── tests/                  Test cho các bất biến bảo mật
```

**Cơ sở dữ liệu:** `songs`, `gears`, `profiles`, `orders`, `purchases`,
`favorites`, `redemption_codes`, `app_secrets`, `cam_am_leaderboard`,
`cam_am_players` — tất cả đều bật RLS.

**Logic nghiệp vụ nhạy cảm** (cấp quyền, thống kê doanh thu, xoá người dùng)
đặt trong PostgreSQL function `SECURITY DEFINER` có tự kiểm tra vai trò admin
bên trong, thay vì tin vào việc client có gọi đúng hay không.

---

## Chạy dự án ở máy local

```bash
git clone https://github.com/quangdnnse184218/guitar-by-quang-v2.git
cd guitar-by-quang-v2
npm install
cp .env.local.example .env.local   # điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY
npm run dev
```

| Lệnh | Công dụng |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` | Build production vào `dist/` |
| `npm run test` | Chạy test |
| `npm run lint` | Kiểm tra code |
| `npm run format` | Format code bằng Prettier |

---

## Các quyết định kỹ thuật và lý do

**Vì sao dùng multi-page thay vì SPA (React/Vue)?**
Người dùng chính là người Việt vào bằng điện thoại, nhiều người mạng yếu. Mỗi
trang ở đây là một trang nội dung độc lập (trang chủ, kho tab, công cụ) chứ
không phải một ứng dụng có trạng thái phức tạp. Multi-page cho HTML tĩnh sẵn
sàng ngay, không tốn thời gian hydration, tốt cho SEO — vốn là kênh tìm kiếm
chính của người học guitar. Cái giá phải trả là phải tự quản lý phần dùng
chung giữa các trang, nên header/auth/modal được gom vào `src/common.js`.

**Vì sao đặt logic quan trọng trong database function thay vì ở backend?**
Supabase để lộ REST API trực tiếp ra client, nên "backend" thật sự chính là
database. Đặt kiểm tra quyền trong RLS policy và `SECURITY DEFINER` function
nghĩa là dù kẻ tấn công gọi thẳng API bỏ qua giao diện thì vẫn bị chặn — đây là
bài học rút ra sau khi tự kiểm thử xâm nhập và phát hiện giao diện ẩn nút
không hề là một lớp bảo mật.

**Vì sao webhook lại tin cậy được?**
Vì endpoint webhook là công khai, nên nó không tin request đến từ đâu mà chỉ
tin chữ ký HMAC tính từ secret dùng chung. Cộng thêm ràng buộc số tiền ở
database và compare-and-set chống replay, một request giả mạo không thể tạo
ra quyền sở hữu.

**Vì sao cấp quyền Drive bằng Google Apps Script?**
Nội dung trả phí là video đặt trên Google Drive. Dùng Apps Script làm cầu nối
cho phép cấp quyền theo email khách mà không phải quản lý OAuth service
account phức tạp, đổi lại phải tự bảo vệ endpoint đó bằng secret riêng.
