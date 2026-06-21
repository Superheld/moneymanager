// Import-Vorschau (Slice 1.5) — read-only. Datei wählen → Auto-Erkennung des Quellen-
// Adapters → geparste RohUmsätze in einer Tabelle, plus Hinweise. Schreibt NICHTS in die
// Datenbank; der „Importieren"-Button folgt mit der Persistenz (Slice 2). Alle Strings
// über t(), alles Geld über useGeld() (ADR-0004).

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { waehleAdapter, type ImportErgebnis } from "../../application/import";
// Selbst-Registrierung des Finanzguru-Adapters auslösen.
import "../import/finanzguruAdapter";
import { Button, Card, DataTable } from "./ds";
import { PageHead } from "./PageHead";
import { useGeld } from "./EinstellungenProvider";

const VORSCHAU_MAX = 500;

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function ImportScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const [dateiname, setDateiname] = useState<string | null>(null);
  const [nichtErkannt, setNichtErkannt] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setDateiname(datei.name);
    const inhalt = await datei.text();
    const adapter = waehleAdapter(inhalt);
    if (!adapter) {
      setErgebnis(null);
      setNichtErkannt(true);
      return;
    }
    setNichtErkannt(false);
    setErgebnis(adapter.lies(inhalt));
    // gleiche Datei erneut wählbar machen
    if (inputRef.current) inputRef.current.value = "";
  }

  const konten = ergebnis ? new Set(ergebnis.umsaetze.map((u) => u.kontoIban)).size : 0;
  const vorschau = ergebnis ? ergebnis.umsaetze.slice(0, VORSCHAU_MAX) : [];

  return (
    <>
      <PageHead title={t("import.titel")} subtitle={t("import.untertitel")} />

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={dateiGewaehlt}
            style={{ display: "none" }}
          />
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            {t("import.dateiWaehlen")}
          </Button>
          {dateiname && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{dateiname}</span>}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-3)" }}>
          {t("import.hinweis")}
        </div>
      </Card>

      {nichtErkannt && (
        <Card style={{ marginTop: "var(--sp-4)", borderColor: "var(--warn, #d9822b)" }}>
          {t("import.nichtErkannt")}
        </Card>
      )}

      {ergebnis && (
        <>
          <Card
            style={{ marginTop: "var(--sp-4)" }}
            title={t("import.erkannt", { n: ergebnis.umsaetze.length, quelle: ergebnis.quelle, konten })}
          >
            {ergebnis.warnungen.length > 0 && (
              <ul style={{ margin: "0 0 var(--sp-3)", paddingLeft: "1.2em", color: "var(--ink-2)", fontSize: "var(--fs-xs)" }}>
                {ergebnis.warnungen.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <DataTable
              columns={[
                { key: "buchungstag", label: t("import.spalteDatum"), render: (u: ImportErgebnis["umsaetze"][number]) => ddmmyyyy(u.buchungstag) },
                { key: "betrag", label: `${t("import.spalteBetrag")} ${geld.symbol}`, align: "right", render: (u: ImportErgebnis["umsaetze"][number]) => geld.format(u.betrag, { mitVorzeichen: true }) },
                { key: "gegenpartei", label: t("import.spalteGegenpartei") },
                { key: "verwendungszweck", label: t("import.spalteZweck"), render: (u: ImportErgebnis["umsaetze"][number]) => (u.verwendungszweck.length > 60 ? u.verwendungszweck.slice(0, 60) + "…" : u.verwendungszweck) },
                { key: "kategorieHinweis", label: t("import.spalteKategorie"), render: (u: ImportErgebnis["umsaetze"][number]) => u.kategorieHinweis ?? "—" },
              ]}
              rows={vorschau}
            />

            {ergebnis.umsaetze.length > VORSCHAU_MAX && (
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-3)" }}>
                {t("import.zeigeAuszug", { zeige: VORSCHAU_MAX, gesamt: ergebnis.umsaetze.length })}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginTop: "var(--sp-4)" }}>
              <Button variant="default" style={{ opacity: 0.5, cursor: "not-allowed" }}>
                {t("import.importierenDeaktiviert")}
              </Button>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("import.importierenHinweis")}</span>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
