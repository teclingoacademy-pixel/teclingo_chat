/**
 * Identity Service — puente al Data Lake TECLINGO_IDENTITY_LAKE_V1 (FASE 6).
 *
 * Identidad UNICA del ecosistema: un usuario existe UNA vez en el lake
 * (llave = email en minusculas). Esta app delega en la Identity API.
 *
 * Patron anti-CORS obligatorio: POST con body JSON pero
 * Content-Type text/plain;charset=utf-8. NUNCA mode:'no-cors'.
 *
 * Diseno a prueba de fallos: si el lake no responde, la app
 * continua igual (degradacion elegante).
 */

const IDENTITY_API_URL =
  (import.meta.env.VITE_IDENTITY_API_URL as string | undefined)?.trim() ||
  'https://script.google.com/macros/s/AKfycbxSy2hdgZZ1wM0yQT2Gw0dRs52V_z7JWs1biMY1kCZHpF2gf6W3NxxsZRqvjHqAMYpr/exec';

const APP_NAME = 'venus_chat';

export interface IdentidadResultado {
  ok: boolean;
  code?: string;
  error?: string;
  email?: string;
  perfil?: Record<string, unknown>;
}

interface LakeResponse {
  ok?: boolean;
  code?: string;
  error?: string;
  exists?: boolean;
  perfil?: { email?: string; [k: string]: unknown };
}

// ---------------------------------------------------------------------------
// Persistencia local
// ---------------------------------------------------------------------------

const LS_KEYS = {
  email: 'venus_lake_email',
  perfil: 'venus_lake_perfil',
} as const;

function normEmail(v: string): string {
  return String(v || '').trim().toLowerCase();
}

function storageGet(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}

function storageRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

function storageGetJSON(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function storageSetJSON(key: string, obj: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Comunicacion con el Lake (anti-CORS)
// ---------------------------------------------------------------------------

async function postAlLake(
  payload: Record<string, unknown>,
  timeoutMs = 12000,
): Promise<LakeResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(IDENTITY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return await resp.json();
  } catch (err) {
    console.error('[Identity] postAlLake error:', err);
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/** Ping de salud al Lake. */
export async function ping(): Promise<LakeResponse> {
  try {
    const resp = await fetch(`${IDENTITY_API_URL}?action=ping`, {
      signal: AbortSignal.timeout(8000),
    });
    return await resp.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Verificar si un email ya existe en el Lake. */
export async function verificarEmail(email: string): Promise<boolean> {
  try {
    const res = await postAlLake({ action: 'verificarEmail', email: normEmail(email) }, 8000);
    return Boolean(res?.ok && res.exists);
  } catch { return false; }
}

/** Registrar usuario nuevo en el Lake. */
export async function registrarUsuario(
  email: string,
  nombre: string,
  password?: string,
  nikName?: string,
): Promise<IdentidadResultado> {
  const body: Record<string, unknown> = {
    action: 'registrarUsuario',
    email: normEmail(email),
    nombre: nombre || '',
    metodo: password ? 'email' : 'google',
  };
  if (password) body.password = password;
  if (nikName) body.nik_name = nikName;

  try {
    const res = await postAlLake(body);
    if (res?.ok) {
      return { ok: true, code: res.code, email: normEmail(email) };
    }
    return { ok: false, code: res?.code, error: res?.error };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Login con email + password. */
export async function loginEmail(
  email: string,
  password: string,
): Promise<IdentidadResultado> {
  try {
    const res = await postAlLake({
      action: 'loginEmail',
      email: normEmail(email),
      password,
    });
    if (res?.ok && res.code === 'login_ok') {
      return { ok: true, code: 'login_ok', email: normEmail(email), perfil: res.perfil };
    }
    return { ok: false, code: res?.code, error: res?.error };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Obtener perfil completo del usuario. */
export async function obtenerPerfil(email: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await postAlLake({ action: 'obtenerPerfil', email: normEmail(email) }, 8000);
    if (res?.ok && res.perfil) return res.perfil;
    return null;
  } catch { return null; }
}

/** Actualizar campos del perfil. */
export async function actualizarPerfil(
  email: string,
  campos: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await postAlLake({
      action: 'actualizarPerfil',
      email: normEmail(email),
      campos,
    });
    return Boolean(res?.ok);
  } catch { return false; }
}

/** Registrar evento de actividad global (dual-write). */
export async function logActividadGlobal(
  email: string,
  herramienta: string,
  accion: string,
  detalle?: string,
): Promise<boolean> {
  if (!email) return false;
  try {
    const res = await postAlLake({
      action: 'registrarActividadGlobal',
      email: normEmail(email),
      app: APP_NAME,
      herramienta,
      accion,
      detalle: detalle || '',
    });
    return Boolean(res?.ok);
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Estado de sesion
// ---------------------------------------------------------------------------

/** Obtener el email guardado de la sesion actual. */
export function getEmail(): string {
  return storageGet(LS_KEYS.email);
}

/** Guardar email de la sesion. */
export function setEmail(email: string): void {
  storageSet(LS_KEYS.email, normEmail(email));
}

/** Obtener el perfil cacheado. */
export function getPerfil(): Record<string, unknown> | null {
  return storageGetJSON(LS_KEYS.perfil);
}

/** Guardar perfil en cache y localStorage. */
export function setPerfil(perfil: Record<string, unknown>): void {
  storageSetJSON(LS_KEYS.perfil, perfil);
}

/** Verificar si hay sesion activa (email guardado). */
export function isLoggedIn(): boolean {
  return Boolean(getEmail());
}

/** Cerrar sesion local. */
export function logout(): void {
  storageRemove(LS_KEYS.email);
  storageRemove(LS_KEYS.perfil);
}

/** Cargar perfil desde el Lake y actualizar cache. */
export async function cargarPerfil(): Promise<Record<string, unknown> | null> {
  const email = getEmail();
  if (!email) return null;
  const perfil = await obtenerPerfil(email);
  if (perfil) setPerfil(perfil);
  return perfil;
}

// ---------------------------------------------------------------------------
// Flujos de alto nivel
// ---------------------------------------------------------------------------

/** Login con email + password → guardar sesion → log actividad. */
export async function doLogin(
  email: string,
  password: string,
): Promise<IdentidadResultado> {
  const res = await loginEmail(email, password);
  if (res.ok) {
    setEmail(email);
    if (res.perfil) setPerfil(res.perfil);
    logActividadGlobal(email, 'auth', 'login_ok', 'email');
    return { ok: true, code: 'login_ok', email: normEmail(email), perfil: res.perfil };
  }
  return res;
}

/** Registro → guardar sesion → log actividad. */
export async function doRegister(
  email: string,
  nombre: string,
  password: string,
  nikName?: string,
): Promise<IdentidadResultado> {
  const res = await registrarUsuario(email, nombre, password, nikName);
  if (res.ok) {
    setEmail(email);
    logActividadGlobal(email, 'auth', 'registro_exitoso', nombre);
    return { ok: true, code: 'registro_exitoso', email: normEmail(email) };
  }
  return res;
}
