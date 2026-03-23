-- ================================================================
--  NZ TECN — Supabase Database Setup  (VERSIÓN COMPLETA)
--  Ejecuta TODO este script en: Supabase → SQL Editor → New Query
--
--  Incluye:
--    · nzt_catalogo   → catálogo público curado
--    · nzt_banners    → configuración del hero banner
--    · usuarios       → tabla de admins con login por usuario/clave
--    · validate_admin → función segura de autenticación (sin exponer passwords)
-- ================================================================


-- ══════════════════════════════════════════════════════════════
-- 1. TABLA: nzt_catalogo
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.nzt_catalogo (
  id             SERIAL PRIMARY KEY,
  origin_id      TEXT,
  codigo         TEXT,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  precio         NUMERIC(10,2) NOT NULL DEFAULT 0,
  precio_mayor   NUMERIC(10,2) DEFAULT 0,
  precio_gmayor  NUMERIC(10,2) DEFAULT 0,
  categoria      TEXT DEFAULT 'General',
  stock          INTEGER DEFAULT 0,
  imagen_url     TEXT,
  activo         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Agrega columnas nuevas si ya existía la tabla
ALTER TABLE public.nzt_catalogo ADD COLUMN IF NOT EXISTS descripcion   TEXT;
ALTER TABLE public.nzt_catalogo ADD COLUMN IF NOT EXISTS precio_mayor  NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.nzt_catalogo ADD COLUMN IF NOT EXISTS precio_gmayor NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.nzt_catalogo ADD COLUMN IF NOT EXISTS stock         INTEGER DEFAULT 0;
ALTER TABLE public.nzt_catalogo ADD COLUMN IF NOT EXISTS codigo        TEXT;
ALTER TABLE public.nzt_catalogo ADD COLUMN IF NOT EXISTS origin_id     TEXT;

-- Asegura que origin_id sea TEXT (evita errores de bigint si ya existía como otro tipo)
ALTER TABLE public.nzt_catalogo ALTER COLUMN origin_id TYPE TEXT USING origin_id::TEXT;


-- ══════════════════════════════════════════════════════════════
-- 2. TABLA: nzt_banners
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.nzt_banners (
  id          SERIAL PRIMARY KEY,
  titulo      TEXT NOT NULL DEFAULT 'Bienvenido a NZ TECN',
  subtitulo   TEXT DEFAULT 'Tecnología de vanguardia a tu alcance',
  imagen_url  TEXT DEFAULT '',
  cta_texto   TEXT DEFAULT 'Ver Catálogo',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.nzt_banners (titulo, subtitulo, imagen_url, cta_texto)
  SELECT 'Bienvenido a NZ TECN', 'Tecnología de vanguardia a tu alcance', '', 'Ver Catálogo'
  WHERE NOT EXISTS (SELECT 1 FROM public.nzt_banners LIMIT 1);


-- ══════════════════════════════════════════════════════════════
-- 3. TABLA: usuarios  (login por usuario, no por email)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.usuarios (
  id         SERIAL PRIMARY KEY,
  usuario    TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  rol        TEXT NOT NULL DEFAULT 'admin',
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Usuario admin por defecto ─────────────────────────────────
-- Usuario: nztecn    Contraseña: Admin2024
-- Cambia la contraseña después de tu primer ingreso.
INSERT INTO public.usuarios (usuario, password, rol, activo)
  SELECT 'nztecn', 'Admin2024', 'admin', true
  WHERE NOT EXISTS (SELECT 1 FROM public.usuarios WHERE usuario = 'nztecn');


-- ══════════════════════════════════════════════════════════════
-- 4. RLS — Row Level Security
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.nzt_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nzt_banners  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios     ENABLE ROW LEVEL SECURITY;

-- nzt_catalogo: lectura pública de productos activos con imagen
DROP POLICY IF EXISTS "Public read active catalog" ON public.nzt_catalogo;
DROP POLICY IF EXISTS "Admin full access catalog"  ON public.nzt_catalogo;

CREATE POLICY "Public read active catalog"
  ON public.nzt_catalogo FOR SELECT
  USING (activo = TRUE AND imagen_url IS NOT NULL AND imagen_url <> '');

-- Acceso completo para anon (el admin panel usa login propio, no Supabase Auth)
CREATE POLICY "Admin full access catalog"
  ON public.nzt_catalogo FOR ALL
  TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- nzt_banners: lectura pública + escritura anon (admin panel)
DROP POLICY IF EXISTS "Public read banners"  ON public.nzt_banners;
DROP POLICY IF EXISTS "Admin manage banners" ON public.nzt_banners;

CREATE POLICY "Public read banners"
  ON public.nzt_banners FOR SELECT USING (TRUE);

CREATE POLICY "Admin manage banners"
  ON public.nzt_banners FOR ALL
  TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- usuarios: nadie puede leer la tabla directamente (solo via RPC)
DROP POLICY IF EXISTS "No direct access usuarios" ON public.usuarios;

CREATE POLICY "No direct access usuarios"
  ON public.usuarios FOR SELECT
  USING (FALSE);


-- ══════════════════════════════════════════════════════════════
-- 5. FUNCIÓN: validate_admin  (verifica credenciales sin exponer passwords)
--    El password NUNCA llega al cliente, la validación es server-side.
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.validate_admin(p_usuario TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER  -- Corre con privilegios del owner, no del caller
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM   public.usuarios
    WHERE  usuario = p_usuario
    AND    password = p_password
    AND    activo = TRUE
    AND    rol = 'admin'
  );
END;
$$;

-- Permite que el cliente (anon) llame a esta función
GRANT EXECUTE ON FUNCTION public.validate_admin TO anon;


-- ══════════════════════════════════════════════════════════════
-- 6. TRIGGERS: updated_at automático
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_catalogo_updated_at ON public.nzt_catalogo;
CREATE TRIGGER trg_catalogo_updated_at
  BEFORE UPDATE ON public.nzt_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_banners_updated_at ON public.nzt_banners;
CREATE TRIGGER trg_banners_updated_at
  BEFORE UPDATE ON public.nzt_banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ══════════════════════════════════════════════════════════════
-- ✅ LISTO
-- ══════════════════════════════════════════════════════════════
-- Tablas creadas:
--   · nzt_catalogo  (3 precios, stock, codigo, descripcion)
--   · nzt_banners
--   · usuarios
--
-- Usuario admin creado:
--   Usuario:    nztecn
--   Contraseña: Admin2024
--
-- Para agregar más admins:
--   INSERT INTO public.usuarios (usuario, password, rol)
--   VALUES ('nuevo_usuario', 'su_clave', 'admin');
