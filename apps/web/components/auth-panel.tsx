"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Alert, Button, Card, Input, type AlertVariant } from "@/components/ui";

type Props = {
  resetting: boolean;
  message: string;
  messageVariant: AlertVariant;
  onMessage: (message: string, variant?: AlertVariant) => void;
  onPasswordUpdated: () => void;
};

export function AuthPanel({ resetting, message, messageVariant, onMessage, onPasswordUpdated }: Props) {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "recovery">("sign-in");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email"));
    const password = String(fields.get("password"));
    setBusy(true);
    onMessage("", "info");
    try {
      if (resetting) {
        if (password !== fields.get("confirmation")) throw new Error("Las contraseñas no coinciden.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onPasswordUpdated();
      } else if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?recovery=1` });
        if (error) throw error;
        onMessage("Si existe una cuenta, recibirás un correo de recuperación.", "info");
      } else if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        onMessage("Revisa tu correo para confirmar la cuenta.", "success");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "No se pudo completar la autenticación.", "danger");
    } finally { setBusy(false); }
  }

  return (
    <main className="app-shell app-shell--narrow">
      <Card className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel__heading">
          <p className="eyebrow">Acceso seguro</p>
          <h1 id="auth-title">Workspace</h1>
          <h2>
            {resetting
              ? "Establecer nueva contraseña"
              : mode === "sign-in"
                ? "Ingresa con tu cuenta"
                : mode === "sign-up"
                  ? "Crea tu cuenta"
                  : "Recupera tu contraseña"}
          </h2>
        </div>
        <form className="form-stack" onSubmit={submit}>
          <fieldset className="form-fields" disabled={busy}>
            {!resetting && (
              <label className="ui-field" htmlFor="auth-email">
                Email
                <Input id="auth-email" name="email" type="email" autoComplete="email" required />
              </label>
            )}
            {(resetting || mode !== "recovery") && (
              <label className="ui-field" htmlFor="auth-password">
                {resetting ? "Nueva contraseña" : "Contraseña"}
                <Input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={resetting || mode === "sign-up" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                />
              </label>
            )}
            {resetting && (
              <label className="ui-field" htmlFor="auth-confirmation">
                Confirmar contraseña
                <Input id="auth-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={8} />
              </label>
            )}
          </fieldset>
          <Button type="submit" disabled={busy}>
            {busy
              ? "Procesando…"
              : resetting
                ? "Guardar contraseña"
                : mode === "recovery"
                  ? "Enviar recuperación"
                  : mode === "sign-up"
                    ? "Crear cuenta"
                    : "Ingresar"}
          </Button>
        </form>
        {!resetting && (
          <nav className="auth-links" aria-label="Opciones de acceso">
            {mode !== "sign-in" && (
              <Button variant="link" size="sm" onClick={() => { setMode("sign-in"); onMessage("", "info"); }}>
                Ya tengo cuenta
              </Button>
            )}
            {mode !== "sign-up" && (
              <Button variant="link" size="sm" onClick={() => { setMode("sign-up"); onMessage("", "info"); }}>
                Crear cuenta
              </Button>
            )}
            {mode !== "recovery" && (
              <Button variant="link" size="sm" onClick={() => { setMode("recovery"); onMessage("", "info"); }}>
                Olvidé mi contraseña
              </Button>
            )}
          </nav>
        )}
        {message && <Alert className="page-message" variant={messageVariant} role="alert">{message}</Alert>}
      </Card>
    </main>
  );
}
