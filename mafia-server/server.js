// Mafia Night server. No npm packages needed: run with `node server.js`
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'public', 'index.html');
const store = new Map();   // path -> document
const touched = new Map(); // room code -> last write time
const subs = new Set();    // live listeners
const hits = new Map();    // uid -> recent write times
const RE = /^rooms\/([A-Z]{4})(?:\/p\/([A-Za-z0-9]{8,40}))?$/;

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const children = col => { const out = {}, pre = col + '/'; for (const [k, v] of store) if (k.startsWith(pre) && !k.slice(pre.length).includes('/')) out[k.slice(pre.length)] = v; return out; };
const notify = p => {
  for (const s of subs) {
    if (!s.col && s.path === p) s.res.write('data: ' + JSON.stringify({ data: store.get(p) ?? null }) + '\n\n');
    else if (s.col && p.startsWith(s.path + '/') && !p.slice(s.path.length + 1).includes('/')) s.res.write('data: ' + JSON.stringify({ docs: children(s.path) }) + '\n\n');
  }
};
const limited = uid => { const t = Date.now(), a = (hits.get(uid) || []).filter(x => t - x < 10000); a.push(t); hits.set(uid, a); return a.length > 60; };

function write(op, body, res) {
  let b; try { b = JSON.parse(body); } catch (e) { return json(res, 400, { error: 'bad json' }); }
  const { path: p, data, uid } = b, m = RE.exec(p || '');
  if (!m || typeof uid !== 'string' || !/^[A-Za-z0-9]{8,40}$/.test(uid) || !data || typeof data !== 'object' || Array.isArray(data)) return json(res, 400, { error: 'bad request' });
  if (limited(uid)) return json(res, 429, { error: 'slow down' });
  const room = 'rooms/' + m[1], old = store.get(p);
  if (!m[2]) { // the room document: only its host may write it
    if (old ? old.host !== uid : data.host !== uid) return json(res, 403, { error: 'not the host' });
    if (!old && [...store.keys()].filter(k => !k.includes('/p/')).length >= 500) return json(res, 503, { error: 'server full' });
  } else { // a player document: only that player may write it
    if (m[2] !== uid) return json(res, 403, { error: 'not you' });
    if (!store.has(room)) return json(res, 404, { error: 'no such room' });
    if (!old && Object.keys(children(room + '/p')).length >= 20) return json(res, 403, { error: 'room is full' });
  }
  store.set(p, op === 'update' ? { ...(old || {}), ...data } : data);
  touched.set(m[1], Date.now());
  notify(p);
  json(res, 200, { ok: true });
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && (u.pathname === '/api/set' || u.pathname === '/api/update')) {
    let body = '', big = false;
    req.on('data', c => { body += c; if (body.length > 65536) { big = true; req.destroy(); } });
    req.on('end', () => { if (!big) write(u.pathname.slice(5), body, res); });
    return;
  }
  if (u.pathname === '/api/get') {
    const p = u.searchParams.get('path') || '';
    return RE.test(p) ? json(res, 200, { data: store.get(p) ?? null }) : json(res, 400, { error: 'bad path' });
  }
  if (u.pathname === '/api/sub') {
    const p = u.searchParams.get('path') || '', col = u.searchParams.get('col') === '1';
    if (!(col ? /^rooms\/[A-Z]{4}\/p$/.test(p) : RE.test(p))) return json(res, 400, { error: 'bad path' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const s = { res, path: p, col }; subs.add(s);
    res.write('data: ' + JSON.stringify(col ? { docs: children(p) } : { data: store.get(p) ?? null }) + '\n\n');
    req.on('close', () => subs.delete(s));
    return;
  }
  if (u.pathname === '/health') return json(res, 200, { ok: true });
  if (u.pathname === '/' || u.pathname === '/index.html') {
    return fs.readFile(INDEX, (e, buf) => {
      if (e) return json(res, 500, { error: 'index.html missing' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(buf);
    });
  }
  json(res, 404, { error: 'not found' });
}).listen(PORT, '0.0.0.0', () => {
  console.log('\nMafia Night is running.\n  On this computer:  http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) for (const i of list) if (i.family === 'IPv4' && !i.internal) console.log('  Friends on your Wi-Fi: http://' + i.address + ':' + PORT);
  console.log('');
});

setInterval(() => { for (const s of subs) s.res.write(': ping\n\n'); }, 25000);          // keep connections alive
setInterval(() => {                                                                      // forget rooms idle for 6 hours
  const t = Date.now();
  for (const [code, at] of touched) if (t - at > 6 * 3600 * 1000) {
    for (const k of [...store.keys()]) if (k === 'rooms/' + code || k.startsWith('rooms/' + code + '/')) store.delete(k);
    touched.delete(code);
  }
}, 600000);
