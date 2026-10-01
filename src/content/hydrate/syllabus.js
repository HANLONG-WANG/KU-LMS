/* src/content/hydrate/syllabus.js */

function hydrateSyllabusDetail(root) {
    if (state.syllabusRightNavCleanup) state.syllabusRightNavCleanup();
    state.syllabusRightNavCleanup = bindSectionNavigation(root);
  }
