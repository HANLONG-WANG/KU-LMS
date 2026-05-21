/* src/content/runtime/boot-syllabus.js */

function bootSyllabus() {
  if (isSyllabusDetailRoute(window.location)) {
    document.documentElement.dataset.kuSyllabusRedesignState = 'booting';
    mountSyllabusDetailBootShell();
    const run = () => initSyllabusDetailRedesign();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
    return;
  }
  mountSyllabusAssistOverlay();
  initSyllabusAssist();
}
