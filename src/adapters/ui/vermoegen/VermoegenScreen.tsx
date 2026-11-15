// Vermögen — was du besitzt und was du schuldest, und was davon unterm Strich bleibt.
//
// Oben das Nettovermögen mit seinen vier Teilen, darunter sein Verlauf, dann die beiden
// Listen: Vermögenswerte und Schulden. Beide sind BEOBACHTUNGEN — ein Wert bzw. eine
// Restschuld zu einem Stichtag, von Hand eingetragen. Gebucht wird hier nichts.
//
// Die Grenze zur Übersicht: deren Karte „Was da ist" zeigt die Konten je Klasse. Hier
// steht auch, was auf keinem Konto liegt.
//
// Gerechnet wird nichts in dieser Datei. Jede Zahl kommt fertig aus `vermoegenLaden`.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Beobachtungszeile,
  Schuldzeile,
  Vermoegenssicht,
  Vermoegenswertzeile,
} from "../../../application";
import {
  restschuldEntfernen,
  schuldLoeschen,
  vermoegen as vermoegenLaden,
  vermoegenswertLoeschen,
  wertEntfernen,
} from "../../dienste";
import { Button, Card, DataTable, KPIStat, Pill } from "../bausteine";
import { Zeile } from "../bausteine/Anordnung";
import { Aufklapptabelle } from "../bausteine/Aufklapptabelle";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { useLoeschfrage } from "../bausteine/Loeschfrage";
import { fehlerMelden } from "../bausteine/Meldungen";
import { PageHead } from "../bausteine/PageHead";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { warnTon } from "../bausteine/geldFarbe";
import { BeobachtungDialog } from "./BeobachtungDialog";
import { NettoVerlaufChart } from "./NettoVerlaufChart";
import { SchuldDialog, VermoegenswertDialog } from "./StammDialoge";

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** Was eine der beiden Listen von der anderen unterscheidet — Wörter und Aufrufe. */
type Seite = "wert" | "restschuld";

/** Eine Zeile beider Listen, auf das gebracht, was die Tabelle braucht. */
interface Listenzeile {
  readonly id: string;
  readonly bezeichnung: string;
  readonly art: string;
  readonly gefuehrt: boolean;
  readonly aktuell?: Beobachtungszeile;
  readonly reihe: readonly Beobachtungszeile[];
  /** Nur bei Schulden: wozu sie gehört (Vertrag, Vermögenswert). */
  readonly verknuepft?: string;
}

