"use client";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS, parseTerms, splitLinks, type TermsBlock } from "@/lib/legal-terms";

// Términos del servicio (web y apps). Como el resto de páginas legales: castellano solo con
// «es»; cualquier otro idioma ve la versión inglesa.
export default function TermsPage() {
  const { lang } = useLanguage();
  const doc = parseTerms(TERMS[lang === "es" ? "es" : "en"]);
  const title = lang === "es" ? "Términos del servicio" : "Terms of Service";
  return (
    <LegalPage title={title} updated={doc.effective}>
      <Blocks blocks={doc.intro} />
      {doc.sections.map((s) => (
        <section key={s.n}>
          <h2>
            {s.n}. {s.title}
          </h2>
          <Blocks blocks={s.blocks} />
        </section>
      ))}
    </LegalPage>
  );
}

function Blocks({ blocks }: { blocks: TermsBlock[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i} className="mt-3">
            <Linked text={b.text} />
          </p>
        ) : (
          <ul key={i} className="mt-3">
            {b.items.map((it, j) => (
              <li key={j}>
                <Linked text={it.text} />
                {it.sub && (
                  <ul className="mt-1">
                    {it.sub.map((x, k) => (
                      <li key={k}>
                        <Linked text={x} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

function Linked({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) =>
        typeof p === "string" ? (
          p
        ) : (
          <a key={i} href={p.href} rel={p.href.startsWith("http") ? "noopener noreferrer" : undefined}>
            {p.label}
          </a>
        ),
      )}
    </>
  );
}
