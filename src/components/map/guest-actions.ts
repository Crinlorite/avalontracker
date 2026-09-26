"use client";
import { signIn } from "next-auth/react";

// Invitado → cuenta de Discord conservando sus mapas: primero la cookie
// firmada de reclamación y después el login normal de Discord.
export async function keepMapsWithDiscord(callbackUrl = "/dashboard") {
  await fetch("/api/guest/claim", { method: "POST" }).catch(() => undefined);
  await signIn("discord", { callbackUrl });
}
