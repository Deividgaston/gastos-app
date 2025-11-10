// js/ocr.js
import { saveExpense } from "./firebase.js";

// ==== Helpers UI ====
const $ = (id) => document.getElementById(id);
const log = (m) => {
  const out = $("out");
  if (!out) return;
  out.textContent += (typeof m === "string" ? m : JSON.stringify(m, null, 2)) + "\n";
};

// ==== API Key handling ====
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

// ==== File -> base64 (para Gemini Vision) ====
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      // reader.result es dataURL; quitamos el prefijo "data:...;base64,"
      const base64 = String(reader.result).split(",")[1] || "";
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

// ==== Llamada a Gemini Vision (con fallback de modelos) ====
async function callGeminiVision(base64, mime) {
  const key = getApiKey();

  const prompt = `Extrae JSON del ticket con esta estructura exacta:
{
  "date": "YYYY-MM-DD",
  "provider": "Nombre del local o concepto",
  "amount": 0.00
}
- Usa punto como decimal.
- Si falta un dato, invéntalo NO: deja vacío o 0.00.
- No escribas texto adicional, solo JSON.
`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mime || "image/jpeg", data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  const attempts = [
    // Prioriza v1 + 2.0 flash
    ["https://generativelanguage.googleapis.com/v1", "gemini-2.0-flash"],
    ["https://generativelanguage.googleapis.com/v1", "gemini-1.5-flash"],
    // Fallback v1beta por si tu key lo requiere
    ["https://generativelanguage.googleapis.com/v1beta", "gemini-1.5-flash"],
  ];

  let lastErr;
  for (const [base, model] of attempts) {
    try {
      const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = null; }

      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} ${res.statusText} @ ${model}`);
        lastErr.responseJSON = json || text;
        log({ endpoint: url, status: res.status, body: json || text });
        continue;
      }

      // Para responseMimeType application/json, la API ya devuelve JSON directo
      // Algunos despliegues devuelven envoltorio; por eso contemplamos ambas
      const out = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (out) {
        return JSON.parse(out);
      } else if (json && json.date) {
        // caso en que el JSON ya es directo
        return json;
      } else {
        lastErr = new Error("Respuesta IA sin contenido utilizable");
        lastErr.responseJSON = json || text;
      }
    } catch (e) {
      lastErr = e;
      log({ falloModelo: model, error: e.message || String(e) });
    }
  }
  throw lastErr || new Error("Fallo IA desconocido");
}

// ==== Captura cámara (modo A: foto) ====
let hiddenInput;
function ensureCameraInput() {
  if (hiddenInput) return hiddenInput;
  hiddenInput = document.createElement("input");
  hiddenInput.type = "file";
  hiddenInput.accept = "image/*";
  hiddenInput.capture = "environment"; // cámara trasera en móvil
  hiddenInput.style.display = "none";
  document.body.appendChild(hiddenInput);
  return hiddenInput;
}

// ==== Flujo principal: Capturar -> OCR -> Guardar ====
async function handleScan() {
  try {
    const input = ensureCameraInput();
    // Espera a que el usuario escoja/capture
    const file = await new Promise((resolve, reject) => {
      const onChange = () => {
        input.removeEventListener("change", onChange);
        if (input.files && input.files[0]) resolve(input.files[0]);
        else reject(new Error("No se seleccionó imagen"));
      };
      input.addEventListener("change", onChange, { once: true });
      input.click();
    });

    // Mostrar tamaño para depurar
    log(`📷 Imagen: ${file.name || "captura"} (${Math.round(file.size / 1024)} KB)`);

    // A base64
    const b64 = await fileToBase64(file);

    // Llamar a IA
    const result = await callGeminiVision(b64, file.type);
    log({ IA: result });

    // Parseo seguro
    const provider = (result?.provider || "").toString().trim().slice(0, 80);
    const amount = Number(result?.amount || 0);
    const dateStr = (result?.date || "").toString().trim();

    if (!provider || !amount || amount <= 0) {
      alert("La IA no pudo extraer datos suficientes (proveedor o importe). Revísalo manualmente.");
    }

    // Guardar en Firestore + subir foto a Storage
    const saveResp = await saveExpense({
      date: dateStr || new Date(),
      category: "varios",
      provider: provider || "Ticket",
      notes: "",
      amount: amount || 0,
      file,
    });

    log("✅ Gasto guardado con foto");
    if (saveResp?.photoURL) log({ photoURL: saveResp.photoURL });
    alert("Ticket escaneado y guardado ✅");

  } catch (e) {
    console.error(e);
    log({ error: e.message || String(e), details: e.responseJSON || "" });
    alert("❌ Error en escaneo: " + (e.message || "desconocido"));
  }
}

// ==== Hook al botón de la UI ====
$("scanBtn")?.addEventListener("click", handleScan);
