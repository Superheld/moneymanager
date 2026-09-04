// „Was noch kommt" — die fälligen Zahlungen der nächsten Tage, über alle Konten.
//
// Sie stand bis 2026-08-27 im Kontoauszug, je Konto eine eigene Liste neben den gebuchten
// Zeilen. Zwei Dinge waren daran falsch, und beide fielen erst auf, als man es benutzte:
//
//   • Der Auszug beantwortet „was ist passiert". Eine zweite Liste über die Zukunft
//     daneben beantwortet eine andere Frage im selben Bild — dieselbe Trennung, die den
//     Kontoabgleich schon aus der Kontenliste in einen eigenen Bereich geschoben hat.
//   • „Was kommt noch auf mich zu" ist keine Frage EINES Kontos. Wer vier führt, musste
//     vier Auszüge öffnen und zusammenzählen.
//
// Hier steht sie zusammen, und das Konto wird zur SPALTE und zum Filter — die Auskunft,
// die vorher die Navigation war, ist jetzt eine Angabe in der Zeile.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { VORSCHAU_TAGE, type Vorschauzeile } from "../../../application";
import { Card, DataTable, Pill } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useCharakterLabel, useDatum, useGeld } from "../bausteine/einstellungenKontext";

/** Dieselben Stufen wie im Kontoauszug zuvor — die letzte ist `VORSCHAU_TAGE`. */
const TAGE_OPTIONEN = [14, 30, 60, VORSCHAU_TAGE];

interface Props {
  zeilen: readonly Vorschauzeile[];
  kontoNamen: ReadonlyMap<string, string>;
}

export function VorschauKarte({ zeilen, kontoNamen }: Props) {
  const { t } = useTranslation();
  const geld = useGeld();
  // Ohne Jahr: die Vorschau reicht höchstens 90 Tage, das Jahr unterscheidet nichts.
  const datum = useDatum();
  const charakterLabel = useCharakterLabel();
  const [tage, setTage] = useState(30);
  const [konto, setKonto] = useState("");

  // Enger stellen, nicht neu laden: die Anwendungsschicht rechnet einmal über das
  // weiteste Fenster vor (`VORSCHAU_TAGE`), und beide Wähler schneiden daraus zu.
  // Dieselbe Entscheidung wie beim Monatswechsel der Budgetliste eine Karte weiter.
  const grenze = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + tage);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [tage]);

  const gezeigt = useMemo(
    () => zeilen.filter((z) => z.datum <= grenze && (!konto || z.kontoId === konto)),
    [zeilen, grenze, konto],
  );

  // Nur Konten anbieten, auf denen im WEITESTEN Fenster überhaupt etwas fällig wird. Ein
  // Filter, der zu leeren Listen führt, ist kein Filter, sondern eine Sackgasse.
  const kontenMitFaelligem = useMemo(() => {
    const ids = [...new Set(zeilen.map((z) => z.kontoId))];
    return ids
      .map((id) => ({ id, name: kontoNamen.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [zeilen, kontoNamen]);

  const summe = gezeigt.reduce((s, z) => s + z.betrag, 0);

  return (
    <Card
      title={t("uebersicht.vorschauTitel")}
      subtitle={t("uebersicht.vorschauUntertitel", { tage })}
      action={
        <span className="tabellenfilter">
          {/* Der Konto-Wähler steht nur da, wo es überhaupt etwas zu wählen gibt: bei
              einem einzigen Konto wäre er ein Bedienelement mit genau einer Möglichkeit. */}
          {kontenMitFaelligem.length > 1 && (
            <Auswahl
              ariaLabel={t("uebersicht.vorschauKonto")}
              wert={konto}
              aufAenderung={setKonto}
              optionen={[
                { wert: "", text: t("uebersicht.vorschauAlleKonten") },
                ...kontenMitFaelligem.map((k) => ({ wert: k.id, text: k.name })),
              ]}
            />
          )}
          <Auswahl
            ariaLabel={t("uebersicht.vorschauZeitraum")}
            wert={String(tage)}
            aufAenderung={(v) => setTage(Number(v))}
            optionen={TAGE_OPTIONEN.map((d) => ({
              wert: String(d),
              text: t("konten.kommendeTage", { tage: d }),
            }))}
          />
        </span>
      }
    >
      {gezeigt.length === 0 ? (
        <div className="muted">
          {konto
            ? t("uebersicht.vorschauLeerKonto", { tage })
            : t("uebersicht.vorschauLeer", { tage })}
        </div>
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: "datum",
                label: t("uebersicht.vorschauSpalteDatum"),
                render: (z: Vorschauzeile) => datum.ohneJahr(z.datum),
              },
              // Die Spalte, wegen der es diese Karte gibt. Sie fällt weg, sobald auf ein
              // Konto gefiltert ist: dann steht in jeder Zeile dasselbe, und die Angabe
              // ist schon im Wähler darüber beantwortet.
              ...(konto
                ? []
                : [
                    {
                      key: "konto",
                      label: t("uebersicht.vorschauSpalteKonto"),
                      maxWidth: 160,
                      render: (z: Vorschauzeile) => (
                        <span className="muted">{kontoNamen.get(z.kontoId) ?? "—"}</span>
                      ),
                    },
                  ]),
              {
                key: "bez",
                label: t("uebersicht.vorschauSpalteBeschreibung"),
                maxWidth: 260,
                render: (z: Vorschauzeile) => (
                  <span
                    title={z.bezeichnung}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {z.bezeichnung}
                    </span>
                    {z.charakter === "Umschichtung" && (
                      <Pill variant="um">{charakterLabel("Umschichtung")}</Pill>
                    )}
                  </span>
                ),
              },
              {
                key: "betrag",
                label: `${t("uebersicht.vorschauSpalteBetrag")} ${geld.symbol}`,
                align: "right" as const,
                render: (z: Vorschauzeile) => (
                  <span className="num" style={{ fontWeight: 700, color: geldFarbe(z.betrag) }}>
                    {geld.format(z.betrag, { mitVorzeichen: true })}
                  </span>
                ),
              },
            ]}
            rows={[...gezeigt]}
            // Gedämpft: nichts davon ist passiert. Der Unterschied zu einer gebuchten
            // Zeile muss sichtbar bleiben, auch wenn hier nur Geplantes steht.
            rowStyle={() => ({ opacity: 0.72 })}
          />
          {/* Die Summe ist der eigentliche Gewinn des kontoübergreifenden Blicks: sie war
              vorher gar nicht zu haben, weil jede Liste nur ihr eigenes Konto kannte. */}
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)", textAlign: "right" }}>
            {t("uebersicht.vorschauSumme", {
              betrag: geld.formatMitSymbol(summe, { mitVorzeichen: true }),
            })}
          </div>
        </>
      )}
    </Card>
  );
}
