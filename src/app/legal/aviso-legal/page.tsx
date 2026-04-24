"use client";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalPage } from "@/components/legal/LegalPage";

export default function LegalNoticePage() {
  const { lang } = useLanguage();
  if (lang === "en") return <English />;
  return <Spanish />;
}

function Spanish() {
  return (
    <LegalPage title="Aviso Legal" updated="Actualizado: 24/04/2026">
      <h2>🏷 Titular del sitio</h2>
      <p>
        Este sitio, accesible en <a href="https://avalon.crintech.pro">https://avalon.crintech.pro</a>, es operado por <strong>Crintech Studios</strong>, proyecto personal sin
        forma jurídica registrada. Contacto:{" "}
        <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>.
      </p>

      <h2>🎯 Objeto</h2>
      <p>
        Avalon Tracker es una herramienta colaborativa para mapear rutas de Roads of Avalon del
        videojuego <strong>Albion Online</strong>, integrada con Discord para gestión de clanes.
        Servicio gratuito, sin cuentas premium, sin publicidad.
      </p>

      <h2>✋ Uso aceptable</h2>
      <p>
        Al usar Avalon Tracker aceptas <strong>no</strong>:
      </p>
      <ul>
        <li>Extraer datos de otros clanes sin su permiso (scraping masivo, ingeniería inversa).</li>
        <li>
          Suplantar identidad o crear cuentas fraudulentas (vía spoofing de Discord OAuth o
          similares).
        </li>
        <li>
          Usar el servicio para coordinar ataques, acoso, o actividades que violen la TOS de Albion
          Online o la legislación vigente.
        </li>
        <li>
          Interferir con la disponibilidad del servicio (denegación de servicio, spam, payloads
          maliciosos).
        </li>
        <li>
          Revender o redistribuir el servicio como si fuera propio (white-labeling no autorizado).
        </li>
      </ul>
      <p>
        Nos reservamos el derecho a suspender cuentas o clanes que incumplan, previo aviso cuando sea
        posible.
      </p>

      <h2>🎮 Relación con Albion Online</h2>
      <p>
        <strong>Avalon Tracker no está afiliado, patrocinado ni respaldado por Sandbox Interactive
        GmbH</strong>, desarrolladora y editora de Albion Online. Albion Online, Roads of Avalon,
        nombres de zona y activos del juego son propiedad de sus respectivos titulares.
      </p>
      <p>
        Solo usamos datos públicos: nombres de zonas (del world map público) e identidades Discord
        que los usuarios voluntariamente conectan. No inyectamos código en el cliente del juego, no
        exponemos información no pública de otros jugadores.
      </p>
      <p>
        Los usuarios son responsables de que el uso que hacen de Avalon Tracker sea compatible con
        los Términos de Servicio de Albion Online en su región.
      </p>

      <h2>©️ Propiedad intelectual</h2>
      <p>
        El código fuente, diseño, logotipos y textos de Avalon Tracker son propiedad de Crintech
        Studios. Queda prohibida la reproducción total o parcial sin autorización expresa, salvo
        para uso personal no comercial.
      </p>

      <h2>⚠️ Limitación de responsabilidad</h2>
      <p>
        El servicio se ofrece &quot;tal cual&quot; (&quot;as is&quot;). Crintech Studios no
        garantiza disponibilidad ininterrumpida, exactitud de los datos mostrados (timers de
        portales, estados de ruta), ni que el servicio sea adecuado para un propósito específico.
      </p>
      <p>
        No nos hacemos responsables de pérdidas derivadas de: caídas del servicio, errores de
        sincronización con Discord, información desactualizada, decisiones tomadas dentro del juego
        basándose en datos del tracker, o acciones de terceros (Discord, Albion Online, tu ISP).
      </p>

      <h2>🔗 Enlaces externos</h2>
      <p>
        Este sitio puede enlazar a sitios de terceros (Discord, Vigil Bot, Royal Forge, Albion
        Invoice, etc.). No somos responsables del contenido ni prácticas de privacidad de esos
        terceros.
      </p>

      <h2>⚖️ Ley aplicable</h2>
      <p>
        Este aviso se rige por la legislación española. Para cualquier disputa derivada del uso del
        servicio, las partes se someten a los tribunales competentes de la residencia del
        consumidor (si procede la legislación de consumo) o, en su defecto, a los tribunales de
        España.
      </p>

      <h2>🔄 Modificaciones</h2>
      <p>
        Podemos actualizar este aviso legal sin previo aviso. La fecha de última actualización
        aparece en la parte superior. El uso continuado tras una modificación implica aceptación.
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
    <LegalPage title="Legal Notice" updated="Last updated: 2026-04-24">
      <h2>🏷 Site owner</h2>
      <p>
        This site, available at <a href="https://avalon.crintech.pro">https://avalon.crintech.pro</a>, is operated by <strong>Crintech Studios</strong>, a personal project without
        registered legal form. Contact: <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>.
      </p>

      <h2>🎯 Purpose</h2>
      <p>
        Avalon Tracker is a collaborative tool to map Roads of Avalon routes from the video game{" "}
        <strong>Albion Online</strong>, integrated with Discord for clan management. Free service,
        no premium tiers, no advertising.
      </p>

      <h2>✋ Acceptable use</h2>
      <p>
        By using Avalon Tracker you agree <strong>not to</strong>:
      </p>
      <ul>
        <li>Extract data from other clans without their permission (mass scraping, reverse engineering).</li>
        <li>
          Impersonate identity or create fraudulent accounts (via Discord OAuth spoofing or similar).
        </li>
        <li>
          Use the service to coordinate attacks, harassment, or activities violating the Albion
          Online TOS or applicable law.
        </li>
        <li>
          Interfere with service availability (denial of service, spam, malicious payloads).
        </li>
        <li>
          Resell or redistribute the service as your own (unauthorized white-labeling).
        </li>
      </ul>
      <p>
        We reserve the right to suspend accounts or clans that breach these terms, with prior notice
        when feasible.
      </p>

      <h2>🎮 Relationship with Albion Online</h2>
      <p>
        <strong>Avalon Tracker is not affiliated with, sponsored by, or endorsed by Sandbox
        Interactive GmbH</strong>, developer and publisher of Albion Online. Albion Online, Roads of
        Avalon, zone names, and game assets are property of their respective owners.
      </p>
      <p>
        We only use public data: zone names (from the public world map) and Discord identities that
        users voluntarily connect. We do not inject code into the game client, we do not expose
        non-public information about other players.
      </p>
      <p>
        Users are responsible for ensuring their use of Avalon Tracker complies with the Albion
        Online Terms of Service in their region.
      </p>

      <h2>©️ Intellectual property</h2>
      <p>
        Source code, design, logos, and texts of Avalon Tracker are property of Crintech Studios.
        Full or partial reproduction without explicit authorization is prohibited, except for
        personal non-commercial use.
      </p>

      <h2>⚠️ Limitation of liability</h2>
      <p>
        The service is provided &quot;as is&quot;. Crintech Studios does not guarantee uninterrupted
        availability, accuracy of displayed data (portal timers, route states), nor that the
        service is fit for any specific purpose.
      </p>
      <p>
        We are not liable for losses arising from: service outages, Discord sync errors, outdated
        information, in-game decisions based on tracker data, or actions of third parties (Discord,
        Albion Online, your ISP).
      </p>

      <h2>🔗 External links</h2>
      <p>
        This site may link to third-party sites (Discord, Vigil Bot, Royal Forge, Albion Invoice,
        etc.). We are not responsible for the content or privacy practices of such third parties.
      </p>

      <h2>⚖️ Applicable law</h2>
      <p>
        This notice is governed by Spanish law. For any dispute arising from the use of the
        service, the parties submit to the competent courts of the consumer&apos;s residence (if
        consumer law applies) or, failing that, to the courts of Spain.
      </p>

      <h2>🔄 Changes</h2>
      <p>
        We may update this legal notice without prior notice. The last update date appears at the
        top. Continued use after a modification implies acceptance.
      </p>

      <h2>📬 Contact</h2>
      <p>
        <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>
      </p>
    </LegalPage>
  );
}
