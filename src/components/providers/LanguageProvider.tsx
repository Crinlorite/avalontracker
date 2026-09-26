"use client";
import type { ReactNode } from "react";
import { LanguageProvider as InnerProvider } from "@/contexts/LanguageContext";

// Wrapper para usar desde root layout (server component) — Next App Router
// no permite importar contextos client-side directamente desde el server layout.
export default function LanguageProvider({ children, pageLang }: { children: ReactNode; pageLang?: string }) {
  return <InnerProvider pageLang={pageLang}>{children}</InnerProvider>;
}
