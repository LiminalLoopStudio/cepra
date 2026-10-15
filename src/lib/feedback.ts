// Retroalimentación de escaneo: sonido + vibración.
// Los tonos se generan con Web Audio (sin archivos de audio).

export type Nivel = "ok" | "advertencia" | "error";

let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tono(frecuencia: number, inicio: number, duracion: number) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "square";
  osc.frequency.value = frecuencia;
  const t0 = ac.currentTime + inicio;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.15, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.02);
}

// ok: un bip agudo · advertencia: dos bips medios · error: un tono grave largo
export function sonar(nivel: Nivel) {
  if (nivel === "ok") {
    tono(1320, 0, 0.09);
  } else if (nivel === "advertencia") {
    tono(880, 0, 0.1);
    tono(880, 0.14, 0.1);
  } else {
    tono(220, 0, 0.35);
  }
  try {
    navigator.vibrate?.(nivel === "ok" ? 40 : nivel === "advertencia" ? [60, 60, 60] : 300);
  } catch {
    // El dispositivo no vibra; no pasa nada.
  }
}
