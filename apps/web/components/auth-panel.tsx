"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = { resetting: boolean; message: string; onMessage: (message: string) => void; onPasswordUpdated: () => void };

export function AuthPanel({ resetting, message, onMessage, onPasswordUpdated }: Props) {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "recovery">("sign-in");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email"));
    const password = String(fields.get("password"));
    setBusy(true);
    onMessage("");
    try {
      if (resetting) {
        if (password !== fields.get("confirmation")) throw new Error("Las contraseñas no coinciden.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onPasswordUpdated();
      } else if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?recovery=1` });
        if (error) throw error;
        onMessage("Si existe una cuenta, recibirás un correo de recuperación.");
      } else if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        onMessage("Revisa tu correo para confirmar la cuenta.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo completar la autenticación.");
    } finally { setBusy(false); }
  }

  return <main className="auth">
    <h1>Workspace</h1>
    <h2>{resetting ? "Establecer nueva contraseña" : mode === "sign-in" ? "Ingresa con tu cuenta" : mode === "sign-up" ? "Crea tu cuenta" : "Recupera tu contraseña"}</h2>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        {!resetting && <label>Email<input name="email" type="email" autoComplete="email" required /></label>}
        {(resetting || mode !== "recovery") && <label>{resetting ? "Nueva contraseña" : "Contraseña"}<input name="password" type="password" autoComplete={resetting || mode === "sign-up" ? "new-password" : "current-password"} required minLength={8} /></label>}
        {resetting && <label>Confirmar contraseña<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} /></label>}
        <button>{busy ? "Procesando…" : resetting ? "Guardar contraseña" : mode === "recovery" ? "Enviar recuperación" : mode === "sign-up" ? "Crear cuenta" : "Ingresar"}</button>
      </fieldset>
    </form>
    {!resetting && <nav className="auth-links" aria-label="Opciones de acceso">
      {mode !== "sign-in" && <button onClick={() => { setMode("sign-in"); onMessage(""); }}>Ya tengo cuenta</button>}
      {mode !== "sign-up" && <button onClick={() => { setMode("sign-up"); onMessage(""); }}>Crear cuenta</button>}
      {mode !== "recovery" && <button onClick={() => { setMode("recovery"); onMessage(""); }}>Olvidé mi contraseña</button>}
    </nav>}
    {message && <p role="alert">{message}</p>}
  </main>;
}
