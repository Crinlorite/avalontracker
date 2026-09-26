"use client";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalPage } from "@/components/legal/LegalPage";

export default function CookiesPage() {
  const { lang } = useLanguage();
  // EN como fallback universal — ver comentario en aviso-legal/page.tsx.
  if (lang === "es") return <Spanish />;
  return <English />;
}

function Spanish() {
  return (
    <LegalPage title="Política de Cookies" updated="Actualizado: 26/09/2026">
      <h2>🍪 Qué son las cookies</h2>
      <p>
        Una cookie es un pequeño archivo de texto que un sitio web guarda en tu navegador. Las hay
        técnicas (imprescindibles para que el sitio funcione) y las hay de terceros (publicidad,
        analytics, tracking entre sitios).
      </p>

      <h2>📋 Qué cookies usa Avalon Tracker</h2>
      <p>
        <strong>Solo cookies técnicas, esenciales</strong>. Sin analytics. Sin tracking de
        publicidad. Sin cookies de terceros.
      </p>
      <ul>
        <li>
          <code>__Secure-authjs.session-token</code> — cookie de sesión emitida por{" "}
          <a href="https://authjs.dev" target="_blank" rel="noopener noreferrer">
            NextAuth
          </a>
          . Contiene un JWT cifrado con tu identidad para mantenerte logueado. Flags{" "}
          <code>HttpOnly</code>, <code>Secure</code>, <code>SameSite=Lax</code>. Caduca en 14 días
          sin actividad, se renueva cada 24 h si entras. También la usa la cuenta de invitado del
          mapa sin cuenta.
        </li>
        <li>
          Durante el login con Discord, NextAuth pone además cookies de corta vida de CSRF y de URL
          de retorno.
        </li>
        <li>
          <code>avalon_guest_claim</code> — solo si eres invitado y pulsas «Guardar mis mapas con
          Discord»: lleva firmado el identificador de tu cuenta de invitado para pasar tus mapas a tu
          cuenta de Discord. <code>HttpOnly</code>, <code>SameSite=Lax</code>, caduca a los 10
          minutos y se borra al completar el login.
        </li>
      </ul>
      <p>
        Esta cookie es <strong>necesaria</strong>: sin ella no puedes estar logueado. No requiere
        consentimiento explícito bajo el artículo 22.2 de la LSSI-CE (cookies técnicas necesarias
        para la prestación del servicio solicitado por el usuario).
      </p>

      <h2>🚫 Lo que NO hacemos</h2>
      <ul>
        <li>No usamos Google Analytics, Meta Pixel ni ningún tracker de comportamiento.</li>
        <li>No compartimos datos con anunciantes.</li>
        <li>No hay cookies de terceros (solo hay cookies del propio dominio).</li>
        <li>No hay fingerprinting del navegador.</li>
      </ul>

      <h2>⚙️ Cómo gestionar cookies</h2>
      <p>Tienes control total:</p>
      <ul>
        <li>
          <strong>Cerrar sesión</strong> elimina la cookie desde el servidor.
        </li>
        <li>
          <strong>Borrar cookies del navegador</strong> — en cualquier momento desde la configuración
          de tu navegador, equivale a cerrar sesión.
        </li>
        <li>
          <strong>Bloquear cookies de primera parte</strong> — posible en tu navegador, pero entonces
          no podrás usar el servicio (no hay login alternativo).
        </li>
      </ul>

      <h2>💾 localStorage</h2>
      <p>
        Además de la cookie de sesión, guardamos en el <code>localStorage</code> de tu navegador una
        única preferencia: tu idioma seleccionado (ES o EN) bajo la clave{" "}
        <code>avalon-lang</code>. Esto no es una cookie técnicamente, no se envía al servidor, y
        queda en tu dispositivo hasta que borres los datos del sitio.
      </p>

      <h2>🔄 Cambios</h2>
      <p>
        Si en el futuro añadimos más cookies, actualizaremos esta política y notificaremos con un
        banner consentido donde aplique.
      </p>

      <h2>📬 Contacto</h2>
      <p>
        <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>
      </p>
    </LegalPage>
  );
}

function English() {
  return (
    <LegalPage title="Cookie Policy" updated="Last updated: 2026-09-26">
      <h2>🍪 What cookies are</h2>
      <p>
        A cookie is a small text file a website stores in your browser. Some are technical
        (essential for the site to work), others are third-party (advertising, analytics,
        cross-site tracking).
      </p>

      <h2>📋 What cookies Avalon Tracker uses</h2>
      <p>
        <strong>Only technical, essential cookies</strong>. No analytics. No ad tracking. No
        third-party cookies.
      </p>
      <ul>
        <li>
          <code>__Secure-authjs.session-token</code> — session cookie issued by{" "}
          <a href="https://authjs.dev" target="_blank" rel="noopener noreferrer">
            NextAuth
          </a>
          . Contains an encrypted JWT with your identity to keep you logged in. Flags{" "}
          <code>HttpOnly</code>, <code>Secure</code>, <code>SameSite=Lax</code>. Expires after 14
          days of inactivity, refreshed every 24 h on active use. The guest account of the free map
          uses it too.
        </li>
        <li>
          <code>avalon_guest_claim</code> — only if you are a guest and press «Keep my maps with
          Discord»: it carries your signed guest account id so your maps move to your Discord
          account. <code>HttpOnly</code>, <code>SameSite=Lax</code>, expires after 10 minutes and is
          deleted when the sign-in completes.
        </li>
        <li>
          During Discord sign-in, NextAuth also sets short-lived CSRF and callback-URL cookies.
        </li>
      </ul>
      <p>
        This cookie is <strong>strictly necessary</strong>: without it you cannot stay logged in. It
        does not require explicit consent under Spanish LSSI-CE article 22.2 (technical cookies
        necessary for the service requested by the user).
      </p>

      <h2>🚫 What we DO NOT do</h2>
      <ul>
        <li>No Google Analytics, no Meta Pixel, no behavioral trackers.</li>
        <li>We never share data with advertisers.</li>
        <li>No third-party cookies (only first-party from our own domain).</li>
        <li>No browser fingerprinting.</li>
      </ul>

      <h2>⚙️ How to manage cookies</h2>
      <p>You have full control:</p>
      <ul>
        <li>
          <strong>Sign out</strong> removes the cookie server-side.
        </li>
        <li>
          <strong>Clear browser cookies</strong> — from your browser settings at any time, equivalent
          to signing out.
        </li>
        <li>
          <strong>Block first-party cookies</strong> — possible in your browser, but then you can&apos;t
          use the service (there is no alternative login).
        </li>
      </ul>

      <h2>💾 localStorage</h2>
      <p>
        Besides the session cookie, we store a single preference in your browser&apos;s{" "}
        <code>localStorage</code>: your selected language (ES or EN) under the key{" "}
        <code>avalon-lang</code>. This is not technically a cookie, it is never sent to the server,
        and persists until you clear site data.
      </p>

      <h2>🔄 Changes</h2>
      <p>
        If we add more cookies in the future, we will update this policy and, where applicable,
        surface a consent banner.
      </p>

      <h2>📬 Contact</h2>
      <p>
        <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>
      </p>
    </LegalPage>
  );
}
