# Venus AI Tutor (TecLingo)

Tutor de conversación libre en inglés ("free speaking") para estudiantes de TecLingo.
Una experiencia de práctica oral sin gramática, sin reglas y sin calificaciones:
un amigo virtual que se adapta al nivel del estudiante.

## Funcionalidades

- **Conversación libre** con un amigo virtual (AURIX) que responde en inglés y se adapta al nivel.
- **Regulador de palabras**: respuestas de 3-5, 4-8, 5-10 palabras o modo nativo sin filtro.
- **Velocidad de voz TTS** ajustable (0.5 / 0.7 / 1.0) con selección de voces naturales.
- **Reconocimiento de voz** (Web Speech API) y entrada por teclado.
- **Botón de pánico**: revela la traducción al español de cada respuesta cuando el estudiante la pide.
- **Resumen de sesión** (EN/ES) guardado en `localStorage` y leído por el narrador en la próxima visita.
- Backend con **OmniRoute** como router principal (multi-proveedor con auto-fallback), **Gemini** como motor secundario y **Groq** como respaldo final.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4.
- **Backend**: Express (server-side), router OpenAI-compatible `@google/genai`, fallback a Groq y OmniRoute.
- **Deploy**: Vercel (frontend estático + función serverless `api/index.ts`).

## Requisitos

- Node.js 20+

## Instalación y desarrollo

```bash
npm install
# Copia .env.example a .env.local y completa las claves
npm run dev
```

Abre `http://localhost:3000`.

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `GEMINI_API_KEY` | Sí | Clave de la API de Gemini (motor secundario). |
| `GROQ_API_KEY` | No | Fallback si Gemini falla (modelo `llama-3.1-8b-instant`). |
| `OMNIROUTE_API_KEY` | No | Router principal (si se define): 291 proveedores + auto-fallback + tiers gratis. |
| `OMNIROUTE_BASE_URL` | No | Dónde corre OmniRoute (default: VPS `http://192.168.0.15:20128`). |
| `OMNIROUTE_MODEL` | No | Modelo que resuelve OmniRoute (default: `gpt-4o-mini`). |

## Scripts

```bash
npm run dev          # Servidor de desarrollo (Express + Vite)
npm run build        # Build estático de Vite
npm run build:server # Bundle del servidor Express para producción local
npm run start        # Ejecuta el servidor de producción local (requiere build)
npm run lint         # Typecheck (tsc --noEmit)
npm run clean        # Elimina dist/
```

## Despliegue en Vercel

1. Crea el proyecto en Vercel (framework preseleccionado: Vite).
2. Configura las variables de entorno `GEMINI_API_KEY` y `GROQ_API_KEY` en *Settings → Environment Variables*.
3. `vercel.json` enruta `/api/*` a la función serverless y el resto al SPA.
4. Deploy (`git push` al repo importado o `vercel --prod`).

## API

| Endpoint | Descripción |
|---|---|
| `POST /api/tutor/chat` | Conversación libre (respuesta EN + traducción ES, con límite de palabras). |
| `POST /api/tutor/summarize` | Resumen de sesión (EN/ES). |
| `GET/POST /api/tutor/adn-profile` | Perfil activo del estudiante (en memoria). |
| `GET /api/health` | Estado del servicio. |
