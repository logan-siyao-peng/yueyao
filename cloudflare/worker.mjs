import todos from './todo.mjs';

const origins = new Set(['https://yueyao.de', 'https://www.yueyao.de']);
const probabilities = new Set(['0', '20', '40', '50', '60', '80', '100']);
const counts = new Set(['0', '1', '2']);
const columns = 'name,email,attendance_probability,additional_adults,child_count,adult_name_1,adult_probability_1,adult_name_2,adult_probability_2,dietary_preference,stay_nights,lodging_preference,note';
const schema = 'CREATE TABLE IF NOT EXISTS rsvps (id INTEGER PRIMARY KEY, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, name TEXT NOT NULL, email TEXT NOT NULL, attendance_probability INTEGER NOT NULL, additional_adults INTEGER NOT NULL, child_count INTEGER NOT NULL, adult_name_1 TEXT, adult_probability_1 INTEGER, adult_name_2 TEXT, adult_probability_2 INTEGER, dietary_preference TEXT NOT NULL, stay_nights TEXT NOT NULL, lodging_preference TEXT NOT NULL, note TEXT NOT NULL)';

function readFields(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.values(data).some(value => typeof value !== 'string')) return null;
  const name = (data.name || '').trim();
  const email = (data.email || '').trim().toLowerCase();
  const probability = data.attendance_probability;
  const dietary = data.dietary_preference;
  const note = (data.note || '').trim();
  if (!name || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) || !probabilities.has(probability) || !['none','vegetarian','vegan'].includes(dietary) || note.length > 1000) return null;
  const attending = probability !== '0';
  const adults = attending ? data.additional_adults : '0';
  const children = attending ? data.child_count : '0';
  if (!counts.has(adults) || !counts.has(children)) return null;
  const companions = [];
  for (const i of [1, 2]) {
    if (i > Number(adults)) {
      companions.push(null, null);
      continue;
    }
    const adultName = (data['adult_name_' + i] || '').trim();
    const adultProbability = data['adult_probability_' + i];
    if (!adultName || adultName.length > 100 || !probabilities.has(adultProbability)) return null;
    companions.push(adultName, Number(adultProbability));
  }
  const nights = attending ? data.stay_nights || '' : '';
  const lodging = attending && nights !== '0' ? data.lodging_preference || '' : '';
  if (!['', '0', '1', '2', '3+'].includes(nights) || !['', 'kristall','galzig','rundeck','alptyrol','own'].includes(lodging)) return null;
  return [name, email, Number(probability), Number(adults), Number(children), ...companions, dietary, nights, lodging, note];
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/todo') return todos.fetch(request, env);
    if (path !== '/api/rsvp') return new Response(null, {status:404});
    const origin = request.headers.get('Origin');
    if (!origins.has(origin)) return new Response(null, {status:403});
    const headers = {'Access-Control-Allow-Origin':origin, 'Vary':'Origin', 'Cache-Control':'no-store', 'Content-Type':'application/json; charset=utf-8'};
    const reply = (status, data) => new Response(data === undefined ? null : JSON.stringify(data), {status,headers});
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'HEAD, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
      return reply(204);
    }
    if (request.method === 'HEAD') {
      try { await env.DB.prepare('SELECT 1').first(); return reply(204); }
      catch { return reply(503); }
    }
    if (request.method !== 'POST') return reply(405);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return reply(415);
    let fields;
    try {
      const body = await request.text();
      if (body.length > 16384) return reply(413);
      fields = readFields(JSON.parse(body));
    } catch { return reply(400, {error:'请检查回执格式。'}); }
    if (!fields) return reply(400, {error:'请检查回执格式。'});
    try {
      await env.DB.batch([
        env.DB.prepare(schema),
        env.DB.prepare('INSERT INTO rsvps (' + columns + ') VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...fields),
      ]);
      return reply(201, {received:true});
    } catch { return reply(503, {error:'暂时无法保存，请稍后重试。'}); }
  },
};
