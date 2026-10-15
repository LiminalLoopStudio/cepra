// Prueba de conexión: consulta el servicio de autenticación de Supabase.
// Si responde, la URL y la llave del .env.local son correctas.
async function estadoSupabase(): Promise<{ ok: boolean; detalle: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !llave) {
    return { ok: false, detalle: "Faltan variables en .env.local" };
  }
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: llave },
      cache: "no-store",
    });
    if (res.ok) return { ok: true, detalle: "Conectado a Supabase" };
    return { ok: false, detalle: `Supabase respondió ${res.status}` };
  } catch {
    return { ok: false, detalle: "No se pudo contactar a Supabase" };
  }
}

export default async function Home() {
  const supabase = await estadoSupabase();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
        C
      </div>
      <h1 className="text-3xl font-bold">CEPRA</h1>
      <p className="max-w-md text-muted">
        Control de Equipos, Préstamos y Recepción en Almacén
        <br />
        Gaming Partners
      </p>

      <p
        className={`mt-6 rounded-full px-4 py-1.5 text-sm font-medium ${
          supabase.ok ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"
        }`}
      >
        {supabase.ok ? "✓" : "✗"} {supabase.detalle}
      </p>
      <p className="text-sm text-muted">En construcción</p>
    </main>
  );
}
