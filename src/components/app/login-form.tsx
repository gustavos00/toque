"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getErrorMessage, login } from "@/lib/api";
import { DEMO_PASSWORD, isDemoMode } from "@/shared/demo";

/** Only same-site paths are allowed as the post-login destination. */
function getSafeNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm() {
  const isDemo = isDemoMode();
  const [password, setPassword] = useState(isDemo ? DEMO_PASSWORD : "");
  const [isVisible, setIsVisible] = useState(isDemo);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setIsSubmitting(true);
    setProblem(null);
    try {
      await login(password);
      // Full navigation so the proxy sees the new session cookie.
      window.location.replace(getSafeNext());
    } catch (error) {
      setProblem(error instanceof ApiRequestError && error.status === 401 ? "Palavra-passe errada." : getErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitLogin} className="w-full" noValidate>
      <div className="flex items-center overflow-hidden rounded-xl bg-card pl-4">
        <input
          type={isVisible ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          aria-label="Palavra-passe"
          placeholder="Palavra-passe"
          autoFocus
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setProblem(null);
          }}
          aria-invalid={problem ? true : undefined}
          className="h-12 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="button"
          onClick={() => setIsVisible((value) => !value)}
          aria-label={isVisible ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
          className="flex size-12 items-center justify-center text-muted-foreground active:opacity-60"
        >
          {isVisible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      <p role="alert" className="min-h-6 px-4 pt-1.5 text-[14px] text-destructive">
        {problem}
      </p>
      {isDemo && !problem && (
        <p className="-mt-6 min-h-6 px-4 pt-1.5 text-[14px] text-muted-foreground">
          Versão de demonstração: a palavra-passe já está preenchida.
        </p>
      )}
      <Button type="submit" size="xl" className="mt-2 w-full" disabled={!password || isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
