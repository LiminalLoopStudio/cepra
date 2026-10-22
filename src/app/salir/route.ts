import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cierra la sesión y manda al login. Se usa cuando alguien con sesión abierta
// fue desactivado: así no queda atrapado entre "/" y "/login".
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = request.nextUrl.searchParams.get("motivo") === "inactivo" ? "?motivo=inactivo" : "";
  return NextResponse.redirect(url);
}
