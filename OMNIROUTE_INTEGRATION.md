# OmniRoute Integration — Hand-off marker

> **LEER ESTE ARCHIVO ANTES DE TOCAR GIT EN ESTE PROYECTO.**
> Este archivo marca el estado de la integración OmniRoute. Cuando un asistente
> (o la persona) retome este proyecto y pida *"sube los cambios"*, debe seguir
> exactamente las instrucciones de la sección **GIT — QUÉ SUBIR Y CÓMO**.

## Estado actual (fase 1: venus_ai_tutor)

- [x] `api/index.ts` — OmniRoute como **router principal** (paso 0) en:
  - `generateFriendReply` (conversación libre `/api/tutor/chat`)
  - `translateToSpanish` (traducción al español)
  - `/api/tutor/summarize` (resumen de sesión)
- [x] Cadena de fallback conservada: **OmniRoute → Gemini → Groq → simulation-fallback**
- [x] Configurable por variables de entorno (sin cambios de código para conmutar):
  - `OMNIROUTE_BASE_URL` (default `http://192.168.0.15:20128`)
  - `OMNIROUTE_API_KEY` (si está vacía, OmniRoute se salta → Gemini sigue siendo principal)
  - `OMNIROUTE_MODEL` (default `gpt-4o-mini`)
- [x] `.env.example` y `README.md` actualizados
- [x] Typecheck OK (`npm run lint` = `tsc --noEmit`, sin errores)
- [ ] **PENDIENTE — prueba en vivo** (requiere URL alcanzable + API key)
- [ ] **PENDIENTE — push a GitHub**
- [ ] **PENDIENTE — fase 2: AURIX_QWEN2**

## Datos importantes

- Branch de trabajo: `feat/omniroute-token-routing` (creado en venus_ai_tutor).
- Remote: `https://github.com/teclingoacademy-pixel/teclingo_chat.git`
- El frontend (React) NO cambia: sigue llamando a `/api/tutor/chat` y `/api/tutor/summarize`.
- AURIX_QWEN2 ya usa estos mismos endpoints (`freeTalkService.ts`) → cuando venus use
  OmniRoute, la conversación libre de AURIX **también** amplía sus tokens. La fase 2 es
  para lo que AURIX llama directo por Apps Script (fuera de venus).

## GIT — QUÉ SUBIR Y CÓMO

### Archivos que forman parte de ESTA integración (subir estos, y solo estos):
```
api/index.ts
.env.example
README.md
OMNIROUTE_INTEGRATION.md
```

### Reglas:
1. **NO** incluir `.env.local` ni `.env` (nunca, jamás).
2. **NO** incluir la eliminación de `api/server.ts` (`D api/server.ts`) salvo que la
   persona lo confirme explícitamente — es un cambio previo no relacionado.
3. Branch = `feat/omniroute-token-routing`. No commitear a `main` directamente.
4. Mensaje de commit (Conventional Commits):
   `feat: add OmniRoute multi-provider routing with auto-fallback (env-configurable)`

### Secuencia correcta para subir:
```bash
cd C:\teclingo_proyect\venus_ai_tutor
git checkout feat/omniroute-token-routing     # si no existe: git checkout -b feat/omniroute-token-routing
git add api/index.ts .env.example README.md OMNIROUTE_INTEGRATION.md
git commit -m "feat: add OmniRoute multi-provider routing with auto-fallback (env-configurable)"
git push -u origin feat/omniroute-token-routing
```

> **Importante:** la prueba en vivo debe hacerse ANTES del push. Si el push ya se hizo,
> el orden recomendado es: probar → corregir si hace falta → commit adicional → push.

## PRUEBA EN VIVO (requisitos previos)

1. OmniRoute alcanzable desde la máquina de prueba. El VPS `192.168.0.15:20128` NO era
   alcanzable desde la máquina donde se preparó esto (IP de LAN / puerto no expuesto).
   Conseguir URL pública (dominio, túnel Cloudflare/ngrok, o conectividad de red).
2. Generar API key de OmniRoute en su dashboard (**Settings → API Keys**) y configurar:
   - `OMNIROUTE_API_KEY` (Vercel: Settings → Environment Variables; local: `.env.local`)
3. Pruebas:
   ```bash
   # local
   npm install
   npm run dev
   # luego:
   curl http://localhost:3000/api/health          # debe mostrar omniRouteKeyAvailable:true
   curl -X POST http://localhost:3000/api/tutor/chat \
     -H "Content-Type: application/json" \
     -d '{"user_input":"Hi!","history":[],"response_level":"1","nickname":"Test"}'
   # la respuesta debe incluir "model":"omniroute/<model>" y reply en inglés
   ```
4. Criterio de éxito: la respuesta del chat usa `omniroute/*`, es coherente, y cumple el
   límite de palabras. Si `OMNIROUTE_API_KEY` está vacía, el comportamiento es el anterior
   (Gemini → Groq).

## FASE 2 — AURIX_QWEN2 (no iniciada)

Repo: `C:\teclingo_proyect\AURIX_QWEN2` — remote
`https://github.com/teclingoacademy-pixel/aurix_ver1_teclingo.git` — branch `master`.

- AURIX es 100% estático (HTML/CSS/JS). Su LLM para la app principal pasa por un
  **Google Apps Script** (`app.js` línea ~6693, `window.AURIX_API`).
- La conversación libre YA va por venus (`freeTalkService.ts`), así que gana los tokens
  de OmniRoute cuando venus los use.
- Para ampliar también lo que hace Apps Script: cambiar el Apps Script para que apunte a
  OmniRoute (URL + key) en vez de al proveedor directo. Esto NO toca el frontend estático.
- Alternativa sin Apps Script: añadir un mini-backend proxy (estilo venus) que enrute a
  OmniRoute y apuntar `window.AURIX_API` ahí.
- Repetir el ciclo: probar en vivo → commit (branch `feat/omniroute-token-routing` en
  AURIX) → push → marcar de nuevo.
