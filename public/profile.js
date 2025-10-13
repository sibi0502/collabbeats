// profile.js — CollabBeats Profile Page (FULL)
(() => {
  const auth    = window.auth    || firebase.auth();
  const db      = window.db      || firebase.firestore();
  const storage = window.storage || firebase.storage();

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const headerEl    = $('profileHeader');
  const beatsListEl = $('beatsList');
  const signOutBtn  = $('signOutBtn');   // optional in your header
  const loginLink   = $('loginLink');    // optional in your header

  // ---------- Small utils ----------
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]
    ));
  }
  function personSVG() {
    return 'data:image/svg+xml;utf8,'+encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">' +
      '<circle cx="40" cy="40" r="40" fill="#1f2937"/>' +
      '<circle cx="40" cy="30" r="14" fill="#9ca3af"/>' +
      '<path d="M12,74c5-16,26-18,28-18s23,2,28,18" fill="#9ca3af"/>' +
      '</svg>'
    );
  }
  function getQueryUID(){
    const p = new URLSearchParams(location.search);
    const q = p.get('uid');
    return (q && q.trim()) ? q.trim() : null;
  }
async function uploadAvatarAndSave(uid, file) {
  if (!uid || !file) throw new Error('Missing uid or file');

  // Basic type guard
  const ok = ['image/png','image/jpeg','image/webp','image/gif'];
  if (file.type && !ok.includes(file.type)) {
    throw new Error('Please choose a PNG, JPG, WEBP, or GIF.');
  }

  // Derive extension safely
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg','jpg');

  // OPTION A path (flat file):
  const ref = firebase.storage().ref(`avatars/${uid}.${ext}`);

  // OPTION B path (folder):
  // const ref = firebase.storage().ref(`avatars/${uid}/avatar.${ext}`);

  // Upload with contentType
  await ref.put(file, { contentType: file.type || `image/${ext}` });

  // Get URL and save to Firestore user doc
  const url = await ref.getDownloadURL();
  await firebase.firestore().collection('users').doc(uid)
    .set({ photoURL: url }, { merge: true });

  return url;
}
  // ---------- “Looking for” ----------
  const LOOKING_FOR_OPTIONS = [
    'co-producer','vocalist','topline','drummer','guitar','keys','bass',
    'mix','master','arrangement','sound-design','marketing'
  ];
  function badgesHTML(arr) {
    if (!arr || !arr.length) return '<span class="muted-sm">Not specified</span>';
    return arr.map(x => '<span class="tag tag-muted">'+esc(x)+'</span>').join('');
  }
  function editorHTML(current) {
    current = Array.isArray(current) ? current : [];
    const set = {};
    current.forEach(x => set[String(x).toLowerCase()] = true);

    const boxes = LOOKING_FOR_OPTIONS.map(opt => {
      const checked = set[opt] ? 'checked' : '';
      return (
        '<label class="tag-select">' +
          '<input type="checkbox" value="'+esc(opt)+'" '+checked+' /> ' + esc(opt) +
        '</label>'
      );
    }).join('');
  return (
  '<div id="lfEditor" style="margin-top:10px">' +
  '<div class="row-left" style="margin:6px 0 10px;gap:8px;flex-wrap:wrap">' +
  boxes +
'</div>' +
'<div class="row-left" style="gap:10px">' +
'<button id="lfSave"   class="pill" type="button">Save</button>' +
'<button id="lfCancel" class="pill" type="button">Cancel</button>' +
'</div>' +
'</div>'
    );
  }

  // ---------- Follows ----------
  async function isFollowing(targetUid) {
    const me = auth.currentUser;
    if (!me || me.uid === targetUid) return false;
    const id = me.uid + '_' + targetUid;
    const doc = await db.collection('follows').doc(id).get();
    return doc.exists;
  }
  async function follow(targetUid) {
    const me = auth.currentUser;
    if (!me) { alert('Please sign in to follow.'); return; }
    const id = me.uid + '_' + targetUid;
    await db.collection('follows').doc(id).set({
      followerId: me.uid,
      followingId: targetUid,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  async function unfollow(targetUid) {
    const me = auth.currentUser; if (!me) return;
    const id = me.uid + '_' + targetUid;
    await db.collection('follows').doc(id).delete();
  }
  async function countsFor(uid) {
    const [a,b] = await Promise.all([
      db.collection('follows').where('followingId','==',uid).get(),
      db.collection('follows').where('followerId','==',uid).get()
    ]);
    return { followers: a.size, following: b.size };
  }

  // ---------- Likes ----------
  async function userLikeState(beatId){
    const u = auth.currentUser; if(!u) return false;
    try{
      const snap = await db.collection('beats').doc(beatId).collection('likes').doc(u.uid).get();
      return snap.exists;
    }catch{ return false; }
  }
  async function toggleLike(beatId){
    const u = auth.currentUser; if(!u){ alert('Please log in to like beats.'); return; }
    const beatRef = db.collection('beats').doc(beatId);
    const likeRef = beatRef.collection('likes').doc(u.uid);
    return db.runTransaction(async tx => {
      const likeSnap = await tx.get(likeRef);
      const beatSnap = await tx.get(beatRef);
      const n = (beatSnap.exists ? (beatSnap.data().likeCount || 0) : 0);
  if (likeSnap.exists){
  tx.delete(likeRef);
  tx.update(beatRef,{ likeCount: Math.max(0, n-1) });
  return { liked:false, count: Math.max(0, n-1) };}
      tx.set(likeRef,{ userId:u.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      tx.update(beatRef,{ likeCount: n+1 });
      return { liked:true, count: n+1 };
    });
  }

 // ---------- Beat cards ----------
async function beatCardHTML(doc, isOwner) {
  const b = Object.assign({ id: doc.id }, doc.data());

  // AUDIO URL (support both downloadURL/audioURL and storagePath)
  let url = b.downloadURL || b.audioURL || '';
  if (!url && b.storagePath) {
    try { url = await storage.ref(b.storagePath).getDownloadURL(); } catch(e){}
  }

  // COVER URL (support coverUrl or coverURL; try coverPath if present)
  let art = b.coverUrl || b.coverURL || '';
  if (!art && b.coverPath) {
    try { art = await storage.ref(b.coverPath).getDownloadURL(); } catch(e){}
  }

  const liked = await userLikeState(b.id);

  return (
    '<article class="track-row" data-id="'+esc(b.id)+'">' +
      (art
        ? '<img class="track-art" src="'+esc(art)+'" alt="">'
        : '<div class="track-art" style="background:#eef1f4"></div>') +

      '<div class="track-main">' +
        '<div class="track-title"><span>'+esc(b.title||'Untitled')+'</span></div>' +
        '<div class="track-sub">'+esc(b.genre||'')+'</div>' +
        (url ? '<audio controls src="'+esc(url)+'" preload="none"></audio>' : '') +
      '</div>' +

      '<div class="track-actions">' +
        '<div class="actions-row">' +
      '<button class="btn btn-like '+(liked?'liked':'')+'" data-like="'+esc(b.id)+'">'+(liked?'♥ Liked':'♡ Like')+'</button>' +
          // NEW: comments button (keeps count in sync via data-cmt-count)
      '<button class="pill cmt-btn" data-cmt="'+esc(b.id)+'">💬 <span data-cmt-count="'+esc(b.id)+'">'+(b.commentCount||0)+'</span></button>' +
      (url ? '<a class="pill" href="'+esc(url)+'" download>Download</a>' : '') +
      (isOwner ? '<button class="btn btn-ghost danger" data-del="'+esc(b.id)+'" type="button">Delete</button>' : '') +
  '</div>' +
  '<div class="track-sub" data-like-count="'+esc(b.id)+'">'+(b.likeCount || 0)+' likes</div>' +
  '</div>' +
'</article>'
  );
}

function wireInteractions(container,isOwner,ownerUid){
container.addEventListener('click', async e => {
const btn = e.target?.closest?.('button,a');
if(!btn) return;

// like
  if (btn.hasAttribute('data-like')){
  const id = btn.getAttribute('data-like');
  const r = await toggleLike(id); if(!r) return;
  btn.classList.toggle('liked', r.liked);
  btn.textContent = r.liked? '♥ Liked':'♡ Like';
  const row = btn.closest('.track-row');
  if (row){
  const cEl = row.querySelector('[data-like-count]');
  if (cEl) cEl.textContent = r.count + ' likes';
        }
      }
// comments (use global modal from js/comments.js)
if (btn.hasAttribute('data-cmt')) {
  const id = btn.getAttribute('data-cmt');
  if (window.showComments) window.showComments(id);
  else alert('Comments module not loaded.');
  return;
}
 // delete (owner only)
      if (isOwner && btn.hasAttribute('data-del')){
        const id2 = btn.getAttribute('data-del');
        if(!confirm('Delete this beat?')) return;
        try{
  const ref  = db.collection('beats').doc(id2);
  const snap = await ref.get();
  if(!snap.exists) return;
  const data = snap.data();
          if (data.userId !== ownerUid){ alert('Not your beat.'); return; }
          if (data.storagePath){
            try{ await storage.ref(data.storagePath).delete(); }catch(e){}
          }
          await ref.delete();
          const row2 = btn.closest('.track-row');
          if (row2 && row2.remove) row2.remove();
        }catch(err){
          console.error(err);
          alert('Failed to delete beat: '+err.message);
        }
      }
    });  }
  // ---------- Modal + helpers ----------
  function showModal(title, html) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    wrap.innerHTML =
  '<div style="max-width:880px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.25)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eee">' +
    '<h3 style="margin:0;font-size:18px;font-weight:800">'+esc(title)+'</h3>' +
    '<button id="modalClose" class="pill">Close</button>' +
    '</div>' +
    '<div style="max-height:70vh;overflow:auto;padding:12px 16px" id="modalBody">'+(html||'')+'</div>' +
  '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    const closeBtn = wrap.querySelector('#modalClose');
    if (closeBtn) closeBtn.addEventListener('click', () => wrap.remove());
    return {
      setBody(h){ const b = wrap.querySelector('#modalBody'); if (b) b.innerHTML = h; },
      getBodyEl(){ return wrap.querySelector('#modalBody'); },
      root: wrap,
      close(){ wrap.remove(); }
    };
  }
  function avatar(url) {
    return url
      ? '<img src="'+esc(url)+'" style="width:40px;height:40px;border-radius:999px;object-fit:cover">'
      : '<img src="'+personSVG()+'" style="width:40px;height:40px;border-radius:999px">';
  }
async function getUsersByIds(uids) {
const out = new Map();
if (!uids || !uids.length) return out;
for (let i=0; i<uids.length; i+=10){
const chunk = uids.slice(i, i+10);
try{
  const snap = await db.collection('users')
  .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
    .get();
        snap.forEach(d => out.set(d.id, d.data()));
      }catch(e){ /* ignore */ }
    }
    return out;
  }

  // ---------- Followers / Following / Likes modals ----------
  async function showFollowers(uid){
    const modal = showModal('Followers', '<div class="track-sub">Loading…</div>');
    const snap = await db.collection('follows').where('followingId', '==', uid).orderBy('ts','desc').limit(50).get();
    if (snap.empty) { modal.setBody('<div class="track-sub">No followers yet.</div>'); return; }
    const ids = snap.docs.map(d => d.data().followerId);
    const users = await getUsersByIds(ids);
    const rows = ids.map(id => {
  const u = users.get(id) || {};
   return (
  '<div class="track-row" style="align-items:center">' +
  avatar(u.photoURL) +
  '<div class="track-main">' +
   '<div class="track-title">'+esc(u.username || id)+'</div>' +
    '<div class="track-sub">'+esc(id)+'</div>' +
   '</div>' +
  '<a class="pill" href="profile.html?uid='+encodeURIComponent(id)+'">View</a>' +
   '</div>'
      );
    }).join('');
    modal.setBody(rows);
  }
  async function showFollowing(uid){
    const modal = showModal('Following', '<div class="track-sub">Loading…</div>');
    const snap = await db.collection('follows').where('followerId', '==', uid).orderBy('ts','desc').limit(50).get();
    if (snap.empty) { modal.setBody('<div class="track-sub">You aren’t following anyone yet.</div>'); return; }
    const ids = snap.docs.map(d => d.data().followingId);
    const users = await getUsersByIds(ids);
    const rows = ids.map(id => {
      const u = users.get(id) || {};
  return (
  '<div class="track-row" style="align-items:center">' +
  avatar(u.photoURL) +
  '<div class="track-main">' +
  '<div class="track-title">'+esc(u.username || id)+'</div>' +
  '<div class="track-sub">'+esc(id)+'</div>' +
  '</div>' +
  '<a class="pill" href="profile.html?uid='+encodeURIComponent(id)+'">View</a>' +
  '</div>'
      );
    }).join('');
    modal.setBody(rows);
  }
  async function showLikesReceived(ownerUid){
    const modal = showModal('Likes received', '<div class="track-sub">Loading…</div>');
    let beatSnap;
    try{
      beatSnap = await db.collection('beats')
        .where('userId','==', ownerUid)
        .orderBy('timestamp','desc')
        .limit(20).get();
    }catch(e){
      beatSnap = await db.collection('beats').where('userId','==', ownerUid).limit(20).get();
    }
    if (beatSnap.empty) { modal.setBody('<div class="track-sub">No beats yet.</div>'); return; }

    const rows = [];
    for (let i=0;i<beatSnap.docs.length;i++){
      const bdoc = beatSnap.docs[i];
      const b    = Object.assign({ id:bdoc.id }, bdoc.data());

      const likesSnap = await db.collection('beats').doc(b.id).collection('likes')
        .orderBy('createdAt','desc')
        .limit(20).get();
      if (likesSnap.empty) continue;

  const likerIds = likesSnap.docs.map(d => d.id);
  const likers   = await getUsersByIds(likerIds);
  const people = likerIds.map(id => {
  const u = likers.get(id) || {};
  return (
    '<div style="display:flex;gap:10px;align-items:center">' +
      avatar(u.photoURL) +
    '<div>' +
    '<div class="track-title">'+esc(u.username || id)+'</div>' +
    '<div class="track-sub">'+esc(id)+'</div>' +
    '</div>' +
    '</div>'
        );
      }).join('');

      rows.push(
    '<article class="track-row">' +
    '<div class="track-main">' +
    '<div class="track-title">'+esc(b.title || 'Untitled')+'</div>' +
    '<div class="track-sub">Last 20 likes</div>' +
    '<div style="display:grid;gap:10px;margin-top:8px">'+people+'</div>' +
      '</div>' +
    '<div class="likes-badge">'+(b.likeCount || 0)+' likes</div>' +
    '</article>');
    }
    modal.setBody(rows.length ? rows.join('') : '<div class="track-sub">No likes yet.</div>');
  }
  async function showLikesGiven(myUid){
    const modal = showModal('Likes given', '<div class="track-sub">Loading…</div>');
    let likesSnap;
    try{
      likesSnap = await db.collectionGroup('likes')
        .where('userId','==', myUid)
        .orderBy('createdAt','desc')
        .limit(30).get();
    }catch(e){
      likesSnap = await db.collectionGroup('likes')
        .where('userId','==', myUid)
        .limit(30).get();
    }
    if (likesSnap.empty) { modal.setBody('<div class="track-sub">You haven’t liked any beats yet.</div>'); return; }

    const beatRefs = likesSnap.docs.map(d => d.ref.parent.parent).filter(Boolean);
    const beats = [];
    for (let i=0;i<beatRefs.length;i++){
      try {
        const s = await beatRefs[i].get();
        if (s.exists) beats.push(Object.assign({ id:s.id }, s.data()));
      } catch(e){}
    }

    const rows = beats.map(b => {
return (
'<article class="track-row">' +
(b.coverUrl ? '<img class="track-art" src="'+esc(b.coverUrl)+'" alt="">' : '<div class="track-art" style="background:#eef1f4"></div>') +
'<div class="track-main">' +
'<div class="track-title">'+esc(b.title || 'Untitled')+'</div>' +
'<div class="track-sub">'+esc(b.genre || '')+'</div>' +
'</div>' +
'<div class="likes-badge">'+(b.likeCount || 0)+' likes</div>' +
  '<a class="pill" href="profile.html?uid='+encodeURIComponent(b.userId)+'">Artist</a>' +
        '</article>'
      );
    }).join('');
    modal.setBody(rows);
  }

  // ---------- Direct Messages (simple chat) ----------
  function threadIdFor(a, b){
    return [String(a), String(b)].sort().join('__');
  }
  function renderDMMsg(m, meUid){
    const ts   = m.createdAt?.toDate?.() || new Date();
    const time = ts.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const mine = m.userId === meUid ? ' mine' : '';
    const body = m.text ? esc(m.text) : (m.gifUrl ? `<img class="chat-gif" src="${esc(m.gifUrl)}" alt="gif">` : '');
    const who  = m.userId === meUid ? 'You' : 'User';
    return `<div class="msg${mine}"><div class="meta">${who} • ${time}</div><div class="text">${body}</div></div>`;
  }

  // NEW: Inbox (list of threads)
  async function renderInbox(meUid){
    const wrap = document.getElementById('inboxWrap');
    const list = document.getElementById('threadList');
    if (!wrap || !list) return;
    wrap.classList.remove('hide');
    list.innerHTML = '<div class="track-sub">Loading…</div>';

    let snap;
    try {
      snap = await db.collection('dms')
        .where('participants','array-contains', meUid)
        .orderBy('lastMessageAt','desc')
        .limit(30).get();
    } catch (e) {
      snap = await db.collection('dms')
        .where('participants','array-contains', meUid)
        .limit(30).get();
    }

    if (snap.empty){
      list.innerHTML = '<div class="track-sub">No conversations yet.</div>';
      return;
    }

    const others = [];
    snap.forEach(d => {
      const t = d.data() || {};
      const other = (t.participants || []).find(x => x !== meUid);
      if (other) others.push(other);
    });
    const users = await getUsersByIds(others);

    list.innerHTML = snap.docs.map(d => {
      const t = d.data() || {};
      const other = (t.participants || []).find(x => x !== meUid) || '';
      const u = users.get(other) || {};
      const name = u.username || other;
      const photo = u.photoURL || '';
      const lastTs = t.lastMessageAt?.toDate?.() || t.createdAt?.toDate?.() || new Date();
      const lastText = t.lastText || 'Start the conversation';

      // unread if my read ts is missing or older than last message
      let unread = false;
      if (t.lastMessageAt) {
        const myRead = t.read?.[meUid];
        unread = !myRead ||
                 (myRead.toMillis ? myRead.toMillis() < t.lastMessageAt.toMillis()
                                  : true);
      }

      return `
        <div class="thread" data-uid="${esc(other)}">
          ${photo ? `<img class="avatar" src="${esc(photo)}" alt="">`
                  : `<div class="avatar" aria-hidden="true"></div>`}
        <div class="thread-main">
        <div class="title">${esc(name)} ${unread ? '<span class="badge-dot" title="Unread"></span>' : ''}</div>
        <div class="preview">${esc(lastText)}</div>
        </div>
          <div class="time">${lastTs.toLocaleString()}</div>
        </div>
      `;
    }).join('');

    // open thread on click, mark read
    list.onclick = (e) => {
      const row = e.target.closest('.thread');
      if (!row) return;
      const otherUid = row.dataset.uid;
      const u = users.get(otherUid) || {};
      openDM(otherUid, u.username, u.photoURL);

      // mark read for me
      db.collection('dms').doc(threadIdFor(meUid, otherUid)).set(
        { read: { [meUid]: firebase.firestore.FieldValue.serverTimestamp() } },
        { merge: true }
      ).catch(()=>{});
    };
  }

  async function openDM(otherUid, otherName, otherPhotoURL){
    const me = auth.currentUser;
    if (!me) {
      const next = encodeURIComponent(location.pathname + location.search);
      alert('Please sign in to send a message.');
      location.href = 'login.html?next='+next;
      return;
    }

    const title =
      'Chat with ' + (otherName ? esc(otherName) : esc(otherUid));
    const html =
      '<div style="display:grid;grid-template-rows:auto 1fr auto;gap:10px;min-height:60vh">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
    (otherPhotoURL ? '<img src="'+esc(otherPhotoURL)+'" style="width:36px;height:36px;border-radius:999px;object-fit:cover">' : '') +
    '<div class="track-title" style="margin:0">'+esc(otherName || otherUid)+'</div>' +
    '<a class="pill" href="profile.html?uid='+encodeURIComponent(otherUid)+'" style="margin-left:auto">View profile</a>' +
  '</div>' +
    '<div id="dmMessages" class="messages" style="height:50vh"></div>' +
      '<form id="dmForm" class="chat-form">' +
      '<input id="dmInput" placeholder="Type a message…" autocomplete="off" />' +
          '<button id="dmSend" type="submit">Send</button>' +
        '</form>' +
      '</div>';

    const modal      = showModal(title, html);
    const bodyEl     = modal.getBodyEl();
    const messagesEl = bodyEl.querySelector('#dmMessages');
    const formEl     = bodyEl.querySelector('#dmForm');
    const inputEl    = bodyEl.querySelector('#dmInput');

    const tid     = threadIdFor(me.uid, otherUid);
    const tRef    = db.collection('dms').doc(tid);
    const msgsRef = tRef.collection('messages');

    // ensure thread exists (idempotent)
    // ensure thread exists (idempotent & order-safe)
try {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(tRef);
    if (!snap.exists) {
      // create once with a canonical, sorted array
      const participants = [me.uid, otherUid].sort();
      tx.set(tRef, {
    participants,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    // if it exists, do NOT touch participants (rules require equality)
  });

  // mark read for me (safe to merge)
  await tRef.set(
    { read: { [me.uid]: firebase.firestore.FieldValue.serverTimestamp() } },
    { merge: true }
  );
} catch (e) {
  console.error('ensure dm thread failed:', e);
  alert('Failed to open chat: ' + e.message);
  return;
}


    // Listen
    const unsub = msgsRef.orderBy('createdAt').limit(300).onSnapshot(
      (qs) => {
        const rows = [];
 qs.forEach(d => rows.push(renderDMMsg(d.data(), me.uid)));
messagesEl.innerHTML = rows.join('');
messagesEl.scrollTop = messagesEl.scrollHeight;
      },
      (err) => {
        console.error('dm onSnapshot error:', err);
        alert('Failed to load messages: ' + err.message);
      }
    );

    // Send
    if (formEl && inputEl){
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
  const txt = (inputEl.value || '').trim();
        if (!txt) return;
   inputEl.value = '';
        try{
          await msgsRef.add({
     userId: me.uid,
            text: txt,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          // update thread metadata (for inbox ordering + preview + read)
          await tRef.set({
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastText: txt.slice(0, 120),
            read: { [me.uid]: firebase.firestore.FieldValue.serverTimestamp() }
          }, { merge: true });
        }catch(err){
          console.error('send dm error:', err);
          alert('Failed to send: ' + err.message);
        }
      });
    }

    // stop listening when modal closes
    modal.root.querySelector('#modalClose')?.addEventListener('click', () => unsub());
  }


// ---------- Header render ----------
async function renderHeader(userObj, isOwner){
  if (!headerEl) return;

  const uid        = userObj.uid;
  let   username   = userObj.username || 'user';
  const photoURL   = userObj.photoURL || '';
  let   lookingFor = Array.isArray(userObj.lookingFor) ? userObj.lookingFor : [];

  const c  = await countsFor(uid);
  const me = auth.currentUser;
  const showFollowBtn = !!(me && !isOwner);
  const showDMBtn     = !!(me && !isOwner);

  // 1) Build avatar block (image + change button if owner)
  const baseImg = photoURL
    ? '<img id="avatarImg" src="'+esc(photoURL)+'" alt="" style="width:96px;height:96px;border-radius:999px;object-fit:cover">'
    : '<img id="avatarImg" src="'+personSVG()+'" alt="" style="width:96px;height:96px;border-radius:999px">';

  const avatarBlock = isOwner
    ? `
<div style="position:relative;display:inline-block">
  ${baseImg}
  <label
  for="avatarFile"
  class="pill"
  style="
   position:absolute;right:-8px;bottom:-8px;font-size:12px;cursor:pointer;
   padding:6px 10px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.15);
  border-radius:999px;box-shadow:0 4px 10px rgba(0,0,0,.25);
          "
          title="Change profile photo"
        >Change</label>
        <input id="avatarFile" type="file" accept="image/*" style="display:none">
      </div>
    `
    : baseImg;

  // 2) Render header HTML
  headerEl.innerHTML =
    '<div style="max-width:900px;margin:24px auto;padding:0 16px;display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap">' +

      avatarBlock +

'<div style="text-align:center">' +
'<div style="font-size:28px;font-weight:800">'+esc(username)+'</div>' +
'<div style="color:#6b7280;font-size:12px">'+esc(uid)+'</div>' +
'<div style="margin-top:10px">' +
'<div class="muted-sm" style="margin-bottom:6px">Looking for</div>' +
'<div id="lfContainer">' +
'<div id="lfView" class="row-center">'+ badgesHTML(lookingFor) +'</div>' +
(isOwner ? '<div style="margin-top:8px"><button id="lfEdit" class="pill" type="button">Edit</button></div>' : '') +
'</div>' +
'</div>' +

'<div style="display:flex;gap:16px;justify-content:center;margin-top:12px;flex-wrap:wrap">' +
'<button id="followersPill" class="pill link" type="button" title="See who follows this profile" aria-label="View followers">Followers: <strong id="followersCount">'+c.followers+'</strong></button>' +
'<button id="followingPill" class="pill link" type="button" title="See accounts this profile follows" aria-label="View following">Following: <strong id="followingCount">'+c.following+'</strong></button>' +
'</div>' +
'<div style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
(showFollowBtn ? '<button id="followBtn" class="pill" type="button">Follow</button>' : '') +
(showDMBtn     ? '<button id="dmBtn" class="pill" type="button">Message</button>' : '') +
(isOwner ? '<button id="signOutBtnTop" class="pill" type="button">Sign out</button>' : '') +
    '</div>' +
'<div style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
'<button id="likesRecvBtn" class="pill" type="button" title="See who liked your beats (and which tracks)">Likes received</button>' +
'<button id="likesGivenBtn" class="pill" type="button" title="See beats you have liked across CollabBeats">Likes given</button>' +
'</div>' +
'</div>' +
'</div>';

 const topSign = $('signOutBtnTop');
    if (topSign) topSign.onclick = doSignOut;
if (isOwner) {
  const avatarInput = document.getElementById('avatarFile');
  const avatarImg   = document.getElementById('avatarImg');
  if (avatarInput && avatarImg) {
    avatarInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // instant local preview
      const prevSrc = avatarImg.src;
      avatarImg.src = URL.createObjectURL(file);

      try {
        const url = await uploadAvatarAndSave(uid, file);
        if (url) avatarImg.src = url;
      } catch (err) {
        console.error('avatar upload error:', err);
        // revert preview if the upload truly failed
        avatarImg.src = prevSrc;
        alert('Failed to update photo: ' + (err && err.message ? err.message : err));
      } finally {
        avatarInput.value = '';}});
  }
}
// follow toggle
const fbtn = $('followBtn');
if (fbtn) {
let amFollowing = await isFollowing(uid);
fbtn.textContent = amFollowing ? 'Following' : 'Follow';
if (amFollowing) fbtn.classList.add('liked');
fbtn.setAttribute('data-state', amFollowing ? 'on' : 'off');
fbtn.onclick = async () => {
const on = fbtn.getAttribute('data-state') === 'on';
try {
if (on) { await unfollow(uid); }
else    { await follow(uid); }
fbtn.setAttribute('data-state', on ? 'off' : 'on');
fbtn.classList.toggle('liked', !on);
fbtn.textContent = on ? 'Follow' : 'Following';
const cc = await countsFor(uid);
const f1 = $('followersCount'); const f2 = $('followingCount');
if (f1) f1.textContent = cc.followers;
if (f2) f2.textContent = cc.following;
} catch (e) {
 console.error(e);
 alert('Failed to update follow: ' + e.message);
        }
      };
    }

    // DM button
    const dmBtn = $('dmBtn');
    if (dmBtn) dmBtn.onclick = () => openDM(uid, username, photoURL);

// looking-for editor (owner only)
if (isOwner) {
const editBtn = $('lfEdit');
const lfContainer = $('lfContainer');
if (editBtn && lfContainer) {
editBtn.onclick = function(){
lfContainer.innerHTML = editorHTML(lookingFor);
const save   = $('lfSave');
const cancel = $('lfCancel');

    if (save) save.onclick = async function(){
  try {
  const checks = Array.from(document.querySelectorAll('#lfEditor input[type="checkbox"]'));
  const vals = checks.filter(c => c.checked).map(c => c.value);
  await db.collection('users').doc(uid).set({ lookingFor: vals }, { merge: true });
  lookingFor = vals.slice();
  lfContainer.innerHTML =
'<div id="lfView" class="row-center">'+ badgesHTML(vals) +'</div>' +
'<div style="margin-top:8px"><button id="lfEdit" class="pill" type="button">Edit</button></div>';
const e2 = $('lfEdit');
if (e2) e2.onclick = editBtn.onclick; } catch (e) {
console.error(e);
alert('Failed to save: ' + e.message); }};

if (cancel) cancel.onclick = function(){
 lfContainer.innerHTML =
 '<div id="lfView" class="row-center">'+ badgesHTML(lookingFor) +'</div>' +
 '<div style="margin-top:8px"><button id="lfEdit" class="pill" type="button">Edit</button></div>';
 const e2 = $('lfEdit');
if (e2) e2.onclick = editBtn.onclick; }; };}
    }

    // counters open the lists
    const followersPill = $('followersPill');
    const followingPill = $('followingPill');
    if (followersPill) followersPill.onclick = () => showFollowers(uid);
    if (followingPill) followingPill.onclick = () => showFollowing(uid);

    // Likes modals
    const likesRecvBtn = $('likesRecvBtn');
    const likesGivenBtn= $('likesGivenBtn');
    if (likesRecvBtn) likesRecvBtn.onclick = () => showLikesReceived(uid);
    if (likesGivenBtn) likesGivenBtn.onclick = () => {
      const me2 = auth.currentUser; if (!me2) { alert('Sign in to view your likes.'); return; }
      showLikesGiven(me2.uid);
    };
  }

  // ---------- Sign out ----------
  async function doSignOut(){
    try { await auth.signOut(); } finally { window.location.replace('login.html'); }
  }
  if (signOutBtn) signOutBtn.onclick = doSignOut;

  // ---------- Page boot ----------
  auth.onAuthStateChanged(async me => {
    if (signOutBtn) signOutBtn.style.display = me ? 'inline-block' : 'none';
    if (loginLink)  loginLink.style.display  = me ? 'none' : 'inline-block';

    const qUid = getQueryUID();
    const targetUid = qUid ? qUid : (me ? me.uid : null);

    if (!targetUid){
      if (beatsListEl) beatsListEl.innerHTML = '<div class="track-sub" style="text-align:center">Please sign in.</div>';
      return;
    }


    // header data
    let username='user', photoURL='', lookingFor=[];
    try{
      const d = await db.collection('users').doc(targetUid).get();
      if (d.exists){
    const u = d.data();
        username   = u.username || username;
    photoURL   = u.photoURL || photoURL;
        lookingFor = Array.isArray(u.lookingFor) ? u.lookingFor : [];
      }
    }catch(e){}

    await renderHeader({uid:targetUid, username, photoURL, lookingFor}, !!(me && me.uid===targetUid));

    // show inbox only on my own profile
    if (me && me.uid === targetUid) {
      renderInbox(me.uid);
    }

    if (!beatsListEl) return;
    beatsListEl.innerHTML = '<div class="track-sub" style="text-align:center">Loading…</div>';

    let snap;
    try{
      snap = await db.collection('beats')
  .where('userId','==',targetUid)
  .where('visibility','==','public')
   .orderBy('timestamp','desc')
 .get();
    }catch(e){
      // fallback for old docs without visibility / index
      snap = await db.collection('beats').where('userId','==',targetUid).get();
    }

    if (snap.empty){
      beatsListEl.innerHTML = '<div class="track-sub" style="text-align:center">No beats yet.</div>';
      return;
    }

  const isOwner = !!(me && me.uid===targetUid);
  const htmlArr = [];
  for (let i=0;i<snap.docs.length;i++){
  htmlArr.push(await beatCardHTML(snap.docs[i], isOwner));}
  beatsListEl.innerHTML = htmlArr.join('');
wireInteractions(beatsListEl, isOwner, targetUid);
  });
})();
