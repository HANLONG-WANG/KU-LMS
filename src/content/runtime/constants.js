/* src/content/runtime/constants.js */

var ROOT_ID = 'ku-redesign-root';
var SYLLABUS_ROOT_ID = 'ku-syllabus-root';
var COURSE_UPCOMING_CACHE_KEY = 'ku-redesign-course-upcoming-v1';
var HOME_REFRESH_STATE_KEY = 'ku-redesign-home-refresh-v1';
var ALL_UPCOMING_STATE_KEY = 'ku-redesign-all-upcoming-v1';
var ALL_UPCOMING_ROUTE_HASH = '#ku-all-upcoming';
var HOME_REFRESH_MAX_AGE_MS = 5 * 60 * 1000;
var HOME_REFRESH_STALL_MS = 45 * 1000;
var HOME_REFRESH_MAX_RESTORE_ATTEMPTS = 2;
var ALL_UPCOMING_MAX_AGE_MS = 15 * 60 * 1000;
var ALL_UPCOMING_STALL_MS = 60 * 1000;
var ALL_UPCOMING_MAX_RESTORE_ATTEMPTS = 2;
var ALL_UPCOMING_WINDOW_DAYS = 7;
var PERIOD_TIMES = {
  '1限': '09:00–10:30',
  '2限': '10:40–12:10',
  '3限': '13:00–14:30',
  '4限': '14:40–16:10',
  '5限': '16:20–17:50'
};
var DAY_LABELS = ['月', '火', '水', '木', '金', '土'];
var DAY_NAMES = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
