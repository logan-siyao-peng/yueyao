import todos from './todo.mjs';

const origins = new Set(['https://yueyao.de', 'https://www.yueyao.de']);
const probabilities = new Set(['0', '20', '40', '50', '60', '80', '100']);
const adultCounts = new Set(['0', '1', '2']);
const childCounts = new Set(['0', '1', '2', '3']);
const columns = 'name,email,attendance_probability,additional_adults,child_count,adult_name_1,adult_probability_1,adult_name_2,adult_probability_2,dietary_preference,stay_nights,lodging_preference,note,guest_details';
const schema = `CREATE TABLE IF NOT EXISTS rsvps (id INTEGER PRIMARY KEY, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, name TEXT NOT NULL, email TEXT NOT NULL, attendance_probability INTEGER NOT NULL, additional_adults INTEGER NOT NULL, child_count INTEGER NOT NULL, adult_name_1 TEXT, adult_probability_1 INTEGER, adult_name_2 TEXT, adult_probability_2 INTEGER, dietary_preference TEXT NOT NULL, stay_nights TEXT NOT NULL, lodging_preference TEXT NOT NULL, note TEXT NOT NULL, guest_details TEXT NOT NULL DEFAULT '')`;

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
  if (!adultCounts.has(adults) || !childCounts.has(children)) return null;
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
  if (!['', '0', '1', '2', '3+'].includes(nights) || !['', 'kristall','galzig','rundeck','alptyrol','own','own_apartment'].includes(lodging)) return null;
  let guestDetails = '';
  if (data.guest_details_version === '1') {
    const guestDiet = prefix => {
      const preference = data[prefix + '_preference'];
      const restrictions = (data[prefix + '_restrictions'] || '').trim();
      return ['none', 'vegetarian', 'vegan'].includes(preference) && restrictions.length <= 250
        ? {preference, restrictions} : null;
    };
    const details = {adult_1: guestDiet('dietary'), additional_adults: [], children: []};
    if (!details.adult_1) return null;
    for (let i = 1; i <= Number(adults); i++) {
      const diet = guestDiet('adult_' + i + '_dietary');
      if (!diet) return null;
      details.additional_adults.push(diet);
    }
    for (let i = 1; i <= Number(children); i++) {
      const age = data['child_age_' + i];
      const chance = data['child_probability_' + i];
      const diet = guestDiet('child_' + i + '_dietary');
      if (!/^(?:[0-9]|1[0-7])$/.test(age || '') || !probabilities.has(chance) || !diet) return null;
      details.children.push({age: Number(age), attendance_probability: Number(chance), ...diet});
    }
    guestDetails = JSON.stringify(details);
  }
  return [name, email, Number(probability), Number(adults), Number(children), ...companions, dietary, nights, lodging, note, guestDetails];
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/todo' || path === '/tasting') return todos.fetch(request, env);
    if (path === '/api/todos') {
      const headers = {'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store'};
      if (request.method !== 'GET') return new Response(null, {status:405, headers:{...headers, Allow:'GET'}});
      try {
        const {results} = await env.DB.prepare('SELECT title, complete FROM wedding_todos ORDER BY id').all();
        return Response.json(results.map(({title, complete}) => ({title, complete:Boolean(complete)})), {headers});
      } catch {
        return Response.json({error:'暂时无法读取待办。'}, {status:503, headers});
      }
    }
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
      try {
        await env.DB.prepare('SELECT guest_details FROM rsvps LIMIT 1').first();
        headers['Access-Control-Expose-Headers'] = 'X-RSVP-Guest-Details';
        headers['X-RSVP-Guest-Details'] = '1';
        return reply(204);
      }
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
        env.DB.prepare('INSERT INTO rsvps (' + columns + ') VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...fields),
      ]);
      return reply(201, {received:true});
    } catch { return reply(503, {error:'暂时无法保存，请稍后重试。'}); }
  },
};
