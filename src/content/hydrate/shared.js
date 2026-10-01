/* src/content/hydrate/shared.js */

function bindInteractiveHandlers(root, route, view) {
    if (typeof kuBindTodos === 'function') kuBindTodos(root, route, view);
    root.querySelectorAll('[data-action="home-search"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        state.homeSearch = event.target.value;
        const results = root.querySelector('[data-home-course-results]');
        if (results) {
          results.innerHTML = renderHomeOtherCourses(view);
          bindSyllabusTitleLinks(results);
        }
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
        const visibleIds = new Set(getVisibleMessageRows(view).map((row) => row.id));
        const selection = getMessageSelection(view);
        for (const id of selection) {
          if (!visibleIds.has(id)) selection.delete(id);
        }
        syncNativeMessageSelection(view);
        refreshMessageResults(root, view);
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
    bindMessageResultHandlers(root, view);
    root.querySelectorAll('[data-action="message-native-action"]').forEach((button) => button.addEventListener('click', () => triggerNativeMessageAction(button.dataset.nativeActionName, view)));
    root.querySelectorAll('[data-action="message-detail-forward"]').forEach((button) => button.addEventListener('click', () => triggerMessageDetailForward(root, view)));
    bindSyllabusTitleLinks(root);
    bindCourseSectionToggles(root);
    if (state.routeRightNavCleanup) state.routeRightNavCleanup();
    state.routeRightNavCleanup = bindSectionNavigation(root);
    if (state.lmsLinkNavigationCleanup) state.lmsLinkNavigationCleanup();
    state.lmsLinkNavigationCleanup = bindLmsLinkNavigation(root);
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
    if (typeof withNativeInteraction === 'function') withNativeInteraction(button, () => button.click());
    else button.click();
  }

function executeMessageHref(href, view) {
    if (!href || href === '#') return;
    const anchor = Array.from(document.querySelectorAll('a[href]')).find((item) => {
      if (item.closest('#' + ROOT_ID)) return false;
      return item.getAttribute('href') === href || item.href === href;
    });
    if (anchor) {
      if (typeof withNativeInteraction === 'function') withNativeInteraction(anchor, () => anchor.click());
      else anchor.click();
      return;
    }
    // A page-world JavaScript URL cannot safely be evaluated in a content script.
    if (!/^javascript:/i.test(href)) window.location.href = href;
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

function refreshMessageResults(root, view) {
    const host = root.querySelector('[data-message-results]');
    if (!host) return;
    host.innerHTML = renderMessageResults(view);
    bindMessageResultHandlers(host, view);
  }

function bindMessageResultHandlers(root, view) {
    root.querySelectorAll('[data-action="message-select"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      const selection = getMessageSelection(view);
      const id = event.target.dataset.id;
      if (event.target.checked) selection.add(id); else selection.delete(id);
      syncNativeMessageSelection(view);
      const pageRoot = root.closest('#' + ROOT_ID) || root;
      refreshMessageResults(pageRoot, view);
    }));
    root.querySelectorAll('[data-action="message-select-all"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      const selection = getMessageSelection(view);
      getVisibleMessageRows(view).forEach((row) => {
        if (event.target.checked) selection.add(row.id); else selection.delete(row.id);
      });
      syncNativeMessageSelection(view);
      const pageRoot = root.closest('#' + ROOT_ID) || root;
      refreshMessageResults(pageRoot, view);
    }));
    root.querySelectorAll('[data-message-js]').forEach((anchor) => anchor.addEventListener('click', (event) => {
      event.preventDefault();
      executeMessageHref(anchor.dataset.messageJs, view);
    }));
  }

function bindSyllabusTitleLinks(root) {
    root.querySelectorAll('[data-syllabus-title]').forEach((anchor) => anchor.addEventListener('click', async (event) => {
      event.preventDefault();
      await handleSyllabusNavigation(anchor);
    }));
  }

function bindCourseSectionToggles(root) {
    if (!(state.courseCollapsedSections instanceof Set)) state.courseCollapsedSections = new Set();
    root.querySelectorAll('[data-action="course-section-toggle"], [data-action="toggle-course-section"]').forEach((button) => {
      const targetId = button.dataset.sectionTarget || button.getAttribute('aria-controls');
      const target = targetId ? root.querySelector('#' + CSS.escape(targetId)) : null;
      if (!target) return;
      const collapsed = state.courseCollapsedSections.has(targetId);
      target.hidden = collapsed;
      button.setAttribute('aria-expanded', String(!collapsed));
      button.addEventListener('click', () => {
        target.hidden = !target.hidden;
        if (target.hidden) state.courseCollapsedSections.add(targetId); else state.courseCollapsedSections.delete(targetId);
        button.setAttribute('aria-expanded', String(!target.hidden));
      });
    });
  }

