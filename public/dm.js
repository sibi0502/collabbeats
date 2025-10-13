// dm.js — rule-compliant + extra sanity logs
(() => {
  const auth = window.auth || firebase.auth();
  const db   = window.db   || firebase.firestore();
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => (
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])
  ));
const makeDmId = (a, b) => [a, b].sort().join('__');

async function ensureDmThread(uidA, uidB) {
const dmId = makeDmId(uidA, uidB);
const ref  = db.collection('dms').doc(dmId);

const snap = await ref.get();
if (!snap.exists) {
console.log('[DM] creating thread', dmId, 'participants', [uidA, uidB]);
await ref.set({
participants: [uidA, uidB], // OK: rules just need 2 strings incl. me
createdAt: firebase.firestore.FieldValue.serverTimestamp(),
}, { merge: false });
} else {
console.log('[DM] thread exists', dmId, snap.data());}

// Read it back once so rules for messages can rely on existing parent
const verify = await ref.get();
if (!verify.exists) throw new Error('Thread failed to create');
console.log('[DM] verified thread', dmId, verify.data());
return { dmId, ref };}
  function avatar(url, size = 36) {
  if (!url) {
  const svg = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <circle cx="40" cy="40" r="40" fill="#1f2937"/>
  <circle cx="40" cy="30" r="14" fill="#9ca3af"/>
  <path d="M12,74c5-16,26-18,28-18s23,2,28,18" fill="#9ca3af"/>
  </svg>`)}`;
  return `<img src="${svg}" alt="" style="width:${size}px;height:${size}px;border-radius:999px">`;
  }
  return `<img src="${esc(url)}" alt="" style="width:${size}px;height:${size}px;border-radius:999px;object-fit:cover">`;
}
function buildModal({ toUid, toName, toPhotoURL }) {
const wrap = document.createElement('div');
wrap.style.cssText = `
position:fixed; inset:0; background:rgba(0,0,0,.55);
z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;
`;
wrap.innerHTML = `
<div style="width:min(860px, 96vw); background:#fff; border-radius:14px; overflow:hidden; display:flex; flex-direction:column; max-height:86vh;">
<div style="display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid #eee;">
${avatar(toPhotoURL, 40)}
<div style="flex:1; min-width:0">
<div style="font-weight:800">${esc(toName || toUid)}</div>
<div style="color:#6b7280; font-size:12px">${esc(toUid)}</div>
</div>
<a class="pill" href="profile.html?uid=${encodeURIComponent(toUid)}">View profile</a>
<button id="dmClose" class="pill">Close</button>
</div>
<div id="dmMessages" style="flex:1; overflow:auto; padding:14px; background:#f9fafb"></div>
<form id="dmComposer" style="display:flex; gap:8px; padding:12px; border-top:1px solid #eee">
<input id="dmInput" type="text" placeholder="Type a message…" autocomplete="off"
style="flex:1; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; outline:none;">
  <button id="dmSend" type="submit" class="pill">Send</button>
  </form>
  </div>
 `;
 document.body.appendChild(wrap);
wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
return {
root: wrap,
messagesEl: wrap.querySelector('#dmMessages'),
formEl: wrap.querySelector('#dmComposer'),
inputEl: wrap.querySelector('#dmInput'),
closeBtn: wrap.querySelector('#dmClose'),
remove: () => wrap.remove()
}; }
function renderMsg(m, meUid) {
const mine = m.userId === meUid;
const ts = m.createdAt?.toDate?.() || new Date();
const time = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const bubble = m.gifUrl
? `<img src="${esc(m.gifUrl)}" style="max-width:220px; border-radius:12px">`
: `<div style="white-space:pre-wrap">${esc(m.text || '')}</div>`;
return `
<div style="display:flex; gap:8px; margin:8px 0; ${mine ? 'flex-direction:row-reverse' : ''}">
${mine ? '' : avatar(null, 28)}
<div style="max-width:70%; background:${mine ? '#111827' : '#ffffff'}; color:${mine ? '#fff' : '#111827'}; border:1px solid #e5e7eb; border-radius:14px; padding:10px 12px;">
${bubble}
<div style="font-size:11px; color:${mine ? '#d1d5db' : '#6b7280'}; margin-top:4px">${time}</div>
</div>
</div>`;
}
async function openDMModal({ toUid, toName = '', toPhotoURL = '' }) {
const me = auth.currentUser;
if (!me) { alert('Please sign in to send a message.'); return; }
if (!toUid) { alert('Missing recipient.'); return; }
if (toUid === me.uid) { alert('That is you 🙃'); return; }
console.log('[DM] opening with', { me: me.uid, to: toUid });

const ui = buildModal({ toUid, toName, toPhotoURL });
let unsub = null;
try {
const { ref } = await ensureDmThread(me.uid, toUid);
const msgsRef = ref.collection('messages');
// --- DM inbox UI ---
function timeAgo(d) {
  const s = Math.floor((Date.now() - d.getTime())/1000);
  if (s < 60) return s+'s';
  const m = Math.floor(s/60); if (m < 60) return m+'m';
  const h = Math.floor(m/60); if (h < 24) return h+'h';
  const d0 = Math.floor(h/24); return d0+'d';
}

function ensureDmShell() {
  // Bell + panel container, appended under header
  let shell = document.getElementById('dmShell');
  if (shell) return shell;
  shell = document.createElement('div');
  shell.id = 'dmShell';
  shell.innerHTML = `
    <style>
    .dm-bell { position: relative; display:inline-flex; align-items:center; gap:8px; }
  .dm-badge { position:absolute; top:-6px; right:-6px; background:#ef4444; color:#fff; font-size:11px; 
    line-height:1; padding:3px 5px; border-radius:999px; min-width:16px; text-align:center; }
  .dm-panel { display:none; background:#101317; border:1px solid #222; border-radius:12px; 
  width:min(420px, 92vw); max-height:60vh; overflow:auto; position:absolute; z-index:30;
  margin-top:8px; box-shadow:0 10px 30px rgba(0,0,0,.35); }
  .dm-row { display:flex; gap:10px; padding:10px 12px; cursor:pointer; align-items:center; }
  .dm-row:hover { background:#161a20; }
  .dm-row .title { font-weight:700; }
  .dm-row .sub { color:#9ca3af; font-size:12px; }
  .dm-unread .title::after { content:' •'; color:#22c55e; }
  </style>
<div id="dmBellWrap" style="position:relative; display:flex; justify-content:center; margin:6px 0;">
<button id="dmBell" class="pill dm-bell" type="button" title="Messages">
  🔔 Messages <span id="dmBadge" class="dm-badge" style="display:none">0</span>
  </button>
  <div id="dmPanel" class="dm-panel"></div>
    </div>`;
  // place under your header block
  const anchor = document.getElementById('profileHeader');
  if (anchor && anchor.parentNode) anchor.parentNode.appendChild(shell);
  return shell;
}

// attach after we verified parent document exists
unsub = msgsRef.orderBy('createdAt').limit(300).onSnapshot((snap) => {
  const rows = [];
  snap.forEach(d => rows.push(renderMsg(d.data(), me.uid)));
  ui.messagesEl.innerHTML = rows.join('');
  ui.messagesEl.scrollTop = ui.messagesEl.scrollHeight;
}, (err) => {
console.error('[DM] onSnapshot error', err);
alert('Failed to load messages: ' + err.message);
  });
ui.formEl.addEventListener('submit', async (e) => {
e.preventDefault();
const txt = (ui.inputEl.value || '').trim();
if (!txt) return;
ui.inputEl.value = '';
try {
await msgsRef.add({
userId: me.uid,
  text: txt,
  createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  } catch (err) {
  console.error('[DM] send error', err);
  alert('Failed to send: ' + err.message);
        }});

  // optional: send GIF helper (also rule-compliant)
  window.sendDMGif = async (gifUrl) => {
  if (!gifUrl) return;
  try {
  await msgsRef.add({
  userId: me.uid,
  gifUrl,
  createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  } catch (err) {
  console.error('[DM] GIF send error', err);
  alert('Failed to send GIF: ' + err.message);}};
} catch (e) {
  console.error('[DM] open error', e);
  alert('Failed to open chat: ' + e.message);
    }
ui.closeBtn.addEventListener('click', () => {
if (unsub) unsub();
ui.remove();
});}
window.openDMModal    = openDMModal;
window.ensureDmThread = (a,b) => ensureDmThread(a,b).then(x => x.dmId);
window.makeDmId       = makeDmId;
})();
