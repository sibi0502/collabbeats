// chat.js — defines window.initChat(roomId, {elements})
// Firestore: chatRooms/{roomId}/messages/{msgId}
// Message: { userId, username, photoURL?, text?, gifUrl?, createdAt }

(function () {
  const auth = window.auth || firebase.auth();
  const db   = window.db   || firebase.firestore();

  const esc = (s)=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const autoScroll = (el)=>{ el.scrollTop = el.scrollHeight; };

  // ---- cache my profile info so messages can store username/photoURL ----
  let meUid = auth.currentUser?.uid || null;
  let meInfo = { username: '', photoURL: '' };

  async function refreshMeInfo(user) {
    if (!user) { meUid = null; meInfo = { username: '', photoURL: '' }; return; }
    meUid = user.uid;
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      const u = snap.exists ? snap.data() : {};
      meInfo = {
        username: u.username || user.displayName || (user.email ? user.email.split('@')[0] : 'user'),
        photoURL: u.photoURL || user.photoURL || ''
      };
    } catch {
      meInfo = {
        username: user.displayName || (user.email ? user.email.split('@')[0] : 'user'),
        photoURL: user.photoURL || ''
      };
    }
  }
  // prime on load
  refreshMeInfo(auth.currentUser);
  auth.onAuthStateChanged(refreshMeInfo);

  // ---- GIPHY helper ----
  async function gifSearch(apiKey, q, limit = 12) {
    const endpoint = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg`;
    const res = await fetch(endpoint);
    const data = await res.json();
    return (data.data || []).map(g => ({
      url: g.images?.original?.url,
      preview: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url
    })).filter(x => x.url);
  }

  // ---- render a message with profile link ----
  function renderMsg(m) {
    const uid   = m.userId || '';
    const name  = esc(m.username || 'user');
    const pURL  = m.photoURL ? esc(m.photoURL) : '';
    const ts    = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
    const time  = ts.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    const mine  = (meUid && m.userId === meUid) ? ' mine' : '';

    const userChip = uid
      ? `<a class="msg-user" href="profile.html?uid=${encodeURIComponent(uid)}">
           ${pURL ? `<img class="msg-avatar" src="${pURL}" alt="">` : ''}
           <span>${name}</span>
         </a>`
      : `<span class="msg-user">
           ${pURL ? `<img class="msg-avatar" src="${pURL}" alt="">` : ''}
           <span>${name}</span>
         </span>`;

    if (m.gifUrl) {
      return `
        <div class="msg${mine}">
          <div class="meta">${userChip} • ${time}</div>
          <img class="chat-gif" src="${esc(m.gifUrl)}" alt="gif" />
        </div>`;
    }
    return `
      <div class="msg${mine}">
        <div class="meta">${userChip} • ${time}</div>
        <div class="text">${esc(m.text || '')}</div>
      </div>`;
  }

  // ---- public entrypoint ----
  window.initChat = function initChat(roomId, opts = {}) {
    if (!roomId) throw new Error('initChat: roomId is required');

    const messagesEl  = opts.elements?.messagesEl   || document.getElementById('messages');
    const formEl      = opts.elements?.formEl       || document.getElementById('composer');
    const inputEl     = opts.elements?.inputEl      || document.getElementById('msg');
    const sendBtn     = opts.elements?.sendBtn      || document.getElementById('sendBtn');
    const gifInputEl  = opts.elements?.gifInputEl   || document.getElementById('gifQuery');
    const gifBtnEl    = opts.elements?.gifBtnEl     || document.getElementById('gifSearchBtn');
    const gifResults  = opts.elements?.gifResultsEl || document.getElementById('gifResults');

    if (!messagesEl || !formEl || !inputEl) {
      console.error('Chat elements missing'); return;
    }

    const roomRef = db.collection('chatRooms').doc(roomId);
    const msgsRef = roomRef.collection('messages');

    // Soft bump for lobby "active" sort
    roomRef.set({
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(()=>{});

    // Live messages
    msgsRef.orderBy('createdAt').limit(200).onSnapshot(snap => {
      const html = [];
      snap.forEach(doc => html.push(renderMsg(doc.data())));
      messagesEl.innerHTML = html.join('');
      autoScroll(messagesEl);
    }, err => {
      console.error('messages onSnapshot error:', err);
      alert('Failed to load messages: ' + err.message);
    });

    // Send text
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const txt = (inputEl.value || '').trim();
      if (!txt) return;
      inputEl.value = '';
      try {
        const me = auth.currentUser;
        if (!me) { alert('Please sign in.'); return; }
        await msgsRef.add({
          userId: me.uid,
          username: meInfo.username || me.displayName || (me.email ? me.email.split('@')[0] : 'user'),
          photoURL: meInfo.photoURL || '',
          text: txt,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        roomRef.set({ lastMessageAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(()=>{});
      } catch (err) {
        console.error('send text error:', err);
        alert('Failed to send message: ' + err.message);
      }
    });

    // GIF search + send
    const GIPHY_KEY = 'Pi52xwhrbSewqvijSZL3Ywd6oCm4eTAx'; // demo key; replace with yours
    async function doGifSearch() {
      const q = (gifInputEl?.value || '').trim();
      if (!gifResults) return;
      if (!q) { gifResults.innerHTML = ''; return; }
      gifResults.innerHTML = '<div class="muted">Searching…</div>';
      try {
        const items = await gifSearch(GIPHY_KEY, q);
        gifResults.innerHTML = items.map(it => `
          <button class="gifpick" type="button" data-url="${esc(it.url)}" title="Send GIF">
            <img class="gif-option" src="${esc(it.preview || it.url)}" alt="gif" />
          </button>
        `).join('');
      } catch (e) {
        console.error('gif search error', e);
        gifResults.innerHTML = '<div class="muted">Failed to load GIFs.</div>';
      }
    }

    gifBtnEl?.addEventListener('click', doGifSearch);
    gifResults?.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button.gifpick');
      if (!btn) return;
      const url = btn.getAttribute('data-url');
      gifResults.innerHTML = '';
      try {
        const me = auth.currentUser;
        if (!me) { alert('Please sign in.'); return; }
        await msgsRef.add({
          userId: me.uid,
          username: meInfo.username || me.displayName || (me.email ? me.email.split('@')[0] : 'user'),
          photoURL: meInfo.photoURL || '',
          gifUrl: url,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        roomRef.set({ lastMessageAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(()=>{});
      } catch (err) {
        console.error('send gif error:', err);
        alert('Failed to send GIF: ' + err.message);
      }
    });
  };
})();
