/* src/content/main.js */

(() => {
  if (document.documentElement.dataset.kuRedesignBooted === 'true') return;
  document.documentElement.dataset.kuRedesignBooted = 'true';
  bootKulms();
})();
