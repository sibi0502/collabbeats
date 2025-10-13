
// comments.js — shared, idempotent comments modal for Explore + Profile
// Uses Firebase v8 compat (firebase.*). No page-specific dependencies.
(function () {
const auth = window.auth || firebase.auth();
const db   = window.db   || firebase.firestore();
function esc(s){
return String(s == null ? "" : s).replace(/[&<>"']/g, m =>
({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m]));}
let current = null; // { wrap, unsub, keyHandler }
function closeCommentsModal() {
if (!current) return;
try { current.unsub && current.unsub(); } catch(_) {}
try { document.removeEventListener("keydown", current.keyHandler); } catch(_) {}
try { current.wrap.remove(); } catch(_) {}
current = null;}
// Expose a global closer (optional)
  window.__closeCommentsModal = closeCommentsModal;
// Utility: bump the visible comment counter on any beat card
function bumpVisibleCount(beatId, delta) {
try {
const sel = `[data-cmt-count="${CSS.escape(beatId)}"]`;
const el  = document.querySelector(sel);
if (!el) return;
const n = parseInt((el.textContent.match(/\d+/)||["0"])[0], 10) || 0;
el.textContent = String(Math.max(0, n + delta));
} catch(_) {}}
async function showComments(beatId) {
if (!beatId) return;
// If there is an existing modal, close it first (idempotent)
    closeCommentsModal();
// Build modal shell
const wrap = document.createElement("div");
wrap.id = "commentsModalWrap";
wrap.style.cssText =
"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;" +
"display:flex;align-items:center;justify-content:center;padding:16px";
wrap.innerHTML = `
<div style="max-width:720px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.25)">
<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eee">
<h3 style="margin:0;font-size:18px;font-weight:800">Comments</h3>
<button class="pill" id="cmtClose">Close</button>
</div>
<div style="max-height:60vh;overflow:auto;padding:12px 16px">
<div id="cmtList" class="list">Loading…</div>
</div>
<div style="padding:12px 16px;border-top:1px solid #eee">
<form id="cmtForm" class="row" style="gap:8px">
<input id="cmtInput" placeholder="Write a comment…" maxlength="500" style="flex:1">
<button class="pill" type="submit">Post</button>
</form>
<div id="cmtHint" class="muted" style="margin-top:6px;display:none">Sign in to comment.</div>
</div>
</div>
`;
document.body.appendChild(wrap);
// Elements
const listEl  = wrap.querySelector("#cmtList");
const formEl  = wrap.querySelector("#cmtForm");
const inputEl = wrap.querySelector("#cmtInput");
const hintEl  = wrap.querySelector("#cmtHint");
// Close behaviors
const keyHandler = (e) => { if (e.key === "Escape") closeCommentsModal(); };
document.addEventListener("keydown", keyHandler);
wrap.addEventListener("click", (e) => { if (e.target === wrap) closeCommentsModal(); });
wrap.querySelector("#cmtClose").onclick = closeCommentsModal;
// Track "current" for safe cleanup
current = { wrap, unsub: null, keyHandler };

// Auth gating for form
const me = auth.currentUser;
if (!me) { formEl.style.display = "none"; hintEl.style.display = "block"; }

// Resolve beat owner (enables owner delete)
const beatRef = db.collection("beats").doc(beatId);
let beatOwner = null;
try {
const bs = await beatRef.get();
if (bs.exists) beatOwner = bs.data().userId || null;
} catch(_) {}
const cmtsRef = beatRef.collection("comments");
// Live list
current.unsub = cmtsRef.orderBy("createdAt","asc").limit(300).onSnapshot(
(qs) => {
if (qs.empty) {
listEl.innerHTML = '<div class="muted">No comments yet.</div>';
return;}
const rows = [];
qs.forEach(d => {
const c  = d.data() || {};
const ts = c.createdAt?.toDate?.() || new Date();
const canDel = (me && (me.uid === c.userId || me.uid === beatOwner));
  rows.push(`
<div class="note" data-cid="${d.id}" style="padding:8px 0;border-bottom:1px solid #f1f1f1">
<div class="row" style="justify-content:space-between;gap:8px;align-items:center">
<div class="muted" style="font-size:12px">${esc(c.username || c.userId || "User")} • ${ts.toLocaleString()}</div>
${canDel ? `<button class="pill" data-del="${d.id}">Delete</button>` : ""}
</div>
<div style="margin-top:6px">${esc(c.text || "")}</div>
</div>
`);
});
listEl.innerHTML = rows.join("");
listEl.scrollTop = listEl.scrollHeight;
},
() => { listEl.innerHTML = '<div class="muted">Failed to load comments.</div>'; }
);
// Submit a new comment
formEl.addEventListener("submit", async (e) => {
e.preventDefault();
const me2 = auth.currentUser; if (!me2) return;
const text = (inputEl.value || "").trim();
if (!text) return;

inputEl.value = "";
inputEl.disabled = true;
try {
// Resolve username once (fallback to uid)
let uname = me2.uid;
try {
const d = await db.collection("users").doc(me2.uid).get();
if (d.exists && d.data().username) uname = d.data().username;
} catch(_) {}
await db.runTransaction(async (tx) => {
const bSnap   = await tx.get(beatRef);
const count   = bSnap.exists ? (bSnap.data().commentCount || 0) : 0;
const newDoc  = cmtsRef.doc();
tx.set(newDoc, {
userId: me2.uid,
username: uname,
text,
createdAt: firebase.firestore.FieldValue.serverTimestamp()
 });
tx.update(beatRef, { commentCount: count + 1 });
});
// Optimistic bump of visible counter on the card
bumpVisibleCount(beatId, +1);
} catch (err) {
console.error("post comment error", err);
alert("Failed to post: " + err.message);
} finally {
inputEl.disabled = false;
inputEl.focus();}
    });
// Handle delete
listEl.addEventListener("click", async (e) => {
const btn = e.target.closest("button[data-del]");
if (!btn) return;
if (!confirm("Delete this comment?")) return;
const cid = btn.getAttribute("data-del");

try {
await db.runTransaction(async (tx) => {
const bSnap = await tx.get(beatRef);
const n     = bSnap.exists ? (bSnap.data().commentCount || 0) : 0;
  tx.delete(cmtsRef.doc(cid));
  tx.update(beatRef, { commentCount: Math.max(0, n - 1) });
  });
  bumpVisibleCount(beatId, -1);
} catch (err) {
console.error("delete comment error", err);
alert("Delete failed: " + err.message);}
});
}
// Make it explicit/global for page scripts
window.showComments = showComments;
})();
