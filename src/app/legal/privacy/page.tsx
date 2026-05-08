"use client";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalPage } from "@/components/legal/LegalPage";

const UPDATED_ISO = "2026-04-24";

export default function PrivacyPolicyPage() {
  const { lang } = useLanguage();
  // EN como fallback universal — ver comentario en aviso-legal/page.tsx.
  if (lang === "es") return <Spanish />;
  return <English />;
}

function Spanish() {
  return (
    <LegalPage title="Política de Privacidad" updated="Actualizado: 24/04/2026">
      <h2>👤 Responsable del tratamiento</h2>
      <p>
        Avalon Tracker es un proyecto operado por <strong>Crintech Studios</strong>. Para consultas
        relacionadas con privacidad, datos personales o ejercer tus derechos, escribe a{" "}
        <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>.
      </p>

      <h2>📦 Qué datos recogemos</h2>
      <p>Cuando te registras con Discord OAuth, guardamos lo mínimo necesario para que funcione:</p>
      <ul>
        <li>
          <strong>Identificador Discord</strong> (ID numérico, username, global nickname, avatar).
        </li>
        <li>
          <strong>Email</strong> asociado a tu cuenta Discord (autorizado vía el scope{" "}
          <code>email</code> de OAuth).
        </li>
        <li>
          <strong>Clanes</strong> en los que participas dentro de Avalon Tracker, y tu rol en cada uno.
        </li>
        <li>
          <strong>Rutas</strong> que creas o contribuyes en esos clanes (zonas Roads of Avalon,
          portales, timers).
        </li>
        <li>
          <strong>Log de auditoría</strong> de acciones administrativas en clanes donde eres ADMIN
          (crear/borrar rutas, cambios de config, etc.).
        </li>
      </ul>
      <p>
        <strong>No recogemos</strong>: IP persistente, datos de pago, datos de juego de Albion Online
        más allá de nombres de zona, ni información de otros jugadores fuera de tu clan.
      </p>

      <h2>🎯 Finalidad y base legal</h2>
      <p>Usamos tus datos exclusivamente para prestar el servicio:</p>
      <ul>
        <li>
          <strong>Autenticación</strong> (base legal: ejecución de contrato — el servicio no funciona
          sin identificarte).
        </li>
        <li>
          <strong>Sincronización de roles</strong> con el servidor Discord de tu clan via Vigil Bot
          (base legal: interés legítimo + consentimiento al conectar tu cuenta Discord).
        </li>
        <li>
          <strong>Auditoría</strong> de acciones en clanes para que los admin vean quién hizo qué
          (base legal: interés legítimo — seguridad y trazabilidad).
        </li>
      </ul>
      <p>
        No usamos tus datos para publicidad, perfilado, ni los vendemos a terceros. No hay analytics
        de comportamiento.
      </p>

      <h2>🤝 Cesión a terceros</h2>
      <p>Los datos técnicamente pasan por:</p>
      <ul>
        <li>
          <strong>Discord</strong> — el login OAuth los suministra. Se rigen por la{" "}
          <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">
            política de privacidad de Discord
          </a>
          .
        </li>
        <li>
          <strong>Vigil Bot</strong> — servicio propio de Crintech Studios, comparte claves seguras
          con Avalon Tracker para sincronizar roles. Alojado en la misma infraestructura.
        </li>
        <li>
          <strong>Hetzner Cloud / Coolify</strong> — proveedor de hosting donde corre la aplicación y
          la base de datos.
        </li>
        <li>
          <strong>Cloudflare</strong> — DNS y CDN.
        </li>
      </ul>
      <p>
        <strong>No cedemos datos a anunciantes, brokers, ni terceros ajenos al funcionamiento del
        servicio.</strong>
      </p>

      <h2>⏳ Retención</h2>
      <ul>
        <li>
          <strong>Cuenta de usuario</strong>: mientras exista. Si cierras sesión Discord
          permanentemente o borras tu cuenta Discord, tu registro en Avalon Tracker queda huérfano —
          puedes pedir borrado escribiendo a <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>.
        </li>
        <li>
          <strong>Rutas y logs</strong>: mientras el clan al que pertenecen exista.
        </li>
        <li>
          <strong>Audit log</strong>: mientras el clan exista. Al borrarse un clan se eliminan
          también sus logs (cascade delete).
        </li>
      </ul>

      <h2>⚖️ Tus derechos (GDPR / LOPDGDD)</h2>
      <p>Como usuario tienes derecho a:</p>
      <ul>
        <li>
          <strong>Acceso</strong>: saber qué datos guardamos sobre ti (pide un dump).
        </li>
        <li>
          <strong>Rectificación</strong>: corregir datos inexactos.
        </li>
        <li>
          <strong>Supresión</strong> (&quot;derecho al olvido&quot;): borrar tu cuenta y datos
          asociados.
        </li>
        <li>
          <strong>Portabilidad</strong>: recibir tus datos en formato estructurado (JSON).
        </li>
        <li>
          <strong>Oposición</strong>: oponerte a usos específicos de tus datos.
        </li>
        <li>
          <strong>Retirar consentimiento</strong>: desconectar tu cuenta Discord (logout) y pedir
          borrado.
        </li>
      </ul>
      <p>
        Para ejercer cualquier derecho escribe a{" "}
        <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>. Respondemos en un plazo máximo
        de 30 días. También puedes reclamar ante la AEPD (
        <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
          www.aepd.es
        </a>
        ) si consideras que no atendimos correctamente.
      </p>

      <h2>🍪 Cookies</h2>
      <p>
        Usamos una única cookie técnica de sesión (NextAuth) para mantenerte logueado. Ver detalle en{" "}
        <a href="/legal/cookies">Política de cookies</a>.
      </p>

      <h2>🔒 Seguridad</h2>
      <p>
        Transmitimos todo vía HTTPS. Las contraseñas no se almacenan (autenticación delegada a
        Discord OAuth). Los secrets/API tokens internos están cifrados. Aplicamos medidas técnicas
        razonables contra accesos no autorizados.
      </p>

      <h2>🔄 Cambios en esta política</h2>
      <p>
        Si cambiamos esta política publicaremos la nueva versión aquí con una fecha de actualización
        visible en la parte superior. Los cambios materiales se comunicarán también en el dashboard
        al usuario. Si sigues usando el servicio después del cambio, aceptas la nueva versión.
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
    <LegalPage title="Privacy Policy" updated="Last updated: 2026-04-24">
      <h2>👤 Data controller</h2>
      <p>
        Avalon Tracker is operated by <strong>Crintech Studios</strong>. For privacy questions,
        personal data queries, or to exercise your rights, contact{" "}
        <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>.
      </p>

      <h2>📦 What we collect</h2>
      <p>When you sign in with Discord OAuth, we store only what we need to run the service:</p>
      <ul>
        <li>
          <strong>Discord identifier</strong> (numeric ID, username, global nickname, avatar).
        </li>
        <li>
          <strong>Email</strong> tied to your Discord account (granted via the OAuth{" "}
          <code>email</code> scope).
        </li>
        <li>
          <strong>Clans</strong> you belong to within Avalon Tracker, and your role in each.
        </li>
        <li>
          <strong>Routes</strong> you create or contribute to in those clans (Roads of Avalon zones,
          portals, timers).
        </li>
        <li>
          <strong>Audit log</strong> of admin actions in clans where you are ADMIN (create/delete
          routes, settings changes, etc.).
        </li>
      </ul>
      <p>
        <strong>We do not collect</strong>: persistent IP, payment data, in-game Albion data beyond
        zone names, or information about other players outside your clan.
      </p>

      <h2>🎯 Purpose and legal basis</h2>
      <p>We use your data solely to deliver the service:</p>
      <ul>
        <li>
          <strong>Authentication</strong> (legal basis: performance of contract — the service can&apos;t
          work without identifying you).
        </li>
        <li>
          <strong>Role sync</strong> with your clan&apos;s Discord server via Vigil Bot (legal basis:
          legitimate interest + consent when you connect your Discord account).
        </li>
        <li>
          <strong>Audit</strong> of clan actions so admins can see who did what (legal basis:
          legitimate interest — security and traceability).
        </li>
      </ul>
      <p>
        We do not use your data for advertising, profiling, and we do not sell it to third parties.
        No behavioral analytics.
      </p>

      <h2>🤝 Third parties</h2>
      <p>Data technically passes through:</p>
      <ul>
        <li>
          <strong>Discord</strong> — provides the OAuth login. Governed by the{" "}
          <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">
            Discord privacy policy
          </a>
          .
        </li>
        <li>
          <strong>Vigil Bot</strong> — Crintech Studios own service, exchanges secure keys with
          Avalon Tracker for role sync. Hosted on the same infrastructure.
        </li>
        <li>
          <strong>Hetzner Cloud / Coolify</strong> — hosting provider running the app and database.
        </li>
        <li>
          <strong>Cloudflare</strong> — DNS and CDN.
        </li>
      </ul>
      <p>
        <strong>We never share data with advertisers, data brokers, or third parties outside service
        operation.</strong>
      </p>

      <h2>⏳ Retention</h2>
      <ul>
        <li>
          <strong>User account</strong>: while it exists. If you permanently disconnect Discord or
          delete your Discord account, your Avalon Tracker record becomes orphan — request deletion
          at <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>.
        </li>
        <li>
          <strong>Routes and logs</strong>: while the clan they belong to exists.
        </li>
        <li>
          <strong>Audit log</strong>: while the clan exists. When a clan is deleted, its logs are
          cascade-deleted.
        </li>
      </ul>

      <h2>⚖️ Your rights (GDPR)</h2>
      <p>As a user you have the right to:</p>
      <ul>
        <li>
          <strong>Access</strong>: know what data we store about you (request a dump).
        </li>
        <li>
          <strong>Rectification</strong>: correct inaccurate data.
        </li>
        <li>
          <strong>Erasure</strong> (&quot;right to be forgotten&quot;): delete your account and
          related data.
        </li>
        <li>
          <strong>Portability</strong>: receive your data in a structured format (JSON).
        </li>
        <li>
          <strong>Object</strong>: oppose specific uses of your data.
        </li>
        <li>
          <strong>Withdraw consent</strong>: disconnect your Discord account (logout) and request
          deletion.
        </li>
      </ul>
      <p>
        To exercise any right, email <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>. We
        reply within 30 days. You may also lodge a complaint with the Spanish Data Protection Agency
        (
        <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
          www.aepd.es
        </a>
        ) if you believe we haven&apos;t handled your request properly.
      </p>

      <h2>🍪 Cookies</h2>
      <p>
        We use a single technical session cookie (NextAuth) to keep you logged in. Full detail in the{" "}
        <a href="/legal/cookies">Cookie Policy</a>.
      </p>

      <h2>🔒 Security</h2>
      <p>
        Everything is served over HTTPS. Passwords are never stored (authentication is delegated to
        Discord OAuth). Internal secrets/API tokens are encrypted. We apply reasonable technical
        measures against unauthorized access.
      </p>

      <h2>🔄 Changes to this policy</h2>
      <p>
        If we change this policy, the new version is published here with a visible update date at
        the top. Material changes are also communicated in the dashboard. Continued use after a
        change constitutes acceptance.
      </p>

      <h2>📬 Contact</h2>
      <p>
        <a href="mailto:avalon@crintech.pro">avalon@crintech.pro</a>
      </p>
    </LegalPage>
  );
}
