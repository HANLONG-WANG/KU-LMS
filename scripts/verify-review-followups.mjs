import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/content/main.js', 'utf8');

function extractFunction(name) {
  const patterns = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const pattern of patterns) {
    start = source.indexOf(pattern);
    if (start !== -1) break;
  }
  if (start === -1) throw new Error(`Function not found: ${name}`);
  let brace = 0;
  let seenOpen = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      brace += 1;
      seenOpen = true;
    } else if (char === '}') {
      brace -= 1;
      if (seenOpen && brace === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract function: ${name}`);
}

const redirects = [];
const sandbox = {
  console,
  encodeURIComponent,
  redirects,
  document: { documentElement: { dataset: {} } },
  window: {
    name: '__KU_SYLLABUS_AUTO__pending',
    location: {
      replace(url) {
        redirects.push(url);
      }
    }
  }
};
vm.createContext(sandbox);

for (const name of [
  'inferMaterialType',
  'shortenCourseTitle',
  'parseAnnouncementDueDate',
  'parseUpcomingFromAnnouncements',
  'normalizeSyllabusCourseQuery',
  'normalizeSyllabusInstructorName',
  'clearPendingSyllabusNavigation',
  'buildSyllabusDetailUrl',
  'resolveSyllabusCandidateByCourseCode',
  'autoResolveSyllabusResult'
]) {
  vm.runInContext(extractFunction(name), sandbox, { filename: 'src/content/main.js' });
}
vm.runInContext(`
  globalThis.loadSyllabusCourseCodeViaFrame = async (detailUrl) => {
    if (detailUrl.includes('UJikanwari_cd=ID2')) return 'ABCD1234';
    return '';
  };
`, sandbox);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  source.includes('upcomingAnnouncementSource = fetchedAnnouncements;')
    && source.includes('parseUpcomingFromAnnouncements(upcomingAnnouncementSource, view.schedule.entries, view.filters.year)'),
  'Homepage upcoming aggregation is not wired to the full fetched announcements source'
);
assert(
  source.includes('function normalizeSyllabusInstructorName(name = \'\')')
    && source.includes('const normalizedInstructor = normalizeSyllabusInstructorName(pending.instructor || \'\');')
    && source.includes('normalizedInstructor: normalizeSyllabusInstructorName(cells[2] || \'\')'),
  'Instructor normalization is still coupled to course-title normalization'
);

const items = [
  { title: '一般連絡 05/20 09:00-10:00', source: '未対応コースA', href: '/n1' },
  { title: '一般連絡 05/19 09:00-10:00', source: '未対応コースB', href: '/n2' },
  { title: '一般連絡 05/18 09:00-10:00', source: '未対応コースC', href: '/n3' },
  { title: '一般連絡 05/17 09:00-10:00', source: '未対応コースD', href: '/n4' },
  { title: '一般連絡 05/16 09:00-10:00', source: '未対応コースE', href: '/n5' },
  { title: '第6回レポート 05/10 09:00-12:00', source: '経済学', href: '/n6' }
];
const scheduleEntries = [{ title: '経済学 (2026-前期)', href: '/webclass/course.php/26170340/' }];
const upcomingFromAll = sandbox.parseUpcomingFromAnnouncements(items, scheduleEntries, '2026');
assert(upcomingFromAll.length === 1, 'Upcoming parser should retain a matching due item beyond the fifth notice');
assert(upcomingFromAll[0].courseHref === '/webclass/course.php/26170340/', 'Upcoming parser should map matched notice back to course href');
assert(sandbox.parseUpcomingFromAnnouncements(items.slice(0, 5), scheduleEntries, '2026').length === 0, 'Control case should show why preview truncation used to lose the sixth notice');

const courseCodeResolved = await sandbox.resolveSyllabusCandidateByCourseCode([
  { id: 'ID1', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学', normalizedInstructor: '佐藤 花子' },
  { id: 'ID2', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学', normalizedInstructor: '田中 太郎' }
], { title: '経済学', year: '2026', courseCode: 'ABCD1234' });
assert(courseCodeResolved.includes('UJikanwari_cd=ID2'), 'Course-code disambiguation should still resolve multi-candidate syllabus matches');

await sandbox.autoResolveSyllabusResult({
  title: '経済学',
  year: '2026',
  instructor: '田中 太郎',
  courseCode: ''
}, [
  { id: 'ID1', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学', normalizedInstructor: '佐藤 花子' },
  { id: 'ID2', year: '2026', query: '経済学', title: '経済学', normalizedTitle: '経済学', normalizedInstructor: '田中 太郎' }
]);
assert(redirects.length === 1, 'Instructor-filtered single syllabus candidate should redirect');
assert(redirects[0].includes('UJikanwari_cd=ID2'), 'Instructor-filtered redirect should use the remaining candidate detail URL');
assert(sandbox.document.documentElement.dataset.kuSyllabusAssist === 'redirect-instructor', 'Assist state should record instructor-based redirect');
assert(sandbox.window.name === '', 'Pending syllabus navigation marker should clear after redirect');

const report = {
  ok: true,
  checks: [
    'source-wiring-full-announcements',
    'upcoming-parser-keeps-sixth-notice-deadline',
    'instructor-normalization-decoupled-from-course-title-normalization',
    'course-code-disambiguation-still-works',
    'instructor-single-candidate-auto-redirect'
  ]
};

fs.mkdirSync('.omx/artifacts/review-followups', { recursive: true });
fs.writeFileSync('.omx/artifacts/review-followups/verification-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
