import menu from '../plan/index.html';

const groups = {
  soup: '汤', starter: '前菜', sorbet: '雪葩', fish: '鱼主菜',
  meat: '肉主菜', dessert: '甜品', google: 'Google 推荐',
};
const dishes = new Map(Array.from(menu.matchAll(/<tr data-tasting-dish="([a-z]+-\d+)"><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g),
  ([, id, name, source, extra]) => [id, {name, source, extra, group: id.split('-')[0]}]));
const schema = 'CREATE TABLE IF NOT EXISTS wedding_tasting (dish TEXT PRIMARY KEY, wants_try INTEGER NOT NULL, score INTEGER)';

function tastingPage(saved, selected) {
  const choices = new Map(saved.map(row => [row.dish, row]));
  const sections = Object.entries(groups).map(([group, name]) => {
    const rows = [...dishes].filter(([, dish]) => dish.group === group).map(([id, dish]) => {
      const choice = choices.get(id);
      const options = Array.from({length: 10}, (_, i) => i + 1).map(score =>
        `<option value="${score}"${choice?.score === score ? ' selected' : ''}>${score}</option>`).join('');
      const checked = choice ? choice.wants_try : group !== 'google' && dish.extra === '想试';
      return `<form id="${id}" method="post" action="/tasting">
        <input type="hidden" name="dish" value="${id}">
        <strong>${dish.name}</strong><small>${dish.source}${group === 'google' ? ' · ' + dish.extra : ''}</small>
        <div class="controls"><label><input type="checkbox" name="try" value="1"${checked ? ' checked' : ''}> 想试菜</label>
        <label>评分 <select name="score"><option value="">未评分</option>${options}</select> / 10</label>
        <button type="submit">保存</button>${selected === id ? '<span role="status">已保存</span>' : ''}</div>
      </form>`;
    }).join('');
    return `<details${group === (dishes.get(selected)?.group || 'soup') ? ' open' : ''}><summary>${name}</summary>${rows}</details>`;
  }).join('');
  return `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>婚礼试菜</title>
  <style>
  body{font:16px/1.55 system-ui,sans-serif;background:#f9f5ed;color:#262a20;margin:0;padding:24px 16px}main{max-width:46rem;margin:auto}a{color:inherit}summary{font-weight:600;cursor:pointer;padding:.65rem 0}details,form{border-top:1px solid #d6cfbe}form{padding:.8rem 0;scroll-margin:12px}small{display:block;color:#55594b}.controls{display:flex;flex-wrap:wrap;align-items:center;gap:.7rem;margin-top:.5rem}button,select{font:inherit;background:#fffdf8;color:inherit;border:1px solid #777963;padding:.35rem}button{cursor:pointer}
  </style><main><nav><a href="https://yueyao.de/plan/#menu">餐酒菜单</a> · <a href="/todo">待办</a></nav><h1>婚礼试菜</h1>
  <p>每道菜可勾选「想试菜」，试吃后可打 1–10 分。点该道菜的「保存」即可跨设备查看。</p>${sections}</main></html>`;
}

export async function serveTasting(request, db, response) {
  const url = new URL(request.url);
  try {
    await db.prepare(schema).run();
    if (request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin) return response('请从试菜网页提交。', 403);
      if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return response('请从试菜网页提交。', 415);
      const form = await request.formData();
      const id = form.get('dish');
      const score = form.get('score');
      if (!dishes.has(id) || typeof score !== 'string' || !/^(?:[1-9]|10)?$/.test(score)) return response('请检查菜名与评分。', 400);
      await db.prepare('INSERT INTO wedding_tasting VALUES (?, ?, ?) ON CONFLICT(dish) DO UPDATE SET wants_try=excluded.wants_try, score=excluded.score')
        .bind(id, Number(form.get('try') === '1'), score ? Number(score) : null).run();
      return response(null, 303, {Location:`/tasting?saved=${id}#${id}`});
    }
    const {results} = await db.prepare('SELECT dish, wants_try, score FROM wedding_tasting').all();
    return response(tastingPage(results, url.searchParams.get('saved')), 200, {'Content-Type':'text/html; charset=utf-8'});
  } catch {
    return response('试菜记录暂时无法加载，请稍后重试。', 503);
  }
}
