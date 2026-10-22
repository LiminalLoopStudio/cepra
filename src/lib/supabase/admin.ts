import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente con la llave SECRETA: ignora las reglas RLS y puede administrar
// usuarios de Authentication.
//
// Reglas:
//  * Solo se usa en el servidor ("server-only" rompe el build si alguien lo
//    importa en un componente del navegador).
//  * Siempre DESPUÉS de verificar que quien pide la acción es administrador.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("Falta SUPABASE_SECRET_KEY en .env.local (ver .env.example).");
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
