// Woher die Zeilen eines Kontos kommen — die Rohdaten hinter den Buchungen.
//
// Der Auszug zeigt, was IM KONTO steht. Hier steht, was HEREINKAM: jede eingelesene Zeile
// mit ihrem Lauf und ihrem Schicksal, auch die weggelegten. Sie liegen alle in der
// Datenbank, waren aber nirgends je Konto sichtbar — die Import-Inbox zeigt nur
// Weggelegtes aus Dateien, und die Abruf-Historie sah man nur einmal, im Dialog direkt
// nach dem Abruf.
//
// **Die Läufe ohne Wirkung stehen zusammengefasst.** Der Rückgriff holt bei jedem Abruf
// einige Tage doppelt, damit nachgetragene Buchungen nicht verlorengehen; die Mehrzahl
// aller Läufe bringt deshalb nichts Neues. Eine Liste, die jeden Lauf gleich gross zeigt,
// besteht überwiegend aus Rauschen, und die wenigen mit Wirkung gehen darin unter.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Kontoherkunft } from "../../../application";
import { zurueckholen, type Umsatz } from "../../../application/import";
import { herkunft as herkunftLaden, umsatzSpeichern } from "../../dienste";
import { Pill } from "../bausteine";
import { DataTable } from "../bausteine/DataTable";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

type Statusfilter = "alle" | "verbucht" | "weggelegt" | "offen";

function datumKurz(iso: string): string {
  const [j, m, d] = iso.split("-");
  return `${d}.${m}.${j.slice(2)}`;
}

