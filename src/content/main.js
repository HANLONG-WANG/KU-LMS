/* src/content/main.js */

(() => {
  if (document.documentElement.dataset.kuRedesignBooted === 'true') return;
  document.documentElement.dataset.kuRedesignBooted = 'true';
  bootKulms().catch((error) => {
    console.error('[KU Redesign] boot failed', error);
  });
})();
