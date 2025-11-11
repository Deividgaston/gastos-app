// js/ocr.v3.js
import { saveExpense } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const log = (m) => {
  const out = $("out");
  if (!out) return;
  out.textContent += (typeof m === "string" ? m : JSON.stringify(m, null, 2)) + "\n";
};

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onerror = () => reject(new Error("No se pudo leer la imagen"));
    rd.onload = () => resolve(String(rd.result).split(",")[1] || "");
    rd.readAsDataURL(file);
  });
}

function safeParseJSON(text) {
  if (!text) throw new Error("Salida vacía de la IA");
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a !== -1 && b !== -1 && b > a) cleaned = cleaned.slice(a, b + 1);
  return JSON.parse(cleaned);
}

function normalizeAmount(val) {
  if (val == null) return 0;
  let s = String(val).trim().replace(/[€$]/g, "").replace(/\s/g, "").replace(",", ".");
  s = s.replace(/[^\d.\-]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}
function normalizeDate(val) {
  if (!val) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const d = new Date(val + "T00:00:00");
    if (!isNaN(d)) return d;
  }
  const d2 = new Date(val);
  return isNaN(d2) ? new Date() : d2;
}

// ====== IA CALL con fallback de modelos ======
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

  // Modelos a probar con v1 (sin generationConfig, sin responseMimeType)
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash"
  ];

  let lastErr;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      log({ probando_modelo: model, endpoint: url });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const raw = await res.text();
      let json = null; try { json = JSON.parse(raw); } catch {}

      if (!res.ok) {
        // guarda el último error y sigue con el siguiente modelo
        lastErr = new Error(json?.error?.message || `HTTP ${res.status}`);
        log({ fallo_modelo: model, status: res.status, body: json || raw });
        continue;
      }

      // salida típica
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? json?.text ?? raw;
      const parsed = safeParseJSON(text);
      log({ modelo_ok: model });
      return parsed;
    } catch (e) {
      lastErr = e;
      log({ excepcion_modelo: model, error: e.message || String(e) });
    }
  }

  throw lastErr || new Error("No hay modelos disponibles para tu API key.");
}

// ===== Cámara (modo A: foto) =====
let hiddenInput;
function ensureCameraInput() {
  if (hiddenInput) return hiddenInput;
  hiddenInput = document.createElement("input");
  hiddenInput.type = "file";
  hiddenInput.accept = "image/*";
  hiddenInput.capture = "environment";
  hiddenInput.style.display = "none";
  document.body.appendChild(hiddenInput);
  return hiddenInput;
}

// ===== Flujo principal =====
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

    log(`📷 Imagen: ${file.name || "captura"} (${Math.round(file.size/1024)} KB)`);
    const b64 = await fileToBase64(file);

    const result = await callGeminiVision(b64, file.type);
    log({ IA: result });

    const provider = (result?.provider || "").toString().trim().slice(0,80) || "Ticket";
    const amount = normalizeAmount(result?.amount);
    const dateObj = normalizeDate(result?.date);
    const yyyy_mm_dd = dateObj.toISOString().slice(0,10);

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

document.getElementById("scanBtn")?.addEventListener("click", handleScan);