function bindSectionNavigation(root) {
    const entries = Array.from(root.querySelectorAll('.ku-rightnav-link[href^="#"]')).map((link) => {
      const id = link.getAttribute('href').slice(1);
      const section = root.querySelector('#' + CSS.escape(id));
      return section ? { link, section } : null;
    }).filter(Boolean);
    if (!entries.length) return () => {};
    const setActive = (id) => entries.forEach(({ link, section }) => {
      const active = section.id === id;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
    const update = () => {
      const top = root.getBoundingClientRect().top + 120;
      const passed = entries.filter(({ section }) => section.getBoundingClientRect().top <= top);
      setActive((passed[passed.length - 1] || entries[0]).section.id);
    };
    const handlers = entries.map(({ link, section }) => {
      const handler = (event) => {
        event.preventDefault();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(section.id);
      };
      link.addEventListener('click', handler);
      return { link, handler };
    });
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(update, { root, rootMargin: '-90px 0px -60% 0px', threshold: [0, 0.1, 0.5, 1] })
      : null;
    entries.forEach(({ section }) => observer?.observe(section));
    root.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      observer?.disconnect();
      root.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      handlers.forEach(({ link, handler }) => link.removeEventListener('click', handler));
    };
  }

function cleanupRouteHydration() {
    if (typeof kuCleanupTodos === 'function') kuCleanupTodos();
    state.routeRightNavCleanup?.();
    state.syllabusRightNavCleanup?.();
    state.lmsLinkNavigationCleanup?.();
    state.routeRightNavCleanup = null;
    state.syllabusRightNavCleanup = null;
    state.lmsLinkNavigationCleanup = null;
  }

function bindLmsLinkNavigation(root) {
    if (!state.lmsNavigationReplayAnchors) state.lmsNavigationReplayAnchors = new WeakSet();
    const replaying = state.lmsNavigationReplayAnchors;
    let waiting = false;
    let disposed = false;
    const handler = async (event) => {
      if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || replaying.has(anchor) || !root.contains(anchor)) return;
      const rawHref = anchor.getAttribute('href') || '';
      if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref)) return;
      let url;
      try { url = new URL(rawHref, window.location.href); } catch { return; }
      const destinationRoute = detectRoute(url);
      if (url.origin !== 'https://kulms.tl.kansai-u.ac.jp'
        || (!destinationRoute.supported && destinationRoute.name !== 'course-return')) return;
      if (typeof waitForLmsRequestsBeforeNavigation !== 'function') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (waiting) return;
      waiting = true;
      let safe = false;
      try { safe = await waitForLmsRequestsBeforeNavigation(); } catch { /* Keep navigation blocked on an unexpected request failure. */ }
      if (!safe) {
        waiting = false;
        if (!disposed) window.alert('LMSの通信を安全に完了できませんでした。このページを再読み込みしてから移動してください。');
        return;
      }
      let destination = anchor;
      if (disposed || anchor.isConnected === false) {
        destination = root.isConnected === false ? null : Array.from(root.querySelectorAll('a[href]')).find((candidate) =>
          candidate.href === url.href && candidate.getAttribute('target') === anchor.getAttribute('target'));
        if (!destination) {
          if (typeof resumeLmsPageRequests === 'function') resumeLmsPageRequests();
          return;
        }
      }
      let canceled = false;
      const observeCancellation = (clickEvent) => { canceled = clickEvent.defaultPrevented; };
      destination.addEventListener('click', observeCancellation, { once: true });
      replaying.add(destination);
      try { destination.click(); } finally {
        replaying.delete(destination);
        destination.removeEventListener('click', observeCancellation);
        if (canceled) {
          waiting = false;
          if (typeof resumeLmsPageRequests === 'function') resumeLmsPageRequests();
        }
      }
    };
    root.addEventListener('click', handler, true);
    return () => { disposed = true; root.removeEventListener('click', handler, true); };
  }

function syncNativeMessageSelection(view) {
    if (!view.form) return;
    const selection = getMessageSelection(view);
    view.rows.forEach((row) => {
      const input = view.form.elements[row.inputName];
      if (input) input.checked = selection.has(row.id);
    });
    const master = view.form.elements.autochecker;
    if (master) master.checked = view.rows.length > 0 && view.rows.every((row) => selection.has(row.id));
  }

function triggerMessageDetailForward(root, view) {
    if (!view?.forward?.form) return;
    const input = root.querySelector('[data-action="message-detail-forward-input"]');
    if (!input || !input.value.trim() || !input.checkValidity()) {
      input?.reportValidity();
      return;
    }
    const nativeInput = view.forward.form.querySelector('input[name="' + view.forward.inputName + '"]');
    const nativeButton = view.forward.form.querySelector('input[type="submit"][name="' + view.forward.buttonName + '"]');
    if (!nativeInput) return;
    nativeInput.value = input.value.trim();
    const forward = () => {
      if (nativeButton) nativeButton.click();
      else if (typeof view.forward.form.requestSubmit === 'function') view.forward.form.requestSubmit();
    };
    if (typeof withNativeInteraction === 'function') withNativeInteraction(view.forward.form, forward);
    else forward();
  }
