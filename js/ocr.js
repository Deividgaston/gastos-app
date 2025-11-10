// js/ocr.js
import { saveExpense } from "./firebase.js";

/* ===========================
   Helpers UI / Logs
=========================== */
const $ = (id) => document.getElementById(id);
const log = (m) => {
  const out = $("out");
  if (!out) return;
  out.textContent += (typeof m === "string" ? m : JSON.stringify(m, null, 2)) + "\n";
};

/* ===========================
   API Key (localStorage)
=========================== */
function getApiKey() {
  let k = localStorage.getItem("gkey");
  if (!k) {
    k = prompt("Pega tu API Key de Google AI (Gemini):");
    if (k && k.trim()) {
      localStorage.setItem("gkey", k.trim());
      alert("API Key guardada ✅");
    } else {
      throw new Error("No hay API Key");
    }
  }
  return k.trim();
}

/* ===========================
   File -> base64
=========================== */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] || "";
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

/* ===========================
   Sanitizar y parsear JSON texto
=========================== */
function safeParseJSON(text) {
  if (!text) throw new Error("Salida vacía de la IA");
  let cleaned = text.trim();

  // El modelo a veces responde con bloques de código ```json ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }

  // El modelo a veces añade frases antes/después: intentamos extraer el primer objeto { ... }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

/* ===========================
   Normalizadores
=========================== */
function normalizeAmount(val) {
  if (val == null) return 0;
  let s = String(val).trim();
  // Cambiar coma decimal por punto, quitar símbolos
  s = s.replace(/[€$]/g, "").replace(/\s/g, "").replace(",", ".");
  // Quitar multiplicadores raros
  s = s.replace(/[^\d.\-]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function normalizeDate(val) {
  if (!val) return new Date();
  // Si ya parece YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const d = new Date(val + "T00:00:00");
    if (!isNaN(d)) return d;
  }
  // Intentar parsear genérico
  const d2 = new Date(val);
  if (!isNaN(d2)) return d2;

  return new Date();
}

/* ===========================
   Llamada a Gemini Vision (compatible con tu key)
=========================== */
async function callGeminiVision(base64, mime) {
  const key = getApiKey();

  const prompt = `
Extrae JSON del ticket con esta estructura exacta:

{
  "date": "YYYY-MM-DD",
  "provider": "Nombre del local o concepto",
  "amount": 0.00
}

Reglas:
- No añadas texto fuera del JSON.
- Usa punto como decimal.
- Si falta un dato, déjalo vacío ("") o 0.00.
`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mime || "image/jpeg", data: base64 } }
        ]
      }
    ]
  };

  // 👉 Tu API key actual acepta este endpoint/modelo:
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro-vision:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const rawText = await res.text();
  let jsonResponse = null;
  try { jsonResponse = JSON.parse(rawText); } catch {}

  if (!res.ok) {
    log({ endpoint: url, status: res.status, body: jsonResponse || rawText });
    throw new Error(jsonResponse?.error?.message || `HTTP ${res.status}`);
  }

  // A veces viene como candidates->content->parts->text, otras ya plano
  const rawOut = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text
              ?? jsonResponse?.text
              ?? rawText;

  return safeParseJSON(rawOut);
}

/* ===========================
   Cámara (modo A: foto)
=========================== */
let hiddenInput;
function ensureCameraInput() {
  if (hiddenInput) return hiddenInput;
  hiddenInput = document.createElement("input");
  hiddenInput.type = "file";
  hiddenInput.accept = "image/*";
  hiddenInput.capture = "environment"; // cámara trasera
  hiddenInput.style.display = "none";
  document.body.appendChild(hiddenInput);
  return hiddenInput;
}

/* ===========================
   Flujo principal: Capturar -> IA -> Guardar
=========================== */
async function handleScan() {
  try {
    const input = ensureCameraInput();
    const file = await new Promise((resolve, reject) => {
      const onChange = () => {
        input.removeEventListener("change", onChange);
        if (input.files && input.files[0]) resolve(input.files[0]);
        else reject(new Error("No se seleccionó imagen"));
      };
      input.addEventListener("change", onChange, { once: true });
      input.click();
    });

    log(`📷 Imagen: ${file.name || "captura"} (${Math.round(file.size / 1024)} KB)`);

    // A base64
    const b64 = await fileToBase64(file);

    // IA (Gemini)
    const result = await callGeminiVision(b64, file.type);
    log({ IA: result });

    // Normalizar campos
    const provider = (result?.provider || "").toString().trim().slice(0, 80) || "Ticket";
    const amount = normalizeAmount(result?.amount);
    const dateObj = normalizeDate(result?.date);
    const yyyy_mm_dd = dateObj.toISOString().slice(0, 10);

    if (!amount || amount <= 0) {
      alert("La IA no pudo extraer un importe válido. Puedes editar luego en la lista.");
    }

    // Guardar en Firestore + subir foto
    const resp = await saveExpense({
      date: yyyy_mm_dd,
      category: "varios",
      provider,
      notes: "",
      amount,
      file
    });

    log("✅ Gasto guardado con foto");
    if (resp?.photoURL) log({ photoURL: resp.photoURL });
    alert("Ticket escaneado y guardado ✅");
  } catch (e) {
    console.error(e);
    log({ error: e.message || String(e), details: e.responseJSON || "" });
    alert("❌ Error en escaneo: " + (e.message || "desconocido"));
  }
}

/* ===========================
   Hook a botón
=========================== */
$("scanBtn")?.addEventListener("click", handleScan);
