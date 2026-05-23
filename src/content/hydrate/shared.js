/* src/content/hydrate/shared.js */

function bindInteractiveHandlers(root, route, view) {
    root.querySelectorAll('[data-action="home-search"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        state.homeSearch = event.target.value;
        rerender();
      });
    });
    root.querySelectorAll('[data-action="select-year"]').forEach((select) => {
      select.addEventListener('change', (event) => submitHomeFilters(event.target.value, root.querySelector('[data-action="select-semester"]')?.value || view.filters.semester));
    });
    root.querySelectorAll('[data-action="select-semester"]').forEach((select) => {
      select.addEventListener('change', (event) => submitHomeFilters(root.querySelector('[data-action="select-year"]')?.value || view.filters.year, event.target.value));
    });
    root.querySelectorAll('[data-action="message-search"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        state.messageSearch = event.target.value;
        rerender();
      });
    });
    root.querySelectorAll('[data-action="today-week"]').forEach((button) => button.addEventListener('click', () => { state.weekOffset = 0; state.currentView.week = getWeekDays(new Date(), state.weekOffset); rerender(); }));
    root.querySelectorAll('[data-action="week-prev"]').forEach((button) => button.addEventListener('click', () => { state.weekOffset -= 1; state.currentView.week = getWeekDays(new Date(), state.weekOffset); rerender(); }));
    root.querySelectorAll('[data-action="week-next"]').forEach((button) => button.addEventListener('click', () => { state.weekOffset += 1; state.currentView.week = getWeekDays(new Date(), state.weekOffset); rerender(); }));
    root.querySelectorAll('[data-action="refresh-upcoming"]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault();
      void startHomeRefresh(view);
    }));
    root.querySelectorAll('[data-action="open-all-upcoming"]').forEach((anchor) => anchor.addEventListener('click', (event) => {
      event.preventDefault();
      void startAllUpcomingCollection(view);
    }));
    root.querySelectorAll('[data-action="toggle-settings"]').forEach((button) => button.addEventListener('click', () => { state.showSettings = !state.showSettings; rerender(); }));
    root.querySelectorAll('[data-setting-key]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      state.myReportColumns[event.target.dataset.settingKey] = event.target.checked;
      rerender();
    }));
    root.querySelectorAll('[data-action="message-select"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      const selection = getMessageSelection(view);
      const id = event.target.dataset.id;
      if (event.target.checked) selection.add(id); else selection.delete(id);
      syncNativeMessageSelection(view);
      rerender();
    }));
    root.querySelectorAll('[data-action="message-select-all"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      const selection = getMessageSelection(view);
      const checked = event.target.checked;
      if (checked) {
        view.rows.forEach((row) => selection.add(row.id));
      } else {
        selection.clear();
      }
      syncNativeMessageSelection(view);
      rerender();
    }));
    root.querySelectorAll('[data-action="message-native-action"]').forEach((button) => button.addEventListener('click', () => triggerNativeMessageAction(button.dataset.nativeActionName, view)));
    root.querySelectorAll('[data-message-js]').forEach((anchor) => anchor.addEventListener('click', (event) => {
      event.preventDefault();
      executeMessageHref(anchor.dataset.messageJs, view);
    }));
    root.querySelectorAll('[data-action="message-detail-forward"]').forEach((button) => button.addEventListener('click', () => triggerMessageDetailForward(root, view)));
    root.querySelectorAll('.ku-rightnav-link[href^="#"]').forEach((anchor) => anchor.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.getElementById(anchor.getAttribute('href').slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    root.querySelectorAll('[data-syllabus-title]').forEach((anchor) => anchor.addEventListener('click', async (event) => {
      event.preventDefault();
      await handleSyllabusNavigation(anchor);
    }));
  }

function triggerNativeMessageAction(name, view) {
    syncNativeMessageSelection(view);
    const form = view.form;
    if (!form) return;
    const button = form.querySelector(`[name="${name}"]`);
    if (!button) return;
    if (!getMessageSelection(view).size) {
      window.alert('メッセージを選択してください');
      return;
    }
    button.click();
  }

function executeMessageHref(href, view) {
    const matchSort = href.match(/sortMessageListTable\('([^']+)'\)/);
    if (matchSort && typeof window.sortMessageListTable === 'function') {
      window.sortMessageListTable(matchSort[1]);
      return;
    }
    const matchChangePage = href.match(/changePage\('([^']+)'\)/);
    if (matchChangePage && typeof window.changePage === 'function') {
      window.changePage(matchChangePage[1]);
      return;
    }
    if (href && href !== '#') window.location.href = href;
  }

function submitHomeFilters(year, semester) {
    const form = document.forms.condition;
    if (!form) return;
    const yearSelect = form.querySelector('select[name="year"]');
    const semesterSelect = form.querySelector('select[name="semester"]');
    if (yearSelect) yearSelect.value = year;
    if (semesterSelect) semesterSelect.value = semester;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }

function syncNativeMessageSelection(view) {
    if (!view.form) return;
    const selection = getMessageSelection(view);
    view.rows.forEach((row) => {
      const input = view.form.elements[row.inputName];
      if (input) input.checked = selection.has(row.id);
    });
    const master = view.form.elements.autochecker;
    if (master) master.checked = allSelected(view.rows);
  }

function triggerMessageDetailForward(root, view) {
    if (!view?.forward?.form) return;
    const input = root.querySelector('[data-action="message-detail-forward-input"]');
    const nativeInput = view.forward.form.querySelector(`input[name="${view.forward.inputName}"]`);
    const nativeButton = view.forward.form.querySelector(`input[type="submit"][name="${view.forward.buttonName}"]`);
    if (nativeInput) nativeInput.value = input?.value || '';
    if (nativeButton) nativeButton.click();
    else if (typeof view.forward.form.requestSubmit === 'function') view.forward.form.requestSubmit();
    else view.forward.form.submit();
  }
