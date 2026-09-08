/**
 * State dùng chung giữa các module con của admin-dashboard (songs, gears,
 * users/grant). Đây là object mutable đơn giản thay vì export từng biến
 * `let` riêng lẻ — export `let` không cho phép module khác gán lại giá trị
 * (chỉ đọc được bản snapshot tại thời điểm import), nên phải gom vào 1 object
 * rồi gán qua field (`state.songsList = ...`) để mọi module luôn thấy giá trị
 * mới nhất.
 */
export const state = {
  songsList: [],
  gearsList: [],
  usersList: [],
  recentGrantsList: [],
  currentAdminId: null,

  activeTab: 'songs', // 'songs' | 'gears' | 'users' | 'grant'
  songSearchQuery: '',
  songCategoryFilter: 'all',
  songTypeFilter: 'all',

  userSearchQuery: '',
  userSortBy: 'newest',
}
