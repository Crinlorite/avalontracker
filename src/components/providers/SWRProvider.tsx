"use client";
import { SWRConfig } from "swr";
import { fetcher, ApiError } from "@/lib/fetcher";
import toast from "react-hot-toast";
import type { ReactNode } from "react";

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.status >= 500) toast.error("Error del servidor, reintenta");
            else if (err.status === 503) toast.error("Servicio degradado — Discord/Bot no responde");
            else if (err.status === 401) { /* redirect se gestiona en middleware */ }
          }
        },
        revalidateOnFocus: true,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
