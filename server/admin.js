// The owner's admin page and its API: every room, who is in it, and KICK /
// BAN, plus the ban list with UNBAN. Only for the owner and the people he
// gave a key (admins.js); with no key anywhere the whole thing is off.
//
//   GET  /admin                 the page (asks for your key, keeps it for the tab)
//   GET  /admin/api/state       rooms with players (name, id, player id, address, ping), bans, load, you
//   POST /admin/api/kick        { code, id }             out of that room (and kept out of it)
//   POST /admin/api/ban         { code, id, reason }     banned by player id and address, and kicked
//   POST /admin/api/unban       { key }
// Every API call carries the header  Authorization: Bearer <key>. A wrong key
// counts against the address (admins.js locks it out after 10). Every action
// is logged with who did it.

function json(res, status, body) {
 res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
 res.end(JSON.stringify(body));
}

function readBody(req, limit = 4096) {
 return new Promise((resolve, reject) => {
  let size = 0; const parts = [];
  req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else parts.push(chunk); });
  req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { reject(new Error('bad json')); } });
  req.on('error', reject);
 });
}

// Returns true if it answered the request.
export async function handleAdmin(req, res, { admins, rooms, bans, load, url, ip = '?', log = console }) {
 if (!url.pathname.startsWith('/admin')) return false;
 if (!admins.enabled) { json(res, 404, { error: 'The admin page is off (no admin keys).' }); return true; }
 if (url.pathname === '/admin' || url.pathname === '/admin/') {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
  res.end(PAGE); return true;
 }
 if (admins.locked(ip)) { json(res, 429, { error: 'Too many wrong keys. Wait 10 minutes.' }); return true; }
 const who = admins.who(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), ip);
 if (!who) { json(res, 401, { error: 'Wrong key.' }); return true; }
 const did = (...what) => log.log(new Date().toISOString(), 'admin', who, ...what);
 try {
  if (req.method === 'GET' && url.pathname === '/admin/api/state') { json(res, 200, { you: who, rooms: rooms.adminState(), bans: bans.list, load: load() }); return true; }
  if (req.method !== 'POST') { json(res, 405, { error: 'POST only.' }); return true; }
  const body = await readBody(req);
  const room = body.code ? rooms.find(body.code) : null;
  if (url.pathname === '/admin/api/kick') { const ok = !!room?.kick(String(body.id)); if (ok) did('kicked', body.id, 'from', room.code); json(res, 200, { ok }); return true; }
  if (url.pathname === '/admin/api/ban') {
   const conn = room?.conns.get(String(body.id));
   if (!conn) { json(res, 404, { error: 'That player is gone. Ban from the list later if they come back.' }); return true; }
   const name = room.session.lobby().players.find(p => p.id === conn.id)?.name || '';
   const ban = bans.add({ pid: conn.pid, ip: conn.ip, name, reason: body.reason || '', by: who });
   did('banned', name, conn.ip);
   // Out of every room they are in (one browser, one id: usually one room).
   for (const r of rooms.rooms.values()) for (const c of [...r.conns.values()]) if (c.pid === conn.pid || c.ip === conn.ip) { c.send({ t: 'removed', reason: 'You are banned from the Deadstab servers.' }); r.kick(c.id); }
   json(res, 200, { ok: true, ban }); return true;
  }
  if (url.pathname === '/admin/api/unban') { const ok = bans.remove(String(body.key)); if (ok) did('unbanned', body.key); json(res, 200, { ok }); return true; }
  json(res, 404, { error: 'No such call.' }); return true;
 } catch (error) { json(res, 400, { error: error.message }); return true; }
}

