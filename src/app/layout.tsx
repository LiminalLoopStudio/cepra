import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { getUsuarioActual } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "CEPRA", template: "%s · CEPRA" },
  description: "Control de Equipos, Préstamos y Recepción en Almacén — Gaming Partners",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // para respetar el área segura del iPhone (barra inferior)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f14" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Menú solo con sesión y contraseña definitiva.
  const usuario = await getUsuarioActual();
  const conMenu = usuario && !usuario.debeCambiarContrasena ? { nombre: usuario.nombre, rol: usuario.rol, rolReal: usuario.rolReal } : null;

  return (
    <html lang="es-MX" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <AppShell usuario={conMenu}>{children}</AppShell>
      </body>
    </html>
  );
}
