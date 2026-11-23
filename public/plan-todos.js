const todoList = document.querySelector('#public-todos');
const todoStatus = document.querySelector('#public-todo-status');

fetch('https://yueyao-rsvp.loganpeng1992.workers.dev/api/todos', {cache:'no-store', credentials:'omit'})
  .then(response => {
    if (!response.ok) throw new Error('Could not load To Do');
    return response.json();
  })
  .then(tasks => {
    const items = tasks.map(({title, complete}) => {
      const item = document.createElement('li');
      const caption = document.createElement(complete ? 'del' : 'span');
      caption.textContent = title;
      item.append(caption);
      if (complete) item.append('（已完成）');
      return item;
    });
    todoList.replaceChildren(...items);
    todoStatus.textContent = items.length ? '' : '目前没有待办。';
  })
  .catch(() => {
    todoStatus.textContent = '暂时无法读取待办，请刷新后重试。';
  });