export function HerkunftBereich() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [konten, setKonten] = useState<readonly Kontoherkunft[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string>("");
  const [filter, setFilter] = useState<Statusfilter>("alle");
  const [laeufeOffen, setLaeufeOffen] = useState(false);

  async function laden() {
    const daten = await herkunftLaden();
    setKonten(daten);
    setGewaehlt((id) => id || daten.find((k) => k.zeilen.length > 0)?.konto.id || daten[0]?.konto.id || "");
  }
  useEffect(() => {
    laden().catch(() => {
      /* reiner Browser-Modus ohne SQLite */
    });
  }, []);

  const aktiv = konten.find((k) => k.konto.id === gewaehlt);

  const gefiltert = useMemo(() => {
    const zeilen = aktiv?.zeilen ?? [];
    if (filter === "alle") return zeilen;
    return zeilen.filter((z) => {
      if (filter === "verbucht") return z.umsatz.status === "verbucht";
      if (filter === "offen") return z.umsatz.status === "neu";
      return z.umsatz.status === "verworfen" || z.umsatz.status === "duplikat";
    });
  }, [aktiv, filter]);

  // Läufe mit Wirkung nach vorn. „Ohne Wirkung" heisst: für DIESES Konto kam nichts an —
  // der Lauf hat geholt und alles als bekannt verworfen.
  const { mitWirkung, ohneWirkung } = useMemo(() => {
    const alle = aktiv?.laeufe ?? [];
    return {
      mitWirkung: alle.filter((l) => l.verbucht > 0 || l.offen > 0),
      ohneWirkung: alle.filter((l) => l.verbucht === 0 && l.offen === 0),
    };
  }, [aktiv]);

  async function zurueck(umsatz: Umsatz) {
    await umsatzSpeichern(zurueckholen(umsatz));
    await laden();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
      {/* Kontowahl. Konten ohne eingelesene Zeilen bleiben wählbar — dass nichts da ist,
          ist selbst eine Auskunft. */}
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        {konten.map((k) => (
          <button
            key={k.konto.id}
            type="button"
            onClick={() => setGewaehlt(k.konto.id)}
            className="linkbtn"
            style={{
              padding: "4px 10px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--line)",
              fontWeight: k.konto.id === gewaehlt ? "var(--fw-bold)" : "normal",
              background: k.konto.id === gewaehlt ? "var(--accent-wash)" : "transparent",
            }}
          >
            {k.konto.bezeichnung}{" "}
            <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>{k.zeilen.length}</span>
          </button>
        ))}
      </div>

      {aktiv && (
        <>
          {/* Die Läufe: wann wurde für dieses Konto etwas eingelesen, und was kam an. */}
          <div>
            <div style={{ color: "var(--ink-3)", fontSize: "var(--fs-2xs)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", marginBottom: "var(--sp-2)" }}>
              {t("konten.herkunft.laeufeTitel")}
            </div>
            {mitWirkung.length === 0 && ohneWirkung.length === 0 ? (
              <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.herkunft.keineLaeufe")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--fs-sm)" }}>
                {mitWirkung.map((l) => (
                  <div key={l.lauf.id} style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", alignItems: "baseline" }}>
                    <span style={{ minWidth: "9rem" }}>{l.lauf.zeitpunkt.slice(0, 10).split("-").reverse().join(".")}</span>
                    <Pill variant="neutral">{l.lauf.quelle}</Pill>
                    <span className="muted">
                      {t("konten.herkunft.laufZeile", { zeilen: l.zeilen, verbucht: l.verbucht, weggelegt: l.weggelegt })}
                    </span>
                  </div>
                ))}
                {ohneWirkung.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <button className="linkbtn" style={{ padding: 0, fontSize: "var(--fs-xs)" }} onClick={() => setLaeufeOffen((x) => !x)}>
                      {t("konten.herkunft.ohneWirkung", { n: ohneWirkung.length })}
                    </button>
                    {laeufeOffen && (
                      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                        {ohneWirkung.map((l) => (
                          <div key={l.lauf.id} className="muted" style={{ fontSize: "var(--fs-xs)", display: "flex", gap: "var(--sp-3)" }}>
                            <span style={{ minWidth: "9rem" }}>{l.lauf.zeitpunkt.slice(0, 10).split("-").reverse().join(".")}</span>
                            <span>{t("konten.herkunft.laufZeile", { zeilen: l.zeilen, verbucht: l.verbucht, weggelegt: l.weggelegt })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Die Rohzeilen. Der Filter ist der Punkt: weggelegte Zeilen waren bisher
              nirgends je Konto zu sehen. */}
          <div>
            <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-2)", flexWrap: "wrap" }}>
              {(["alle", "verbucht", "weggelegt", "offen"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="linkbtn"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "3px 9px",
                    borderRadius: "var(--r-sm)",
                    border: "1px solid var(--line)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: filter === f ? "var(--fw-bold)" : "normal",
                    background: filter === f ? "var(--accent-wash)" : "transparent",
                  }}
                >
                  {t(`konten.herkunft.filter.${f}`)}
                </button>
              ))}
            </div>

            {gefiltert.length === 0 ? (
              <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.herkunft.keineZeilen")}</div>
            ) : (
              <DataTable
                columns={[
                  { key: "datum", label: t("konten.spalteDatum"), render: (z) => datumKurz(z.umsatz.buchungstag) },
                  {
                    key: "bez", label: t("konten.spalteBeschreibung"), maxWidth: 280,
                    render: (z) => z.umsatz.gegenpartei || z.umsatz.verwendungszweck || "—",
                  },
                  {
                    key: "betrag", label: `${t("konten.spalteBetrag")} ${geld.symbol}`, align: "right",
                    sortValue: (z) => z.umsatz.betrag,
                    render: (z) => (
                      <span className="num" style={{ fontWeight: 700, color: geldFarbe(z.umsatz.betrag) }}>
                        {geld.format(z.umsatz.betrag, { mitVorzeichen: true })}
                      </span>
                    ),
                  },
                  {
                    key: "status", label: t("konten.herkunft.spalteStatus"),
                    render: (z) => (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <Pill variant={z.umsatz.status === "verbucht" ? "ok" : z.umsatz.status === "neu" ? "warn" : "neutral"}>
                          {t(`konten.herkunft.status.${z.umsatz.status}`)}
                        </Pill>
                        {/* Der Widerspruch, den man sonst nie sieht: der Umsatz sagt
                            „verbucht", die Buchung dazu gibt es nicht mehr. */}
                        {z.umsatz.status === "verbucht" && !z.gebucht && (
                          <Pill variant="warn">{t("konten.herkunft.buchungFehlt")}</Pill>
                        )}
                      </span>
                    ),
                  },
                  { key: "quelle", label: t("konten.detail.herkunft"), render: (z) => z.lauf?.quelle ?? "—" },
                  {
                    key: "_a", label: "", align: "right", sortable: false,
                    render: (z) =>
                      z.umsatz.status === "verworfen" || z.umsatz.status === "duplikat" ? (
                        <button className="linkbtn" style={{ padding: 0, fontSize: "var(--fs-xs)" }} onClick={() => void zurueck(z.umsatz)}>
                          {t("konten.herkunft.zurueckholen")}
                        </button>
                      ) : null,
                  },
                ]}
                rows={[...gefiltert]}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
