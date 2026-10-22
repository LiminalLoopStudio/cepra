import type { Metadata } from "next";
import Link from "next/link";
import { requireUsuario, ROL_ETIQUETA, type Rol } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NuevoUsuarioForm } from "./nuevo-usuario-form";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  const yo = await requireUsuario(["administrador"]);

  // Los correos viven en Authentication: se leen con el cliente admin
  // (ya verificamos arriba que quien consulta es administrador).
  const admin = createAdminClient();
  const [{ data: perfiles, error: errorPerfiles }, { data: auth, error: errorAuth }] =
    await Promise.all([
    admin.from("usuarios").select("id, nombre, rol, activo, created_at").order("nombre"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const correo = new Map((auth?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const ultimoAcceso = new Map((auth?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Inicio
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Usuarios</h1>
        <p className="text-sm text-muted">
          Solo el administrador da de alta personas. No hay registro público.
        </p>
      </div>

      {errorPerfiles || errorAuth ? (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <p className="font-semibold">No se pudo leer la lista de usuarios.</p>
          <p>{(errorPerfiles ?? errorAuth)?.message}</p>
          <p className="mt-1 text-xs">
            Revisa que SUPABASE_SECRET_KEY en .env.local sea la llave secreta vigente y reinicia
            npm run dev.
          </p>
        </div>
      ) : null}

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="mb-4 font-semibold">Nuevo usuario</h2>
        <NuevoUsuarioForm />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">
          Usuarios <span className="text-muted">({perfiles?.length ?? 0})</span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-foreground/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-foreground/5 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Correo</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Último acceso</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {perfiles?.map((u) => {
                const acceso = ultimoAcceso.get(u.id);
                return (
                  <tr key={u.id} className={u.activo ? "" : "opacity-50"}>
                    <td className="px-4 py-2">
                      {u.nombre}
                      {u.id === yo.id ? <span className="ml-2 text-xs text-muted">(tú)</span> : null}
                      {!u.activo ? <span className="ml-2 text-xs text-muted">(desactivado)</span> : null}
                    </td>
                    <td className="px-4 py-2 text-muted">{correo.get(u.id) ?? "—"}</td>
                    <td className="px-4 py-2">{ROL_ETIQUETA[u.rol as Rol] ?? u.rol}</td>
                    <td className="px-4 py-2 text-muted">
                      {acceso
                        ? new Date(acceso).toLocaleString("es-MX", {
                            timeZone: "America/Mexico_City",
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "Nunca"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/usuarios/${u.id}`} className="text-brand hover:underline">
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
