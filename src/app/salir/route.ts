import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cierra la sesión y manda al login. Se usa cuando alguien con sesión abierta
// fue desactivado: así no queda atrapado entre "/" y "/login".
//
// Ojo: Next "precarga" (prefetch) rutas en segundo plano. Una precarga NO debe
// cerrar la sesión: solo se cierra cuando de verdad se navega aquí.
export async function GET(request: NextRequest) {
  if (request.headers.get("next-router-prefetch")) {
    return new NextResponse(null, { status: 204 });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = request.nextUrl.searchParams.get("motivo") === "inactivo" ? "?motivo=inactivo" : "";
  return NextResponse.redirect(url);
}
