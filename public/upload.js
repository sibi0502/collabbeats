// upload.js
(() => {
  'use strict';
// Grab form and bail out if we're not on the Upload page
const form = document.getElementById('uploadForm');
if (!form) {
console.warn('[upload.js] No #uploadForm found on this page — skipping.');
  return;}

  // Firebase handles (compat)
const auth = window.auth || firebase.auth();
const db = window.db || firebase.firestore();
const storage = window.storage || firebase.storage();
const FieldValue = firebase.firestore.FieldValue;

  // Elements
  const titleInput      = document.getElementById('titleInput');
  const genreSelect     = document.getElementById('genreSelect');
  const descInput       = document.getElementById('descInput');
  const visibilitySelect= document.getElementById('visibilitySelect');
  const coverInput      = document.getElementById('coverInput');
  const fileInput       = document.getElementById('fileInput');
  const progressBar     = document.getElementById('progressBar');
  const statusMsg       = document.getElementById('statusMsg');
  const uploadBtn       = document.getElementById('uploadBtn');

  function setStatus(msg, isError=false) {
  if (!statusMsg) return;
  statusMsg.textContent = msg || '';
  statusMsg.style.color = isError ? '#e11d48' : '';
  }
function requireAuth() {
return new Promise((resolve, reject) => {
const unsub = auth.onAuthStateChanged(u => {
unsub();
u ? resolve(u) : reject(new Error('Please log in to upload.'));
});
});
}
  
// UX: disable until audio file chosen
if (uploadBtn && fileInput) {
uploadBtn.disabled = true;
fileInput.addEventListener('change', () => {
uploadBtn.disabled = !fileInput.files.length;
});
}
form.addEventListener('submit', async (e) => {
e.preventDefault();
try {
if (uploadBtn) uploadBtn.disabled = true;
if (progressBar) { progressBar.value = 0; progressBar.style.display = 'block'; }
setStatus('');
const user = await requireAuth();
const file  = fileInput?.files?.[0];
const title = (titleInput?.value || '').trim();
const genre = (genreSelect?.value || '').trim();
const vis   = (visibilitySelect?.value || 'public');
if (!file)  throw new Error('Choose an audio file.');
if (!title) throw new Error('Title is required.');
if (!genre) throw new Error('Please select a category.');
  
// Optional cover upload
let coverURL = '';
const cover = coverInput?.files?.[0];
if (cover) {
const coverRef = storage.ref().child(`covers/${user.uid}/${Date.now()}_${cover.name}`);
await coverRef.put(cover);
coverURL = await coverRef.getDownloadURL();}
// Audio upload with progress
const audioRef = storage.ref().child(`audio/${user.uid}/${Date.now()}_${file.name}`);
const task = audioRef.put(file);
await new Promise((resolve, reject) => {
task.on('state_changed', (snap) => {
if (progressBar) {
const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
progressBar.value = pct;
}
}, reject, resolve);
});
const audioURL = await audioRef.getDownloadURL();

// Create Firestore doc
const beatDoc = {
userId: user.uid,
title,
description: (descInput?.value || '').trim(),
genre,                     // required category
visibility: vis,
audioURL,
coverURL,
likeCount: 0,
timestamp: FieldValue.serverTimestamp(),
};
await db.collection('beats').add(beatDoc);
setStatus('Upload complete! Redirecting to Explore…');
form.reset();
if (progressBar) progressBar.style.display = 'none';
setTimeout(() => {
window.location.href = 'explore.html?genre=' + encodeURIComponent(genre);
}, 700);
} catch (err) {
console.error(err);
setStatus(err?.message || 'Upload failed.', true);
if (progressBar) progressBar.style.display = 'none';
} finally {
if (uploadBtn) uploadBtn.disabled = false;
}
});
})();
