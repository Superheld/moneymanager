// Register „Planrechnung" — der Plan der nächsten zwölf Monate ab dem laufenden.
//
// Die Frage dahinter: reichen die Einnahmen für alles, was geplant ist, was bleibt dabei
// übrig, und reicht es für das, was zurückgelegt werden soll? Dafür steht oben die Summe
// über die zwölf Monate mit den Stufen der Ergebnisrechnung, darunter derselbe Plan Monat
// für Monat.
//
// Verträge stehen hier ANTEILIG — ein Quartalsbeitrag mit einem Drittel in jedem Monat.
// Das ist die Rechnung, die die Monatskarten der Übersicht bis 2026-11-22 zeigten; seit
// sie nach Fälligkeit zeigen („was steht an?"), steht die anteilige hier.
//
// Gerechnet wird nichts: `analysePlanrechnung` liefert Monate und Summe fertig. Der Text
// unter der Summe ist eine EINSCHRÄNKUNG (`ui/CLAUDE.md`, „Drei Ränge") und steht offen da:
// Ungeplantes fehlt, und Verträge sind verteilt.

import { useTranslation } from "react-i18next";
import type { Planmonat, Planrechnung, PlanZeileId } from "../../../application";
import { Card, DataTable, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

/** Nach welcher Zeile eine Zwischensumme fällig ist — dieselbe Gliederung wie in den Monatskarten. */
const STUFEN: readonly { id: "nachPflichten" | "nachAlltag" | "ergebnis"; zeilen: readonly PlanZeileId[] }[] = [
  { id: "nachPflichten", zeilen: ["einnahmen", "fixkosten"] },
  { id: "nachAlltag", zeilen: ["laufend"] },
  { id: "ergebnis", zeilen: ["abschreibungen", "vorsorge", "tilgung"] },
];

interface Summenzeile {
  readonly schluessel: string;
  readonly name: string;
  readonly betrag: number;
  readonly stufe: boolean;
}

export function PlanrechnungRegister({ sicht }: { sicht: Planrechnung }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const monatsname = (m: Planmonat) => `${t(`ergebnis.monat.${m.monat}`)} ${m.jahr}`;
  const erster = sicht.monate[0];
  const letzter = sicht.monate[sicht.monate.length - 1];

  // Eine Zwischensumme steht nur da, wenn danach noch etwas abgeht — die letzte Gruppe mit
  // Zeilen schliesst mit dem Ergebnis (dieselbe Regel wie in den Monatskarten).
  const gruppen = STUFEN.map((s) => ({ ...s, zeilen: sicht.zeilen.filter((z) => s.zeilen.includes(z)) })).filter(
    (g) => g.zeilen.length > 0,
  );
  const summen: Summenzeile[] = gruppen.flatMap((g, i) => {
    const stufe = i === gruppen.length - 1 ? "ergebnis" : g.id;
    return [
      ...g.zeilen.map((z) => ({ schluessel: z, name: t(`ergebnis.zeile.${z}`), betrag: sicht.summe.zeilen[z], stufe: false })),
      { schluessel: `stufe:${stufe}`, name: t(`ergebnis.stufe.${stufe}`), betrag: sicht.summe[stufe], stufe: true },
    ];
  });

  const betrag = (wert: number, fett = false) => (
    <span style={{ color: geldFarbe(wert), fontWeight: fett ? "var(--fw-bold)" : undefined }}>
      {geld.format(wert, { mitVorzeichen: true })}
    </span>
  );

  return (
    <>
      <Card
        title={t("planrechnung.summeTitel")}
        subtitle={erster && letzter ? t("planrechnung.summeUntertitel", { von: monatsname(erster), bis: monatsname(letzter) }) : undefined}
      >
        <DataTable<Summenzeile>
          rowStyle={(z) => (z.stufe ? { fontWeight: "var(--fw-bold)" } : undefined)}
          columns={[
            { key: "name", label: "", schmal: "titel", render: (z) => z.name },
            {
              key: "summe",
              label: `${t("planrechnung.spalteSumme")} ${geld.symbol}`,
              align: "right",
              schmal: "wert",
              render: (z) => betrag(z.betrag, z.stufe),
            },
          ]}
          rows={summen}
        />
        <p className="hinweis" style={{ marginTop: "var(--sp-3)", marginBottom: 0 }}>{t("planrechnung.hinweis")}</p>
        {sicht.ohneEinnahmen && (
          <p className="hinweis" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>{t("planrechnung.keineEinnahmen")}</p>
        )}
      </Card>

      {/* Daneben, nicht darin — keine Karte in einer Karte. Schmal bleiben Monat und was
          bleibt; die Zeilen rücken beschriftet in die zweite Zeile. */}
      <Card title={t("planrechnung.monateTitel")} subtitle={t("planrechnung.monateUntertitel")}>
        <DataTable<Planmonat>
          pageSize={12}
          columns={[
            {
              key: "monat",
              label: t("historie.spalteMonat"),
              schmal: "titel",
              render: (m) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  {monatsname(m)}
                  {m.laufend && <Pill variant="neutral">{t("ergebnis.pillLaufend")}</Pill>}
                </span>
              ),
            },
            // Die Zeilen ohne Farbe: zwölf rote Spalten sagten nur, dass Kosten Kosten
            // sind. Die Farbe trägt allein, was bleibt oder fehlt.
            ...sicht.zeilen.map((z, i) => ({
              key: z,
              label: <Kopf>{`${t(`ergebnis.zeile.${z}`)} ${geld.symbol}`}</Kopf>,
              align: "right" as const,
              schmal: "zweitzeile" as const,
              // Den Namen setzt die Zelle selbst und nicht die Tabelle: so darf ein Stück
              // zwischen Name und Betrag umbrechen. Mit dem Namen der Tabelle ist ein
              // Stück eine Zeile und wird gekürzt — bei 390 px fehlte „Vorsorge und
              // Anlage" schon die letzte Ziffer. Breit blendet die Klasse den Namen aus.
              zweitzeileName: false as const,
              render: (m: Planmonat) => (
                // Als eigener Block: ein umbrochener Betrag beginnt dann unter dem Namen
                // und nicht links unter dem Trenner davor, wo er abgeschnitten würde. Der
                // Block lässt dem Trenner seinen Platz (`--zweitzeile-abstand`), sonst
                // stünde er wieder über dem Rand — das erste Stück hat keinen.
                <span style={{ whiteSpace: "normal", display: "inline-block", verticalAlign: "top", maxWidth: i === 0 ? "100%" : "calc(100% - var(--zweitzeile-abstand))" }}>
                  <span className="zweitzeile-beschriftung">{t(`ergebnis.zeile.${z}`)} </span>
                  <span style={{ whiteSpace: "nowrap" }}>{m.zeilen[z] ? geld.format(m.zeilen[z], { mitVorzeichen: true }) : "—"}</span>
                </span>
              ),
            })),
            {
              key: "ergebnis",
              label: <Kopf>{`${t("ergebnis.stufe.ergebnis")} ${geld.symbol}`}</Kopf>,
              align: "right",
              schmal: "wert",
              render: (m) => betrag(m.ergebnis, true),
            },
          ]}
          rows={sicht.monate}
        />
      </Card>
    </>
  );
}

/**
 * Ein Spaltenkopf, der umbrechen darf. Sieben Spalten mit Namen wie „Vorsorge und Anlage"
 * passten breit nicht nebeneinander, und die Tabelle rollte gerade bei der Spalte aus dem
 * Bild, um die es geht — was bleibt. Die Zahlen darunter bleiben einzeilig.
 */
function Kopf({ children }: { children: string }) {
  return <span style={{ whiteSpace: "normal", display: "inline-block" }}>{children}</span>;
}
