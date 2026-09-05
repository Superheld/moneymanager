// Was eine Bank kann — aus ihren eigenen Angaben.
//
// Bis 2026-08-20 holten wir aus den Bankparametern genau einen Wert (den
// Speicherzeitraum), zeigten ihn in einer Zeile und warfen den Rest weg. Alles andere —
// welche Formate die Bank kennt, welche Vorgänge sie überhaupt anbietet, welche
// TAN-Verfahren es gibt — stand in jedem Dialog mit drin und war nach dem Abmelden weg.
//
// Diese Karte ist der Ort, an dem es bleibt. Sie beantwortet ohne Anmeldung die Fragen,
// für die man sich bisher einloggen musste: „warum holt der Abruf nur 30 Tage", „warum
// fällt er auf MT940 zurück", „kann diese Bank überhaupt Depots".

import { useTranslation } from "react-i18next";
import type { Bankkonto, Bankprofil, Bankzugang, Vorfallprofil } from "../../../application";
import { Button, Card, DataTable, Pill } from "../bausteine";

interface Props {
  zugang: Bankzugang;
  profil: Bankprofil;
  /** Gewähltes TAN-Verfahren übernehmen. Fehlt es, wird nur angezeigt. */
  onTanVerfahren?: (id: number) => void;
  gespeichert?: boolean;
  /**
   * Die Konten dieser Anmeldung, für die Namen in der Aufstellung je Konto. Fehlen sie
   * (die Karte steht auch ohne frische Anmeldung), bleibt der Schlüssel stehen — die
   * Auskunft ist dann sperriger, aber sie fehlt nicht.
   */
  konten?: readonly Bankkonto[];
}

/** Was ein Vorfall an Zusatzmerkmalen mitbringt — nur, was die Bank wirklich gesagt hat. */
function merkmale(v: Vorfallprofil, t: (k: string, o?: Record<string, unknown>) => string): string[] {
  const raus: string[] = [];
  if (v.alleKontenAmStueck) raus.push(t("bankabruf.profilAlleKonten"));
  if (v.anzahlBegrenzbar) raus.push(t("bankabruf.profilAnzahlBegrenzbar"));
  if (v.waehrungWaehlbar) raus.push(t("bankabruf.profilWaehrungWaehlbar"));
  if (v.kursqualitaetWaehlbar) raus.push(t("bankabruf.profilKursqualitaet"));
  if (v.formate && v.formate.length > 0) {
    // Die CAMT-Kennungen sind lang und alle gleich lang; der letzte Abschnitt trägt die
    // Fassung und ist das Einzige, was einen Unterschied macht.
    raus.push(t("bankabruf.profilFormate", { formate: v.formate.map(kurzform).join(", ") }));
  }
  return raus;
}

/** `urn:iso:std:iso:20022:tech:xsd:camt.052.001.08` → `camt.052.001.08`. */
function kurzform(format: string): string {
  const teile = format.split(":");
  return teile[teile.length - 1] || format;
}

export function Bankprofilkarte({ zugang, profil, onTanVerfahren, gespeichert, konten }: Props) {
  const { t } = useTranslation();

  const spalten = [
    {
      key: "segment",
      label: t("bankabruf.profilSpalteVorfall"),
      render: (v: Vorfallprofil) => {
        // Die Segmentkürzel sind Protokollvokabular. Wer sie nicht kennt, liest „HKCAZ"
        // als Fehlermeldung — deshalb der Klartext vorn und das Kürzel als Beleg dahinter.
        const name = t(`bankabruf.vorfall.${v.segment}`, { defaultValue: v.segment });
        return (
          <span>
            {name} <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{v.segment}</span>
          </span>
        );
      },
    },
    {
      key: "zeitraum",
      label: t("bankabruf.profilSpalteZeitraum"),
      render: (v: Vorfallprofil) =>
        v.speicherzeitraumTage
          ? t("bankabruf.profilTage", { tage: v.speicherzeitraumTage })
          : <span className="muted">{t("bankabruf.profilKeinZeitraum")}</span>,
    },
    {
      key: "merkmale",
      label: t("bankabruf.profilSpalteMerkmale"),
      sortable: false,
      render: (v: Vorfallprofil) => {
        const liste = merkmale(v, t);
        return liste.length > 0 ? (
          <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{liste.join(" · ")}</span>
        ) : (
          "—"
        );
      },
    },
  ];

  return (
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      title={t("bankabruf.profilTitel")}
      subtitle={t("bankabruf.profilHinweis", { stand: profil.standAm })}
    >
      {/* Eine leere Tabelle unter der Ueberschrift "was diese Bank kann" liest sich wie
          "sie kann nichts". Vorfaelle sind FinTS-Segmente; wer nicht am Verfahren
          teilnimmt, meldet keine — das ist keine fehlende Faehigkeit, sondern eine
          andere Sprache. */}
      {profil.vorfaelle.length === 0 ? (
        <div className="muted">{t("bankabruf.profilOhneVorfaelle")}</div>
      ) : (
        <DataTable columns={spalten} rows={[...profil.vorfaelle]} />
      )}

      {/* WAS DIE BANK JE KONTO FREIGIBT.
          Die Tabelle darüber beantwortet „was kann diese Bank", und das ist eine andere
          Frage als „was kann dieses Konto": ein Institut kann `HKWPD` beherrschen und es
          nur für das Depot freigeben, `HKSAL` nur für einen Teil seiner Konten. Genau an
          dieser Grenze entstehen die Widersprüche, die sonst niemand auflösen kann — ein
          Depot, das laut Bank abrufbar ist und in der Kontenliste als nicht abrufbar
          steht. Erhoben wurde diese Liste von Anfang an; sie stand nur nirgends. */}
      {Object.keys(profil.kontoVorfaelle).length > 0 && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <div className="nlbl">{t("bankabruf.profilJeKonto")}</div>
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-2)" }}>
            {t("bankabruf.profilJeKontoHinweis")}
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {Object.entries(profil.kontoVorfaelle).map(([schluessel, segmente]) => (
              <li key={schluessel} style={{ padding: "var(--sp-1) 0" }}>
                <div>{konten?.find((k) => k.schluessel === schluessel)?.bezeichnung ?? schluessel}</div>
                <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {segmente.length > 0
                    ? [...segmente].sort().join(" · ")
                    : t("bankabruf.profilKontoOhneVorfaelle")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profil.nationaleFelderErlaubt === false && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {t("bankabruf.profilNationaleFelder")}
        </div>
      )}

      {profil.tanVerfahren.length > 0 && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <div className="nlbl">{t("bankabruf.profilTanVerfahren")}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {profil.tanVerfahren.map((v) => {
              const aktiv = zugang.tanVerfahrenId === v.id;
              return (
                <li
                  key={v.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-2)",
                    padding: "var(--sp-1) 0",
                    flexWrap: "wrap",
                  }}
                >
                  <span>{v.name}</span>
                  {aktiv && <Pill variant="ok">{t("bankabruf.profilTanAktiv")}</Pill>}
                  {v.decoupled && <Pill>{t("bankabruf.profilTanDecoupled")}</Pill>}
                  {v.mediumPflicht && <Pill>{t("bankabruf.profilTanMedium")}</Pill>}
                  {v.medien.length > 0 && (
                    <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{v.medien.join(", ")}</span>
                  )}
                  {!aktiv && onTanVerfahren && (
                    <Button onClick={() => onTanVerfahren(v.id)}>{t("bankabruf.profilTanWaehlen")}</Button>
                  )}
                </li>
              );
            })}
          </ul>
          {gespeichert && (
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)" }}>
              {t("bankabruf.profilTanGespeichert")}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
