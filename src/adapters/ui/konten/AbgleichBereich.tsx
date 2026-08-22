// Der Kontoabgleich — je Konto: was wir rechnen, was gemeldet wurde, und wo es auseinandergeht.
//
// Bis hierher stand die Frage als PILLE in der Kontenübersicht: eine Zahl am Rand, die
// sagt „hier fehlen 600 Euro", ohne zu sagen wo. Das ist die Auskunft, die am wenigsten
// hilft — sie beunruhigt und zeigt nicht hin. Der Auszug beantwortet „was ist passiert",
// diese Frage hier ist eine andere: „stimmt der Stand überhaupt". Man stellt sie nicht
// täglich, sondern wenn etwas nicht aufgeht, und dann will man alles nebeneinander.
//
// Konten OHNE Bank stehen gleichberechtigt drin. Ihre Meldungen kommen aus dem
// Kassensturz statt aus dem Abruf, und die Frage ist dort dieselbe; nur die Antwort kommt
// von Hand. Ein Abgleich, der an den Bankzugängen hinge, würde sie aussperren.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Abgleichzeile } from "../../../application";
import { abgleich as abgleichLaden } from "../../dienste";
import { Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { AbgleichModal, KassensturzModal } from "./KontostandModal";

/**
 * „2026-08-22" → „22.08.2026" — MIT Jahr.
 *
 * Anders als im Register, wo die Kurzform genügt: hier stehen Stichtage nebeneinander,
 * die Jahre auseinanderliegen können, und ein Fenster „vom 31.12. bis zum 02.01." wäre
 * ohne Jahr nicht zu lesen.
 */
function datumLang(iso: string): string {
  const [j, m, d] = iso.split("-");
  return `${d}.${m}.${j}`;
}

export function AbgleichBereich() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [zeilen, setZeilen] = useState<readonly Abgleichzeile[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [abgleichFuer, setAbgleichFuer] = useState<Abgleichzeile | null>(null);
  const [kassensturzFuer, setKassensturzFuer] = useState<Abgleichzeile | null>(null);

  async function laden() {
    setZeilen(await abgleichLaden());
  }
  useEffect(() => {
    laden().catch(() => {
      /* reiner Browser-Modus ohne SQLite */
    });
  }, []);

  // Konten mit Abweichung zuerst: wer hier hereinschaut, sucht ein Problem, und die
  // stimmenden Konten sind dann die Bestätigung darunter statt der Weg dorthin.
  const sortiert = useMemo(
    () =>
      [...zeilen].sort((a, b) => {
        const gewicht = (z: Abgleichzeile) => (z.abweichung == null ? 1 : z.abweichung === 0 ? 2 : 0);
        return gewicht(a) - gewicht(b) || a.konto.bezeichnung.localeCompare(b.konto.bezeichnung);
      }),
    [zeilen],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      {sortiert.map((z) => {
        const aufgeklappt = offen === z.konto.id;
        return (
          <div
            key={z.konto.id}
            style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "var(--sp-3)" }}
          >
            {/* Die Kopfzeile beantwortet die Frage schon: stimmt es, und wenn nicht, um
                wieviel. Alles Weitere ist die Begründung darunter. */}
            <button
              type="button"
              onClick={() => setOffen(aufgeklappt ? null : z.konto.id)}
              style={{
                width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer",
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                gap: "var(--sp-3)", flexWrap: "wrap", textAlign: "left",
              }}
            >
              <span style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <span style={{ fontWeight: "var(--fw-bold)" }}>{z.konto.bezeichnung}</span>
                {z.abweichung == null ? (
                  <Pill variant="neutral">{t("konten.abgleichBereich.ohneMeldung")}</Pill>
                ) : z.abweichung === 0 ? (
                  <Pill variant="ok">{t("konten.abgleich.stimmt")}</Pill>
                ) : (
                  <Pill variant="warn">
                    {t("konten.abgleich.differenz", {
                      betrag: geld.formatMitSymbol(z.abweichung, { mitVorzeichen: true }),
                    })}
                  </Pill>
                )}
                {!z.online && <Pill variant="neutral">{t("konten.abgleichBereich.ohneBank")}</Pill>}
              </span>
              <span className="num" style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(z.gerechnet) }}>
                {geld.formatMitSymbol(z.gerechnet)}
              </span>
            </button>

            {z.juengster && (
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>
                {t(z.juengster.herkunft === "bank" ? "konten.abgleich.bankSagt" : "konten.anker.gezaehlt", {
                  betrag: geld.formatMitSymbol(z.juengster.betrag),
                  datum: datumLang(z.juengster.datum),
                })}
              </div>
            )}

            {aufgeklappt && (
              <div style={{ marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line-soft)" }}>
                {/* Die Reihe der Stichtage. Sie ist der eigentliche Inhalt: eine
                    Gesamtdifferenz sagt „irgendwo", die Reihe sagt „ab hier". */}
                {z.punkte.length > 0 ? (
                  <table style={{ width: "100%", fontSize: "var(--fs-sm)", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--ink-3)", fontSize: "var(--fs-2xs)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}>
                        <th style={{ textAlign: "left", padding: "4px 0" }}>{t("konten.abgleichBereich.stichtag")}</th>
                        <th style={{ textAlign: "right" }}>{t("konten.abgleichBereich.gemeldet")}</th>
                        <th style={{ textAlign: "right" }}>{t("konten.abgleichBereich.gerechnet")}</th>
                        <th style={{ textAlign: "right" }}>{t("konten.abgleichBereich.differenz")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...z.punkte].reverse().map((p) => (
                        <tr key={`${p.anker.datum}-${p.anker.herkunft}`}>
                          <td style={{ padding: "3px 0" }}>
                            {datumLang(p.anker.datum)}{" "}
                            <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>
                              {t(p.anker.herkunft === "bank" ? "konten.abgleichBereich.vonBank" : "konten.abgleichBereich.gezaehlt")}
                            </span>
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>{geld.format(p.anker.betrag)}</td>
                          <td className="num" style={{ textAlign: "right" }}>{geld.format(p.gerechnet)}</td>
                          <td className="num" style={{ textAlign: "right", fontWeight: p.abweichung === 0 ? "normal" : "var(--fw-bold)", color: p.abweichung === 0 ? "var(--ink-3)" : "var(--warn-deep)" }}>
                            {p.abweichung === 0 ? "—" : geld.format(p.abweichung, { mitVorzeichen: true })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                    {t("konten.abgleichBereich.keineStichtage")}
                  </div>
                )}

                {/* Die Fenster schlagen die Gesamtdifferenz: sie zeigen auf einen
                    Zeitraum statt auf die ganze Historie. */}
                {z.fenster.length > 0 && (
                  <div style={{ marginTop: "var(--sp-3)", fontSize: "var(--fs-xs)" }}>
                    <div style={{ color: "var(--ink-3)", fontSize: "var(--fs-2xs)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", marginBottom: 4 }}>
                      {t("konten.abgleichBereich.fensterTitel")}
                    </div>
                    {[...z.fenster].reverse().map((f) => (
                      <div key={`${f.von}-${f.bis}`} className="muted">
                        {t("konten.anker.luecke", {
                          betrag: geld.formatMitSymbol(f.betrag, { mitVorzeichen: true }),
                          von: datumLang(f.von),
                          bis: datumLang(f.bis),
                        })}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: "var(--sp-3)", marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
                  {/* Der Anfangsbestand ist die einzige Schraube, an der sich hier drehen
                      lässt — und sie schiebt die Differenz in die Vergangenheit. Richtig
                      nur, wenn sie von dort stammt, deshalb auf Zuruf statt automatisch. */}
                  {z.anfangsbestandVorschlag != null && (
                    <button className="linkbtn" style={{ padding: 0 }} onClick={() => setAbgleichFuer(z)}>
                      {t("konten.anker.abgleichen")}
                    </button>
                  )}
                  {!z.online && (
                    <button className="linkbtn" style={{ padding: 0 }} onClick={() => setKassensturzFuer(z)}>
                      {t("konten.anker.festhalten")}
                    </button>
                  )}
                </div>

                <div className="muted" style={{ fontSize: "var(--fs-2xs)", marginTop: "var(--sp-2)" }}>
                  {t("konten.abgleichBereich.zusammensetzung", {
                    anfang: geld.formatMitSymbol(z.anfangsbestand),
                    bewegungen: geld.formatMitSymbol(z.bewegungen, { mitVorzeichen: true }),
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {abgleichFuer?.anfangsbestandVorschlag != null && (
        <AbgleichModal
          konto={abgleichFuer.konto}
          vorschlag={abgleichFuer.anfangsbestandVorschlag}
          offeneFenster={abgleichFuer.fenster.length}
          onClose={() => setAbgleichFuer(null)}
          onFertig={async () => { setAbgleichFuer(null); await laden(); }}
        />
      )}
      {kassensturzFuer && (
        <KassensturzModal
          kontoId={kassensturzFuer.konto.id}
          bezeichnung={kassensturzFuer.konto.bezeichnung}
          heute={new Date().toISOString().slice(0, 10)}
          onClose={() => setKassensturzFuer(null)}
          onGespeichert={async () => { setKassensturzFuer(null); await laden(); }}
        />
      )}
    </div>
  );
}
