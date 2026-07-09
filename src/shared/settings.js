/* src/shared/settings.js */

var KU_LMS_SETTINGS_STORAGE_KEY = 'kuLmsSettingsV1';
var KU_LMS_DEFAULT_SETTINGS = {
  enabled: true,
  username: '',
  password: ''
};

function kuNormalizeExtensionSettings(settings = {}) {
  return {
    enabled: settings.enabled !== false,
    username: String(settings.username || ''),
    password: String(settings.password || '')
  };
}

function kuReadExtensionSettings() {
  return new Promise((resolve) => {
    const fallback = kuNormalizeExtensionSettings(KU_LMS_DEFAULT_SETTINGS);
    try {
      if (!globalThis.chrome?.storage?.local) {
        resolve(fallback);
        return;
      }
      chrome.storage.local.get([KU_LMS_SETTINGS_STORAGE_KEY], (result = {}) => {
        if (chrome.runtime?.lastError) {
          resolve(fallback);
          return;
        }
        resolve(kuNormalizeExtensionSettings(result[KU_LMS_SETTINGS_STORAGE_KEY] || fallback));
      });
    } catch (error) {
      resolve(fallback);
    }
  });
}

function kuWriteExtensionSettings(settings = {}) {
  const normalized = kuNormalizeExtensionSettings(settings);
  return new Promise((resolve, reject) => {
    try {
      if (!globalThis.chrome?.storage?.local) {
        resolve(normalized);
        return;
      }
      chrome.storage.local.set({ [KU_LMS_SETTINGS_STORAGE_KEY]: normalized }, () => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to save settings'));
          return;
        }
        resolve(normalized);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function kuOnExtensionSettingsChanged(callback) {
  if (!globalThis.chrome?.storage?.onChanged || typeof callback !== 'function') return false;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[KU_LMS_SETTINGS_STORAGE_KEY]) return;
    callback(kuNormalizeExtensionSettings(changes[KU_LMS_SETTINGS_STORAGE_KEY].newValue || KU_LMS_DEFAULT_SETTINGS));
  });
  return true;
}
