document.addEventListener('DOMContentLoaded', () => {
  const uploadForm = document.getElementById('uploadForm');
  const titleInput = document.getElementById('trackTitle');
  const fileInput = document.getElementById('audioFile');
  const uploadMessage = document.getElementById('uploadMessage');

  auth.onAuthStateChanged((user) => {
    if (!user) window.location.href = 'login.html';
  });

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    uploadMessage.textContent = '';

    try {
      const user = auth.currentUser;
      if (!user) {
        uploadMessage.textContent = 'You must be logged in.';
        return;
      }

      const file = fileInput.files[0];
      const title = (titleInput.value || '').trim();
      if (!file || !title) {
        uploadMessage.textContent = 'Please enter a title and choose a file.';
        return;
      }

      // Build a safe file name (no slashes)
      const safeTitle = title.replace(/[\\/]/g, '-');
      const fileName = `${safeTitle}_${Date.now()}_${file.name}`;
      const storagePath = `beats/${user.uid}/${fileName}`;
      const storageRef = storage.ref(storagePath);

      console.log('[UPLOAD] uid:', user.uid);
      console.log('[UPLOAD] path:', storagePath);
      console.log('[UPLOAD] bucket:', storage.app.options.storageBucket);

      // Upload
      await storageRef.put(file);

      // URL + Firestore metadata
      const downloadURL = await storageRef.getDownloadURL();
      await db.collection('beats').add({
        userId: user.uid,
        title: safeTitle,
        storagePath,
        downloadURL,
        likeCount: 0,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      uploadMessage.textContent = 'Beat uploaded successfully!';
      uploadForm.reset();
      if (typeof loadBeats === 'function') loadBeats();
    } catch (err) {
      console.error('[UPLOAD] error:', err);
      uploadMessage.textContent = `Upload failed: ${err.code || ''} ${err.message}`;
    }
  });
});
