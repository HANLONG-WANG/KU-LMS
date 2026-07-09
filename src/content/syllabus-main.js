/* src/content/syllabus-main.js */

(() => {
  if (document.documentElement.dataset.kuSyllabusAssistBooted === 'true') return;
  document.documentElement.dataset.kuSyllabusAssistBooted = 'true';
  bootSyllabus().catch((error) => {
    console.warn('[KU Redesign] syllabus boot failed', error);
  });
})();
