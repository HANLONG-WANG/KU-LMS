import vm from 'node:vm';
import { readKulmsSource, extractFunction, assert } from './lib/content-source.mjs';

const source = readKulmsSource();

for (const name of ['parseCourseMeta', 'parseCourseScores', 'renderCourseScores', 'renderCourseHeader', 'buildCourseScoresView']) {
  assert(extractFunction(source, name).length > 0, `Grades-tab contract missing function: ${name}`);
}

assert(source.includes("name: 'course-scores'"), 'Route support for course-scores should be present.');
assert(source.includes("currentTab: 'scores'"), 'Score route view should mark the active tab as scores.');
assert(source.includes("course.links.scores"), 'Course header should render a 成績 tab from the parsed score link.');
assert(source.includes("course.links.testResults"), 'Course header should render a テスト結果 tab from the parsed native link.');
assert(source.includes('summaryOption[dateRangeStart]'), 'Score parser/render should preserve the native dateRangeStart field.');
assert(source.includes('summaryOption[dateRangeEnd]'), 'Score parser/render should preserve the native dateRangeEnd field.');
assert(source.includes("name=\"showdata\""), 'Score renderer should preserve the native showdata radio field.');

const sourceWithoutEntrypoint = source.replace(/\/\* FILE: src\/content\/main\.js \*\/[\s\S]*$/m, '');
const context = {
  console,
  URL,
  URLSearchParams,
  window: {
    location: {
      href: 'https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/scores',
      origin: 'https://kulms.tl.kansai-u.ac.jp',
      pathname: '/webclass/course.php/26170340/scores',
      search: ''
    }
  },
  location: null
};
context.location = context.window.location;
vm.createContext(context);
vm.runInContext(sourceWithoutEntrypoint, context);

const detected = context.detectRoute(new URL('https://kulms.tl.kansai-u.ac.jp/webclass/course.php/26170340/scores'));
assert(detected.supported && detected.name === 'course-scores', 'detectRoute() should recognize /scores as course-scores.');

console.log(JSON.stringify({
  ok: true,
  checks: [
    'course-scores-route-supported',
    'course-grades-parser-present',
    'course-grades-render-present',
    'course-header-tabs-extended',
    'native-score-form-fields-preserved'
  ]
}, null, 2));