// The page: plain, dark, no outside files.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deadstab admin</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#161919;color:#e7ecea;font:14px/1.45 system-ui,Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}h1{font-size:20px;margin:0 0 12px}h2{font-size:15px;margin:22px 0 8px;color:#e8afb9}
input,button{font:inherit;border-radius:4px;border:1px solid #4d5754;background:#202524;color:#e7ecea;padding:6px 10px}button{cursor:pointer}button.bad{border-color:#a8434f;color:#ffb3bd}
.room{border:1px solid #333b39;border-radius:6px;padding:10px 12px;margin:0 0 10px;background:#1c2020}.room h3{margin:0 0 6px;font-size:14px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:4px 6px;border-top:1px solid #2b3230;vertical-align:middle}th{color:#9aa7a3;font-weight:600}
.muted{color:#8d9894}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}code{color:#c9d6d2}
</style></head><body><main>
<h1>Deadstab servers</h1>
<div class="row"><input id="token" type="password" placeholder="your admin key" autocomplete="off" size="30"><button id="save">Sign in</button><button id="out">Sign out</button><span id="status" class="muted"></span></div>
<h2>Rooms</h2><div id="rooms" class="muted">Enter your key.</div>
<h2>Bans</h2><div id="bans" class="muted"></div>
</main><script>
const $=id=>document.getElementById(id);let token=sessionStorage.getItem('ds-admin')||'';$('token').value=token;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function call(path,body){const r=await fetch('/admin/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j;}
async function refresh(){if(!token)return;try{const s=await call('state');$('status').textContent='load '+s.load.tickMs+' ms a tick · '+s.load.players+' players';
$('status').textContent='signed in as '+s.you+' · '+$('status').textContent;
$('rooms').innerHTML=s.rooms.map(r=>'<div class="room"><h3>'+esc(r.name||'Room')+' <code>'+esc(r.code)+'</code> <span class="muted">'+esc(r.map)+' · '+esc(r.mode)+' · '+esc(r.phase)+' · '+r.players+' players, '+r.robots+' bots'+(r.public?' · always open':'')+'</span></h3>'+(r.players?'<table><tr><th>name</th><th>ping</th><th>here</th><th>player id</th><th>address</th><th></th></tr>'+r.players.map(p=>'<tr><td>'+esc(p.name)+(p.lead?' <span class="muted">(leader)</span>':'')+'</td><td>'+(p.ping??'')+'</td><td>'+p.since+' s</td><td><code>'+esc(p.pid).slice(0,12)+'…</code></td><td><code>'+esc(p.ip)+'</code></td><td class="row"><button data-kick="'+esc(r.code)+'|'+esc(p.id)+'">KICK</button><button class="bad" data-ban="'+esc(r.code)+'|'+esc(p.id)+'|'+esc(p.name)+'">BAN</button></td></tr>').join('')+'</table>':'<span class="muted">empty</span>')+'</div>').join('');
$('bans').innerHTML=s.bans.length?'<table><tr><th>name</th><th>reason</th><th>by</th><th>when</th><th></th></tr>'+s.bans.map(b=>'<tr><td>'+esc(b.name||'?')+'</td><td>'+esc(b.reason)+'</td><td>'+esc(b.by||'')+'</td><td>'+esc(b.at)+'</td><td><button data-unban="'+esc(b.key)+'">UNBAN</button></td></tr>').join('')+'</table>':'none';}
catch(e){$('status').textContent=e.message;}}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
if(b.id==='save'){token=$('token').value.trim();sessionStorage.setItem('ds-admin',token);}
else if(b.id==='out'){token='';sessionStorage.removeItem('ds-admin');$('token').value='';$('rooms').textContent='Enter your key.';$('bans').textContent='';$('status').textContent='signed out';return;}
else if(b.dataset.kick){const[code,id]=b.dataset.kick.split('|');await call('kick',{code,id});}
else if(b.dataset.ban){const[code,id,name]=b.dataset.ban.split('|');const reason=prompt('Ban '+name+'? Reason (optional):');if(reason===null)return;await call('ban',{code,id,reason});}
else if(b.dataset.unban){await call('unban',{key:b.dataset.unban});}
}catch(err){$('status').textContent=err.message;}refresh();});
refresh();setInterval(refresh,3000);
</script></body></html>`;
