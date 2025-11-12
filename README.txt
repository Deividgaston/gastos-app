Gastos 2N · WebApp (iOS dark)
===============================

Archivos incluidos:
- index.html (OCR + ingreso manual + login + navegación)
- kms.html (kilómetros con totales globales/mes)
- export.html (dashboard compacto, Excel plantilla 2N, abrir fotos)
- summary.html (sumario mensual y PDF bonito; descargar/abrir fotos)
- assets/style.css (tema oscuro estilo iOS)

Requisitos:
- Firebase (Auth con proveedor Google activado, Firestore, Storage)
- Reglas Storage recomendadas:
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /tickets/{userId}/{month}/{fileName} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /{allPaths=**} { allow read, write: if false; }
    }
  }

- OCR (Gemini): pulsa ⚙️ IA en index y pega tu API Key (se guarda en localStorage)

Publicación (GitHub Pages):
1) Crea/usa el repo y sube estos archivos a la rama "main".
2) Settings → Pages → Source = "Deploy from a branch", rama "main".
3) Abre https://TU_USUARIO.github.io/TU_REPO/

Notas:
- "Abrir todas las fotos" lanza cada enlace (puede que Chrome bloquee muchas pestañas).
- Excel: genera un libro similar a la plantilla 2N con la fila de "KM personales (coste)".
- El PDF de sumario incluye SOLO coste de km personales y la liquidación neta, con diseño limpio.