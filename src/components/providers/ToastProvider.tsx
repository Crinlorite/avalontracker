"use client";
import { Toaster } from "react-hot-toast";
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: { background: "#1f2937", color: "#f3f4f6", border: "1px solid #374151" },
        success: { iconTheme: { primary: "#10b981", secondary: "#1f2937" } },
        error: { iconTheme: { primary: "#ef4444", secondary: "#1f2937" } },
      }}
    />
  );
}
