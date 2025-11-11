/* Shared app boot + Auth (popup with redirect fallback) */
(function(){

  window.$ = (sel) => document.querySelector(sel);
  window.$id = (id) => document.getElementById(id);

  /* Firebase compat SDKs are expected in page before this file */
  // Firebase config - gastos-2n
const firebaseConfig = {
  apiKey: "AIzaSyBTK8altmAR-fWqR9BjE74gEGavuiqk1Bs",
  authDomain: "gastos-2n.firebaseapp.com",
  projectId: "gastos-2n",
  storageBucket: "gastos-2n.firebasestorage.app",
  messagingSenderId: "55010048795",
  appId: "1:55010048795:web:4fb48d1e0f9006ebf7b1be"
};


  // Init once
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();
  const st   = firebase.storage();

  // Expose
  window.App = { auth, db, st, firebase };

  // Auth helpers
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  async function signInPreferPopup() {
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      return await auth.signInWithPopup(provider);
    } catch (e) {
      // Fallback to redirect for Safari/iOS popup block
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request' || e.message?.includes('popup'))) {
        return auth.signInWithRedirect(provider);
      }
      throw e;
    }
  }

  async function handleRedirectResult() {
    try { await auth.getRedirectResult(); } catch (e) {
      console.warn('redirect result', e);
    }
  }

  window.SignIn = signInPreferPopup;
  window.AfterRedirect = handleRedirectResult;

  // simple guard for pages that require auth
  window.requireAuth = function(onReady) {
    auth.onAuthStateChanged((user)=>{
      const status = $id('whoami');
      if (status) status.textContent = user ? (user.email||user.uid) : 'No autenticado';
      if (user) onReady(user); else {
        const login = $id('btnLogin');
        if (login) login.classList.remove('hidden');
      }
    });
  }

})();
