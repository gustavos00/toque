"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** "Copiar" pill that copies `value` and briefly shows a check mark. */
export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [isCopied, setIsCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1600);
    } catch {
      toast.error("Não foi possível copiar. Mantém o dedo no texto para copiar.");
    }
  }

  return (
    <Button type="button" variant="secondary" size="touch" onClick={copyValue} className="rounded-full">
      {isCopied ? <Check className="text-success" /> : <Copy />}
      {isCopied ? "Copiado" : label}
    </Button>
  );
}
