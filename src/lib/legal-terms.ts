// Términos del servicio de Avalon Tracker (web y apps), en texto plano con un formato mínimo:
// 1.ª línea título; 2.ª «Etiqueta: fecha»; luego párrafos sueltos; «N. Título» abre apartado;
// «- » viñeta y «  - » viñeta anidada. La versión española es la original.

export type TermsBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: { text: string; sub?: string[] }[] };
export type TermsSection = { n: number; title: string; blocks: TermsBlock[] };
export type TermsDoc = { title: string; effective: string; intro: TermsBlock[]; sections: TermsSection[] };
export type LinkPart = string | { href: string; label: string };

export function parseTerms(src: string): TermsDoc {
  const lines = src.replace(/\r/g, "").split("\n");
  const title = (lines.shift() ?? "").trim();
  const effective = (lines.shift() ?? "").trim();
  const doc: TermsDoc = { title, effective, intro: [], sections: [] };
  let blocks = doc.intro;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const head = raw.match(/^(\d+)\. (.+)$/);
    if (head) {
      const s: TermsSection = { n: Number(head[1]), title: head[2].trim(), blocks: [] };
      doc.sections.push(s);
      blocks = s.blocks;
      continue;
    }
    const sub = raw.match(/^ {2,}- (.+)$/);
    const item = raw.match(/^- (.+)$/);
    const last = blocks[blocks.length - 1];
    if (sub && last?.kind === "ul" && last.items.length) {
      const it = last.items[last.items.length - 1];
      (it.sub ??= []).push(sub[1].trim());
    } else if (item) {
      if (last?.kind === "ul") last.items.push({ text: item[1].trim() });
      else blocks.push({ kind: "ul", items: [{ text: item[1].trim() }] });
    } else {
      blocks.push({ kind: "p", text: raw.trim() });
    }
  }
  return doc;
}

const LINK_RE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https:\/\/[^\s),]+[^\s),.;:])/g;

