import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para componentes que corren en el navegador
// (escaneo, tiempo real). Usa la llave pública: la seguridad la ponen las
// reglas RLS de la base de datos, no el código.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
