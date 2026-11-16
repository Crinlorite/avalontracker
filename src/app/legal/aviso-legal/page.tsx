"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalPage } from "@/components/legal/LegalPage";

export default function LegalNoticePage() {
  const { lang } = useLanguage();
  // EN como fallback universal: solo el castellano explícito devuelve
  // la versión ES. Cualquier otro idioma (fr, de, pt, etc.) ve EN para
  // ser consistente con el navbar del legal/layout.tsx, que también
  // usa EN como default.
  if (lang === "es") return <Spanish />;
  return <English />;
}

// NIF ofuscado (XOR con la 1.ª pareja hex, la misma técnica y el mismo valor que crintech.pro):
// está publicado como exige la LSSI, pero no en claro en el HTML para los recolectores.
const NIF_DATA = "6a5e5d5f595f5e5d532f";
function Nif({ fallback }: { fallback: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const k = parseInt(NIF_DATA.slice(0, 2), 16);
    let s = "";
    for (let i = 2; i < NIF_DATA.length; i += 2) s += String.fromCharCode(parseInt(NIF_DATA.slice(i, i + 2), 16) ^ k);
    if (ref.current) ref.current.textContent = s;
  }, []);
  return <span ref={ref}>{fallback}</span>;
}

const ADDRESS = "Calle Lapurbide 12, 4.º izquierda, 31013 Ansoáin (Navarra)";
const PHONE = "+34 623 05 14 56";

function Spanish() {
  return (
    <LegalPage title="Aviso Legal" updated="Actualizado: 16/11/2026">
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio
        electrónico (LSSI-CE), estos son los datos del titular de Avalon Tracker.
      </p>

      <h2>🏷 Titular</h2>
      <ul>
        <li>Titular: Cristobal Ruiz Lorite, trabajador autónomo</li>
        <li>Nombre comercial: Crintech Studios</li>
        <li>
          NIF: <Nif fallback="activa JavaScript para verlo o pídelo por correo" />
        </li>
        <li>Domicilio: {ADDRESS}, España</li>
        <li>
          Correo electrónico: <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>
        </li>
        <li>Teléfono: {PHONE}</li>
        <li>
          Sitio web: <a href="https://avalontracker.app">https://avalontracker.app</a>
        </li>
      </ul>

      <h2>🎯 Objeto</h2>
      <p>
        Avalon Tracker es una herramienta gratuita, hecha por fans, para mapear rutas de los Caminos de Avalon del
        videojuego <strong>Albion Online</strong>, en esta web y en sus apps para Android e iOS. No tiene compras,
        suscripciones ni publicidad.
      </p>
      <p>
        Las condiciones de uso (cuentas, normas de uso, moderación, responsabilidad, cambios, reclamaciones, ley
        aplicable y tribunales) están en los <Link href="/legal/terms">Términos del servicio</Link>. Los datos
        personales, en la <Link href="/legal/privacy">Política de privacidad</Link> y la{" "}
        <Link href="/legal/cookies">Política de cookies</Link>.
      </p>

      <h2>🎮 Relación con Albion Online</h2>
      <p>
        <strong>
          Avalon Tracker no está afiliado a Sandbox Interactive GmbH, ni cuenta con su patrocinio o respaldo
        </strong>
        ; Sandbox Interactive desarrolla y publica Albion Online. Albion Online, Roads of Avalon, los nombres de zonas y
        el resto de datos y elementos del juego pertenecen a Sandbox Interactive GmbH.
      </p>
      <p>
        Los datos de zonas (recursos, cofres, criaturas, mazmorras) proceden de los volcados de datos del juego que
        mantiene la comunidad, y los precios de mercado, del Albion Online Data Project. Avalon Tracker no se conecta al
        juego ni modifica su cliente.
      </p>

      <h2>©️ Propiedad intelectual</h2>
      <p>
        El código de la web es libre, con licencia MIT, en{" "}
        <a href="https://github.com/Crinlorite/avalontracker" rel="noopener noreferrer">
          github.com/Crinlorite/avalontracker
        </a>
        . El nombre y el logotipo de Avalon Tracker y de Crintech Studios no están incluidos en esa licencia: no se
        pueden usar para presentar otro servicio como si fuera este.
      </p>

      <h2>🔗 Enlaces externos</h2>
      <p>
        Esta web enlaza a sitios de terceros (Discord, Vigil Bot, Royal Forge, Albion Invoice…) que no controlamos.
      </p>
    </LegalPage>
  );
}

function English() {
  return (
    <LegalPage title="Legal Notice" updated="Last updated: 2026-11-16">
      <p>
        In compliance with article 10 of Spanish Law 34/2002 on information society services and electronic commerce
        (LSSI-CE), these are the details of the owner of Avalon Tracker.
      </p>

      <h2>🏷 Owner</h2>
      <ul>
        <li>Owner: Cristobal Ruiz Lorite, self-employed sole trader</li>
        <li>Trade name: Crintech Studios</li>
        <li>
          Tax ID (NIF): <Nif fallback="enable JavaScript to see it or ask by email" />
        </li>
        <li>Address: {ADDRESS}, Spain</li>
        <li>
          Email: <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>
        </li>
        <li>Phone: {PHONE}</li>
        <li>
          Website: <a href="https://avalontracker.app">https://avalontracker.app</a>
        </li>
      </ul>

      <h2>🎯 Purpose</h2>
      <p>
        Avalon Tracker is a free, fan-made tool to map Roads of Avalon routes from the video game{" "}
        <strong>Albion Online</strong>, on this website and in its Android and iOS apps. It has no purchases,
        subscriptions or ads.
      </p>
      <p>
        The terms of use (accounts, rules of use, moderation, liability, changes, complaints, governing law and courts)
        are in the <Link href="/legal/terms">Terms of Service</Link>. Personal data is covered by the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link> and the <Link href="/legal/cookies">Cookie Policy</Link>.
      </p>

      <h2>🎮 Relationship with Albion Online</h2>
      <p>
        <strong>Avalon Tracker is not affiliated with, sponsored by or endorsed by Sandbox Interactive GmbH</strong>,
        which develops and publishes Albion Online. Albion Online, Roads of Avalon, zone names and all other game data
        and elements belong to Sandbox Interactive GmbH.
      </p>
      <p>
        Zone data (resources, chests, creatures, dungeons) comes from the game data dumps maintained by the community,
        and market prices from the Albion Online Data Project. Avalon Tracker does not connect to the game or modify its
        client.
      </p>

      <h2>©️ Intellectual property</h2>
      <p>
        The website code is free software under the MIT licence at{" "}
        <a href="https://github.com/Crinlorite/avalontracker" rel="noopener noreferrer">
          github.com/Crinlorite/avalontracker
        </a>
        . The Avalon Tracker and Crintech Studios names and logos are not covered by that licence: they may not be used
        to present another service as if it were this one.
      </p>

      <h2>🔗 External links</h2>
      <p>This website links to third-party sites (Discord, Vigil Bot, Royal Forge, Albion Invoice…) that we do not control.</p>
    </LegalPage>
  );
}