export function splitLinks(text: string): LinkPart[] {
  const out: LinkPart[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const i = m.index ?? 0;
    if (i > at) out.push(text.slice(at, i));
    out.push(m[1] ? { href: `mailto:${m[1]}`, label: m[1] } : { href: m[2], label: m[2] });
    at = i + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

const ES = `TÉRMINOS DEL SERVICIO
Vigentes desde: 16/11/2026
Estos términos son el acuerdo entre tú y el titular de Avalon Tracker. Valen para la web https://avalontracker.app y para las apps de Avalon Tracker para Android e iOS.

1. Quién presta el servicio
Avalon Tracker es un servicio de Cristobal Ruiz Lorite, trabajador autónomo establecido en España, que publica sus aplicaciones con el nombre Crintech Studios.
- Domicilio: Calle Lapurbide 12, 4.º izquierda, 31013 Ansoáin (Navarra), España
- Correo electrónico: avalon@crintech.pro
- Teléfono: +34 623 05 14 56
- NIF y demás datos de identificación: en el Aviso legal.
En este texto, «nosotros» es el titular y «tú» eres quien usa Avalon Tracker.

2. Qué es Avalon Tracker
Una herramienta gratuita, hecha por fans, para jugadores de Albion Online. Sirve para apuntar rutas de portales de los Caminos de Avalon con su cuenta atrás, compartirlas con tu gremio, consultar las 400 zonas de Avalon y ver precios de mercado orientativos.
No hay compras, suscripciones, cuentas de pago ni publicidad, y no te pedimos datos de pago.
No es un producto oficial de Albion Online (apartado 13).

3. Cuándo aceptas estos términos
Las páginas públicas (zonas, salidas, precios) se pueden consultar sin cuenta; a quien solo las consulta se le aplican las normas de uso del apartado 10. Aceptas estos términos completos cuando haces cualquiera de estas cosas:
- pulsar «Crear mi mapa» para abrir un mapa de invitado;
- entrar con Discord;
- vincular la app móvil a una cuenta.
No hay más trámites. No guardamos un contrato por cada persona: el contrato es este texto, en la versión vigente mientras usas el servicio. Puedes guardarlo o imprimirlo desde tu navegador y pedirnos versiones anteriores. Está disponible en español y en inglés; la versión española es la original. Todo lo que introduces en Avalon Tracker lo puedes corregir o borrar después.
Si no estás de acuerdo con estos términos, no uses el servicio.

4. Edad
Avalon Tracker no está dirigido a menores de 14 años. Para entrar con Discord tienes que cumplir, además, la edad mínima que Discord exige en tu país. Si eres menor de edad, úsalo con el permiso de tu padre, madre o tutor.

5. Cuentas
- Sin cuenta. La app móvil funciona sin cuenta: tus rutas se quedan en tu dispositivo y no nos llegan.
- Invitado. Es una cuenta anónima, sin nombre ni correo, ligada a tu navegador o a tu app. En la web, la sesión del navegador caduca tras 14 días sin actividad y, como no sabemos quién eres, no podemos devolverte el acceso. La cuenta de invitado se borra sola, con sus mapas, tras 30 días sin actividad. Puedes pasar sus mapas a una cuenta de Discord cuando quieras.
- Discord. Entras con tu cuenta de Discord; solo pedimos los permisos «identify» y «email». La seguridad de esa cuenta es cosa tuya y su uso se rige por las condiciones de Discord.
- App vinculada. Al vincular la app, el dispositivo recibe una clave propia. Puedes ver y revocar tus dispositivos desde tu perfil y desvincular el móvil cuando quieras; las rutas se quedan en él.
Puedes tener hasta 3 mapas personales. Puedes dejar el servicio y pedir el borrado de tu cuenta en cualquier momento, sin coste y sin dar explicaciones: la Política de privacidad explica cómo.

6. Mapas de clan
- Un mapa de clan va unido a un servidor de Discord. Solo puede crearlo quien sea propietario o administrador de ese servidor, o tenga permiso para gestionarlo, y haya instalado en él Vigil Bot, el bot de Crintech Studios que lee los roles del servidor.
- Dentro del clan hay cuatro niveles: Admin, Editor, Colaborador y Observador. El Admin los asigna a partir de los roles de Discord. Quien crea el clan es siempre Admin.
- El Admin decide qué permisos tiene cada miembro, configura el webhook de Discord, puede consultar el registro de acciones del clan (quién hizo qué) y puede borrar el clan con todo su contenido. Es responsable de a quién da acceso y del webhook que configura.
- Lo que aportas a un mapa de clan lo ven los demás miembros y se queda en el mapa aunque salgas del clan. Si borras tu cuenta, se queda sin tu nombre.
- Dentro de la aplicación no existe un administrador general: no tenemos ningún panel para entrar en los mapas de los clanes. Solo accedemos a los datos guardados cuando hace falta para atender una petición tuya, un aviso sobre contenido, una obligación legal o un problema de seguridad.

7. Envíos a Discord (webhooks)
- En la web, el Admin del clan puede configurar la dirección de un webhook de Discord; en la app, puedes configurar el tuyo en Ajustes. Solo se envía algo cuando alguien pulsa enviar: la ruta (zonas, tamaño y cierre de cada portal, estado), el nombre visible de quien la creó y, si se añaden, un texto de cabecera y una imagen de la ruta.
- Configura solo webhooks de canales que administres o para los que tengas permiso. La dirección de un webhook funciona como una contraseña: quien la conoce puede publicar en ese canal. En la web solo la ven los Admin del clan.
- Lo que se publica en Discord queda en Discord, bajo sus normas. Desde Avalon Tracker no se puede borrar.

8. Enlaces, códigos y QR
- Mapas personales. Puedes crear enlaces de «ver» o de «editar» (hasta 20 activos por mapa) y revocarlos cuando quieras. Quien tenga un enlace de ver puede ver el mapa sin cuenta; quien tenga uno de editar puede unirse y cambiarlo. Al revocar un enlace, quienes entraron por él pierden el acceso. Compártelos solo con quien quieras que entre.
- Rutas sueltas. Puedes pasar una ruta por enlace, código o QR. La ruta viaja dentro del propio enlace o código: quien lo reciba puede importarla y ya no se puede retirar.

9. Tu contenido
Tu contenido es lo que escribes en Avalon Tracker: nombres de mapas y clanes, rutas, portales, notas, partes de seguridad, textos de cabecera de los envíos a Discord, el nombre de tu dispositivo y los mensajes que mandas por el formulario de feedback.
- Sigue siendo tuyo. Nos das permiso, gratis y solo para hacer funcionar el servicio, para guardarlo, mostrarlo a quienes tú o el Admin de tu clan habéis dado acceso, sincronizarlo entre tus dispositivos y enviarlo a Discord cuando lo pidas.
- Ese permiso termina cuando borras el contenido o tu cuenta, con dos salvedades: lo borrado pasa 7 días en la papelera antes de eliminarse, y lo que aportaste a mapas de otros se queda en ellos sin tu nombre.
- Respondes de lo que escribes y de tener derecho a compartirlo.
- Los mensajes de feedback se registran como tiques en nuestro sistema de soporte, que funciona sobre Discord. Podemos usar tus sugerencias para mejorar Avalon Tracker sin deberte nada por ello.

10. Normas de uso
No está permitido:
- entrar o intentar entrar en mapas, clanes o cuentas ajenos sin permiso, ni probar enlaces o códigos al azar;
- hacerte pasar por otra persona o crear cuentas de forma automática o en masa;
- escribir datos de la vida real de otras personas (nombre real, domicilio, teléfono, fotos), amenazas, acoso o cualquier contenido ilegal. Las notas y los partes de seguridad son para información del juego: zonas, personajes y gremios;
- entorpecer el servicio: ataques, envíos masivos, saltarse los límites de frecuencia, código malicioso o usar los envíos a Discord o el formulario de feedback para hacer spam;
- extraer datos en masa por encima de los límites publicados. La API pública de zonas se puede usar libremente dentro de su límite (60 peticiones por minuto por dirección IP) y citando la fuente;
- presentar el servicio de avalontracker.app, su nombre o su logotipo como si fueran tuyos;
- usar Avalon Tracker de forma contraria a la ley o a las condiciones de Albion Online y de Discord que te obligan a ti.
Hay límites técnicos (número de mapas, de enlaces y de peticiones) que podemos ajustar para proteger el servicio.

11. Moderación, avisos y suspensión
- No revisamos de antemano lo que escriben los usuarios ni usamos sistemas automáticos para moderar contenido. Lo único automático son medidas técnicas: los límites de frecuencia, el borrado de invitados inactivos y el vaciado de la papelera.
- Dentro de cada clan modera su Admin.
- Cualquier persona puede avisarnos de contenido ilegal o contrario a estos términos escribiendo a avalon@crintech.pro con el asunto «Aviso de contenido». Indica qué contenido es y dónde está (enlace, nombre del mapa o del clan), por qué lo consideras ilegal, tu nombre y tu correo, y que haces el aviso de buena fe. Te confirmaremos que lo hemos recibido, lo revisará una persona y te diremos qué hemos decidido.
- Según la gravedad, podemos retirar el contenido, revocar enlaces o dispositivos, quitar un webhook, o suspender o eliminar una cuenta o un mapa. Salvo en casos graves o urgentes, avisaremos antes y daremos ocasión de corregirlo.
- Si tomamos una medida contra tu contenido o tu cuenta y tenemos un correo tuyo, te explicaremos por escrito qué medida es, por qué y cómo pedir que se revise. Con una cuenta de invitado no tenemos forma de avisarte.
- Si no estás de acuerdo, responde a ese mensaje o escribe a avalon@crintech.pro: lo revisará una persona y te contestaremos en un máximo de 15 días. También puedes acudir a los tribunales.
- Si conocemos indicios de un delito que amenace la vida o la seguridad de alguien, lo comunicaremos a las autoridades.

12. Disponibilidad y cambios en el servicio
- Avalon Tracker es un servicio gratuito mantenido por una sola persona. Puede haber cortes por mantenimiento, por averías o por fallos de los servicios de los que depende.
- Podemos añadir, cambiar o retirar funciones. Si vamos a cerrar el servicio o a retirar una función esencial, lo anunciaremos en la web con al menos 30 días de antelación, salvo que una causa ajena a nosotros lo impida (una obligación legal, un problema de seguridad o el cierre de un servicio de terceros). Durante ese plazo podrás pedir una copia de tus datos.
- Tú puedes dejar de usar Avalon Tracker cuando quieras.

13. Albion Online, datos del juego y otros terceros
- Avalon Tracker no está afiliado a Sandbox Interactive GmbH, que desarrolla y publica Albion Online, ni cuenta con su patrocinio o respaldo. Albion Online, Roads of Avalon, los nombres de zonas y el resto de datos y elementos del juego pertenecen a Sandbox Interactive GmbH.
- Los datos de zonas (recursos, cofres, criaturas, mazmorras) proceden de los volcados de datos del juego que mantiene la comunidad y se muestran como referencia para jugadores. Pueden cambiar con cada parche.
- Avalon Tracker no se conecta al juego, no lee ni modifica su cliente ni su tráfico de red, y no automatiza nada dentro de él: las rutas de tus mapas las escribes tú. Cumplir las condiciones de Albion Online como jugador es responsabilidad tuya.
- Los precios de mercado proceden del Albion Online Data Project, un proyecto de la comunidad, independiente de nosotros y de Sandbox Interactive. Se actualizan aproximadamente cada hora y se muestran con la fecha del dato.
- Discord es una marca de Discord Inc. Avalon Tracker usa Discord para entrar y para los envíos a canales, pero no está afiliado a Discord.
- Los enlaces a otros sitios llevan a servicios que no controlamos.

14. Código, nombre y logotipo
El código de la web de Avalon Tracker es libre: se publica con licencia MIT en https://github.com/Crinlorite/avalontracker y puedes montar tu propia copia. Esa licencia no cubre el servicio alojado en avalontracker.app ni te autoriza a presentar otro servicio con el nombre o el logotipo de Avalon Tracker o de Crintech Studios como si fuera este. Las apps móviles te las licenciamos gratis para uso personal en tus dispositivos.

15. Exactitud de los datos y responsabilidad
- Las cuentas atrás de los portales salen de lo que apuntan los usuarios: pueden estar equivocadas o desfasadas. Los avisos de la app dependen de tu móvil (permisos, ahorro de batería) y pueden llegar tarde o no llegar. Los precios son orientativos.
- Nada de lo que dicen estos términos recorta los derechos que la ley te reconoce como consumidor, ni nuestra responsabilidad cuando un daño se deba a dolo o negligencia grave por nuestra parte.
- Dicho esto, Avalon Tracker es un servicio gratuito que se ofrece tal como está y, en la medida en que la ley lo permite, no respondemos de:
  - cortes, errores o pérdida de datos por causas que no dependan de nosotros;
  - lo que escriban o hagan otros usuarios, incluido lo que ocurra con enlaces o webhooks que tú hayas compartido;
  - datos inexactos o desfasados de terceros;
  - lo que ganes o pierdas dentro del juego por decisiones tomadas con ayuda de Avalon Tracker;
  - los servicios de terceros de los que depende: Discord, Albion Online, las tiendas de aplicaciones y tu conexión.

16. Privacidad
Qué datos tratamos, para qué y cómo borrarlos está en la Política de privacidad y en la Política de cookies.

17. Cambios en estos términos
Podemos cambiar estos términos por motivos justificados: cambios en la ley o en las normas de las tiendas, funciones nuevas o retiradas, razones de seguridad o cambios en los servicios de terceros de los que dependemos.
- Los cambios importantes los anunciaremos de forma visible en avalontracker.app al menos 15 días antes de que se apliquen. Si no estás de acuerdo, puedes dejar de usar el servicio y pedir el borrado de tu cuenta; si sigues usándolo después de esa fecha, se aplica la versión nueva.
- Las correcciones menores (erratas, aclaraciones, datos de contacto) se publican directamente.
La fecha de la versión vigente aparece arriba.

18. Reclamaciones, ley aplicable y tribunales
- Reclamaciones. Escribe a avalon@crintech.pro o usa el correo postal o el teléfono del apartado 1. Te confirmaremos por escrito que la hemos recibido, con una referencia, y te responderemos lo antes posible y como máximo en 15 días. Si no quedas conforme, puedes acudir a los servicios de consumo de tu comunidad autónoma o de tu país, y a los tribunales.
- Ley aplicable. Estos términos se rigen por la ley española. Si eres consumidor y vives en otro país, conservas además la protección de las normas de tu país que la ley no permite excluir.
- Tribunales. Si eres consumidor, puedes reclamar ante los tribunales de tu domicilio, y nosotros solo podemos demandarte ante ellos. Si no actúas como consumidor, serán competentes los juzgados y tribunales que correspondan al domicilio del titular, en Navarra (España).

19. Contacto
avalon@crintech.pro es el punto de contacto único de Avalon Tracker, tanto para los usuarios como para las autoridades. Puedes escribirnos en español o en inglés y te contestará una persona.
`;

const EN = `TERMS OF SERVICE
Effective from: 2026-11-16
These terms are the agreement between you and the owner of Avalon Tracker. They cover the website https://avalontracker.app and the Avalon Tracker apps for Android and iOS.

1. Who provides the service
Avalon Tracker is provided by Cristobal Ruiz Lorite, a self-employed sole trader established in Spain, who publishes his apps under the name Crintech Studios.
- Address: Calle Lapurbide 12, 4.º izquierda, 31013 Ansoáin (Navarra), Spain
- Email: avalon@crintech.pro
- Phone: +34 623 05 14 56
- Tax ID and other identification details: see the Legal notice.
In this text, "we" means the owner and "you" means whoever uses Avalon Tracker.

2. What Avalon Tracker is
A free, fan-made tool for Albion Online players. It lets you record Roads of Avalon portal routes with their countdowns, share them with your guild, browse the 400 Avalon zones and check indicative market prices.
There are no purchases, subscriptions, paid accounts or ads, and we never ask for payment details.
It is not an official Albion Online product (section 13).

3. When you accept these terms
The public pages (zones, exits, prices) can be browsed without an account; if you only browse them, the rules of use in section 10 apply to you. You accept these terms in full when you do any of the following:
- press "Create my map" to open a guest map;
- sign in with Discord;
- link the mobile app to an account.
There are no further steps. We do not keep a separate contract for each person: the contract is this text, in the version in force while you use the service. You can save or print it from your browser and ask us for earlier versions. It is available in Spanish and English; the Spanish version is the original. Anything you enter in Avalon Tracker can be corrected or deleted afterwards.
If you do not agree with these terms, do not use the service.

4. Age
Avalon Tracker is not aimed at children under 14. To sign in with Discord you must also meet the minimum age Discord requires in your country. If you are a minor, use it with the permission of a parent or guardian.

5. Accounts
- No account. The mobile app works without an account: your routes stay on your device and never reach us.
- Guest. An anonymous account, with no name or email, tied to your browser or your app. On the website, the browser session expires after 14 days without activity and, since we do not know who you are, we cannot give you access back. The guest account deletes itself, with its maps, after 30 days without activity. You can move its maps to a Discord account at any time.
- Discord. You sign in with your Discord account; we only request the "identify" and "email" permissions. Keeping that account secure is up to you, and its use is governed by Discord's terms.
- Linked app. When you link the app, the device gets its own key. You can see and revoke your devices from your profile and unlink the phone at any time; your routes stay on it.
You can have up to 3 personal maps. You can stop using the service and ask for your account to be deleted at any time, free of charge and without giving a reason: the Privacy Policy explains how.

6. Clan maps
- A clan map is tied to a Discord server. It can only be created by someone who owns or administers that server, or has permission to manage it, and who has installed Vigil Bot there, the Crintech Studios bot that reads the server's roles.
- A clan has four levels: Admin, Editor, Contributor and Viewer. The Admin assigns them based on Discord roles. Whoever creates the clan is always an Admin.
- The Admin decides each member's permissions, sets up the Discord webhook, can view the clan's action log (who did what) and can delete the clan with all its content. The Admin is responsible for who is given access and for the webhook they set up.
- What you add to a clan map is visible to the other members and stays in the map even if you leave the clan. If you delete your account, it stays without your name.
- There is no general administrator inside the application: we have no panel for entering clan maps. We only access stored data when needed to handle a request from you, a notice about content, a legal obligation or a security problem.

7. Sending to Discord (webhooks)
- On the website, the clan Admin can set a Discord webhook address; in the app, you can set your own in Settings. Something is sent only when someone presses send: the route (zones, size and closing time of each portal, status), the display name of whoever created it and, if added, a header text and an image of the route.
- Only set up webhooks for channels you manage or have permission for. A webhook address works like a password: anyone who knows it can post in that channel. On the website only clan Admins can see it.
- What is posted on Discord stays on Discord, under its rules. It cannot be deleted from Avalon Tracker.

8. Links, codes and QR
- Personal maps. You can create "view" or "edit" links (up to 20 active per map) and revoke them at any time. Anyone with a view link can see the map without an account; anyone with an edit link can join and change it. When you revoke a link, those who came in through it lose access. Share them only with people you want to let in.
- Single routes. You can pass a route on as a link, a code or a QR. The route travels inside the link or code itself: whoever receives it can import it, and it can no longer be withdrawn.

9. Your content
Your content is what you write in Avalon Tracker: map and clan names, routes, portals, notes, security reports, header texts for Discord posts, your device name and the messages you send through the feedback form.
- It remains yours. You give us permission, free of charge and only to run the service, to store it, show it to the people you or your clan Admin have given access to, sync it across your devices and send it to Discord when you ask.
- That permission ends when you delete the content or your account, with two exceptions: deleted items spend 7 days in the trash before being removed, and what you added to other people's maps stays there without your name.
- You are responsible for what you write and for having the right to share it.
- Feedback messages are recorded as tickets in our support system, which runs on Discord. We may use your suggestions to improve Avalon Tracker without owing you anything for them.

10. Rules of use
You may not:
- enter or try to enter other people's maps, clans or accounts without permission, or try links or codes at random;
- pretend to be someone else or create accounts automatically or in bulk;
- write real-life details of other people (real name, address, phone, photos), threats, harassment or any illegal content. Notes and security reports are for game information: zones, characters and guilds;
- disrupt the service: attacks, bulk requests, getting around rate limits, malicious code, or using Discord posts or the feedback form for spam;
- extract data in bulk beyond the published limits. The public zones API may be used freely within its limit (60 requests per minute per IP address) and with credit to the source;
- present the avalontracker.app service, its name or its logo as your own;
- use Avalon Tracker in a way that breaks the law or the Albion Online and Discord terms that apply to you.
There are technical limits (number of maps, links and requests) that we may adjust to protect the service.

11. Moderation, notices and suspension
- We do not review what users write in advance and we do not use automated systems to moderate content. The only automated measures are technical: rate limits, deletion of inactive guest accounts and emptying of the trash.
- Inside each clan, its Admin moderates.
- Anyone can notify us of content that is illegal or against these terms by emailing avalon@crintech.pro with the subject "Content notice". Tell us what the content is and where it is (link, name of the map or clan), why you consider it illegal, your name and email, and that you are making the notice in good faith. We will confirm receipt, a person will review it and we will tell you what we decided.
- Depending on how serious it is, we may remove the content, revoke links or devices, remove a webhook, or suspend or delete an account or a map. Except in serious or urgent cases, we will warn first and give a chance to fix it.
- If we take action against your content or account and we have an email address for you, we will explain in writing what the action is, why, and how to ask for a review. With a guest account we have no way of contacting you.
- If you disagree, reply to that message or email avalon@crintech.pro: a person will review it and we will answer within 15 days at most. You can also go to court.
- If we become aware of signs of a crime threatening someone's life or safety, we will report it to the authorities.

12. Availability and changes to the service
- Avalon Tracker is a free service maintained by one person. There may be outages due to maintenance, faults or failures of the services it depends on.
- We may add, change or remove features. If we are going to close the service or remove an essential feature, we will announce it on the website at least 30 days in advance, unless something outside our control prevents it (a legal obligation, a security problem or the closure of a third-party service). During that period you can ask for a copy of your data.
- You can stop using Avalon Tracker whenever you like.

13. Albion Online, game data and other third parties
- Avalon Tracker is not affiliated with, sponsored by or endorsed by Sandbox Interactive GmbH, which develops and publishes Albion Online. Albion Online, Roads of Avalon, zone names and all other game data and elements belong to Sandbox Interactive GmbH.
- Zone data (resources, chests, creatures, dungeons) comes from the game data dumps maintained by the community and is shown as a reference for players. It may change with every patch.
- Avalon Tracker does not connect to the game, does not read or modify its client or its network traffic, and does not automate anything inside it: you write the routes in your maps yourself. Complying with the Albion Online terms as a player is your responsibility.
- Market prices come from the Albion Online Data Project, a community project independent of us and of Sandbox Interactive. They are refreshed roughly every hour and shown with the date of the data.
- Discord is a trademark of Discord Inc. Avalon Tracker uses Discord for sign-in and for posting to channels, but is not affiliated with Discord.
- Links to other sites lead to services we do not control.

14. Code, name and logo
The code of the Avalon Tracker website is free software: it is published under the MIT licence at https://github.com/Crinlorite/avalontracker and you can run your own copy. That licence does not cover the service hosted at avalontracker.app, and it does not allow you to present another service under the name or logo of Avalon Tracker or Crintech Studios as if it were this one. The mobile apps are licensed to you free of charge for personal use on your devices.

15. Accuracy of data and liability
- Portal countdowns come from what users record: they may be wrong or out of date. App reminders depend on your phone (permissions, battery saving) and may arrive late or not at all. Prices are indicative.
- Nothing in these terms reduces the rights the law gives you as a consumer, or our liability where damage is caused by our wilful misconduct or gross negligence.
- That said, Avalon Tracker is a free service provided as it is and, to the extent the law allows, we are not liable for:
  - outages, errors or loss of data due to causes outside our control;
  - what other users write or do, including what happens with links or webhooks you have shared;
  - inaccurate or out-of-date third-party data;
  - what you gain or lose in the game through decisions made with the help of Avalon Tracker;
  - the third-party services it depends on: Discord, Albion Online, the app stores and your connection.

16. Privacy
What data we process, why, and how to delete it is set out in the Privacy Policy and the Cookie Policy.

17. Changes to these terms
We may change these terms for justified reasons: changes in the law or in app store rules, new or removed features, security reasons, or changes in the third-party services we depend on.
- We will announce important changes visibly on avalontracker.app at least 15 days before they apply. If you disagree, you can stop using the service and ask for your account to be deleted; if you keep using it after that date, the new version applies.
- Minor corrections (typos, clarifications, contact details) are published directly.
The date of the version in force is shown at the top.

18. Complaints, governing law and courts
- Complaints. Email avalon@crintech.pro, or use the postal address or phone number in section 1. We will confirm receipt in writing, with a reference, and answer as soon as possible and within 15 days at most. If you are not satisfied, you can turn to the consumer authorities of your region or country, and to the courts.
- Governing law. These terms are governed by Spanish law. If you are a consumer living in another country, you also keep the protection of the rules of your country that the law does not allow to be excluded.
- Courts. If you are a consumer, you can bring a claim before the courts of your place of residence, and we can only sue you there. If you are not acting as a consumer, the competent courts are those of the owner's place of residence, in Navarra (Spain).

19. Contact
avalon@crintech.pro is Avalon Tracker's single point of contact, for users and for authorities alike. You can write to us in Spanish or English and a person will answer.
`;

export const TERMS = { es: ES, en: EN } as const;
