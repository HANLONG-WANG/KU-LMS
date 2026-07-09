/* src/content/runtime/boot-syllabus.js */

async function bootSyllabus(options = {}) {
  bindSyllabusExtensionSettingsListener();
  if (!options.skipSettingsCheck) {
    state.extensionSettings = await kuReadExtensionSettings();
    if (!state.extensionSettings.enabled) {
      releaseSyllabusDetailRedesign();
      clearSyllabusAssistOverlay();
      return;
    }
  }
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

function bindSyllabusExtensionSettingsListener() {
  if (state.syllabusSettingsListenerBound) return;
  state.syllabusSettingsListenerBound = kuOnExtensionSettingsChanged((settings) => {
    state.extensionSettings = settings;
    if (!settings.enabled) {
      releaseSyllabusDetailRedesign();
      clearSyllabusAssistOverlay();
      return;
    }
    if (!document.documentElement.dataset.kuSyllabusRedesignState && !document.documentElement.dataset.kuSyllabusAssist) {
      bootSyllabus({ skipSettingsCheck: true }).catch((error) => console.warn('[KU Redesign] syllabus settings re-enable failed', error));
    }
  });
}
