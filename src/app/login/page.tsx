import type { Metadata } from "next";
import { LoginForm } from "@/components/app/login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed */}
      <img src="/icon.svg" alt="" width={88} height={88} className="mb-5 rounded-[22px] shadow-lg shadow-primary/20" />
      <h1 className="text-[28px] font-bold tracking-tight">Toque</h1>
      <p className="mt-1 mb-8 text-center text-[15px] text-muted-foreground">As tarefas da casa, num toque.</p>
      <LoginForm />
    </main>
  );
}