export function VermoegenScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const loeschfrage = useLoeschfrage();
  const heute = useMemo(heuteIso, []);
  const [sicht, setSicht] = useState<Vermoegenssicht | null>(null);

  // Welcher Dialog offen ist. Ihr Zustand gehört den Dialogen; der Screen merkt sich nur,
  // für welchen Eintrag.
  const [wertDialog, setWertDialog] = useState<Vermoegenswertzeile | "neu" | null>(null);
  const [schuldDialog, setSchuldDialog] = useState<Schuldzeile | "neu" | null>(null);
  const [eintragen, setEintragen] = useState<{ seite: Seite; id: string; name: string } | null>(null);
  // Welche Zeile ihre Reihe zeigt — je Liste eine, damit das Aufklappen der einen die
  // andere nicht zuklappt.
  const [offenerWert, setOffenerWert] = useState<string | null>(null);
  const [offeneSchuld, setOffeneSchuld] = useState<string | null>(null);

  async function laden() {
    setSicht(await vermoegenLaden(heute));
  }
  useEffect(() => {
    laden().catch(fehlerMelden);
  }, []);

  if (!sicht) return <div className="screen"><PageHead title={t("vermoegen.titel")} subtitle={t("vermoegen.untertitel")} /></div>;

  const leer = sicht.vermoegenswerte.length === 0 && sicht.schulden.length === 0;
  const netto = sicht.netto;

  const wertzeilen: Listenzeile[] = sicht.vermoegenswerte.map((z) => ({
    id: z.gegenstand.id,
    bezeichnung: z.gegenstand.bezeichnung,
    art: t(`vermoegen.art.${z.gegenstand.art}`),
    gefuehrt: z.gefuehrt,
    aktuell: z.aktuell,
    reihe: z.reihe,
  }));
  const schuldzeilen: Listenzeile[] = sicht.schulden.map((z) => ({
    id: z.verbindlichkeit.id,
    bezeichnung: z.verbindlichkeit.bezeichnung,
    art: t(`vermoegen.schuldArt.${z.verbindlichkeit.art}`),
    gefuehrt: z.gefuehrt,
    aktuell: z.aktuell,
    reihe: z.reihe,
    verknuepft: [z.gegenstandName, z.vertragName].filter(Boolean).join(" · ") || undefined,
  }));

  /** Eine der beiden Listen samt der aufgeklappten Reihe darunter. */
  function liste(seite: Seite, zeilen: Listenzeile[], offen: string | null, setOffen: (id: string | null) => void) {
    const istWert = seite === "wert";
    const gewaehlt = zeilen.find((z) => z.id === offen);

    const bearbeiten = (z: Listenzeile) => {
      if (istWert) setWertDialog(sicht!.vermoegenswerte.find((x) => x.gegenstand.id === z.id) ?? null);
      else setSchuldDialog(sicht!.schulden.find((x) => x.verbindlichkeit.id === z.id) ?? null);
    };
    const loeschen = (z: Listenzeile) =>
      loeschfrage.stellen({
        name: z.bezeichnung,
        folgen: istWert ? t("vermoegen.loeschenFolgenVermoegenswert") : t("vermoegen.loeschenFolgenSchuld"),
        ausfuehren: async () => {
          if (istWert) await vermoegenswertLoeschen(z.id);
          else await schuldLoeschen(z.id);
          if (offen === z.id) setOffen(null);
          await laden();
        },
      });
    const entfernen = async (z: Listenzeile, b: Beobachtungszeile) => {
      try {
        if (istWert) await wertEntfernen(z.id, b.stichtag);
        else await restschuldEntfernen(z.id, b.stichtag);
        await laden();
      } catch (e) {
        fehlerMelden(e);
      }
    };

    // Keine Spalte setzt `schmal`: sobald eine es täte, fiele schmal alles Ungesetzte weg
    // — auch die Aktionen, und eine Handlung darf nicht weichen. Die Vorgabe der
    // `DataTable` (Bezeichnung als Titel, der Betrag rechts, der Rest darunter) passt.
    const spalten = [
      {
        key: "bezeichnung",
        label: t("vermoegen.spalteBezeichnung"),
        sortValue: (z: Listenzeile) => z.bezeichnung,
        render: (z: Listenzeile) => (
          <Zeile inline abstand={2}>
            {z.bezeichnung}
            {!z.gefuehrt && <Pill variant="neutral">{t("vermoegen.pillNichtGefuehrt")}</Pill>}
          </Zeile>
        ),
      },
      {
        key: "art",
        label: t("vermoegen.spalteArt"),
        sortValue: (z: Listenzeile) => z.art,
        render: (z: Listenzeile) => z.art,
      },
      ...(istWert
        ? []
        : [
            {
              key: "verknuepft",
              label: t("vermoegen.spalteVerknuepft"),
              sortValue: (z: Listenzeile) => z.verknuepft ?? "",
              render: (z: Listenzeile) => z.verknuepft ?? "",
            },
          ]),
      {
        key: "stichtag",
        label: t("vermoegen.spalteStichtag"),
        sortValue: (z: Listenzeile) => z.aktuell?.stichtag ?? "",
        // Der Stichtag steht IMMER neben dem Betrag: ohne ihn wäre der Wert eine
        // Behauptung ohne Zeitbezug.
        render: (z: Listenzeile) => (z.aktuell ? datum.mitJahr(z.aktuell.stichtag) : ""),
      },
      {
        key: "betrag",
        label: `${istWert ? t("vermoegen.spalteWert") : t("vermoegen.spalteRestschuld")} ${geld.symbol}`,
        align: "right" as const,
        sortValue: (z: Listenzeile) => z.aktuell?.betrag ?? -1,
        render: (z: Listenzeile) =>
          z.aktuell ? (
            <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(z.aktuell.betrag)}</span>
          ) : (
            <span className="muted">{istWert ? t("vermoegen.keinWert") : t("vermoegen.keineRestschuld")}</span>
          ),
      },
      {
        key: "aktionen",
        label: "",
        align: "right" as const,
        sortable: false,
        render: (z: Listenzeile) => (
          <IconLeiste>
            <IconButton icon="bearbeiten" label={t("vermoegen.bearbeiten", { name: z.bezeichnung })} onClick={() => bearbeiten(z)} />
            <IconButton icon="loeschen" ton="gefahr" label={t("vermoegen.loeschen", { name: z.bezeichnung })} onClick={() => loeschen(z)} />
          </IconLeiste>
        ),
      },
    ];

    return (
      <Card
        title={istWert ? t("vermoegen.vermoegenswerteTitel") : t("vermoegen.schuldenTitel")}
        action={
          <Button plus onClick={() => (istWert ? setWertDialog("neu") : setSchuldDialog("neu"))}>
            {istWert ? t("vermoegen.neuVermoegenswert") : t("vermoegen.neuSchuld")}
          </Button>
        }
      >
        {zeilen.length === 0 ? (
          <div className="muted">{istWert ? t("vermoegen.vermoegenswerteLeer") : t("vermoegen.schuldenLeer")}</div>
        ) : (
          <DataTable
            columns={spalten}
            rows={zeilen}
            sortable
            onRowClick={(z) => setOffen(offen === z.id ? null : z.id)}
            istAktiv={(z) => z.id === offen}
            // Was nicht mehr geführt wird, tritt zurück — es zählt nicht mehr, steht
            // aber noch da, weil seine Reihe im Verlauf steckt.
            rowStyle={(z) => (z.gefuehrt ? undefined : { opacity: 0.6 })}
          />
        )}

        {/* Die Reihe des gewählten Eintrags, UNTER der Tabelle und in derselben Karte:
            eine getönte Fläche, keine zweite Karte. */}
        {gewaehlt && (
          <div className="abschnitt">
            <Zeile abstand={3} style={{ justifyContent: "space-between" }}>
              <span style={{ fontWeight: "var(--fw-bold)" }}>
                {istWert
                  ? t("vermoegen.reiheWerte", { name: gewaehlt.bezeichnung })
                  : t("vermoegen.reiheRestschulden", { name: gewaehlt.bezeichnung })}
              </span>
              <Button groesse="klein" plus onClick={() => setEintragen({ seite, id: gewaehlt.id, name: gewaehlt.bezeichnung })}>
                {istWert ? t("vermoegen.wertEintragen") : t("vermoegen.restschuldEintragen")}
              </Button>
            </Zeile>
            <Aufklapptabelle
              zeilen={gewaehlt.reihe}
              schluessel={(b) => b.stichtag}
              leer={istWert ? t("vermoegen.reiheWerteLeer") : t("vermoegen.reiheRestschuldenLeer")}
              spalten={[
                { key: "stichtag", label: t("vermoegen.spalteStichtag"), breite: "8em", render: (b) => datum.mitJahr(b.stichtag) },
                {
                  key: "betrag",
                  label: `${istWert ? t("vermoegen.spalteWert") : t("vermoegen.spalteRestschuld")} ${geld.symbol}`,
                  align: "right",
                  fett: true,
                  render: (b) => geld.format(b.betrag),
                },
                {
                  key: "entfernen",
                  label: "",
                  align: "right",
                  breite: "3em",
                  render: (b) => (
                    <IconButton
                      icon="verwerfen"
                      ton="gefahr"
                      label={t(istWert ? "vermoegen.wertEntfernen" : "vermoegen.restschuldEntfernen", { datum: datum.mitJahr(b.stichtag) })}
                      onClick={() => void entfernen(gewaehlt, b)}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="screen">
      <PageHead title={t("vermoegen.titel")} subtitle={t("vermoegen.untertitel")} />

      {/* Der leere Zustand sagt, was hierher gehört und warum es sich lohnt — und bietet
          beide Wege an, statt auf zwei leere Tabellen zu zeigen. */}
      {leer && (
        <Card>
          <p style={{ margin: "0 0 var(--sp-3)" }}>{t("vermoegen.leer")}</p>
          <Zeile abstand={3}>
            <Button variant="primary" plus onClick={() => setWertDialog("neu")}>{t("vermoegen.neuVermoegenswert")}</Button>
            <Button plus onClick={() => setSchuldDialog("neu")}>{t("vermoegen.neuSchuld")}</Button>
          </Zeile>
        </Card>
      )}

      <Card
        title={t("vermoegen.nettoTitel")}
        subtitle={t("vermoegen.nettoUntertitel", { datum: datum.mitJahr(netto.stichtag) })}
      >
        {/* Ein Bestand, kein Fluss: er wird nicht grün, nur weil er positiv ist. Amber
            erst, wenn die Schulden überwiegen. */}
        <KPIStat
          size="hero"
          label={t("vermoegen.nettoTitel")}
          value={geld.format(netto.netto)}
          unit={geld.symbol}
          tone={warnTon(netto.netto < 0)}
        />
        <div className="kpis" style={{ marginTop: "var(--sp-4)" }}>
          <KPIStat size="chip" label={t("vermoegen.kpiKonten")} value={geld.format(netto.konten)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("vermoegen.kpiDepots")} value={geld.format(netto.depots)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("vermoegen.kpiVermoegenswerte")} value={geld.format(netto.vermoegenswerte)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("vermoegen.kpiSchulden")} value={geld.format(netto.schulden)} unit={geld.symbol} />
        </div>
        {/* Eine Einschränkung, keine Erklärung: sie ändert, was die Zahl darüber bedeutet,
            und steht deshalb offen da. */}
        {!leer && <p className="hinweis" style={{ margin: "var(--sp-3) 0 0" }}>{t("vermoegen.nettoHinweis")}</p>}
      </Card>

      {!leer && (
        <Card title={t("vermoegen.verlaufTitel")} subtitle={t("vermoegen.verlaufUntertitel")}>
          {sicht.verlauf.length > 1 ? (
            <NettoVerlaufChart
              labels={sicht.verlauf.map((p) => datum.kurz(p.stichtag))}
              werte={sicht.verlauf.map((p) => p.netto)}
              legende={t("vermoegen.verlaufLegende")}
              titel={(i) =>
                t("vermoegen.verlaufPunkt", {
                  datum: datum.mitJahr(sicht.verlauf[i].stichtag),
                  betrag: geld.formatMitSymbol(sicht.verlauf[i].netto),
                })
              }
            />
          ) : (
            <div className="hinweis">{t("vermoegen.verlaufZuWenig")}</div>
          )}
        </Card>
      )}

      {!leer && liste("wert", wertzeilen, offenerWert, setOffenerWert)}
      {!leer && liste("restschuld", schuldzeilen, offeneSchuld, setOffeneSchuld)}

      {wertDialog && (
        <VermoegenswertDialog
          zeile={wertDialog === "neu" ? null : wertDialog}
          onClose={() => setWertDialog(null)}
          onGespeichert={async () => { setWertDialog(null); await laden(); }}
        />
      )}
      {schuldDialog && (
        <SchuldDialog
          zeile={schuldDialog === "neu" ? null : schuldDialog}
          vertraege={sicht.vertraege}
          vermoegenswerte={sicht.vermoegenswerte}
          onClose={() => setSchuldDialog(null)}
          onGespeichert={async () => { setSchuldDialog(null); await laden(); }}
        />
      )}
      {eintragen && (
        <BeobachtungDialog
          art={eintragen.seite}
          id={eintragen.id}
          name={eintragen.name}
          heute={heute}
          onClose={() => setEintragen(null)}
          onGespeichert={async () => { setEintragen(null); await laden(); }}
        />
      )}
      {loeschfrage.dialog}
    </div>
  );
}
