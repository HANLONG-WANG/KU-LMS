/* src/popup/popup.js */

const form = document.getElementById('settings-form');
const enabledInput = document.getElementById('enabled');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const showPasswordInput = document.getElementById('show-password');
const saveButton = document.getElementById('save');
const statusNode = document.getElementById('status');

initPopup();

async function initPopup() {
  try {
    const settings = await kuReadExtensionSettings();
    enabledInput.checked = settings.enabled;
    usernameInput.value = settings.username;
    passwordInput.value = settings.password;
    setStatus('');
  } catch (error) {
    setStatus('读取设置失败。', true);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveSettings('已保存。');
});

enabledInput.addEventListener('change', async () => {
  await saveSettings(enabledInput.checked ? '扩展已启用。' : '扩展已停用。');
});

showPasswordInput.addEventListener('change', () => {
  passwordInput.type = showPasswordInput.checked ? 'text' : 'password';
});

async function saveSettings(message) {
  saveButton.disabled = true;
  setStatus('保存中...');
  try {
    await kuWriteExtensionSettings({
      enabled: enabledInput.checked,
      username: usernameInput.value.trim(),
      password: passwordInput.value
    });
    setStatus(message);
  } catch (error) {
    setStatus('保存失败。', true);
  } finally {
    saveButton.disabled = false;
  }
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', isError);
}
