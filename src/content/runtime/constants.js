/* src/content/runtime/constants.js */

var ROOT_ID = 'ku-redesign-root';
var COURSE_UPCOMING_CACHE_KEY = 'ku-redesign-course-upcoming-v1';
var HOME_REFRESH_STATE_KEY = 'ku-redesign-home-refresh-v1';
var HOME_REFRESH_MAX_AGE_MS = 5 * 60 * 1000;
var HOME_REFRESH_STALL_MS = 45 * 1000;
var HOME_REFRESH_MAX_RESTORE_ATTEMPTS = 2;
var PERIOD_TIMES = {
  '1限': '08:50–10:20',
  '2限': '10:30–12:00',
  '3限': '13:00–14:30',
  '4限': '14:40–16:10',
  '5限': '16:20–17:50',
  '6限': '18:00–19:30',
  '7限': '19:40–21:10',
  '8限': '21:20–22:50'
};
var DAY_LABELS = ['月', '火', '水', '木', '金', '土'];
var DAY_NAMES = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
