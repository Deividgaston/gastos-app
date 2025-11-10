// js/firebase.js
// Carga modular de Firebase desde CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// ---- Config de tu proyecto (confirmada contigo) ----
const firebaseConfig = {
  apiKey: "AIzaSyBTK8altmAR-fWqR9BjE74gEGavuiqk1Bs",
  authDomain: "gastos-2n.firebaseapp.com",
  projectId: "gastos-2n",
  storageBucket: "gastos-2n.firebasestorage.app",
  messagingSenderId: "55010048795",
  appId: "1:55010048795:web:4fb48d1e0f9006ebf7b1be",
};

// ---- Inicialización ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Forzamos bucket explícito compatible con eur3
const storage = getStorage(app, "gs://gastos-2n.firebasestorage.app");

// ---- Helpers UI ----
const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const out = $("out");
  if (!out) return;
  out.textContent +=
    (typeof msg === "string" ? msg : JSON.stringify(msg, null, 2)) + "\n";
};

// ---- Estado auth ----
onAuthStateChanged(auth, (user) => {
  $("whoami").textContent = user
    ? `Conectado como ${user.email || user.uid}`
    : "No autenticado";
});

// ---- Botones auth ----
$("btnLogin")?.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (e) {
    log("❌ Login: " + (e.code || e.message));
    console.error(e);
    alert("Error en login: " + (e.code || e.message));
  }
});

$("btnLogout")?.addEventListener("click", async () => {
  await signOut(auth);
});

// ---- API pública para el resto de módulos ----
export async function saveExpense({ date, category, provider, notes, amount, file }) {
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");

  // 1) Subir foto si hay
  let photoURL = "";
  if (file) {
    const yyyyMM = (date || new Date()).toISOString().slice(0, 7); // YYYY-MM
    const safeProv = (provider || "ticket")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .slice(0, 40)
      .replace(/\s+/g, "_");
    const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
    const filename = `${(date || new Date()).toISOString().slice(0, 10)}_${safeProv}_${Date.now()}.${ext}`;
    const path = `tickets/${user.uid}/${yyyyMM}/${filename}`;
    const r = ref(storage, path);
    await uploadBytes(r, file);
    photoURL = await getDownloadURL(r);
  }

  // 2) Guardar gasto
  const col = collection(db, `users/${user.uid}/entries`);
  await addDoc(col, {
    date: date ? new Date(date) : new Date(),
    category: category || "varios",
    provider: provider || "",
    notes: notes || "",
    amount: Number(amount || 0),
    photoURL,
    isExpense: category !== "ingreso",
    createdAt: serverTimestamp(),
  });

  return { ok: true, photoURL };
}

export async function listLast(n = 10) {
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");
  const col = collection(db, `users/${user.uid}/entries`);
  const q = query(col, orderBy("createdAt", "desc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---- Pruebas rápidas para que veas que funciona ----
$("voiceBtn")?.addEventListener("click", async () => {
  try {
    const user = auth.currentUser;
    if (!user) return alert("Haz login primero");

    // Guarda un gasto de prueba de 1€
    await saveExpense({
      date: new Date(),
      category: "varios",
      provider: "Prueba",
      notes: "Gasto demo (botón voz)",
      amount: 1,
      file: null,
    });
    log("✅ Gasto guardado (demo)");

    const items = await listLast(5);
    log({ ultimos: items });
  } catch (e) {
    log(e);
    alert("Error guardando: " + (e.code || e.message));
  }
});
