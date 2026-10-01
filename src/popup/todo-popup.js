/* TODO failures must not block settings. */
(() => {
  const todo = document.getElementById('todo-page'), settings = document.getElementById('settings-form');
  const todoTab = document.getElementById('todo-tab'), settingsTab = document.getElementById('settings-tab');
  const select = showTodos => {
    todo.hidden = !showTodos; settings.hidden = showTodos;
    todoTab.setAttribute('aria-selected', String(showTodos)); settingsTab.setAttribute('aria-selected', String(!showTodos));
  };
  todoTab.addEventListener('click', () => select(true)); settingsTab.addEventListener('click', () => select(false));
  try { KuTodoUI.mount(todo); }
  catch (_) { todo.textContent = 'TODO 无法初始化，请重新打开扩展。设置仍可使用。'; }
})();
