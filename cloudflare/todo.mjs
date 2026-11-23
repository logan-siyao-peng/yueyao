const starterTasks = [
  '确认婚礼当天的到场与仪式时间',
  '和 Museum Café 确认餐酒菜单',
  '核对住宿房量与预订条款',
  '确认宾客名单与出席回执安排',
];

const table = 'CREATE TABLE IF NOT EXISTS wedding_todos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, complete INTEGER NOT NULL DEFAULT 0)';
const metadata = 'CREATE TABLE IF NOT EXISTS wedding_todo_setup (id INTEGER PRIMARY KEY)';

function html(value) {
  const escapes = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
  return String(value).replace(/[&<>"']/g, character => escapes[character]);
}

function response(body, status = 200, headers = {}) {
  return new Response(body, {status, headers: {'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", ...headers}});
}

async function equal(left, right) {
  const encoder = new TextEncoder();
  const digests = await Promise.all([left, right].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const first = new Uint8Array(digests[0]);
  const second = new Uint8Array(digests[1]);
  return first.reduce((difference, byte, index) => difference | (byte ^ second[index]), 0) === 0;
}

async function initialize(db) {
  await db.batch([
    db.prepare(table),
    db.prepare(metadata),
    ...starterTasks.map(title => db.prepare('INSERT INTO wedding_todos (title) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM wedding_todo_setup WHERE id=1)').bind(title)),
    db.prepare('INSERT OR IGNORE INTO wedding_todo_setup (id) VALUES (1)'),
  ]);
}

function page(rows) {
  const tasks = rows.map(({id, title, complete}) => `
    <li>
      <span class="${complete ? 'done' : ''}">${html(title)}</span>
      <form method="post">
        <input type="hidden" name="id" value="${id}">
        <button name="action" value="${complete ? 'reopen' : 'complete'}">${complete ? '撤销完成' : '完成'}</button>
        <button name="action" value="remove">移除</button>
      </form>
    </li>`).join('');
  return `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>越 &amp; 尧 · To Do</title>
  <style>body{font:16px/1.55 system-ui,sans-serif;background:#f9f5ed;color:#262a20;margin:0;padding:28px 18px}main{max-width:42rem;margin:auto}a{color:inherit}form{display:flex;gap:.5rem;flex-wrap:wrap}input,button{font:inherit;padding:.4rem .65rem;border:1px solid #777963;background:#fffdf8;color:inherit}form>input:not([type=hidden]){flex:1;min-width:0}button{cursor:pointer}ul{list-style:none;padding:0}li{padding:.75rem 0;border-bottom:1px solid #d6cfbe;display:flex;flex-wrap:wrap;gap:.5rem;justify-content:space-between}li span{overflow-wrap:anywhere}.done{text-decoration:line-through;color:#5b5d50}</style>
  <main><a href="https://yueyao.de/plan/">越 &amp; 尧 · 婚礼筹备</a><h1>To Do</h1>
  <p>这份清单也会显示在公开筹备页。</p>
  <form method="post"><label for="title">新增待办</label><input id="title" name="title" required maxlength="160"><button name="action" value="add">添加</button></form>
  <ul>${tasks}</ul></main></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['/', '/todo'].includes(url.pathname)) return response('页面不存在。', 404);
    if (!env.TODO_LOGIN_SECRET || !env.DB) return response('待办尚未启用。', 503);
    const header = request.headers.get('Authorization') || '';
    let credentials = '';
    try { if (header.startsWith('Basic ')) credentials = atob(header.slice(6)); } catch {}
    if (!await equal(credentials, 'yueyao:' + env.TODO_LOGIN_SECRET)) {
      return response('请登录查看待办。', 401, {'WWW-Authenticate':'Basic realm="Yue and Yao To Do", charset="UTF-8"'});
    }
    if (request.method !== 'GET' && request.method !== 'POST') return response(null, 405, {Allow:'GET, POST'});
    try {
      if (request.method === 'POST') {
        if (request.headers.get('Origin') !== url.origin) return response('请从待办网页提交。', 403);
        if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return response('请从待办网页提交。', 415);
        const form = await request.formData();
        const action = form.get('action');
        const title = String(form.get('title') || '').trim();
        const id = String(form.get('id') || '');
        if (action === 'add' && title && title.length <= 160) {
          await env.DB.prepare('INSERT INTO wedding_todos (title) VALUES (?)').bind(title).run();
        } else if (/^[1-9]\d{0,14}$/.test(id) && action === 'remove') {
          await env.DB.prepare('DELETE FROM wedding_todos WHERE id=?').bind(Number(id)).run();
        } else if (/^[1-9]\d{0,14}$/.test(id) && ['complete','reopen'].includes(action)) {
          await env.DB.prepare('UPDATE wedding_todos SET complete=? WHERE id=?').bind(action === 'complete' ? 1 : 0, Number(id)).run();
        } else return response('请检查待办内容。', 400);
        return response(null, 303, {Location:'/todo'});
      }
      const setup = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wedding_todo_setup'").first();
      if (!setup) await initialize(env.DB);
      const {results} = await env.DB.prepare('SELECT id, title, complete FROM wedding_todos ORDER BY id').all();
      return response(page(results), 200, {'Content-Type':'text/html; charset=utf-8'});
    } catch {
      return response('待办暂时无法加载，请稍后重试。', 503);
    }
  },
};
