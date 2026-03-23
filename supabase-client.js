// ================================================================
//  NZ TECN — Supabase Client Configuration
//  Un solo proyecto Supabase para todo:
//    - Tabla 'products'     → inventario de origen
//    - Tabla 'nzt_catalogo' → catálogo público curado
//    - Tabla 'nzt_banners'  → configuración del hero banner
//    - Tabla 'usuarios'     → admins con login por usuario/clave
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = 'https://ebkmhvrffajaodsrmgfd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVia21odnJmZmFqYW9kc3JtZ2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNzcxMzAsImV4cCI6MjA3NTg1MzEzMH0.bCkXUogywYWQjDAjDZfKh-0QZ-0w_jKE93KNI-Fj3nU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Tabla References ──────────────────────────────────────────
export const TABLES = {
  inventario: 'products',
  catalogo:   'nzt_catalogo',
  banners:    'nzt_banners',
  usuarios:   'usuarios',
};

// ── Clave de sesión en sessionStorage ─────────────────────────
const SESSION_KEY = 'nzt_admin_session';

// ── Auth con tabla 'usuarios' (no Supabase Auth) ──────────────

/**
 * Verifica credenciales contra la tabla 'usuarios' usando la
 * función RPC validate_admin (el password nunca se expone al cliente).
 * Si son válidas, guarda la sesión en sessionStorage.
 */
export async function signIn(usuario, password) {
  const { data, error } = await supabase.rpc('validate_admin', {
    p_usuario:  usuario,
    p_password: password,
  });

  if (error) throw new Error('Error de conexión: ' + error.message);
  if (!data)  throw new Error('Usuario o contraseña incorrectos.');

  // Guarda sesión simple (se borra al cerrar el navegador)
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    usuario,
    loggedAt: Date.now(),
  }));

  return { usuario };
}

/**
 * Devuelve el usuario activo de sessionStorage, o null si no hay sesión.
 */
export function getUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Cierra la sesión borrando sessionStorage.
 */
export function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
}
