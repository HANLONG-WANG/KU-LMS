/* src/content/services/cache.js */

async function loadUpcomingFromDueCourses(scheduleEntries, year = '') {
    return loadUpcomingFromCourseCache((scheduleEntries || []).filter((entry) => isDueFlagNote(entry.note) && entry.href));
  }

function loadUpcomingFromCourseCache(scheduleEntries) {
    const cache = readCourseUpcomingCache();
    let dirty = false;
    const items = [];
    (scheduleEntries || []).forEach((entry) => {
      const cacheKey = buildCourseCacheKey(entry.href);
      const cachedItems = Array.isArray(cache[cacheKey]) ? cache[cacheKey] : [];
      const hydratedItems = cachedItems
        .map((item) => hydrateCourseUpcomingItem(item, entry, cacheKey))
        .filter(Boolean);
      const prunedItems = pruneUpcomingItems(hydratedItems);
      const serializedItems = prunedItems.map(serializeCourseUpcomingItem);
      if (serializedItems.length) cache[cacheKey] = serializedItems;
      else if (cachedItems.length) delete cache[cacheKey];
      if (!areUpcomingCacheEntriesEqual(cachedItems, serializedItems)) dirty = true;
      items.push(...prunedItems);
    });
    if (dirty) writeCourseUpcomingCache(cache);
    return items;
  }

function mergeUpcomingSources(primaryItems, secondaryItems) {
    const keyed = new Map();
    const push = (item) => {
      const key = buildUpcomingIdentityKey(item);
      if (!key) return;
      if (!keyed.has(key) || item.availability) keyed.set(key, item);
    };
    (secondaryItems || []).forEach(push);
    (primaryItems || []).forEach(push);
    return [...keyed.values()];
  }

function buildUpcomingIdentityKey(item) {
    const courseHref = buildCourseCacheKey(item?.courseHref || '') || item?.courseHref || '';
    const title = String(item?.title || '').replace(/\s+/g, ' ').trim();
    const due = item?.dueDate && typeof item.dueDate.getTime === 'function' ? item.dueDate.getTime() : '';
    return courseHref || title ? `${courseHref}::${title}::${due}` : '';
  }

function readCourseUpcomingCache() {
    try {
      const raw = window.sessionStorage?.getItem(COURSE_UPCOMING_CACHE_KEY) || '{}';
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

function writeCourseUpcomingCache(cache) {
    try {
      window.sessionStorage?.setItem(COURSE_UPCOMING_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('[KU Redesign] failed to write course upcoming cache', error);
    }
  }

function rememberCourseUpcoming(courseHref = '', items = []) {
    const cacheKey = buildCourseCacheKey(courseHref);
    if (!cacheKey) return;
    const cache = readCourseUpcomingCache();
    const serializedItems = pruneUpcomingItems(items || []).map(serializeCourseUpcomingItem);
    if (serializedItems.length) cache[cacheKey] = serializedItems;
    else delete cache[cacheKey];
    writeCourseUpcomingCache(cache);
  }

function hydrateCourseUpcomingItem(item, scheduleEntry, cacheKey = '') {
    const dueDate = item?.dueDate ? new Date(item.dueDate) : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) return null;
    return {
      ...item,
      dueDate,
      courseHref: cacheKey || buildCourseCacheKey(item?.courseHref || scheduleEntry?.href || ''),
      courseTitle: shortenCourseTitle(scheduleEntry?.title || item?.courseTitle || ''),
      courseNote: scheduleEntry?.note || item?.courseNote || '',
      hasCourseDueFlag: isDueFlagNote(scheduleEntry?.note || item?.courseNote || ''),
      scheduleIndex: scheduleEntry?.sortIndex ?? item?.scheduleIndex ?? Number.MAX_SAFE_INTEGER
    };
  }

function serializeCourseUpcomingItem(item) {
    return {
      title: item.title,
      type: item.type,
      availability: item.availability,
      dueDate: item.dueDate?.toISOString?.() || '',
      href: item.href,
      detailHref: item.detailHref,
      historyHref: item.historyHref,
      usageText: item.usageText,
      usageCount: item.usageCount,
      hasUsage: item.hasUsage,
      usageKnown: item.usageKnown
    };
  }

function areUpcomingCacheEntriesEqual(a = [], b = []) {
    return JSON.stringify(a || []) === JSON.stringify(b || []);
  }

function pruneUpcomingItems(items = []) {
    return (items || []).filter((item) => isUpcomingDueSoonUnused(item));
  }

function getRefreshEntries(scheduleEntries = []) {
    const dueEntries = (scheduleEntries || []).filter((entry) => isDueFlagNote(entry.note) && entry.href);
    const cache = readCourseUpcomingCache();
    let dirty = false;
    dueEntries.forEach((entry) => {
      const cacheKey = buildCourseCacheKey(entry.href);
      const cachedItems = Array.isArray(cache[cacheKey]) ? cache[cacheKey] : [];
      const hydratedItems = cachedItems
        .map((item) => hydrateCourseUpcomingItem(item, entry, cacheKey))
        .filter(Boolean);
      const prunedItems = pruneUpcomingItems(hydratedItems);
      const serializedItems = prunedItems.map(serializeCourseUpcomingItem);
      if (serializedItems.length) cache[cacheKey] = serializedItems;
      else if (cachedItems.length) delete cache[cacheKey];
      if (!areUpcomingCacheEntriesEqual(cachedItems, serializedItems)) dirty = true;
    });
    if (dirty) writeCourseUpcomingCache(cache);
    return dueEntries;
  }
