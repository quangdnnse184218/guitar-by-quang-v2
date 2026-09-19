/**
 * State dùng chung giữa các module con của admin-dashboard (songs, gears,
 * users, đơn hàng, cấp quyền...). Đây là object mutable đơn giản thay vì
 * export từng biến `let` riêng lẻ — export `let` không cho phép module khác gán
 * lại giá trị (chỉ đọc được bản snapshot tại thời điểm import), nên phải gom
 * vào 1 object rồi gán qua field (`state.songsList = ...`) để mọi module luôn
 * thấy giá trị mới nhất.
 */
export const state = {
  songsList: [],
  gearsList: [],
  usersList: [],
  recentGrantsList: [],
  currentAdminId: null,
  // Hồ sơ của chính admin đang đăng nhập (full_name, avatar_url, ...) — nạp một
  // lần khi vào trang, cập nhật lại sau khi sửa ở trang Cài đặt.
  adminProfile: null,

  // Route đang mở — đặt bởi router (xem src/admin/router.js để biết danh sách).
  activeTab: 'tong-quan',
  songSearchQuery: '',
  songCategoryFilter: 'all',
  songTypeFilter: 'all',

  userSearchQuery: '',
  userSortBy: 'newest',

  // Dữ liệu chuyển từ trang này sang trang Cấp quyền thủ công (bấm "Cấp quyền"
  // ở đơn chờ hoặc ở hồ sơ thành viên). Trang Cấp quyền đọc rồi xoá đi.
  // Dạng: { userId, songId?, reason?, note? }
  grantPrefill: null,
}
