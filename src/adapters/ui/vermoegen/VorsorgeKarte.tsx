// Die Karte „Vorsorge" — was das Vorsorgeziel heute verlangt.
//
// Oben die eine Zahl, auf die es ankommt (die nötige Sparrate), darunter die Kette, aus
// der sie folgt: was da ist, was daraus wird, was da sein muss, was fehlt. Jede Stufe
// steht da, weil die Sparrate allein eine Behauptung wäre — wer sie für zu hoch hält,
// soll sehen, an welcher Annahme es liegt.
//
// **Die Annahmen stehen im Untertitel, neben dem Ergebnis.** Wunsch, Rente, Dauer und
// Rendite sind Eingaben des Nutzers; eine Sparrate ohne sie daneben sähe nach einer
// Tatsache aus.
//
// **Unter „Heute dafür da" steht, was zählt**, Posten für Posten (`posten` der Sicht): die
// Depots, die zum Ziel zählen, je mit ihrem Verrechnungskonto darunter, die übrigen Konten
// der Klassen Vorsorge und Investment, die zugeordneten Vermögenswerte. Ohne die Liste
// war die Zahl eine Summe, deren Teile man nicht sah — und ob ein Depot darin steckt,
// liess sich nur erraten. Ein Verrechnungskonto, dessen Klasse nicht zählt, steht dabei
// und sagt es; seine Zahl ist nicht in der Summe.
//
// Die Karte RECHNET NICHTS. Alles kommt fertig aus `vorsorgeLaden`.

/** Eine Zeile der Liste: ein Posten oder das Verrechnungskonto unter seinem Depot. */
interface Postenzeile {
  readonly schluessel: string;
  readonly bezeichnung: string;
  readonly art: "depot" | "konto" | "verrechnungskonto" | "vermoegenswert";
  readonly betrag: number;
  /** Nur beim Verrechnungskonto: zählt es über seine Klasse nicht mit, steht sie hier. */
  readonly zaehltNichtKlasse?: string;
}

import { useTranslation } from "react-i18next";
import type { Vorsorgesicht } from "../../../application";
import { Button, Card, CoverageTrack, DataTable, KPIStat } from "../bausteine";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { useDatum, useGeld, useProzent } from "../bausteine/einstellungenKontext";
import { warnTon } from "../bausteine/geldFarbe";

export function VorsorgeKarte({
  sicht,
  onBearbeiten,
  onLoeschen,
}: {
  /** `null`, solange kein Ziel angelegt ist. */
  sicht: Vorsorgesicht | null;
  onBearbeiten: () => void;
  onLoeschen: () => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const prozent = useProzent();

  if (!sicht) {
    return (
      <Card title={t("vermoegen.vorsorge.titel")} action={<Button plus onClick={onBearbeiten}>{t("vermoegen.vorsorge.neu")}</Button>}>
        <p style={{ margin: 0 }}>{t("vermoegen.vorsorge.leer")}</p>
      </Card>
    );
  }

  const { ziel, annahme, stand, vermoegen } = sicht;
  const zeilen: Postenzeile[] = sicht.posten.flatMap((p): Postenzeile[] => {
    const eigene: Postenzeile = { schluessel: `${p.art}:${p.id}`, bezeichnung: p.bezeichnung, art: p.art, betrag: p.betrag };
    const k = p.verrechnungskonto;
    if (!k) return [eigene];
    return [
      eigene,
      {
        schluessel: `verrechnungskonto:${p.id}:${k.id}`,
        bezeichnung: k.bezeichnung,
        art: "verrechnungskonto",
        betrag: k.betrag,
        zaehltNichtKlasse: k.zaehlt ? undefined : k.klasse,
      },
    ];
  });
  const klassen = {
    vorsorge: t("einstellungen.konto.klasse.vorsorge"),
    investment: t("einstellungen.konto.klasse.investment"),
  };
  const ab = datum.mitJahr(`${annahme.zielMonat}-01`);
  const wunsch = geld.formatMitSymbol(annahme.wunschMonatlich);

  return (
    <Card
      title={`${t("vermoegen.vorsorge.titel")}: ${ziel.bezeichnung}`}
      subtitle={t("vermoegen.vorsorge.annahmen", {
        ab,
        wunsch,
        rente: geld.formatMitSymbol(annahme.renteMonatlich),
        jahre: annahme.entnahmeMonate / 12,
        rendite: prozent(annahme.renditeBp / 10000, 2),
      })}
      action={
        <IconLeiste>
          <IconButton icon="bearbeiten" label={t("vermoegen.vorsorge.bearbeiten")} onClick={onBearbeiten} />
          <IconButton icon="loeschen" ton="gefahr" label={t("vermoegen.vorsorge.loeschen")} onClick={onLoeschen} />
        </IconLeiste>
      }
    >
      {/* Drei Fälle, und nur einer hat eine Zahl: gibt es keine Rate mehr, die das Ziel
          erreicht, stünde eine Null da und läse sich als „nichts zu tun". */}
      {stand.sparrate === null ? (
        <p style={{ margin: 0 }}>{t("vermoegen.vorsorge.unerreichbar")}</p>
      ) : (
        <KPIStat
          size="hero"
          label={t("vermoegen.vorsorge.sparrate")}
          value={geld.format(stand.sparrate)}
          unit={geld.symbol}
          meta={stand.sparrate === 0 ? t("vermoegen.vorsorge.gedeckt") : undefined}
        />
      )}

      <div style={{ marginTop: "var(--sp-4)" }}>
        <CoverageTrack
          value={stand.hochgerechnet}
          max={Math.max(1, stand.kapitalbedarf)}
          label={t("vermoegen.vorsorge.deckung")}
          right={prozent(stand.deckung)}
          // Ein Ziel, das übertroffen wird, ist keine Überschreitung.
          over={false}
        />
      </div>

      <div className="kpis" style={{ marginTop: "var(--sp-4)" }}>
        <KPIStat size="chip" label={t("vermoegen.vorsorge.kpiDa")} value={geld.format(vermoegen.netto)} unit={geld.symbol} />
        <KPIStat size="chip" label={t("vermoegen.vorsorge.kpiHochgerechnet", { ab })} value={geld.format(stand.hochgerechnet)} unit={geld.symbol} />
        <KPIStat size="chip" label={t("vermoegen.vorsorge.kpiBedarf")} value={geld.format(stand.kapitalbedarf)} unit={geld.symbol} />
        <KPIStat size="chip" label={t("vermoegen.vorsorge.kpiFehlt")} value={geld.format(stand.fehlbetrag)} unit={geld.symbol} tone={warnTon(stand.fehlbetrag > 0)} />
      </div>

      {/* Was in „Heute dafür da" steckt. Ohne Sortierung: die Reihenfolge ist die Aussage
          — das Verrechnungskonto gehört unter sein Depot. */}
      <div className="abschnitt">
        <span style={{ fontWeight: "var(--fw-bold)" }}>{t("vermoegen.vorsorge.kpiDa")}</span>
        {zeilen.length === 0 ? (
          <p className="hinweis" style={{ margin: "var(--sp-2) 0 0" }}>{t("vermoegen.vorsorge.postenLeer", klassen)}</p>
        ) : (
          <DataTable
            rows={zeilen}
            columns={[
              {
                key: "bezeichnung",
                label: t("vermoegen.vorsorge.spaltePosten"),
                render: (z: Postenzeile) =>
                  z.art === "verrechnungskonto" ? (
                    <span style={{ paddingLeft: "var(--sp-4)" }}>{z.bezeichnung}</span>
                  ) : (
                    z.bezeichnung
                  ),
              },
              {
                key: "art",
                label: t("vermoegen.spalteArt"),
                render: (z: Postenzeile) => t(`vermoegen.vorsorge.postenArt.${z.art}`),
              },
              {
                key: "betrag",
                label: `${t("vermoegen.vorsorge.spalteBetrag")} ${geld.symbol}`,
                align: "right" as const,
                render: (z: Postenzeile) =>
                  z.zaehltNichtKlasse ? (
                    <>
                      <span className="muted">{geld.format(z.betrag)}</span>
                      <span className="hinweis" style={{ display: "block" }}>
                        {t("vermoegen.vorsorge.zaehltNichtKurz", {
                          klasse: t(`einstellungen.konto.klasse.${z.zaehltNichtKlasse}`),
                        })}
                      </span>
                    </>
                  ) : (
                    geld.format(z.betrag)
                  ),
              },
            ]}
          />
        )}
      </div>

      {stand.fehlbetrag > 0 && (
        <p style={{ margin: "var(--sp-3) 0 0" }}>
          {t("vermoegen.vorsorge.ohneSparen", { betrag: geld.formatMitSymbol(sicht.ohneSparenMonatlich), wunsch })}
        </p>
      )}
      {/* Eine Einschränkung: sie sagt, was die Zahlen darüber bedeuten und was in ihnen
          steckt. Sie steht deshalb offen da. */}
      <p className="hinweis" style={{ margin: "var(--sp-3) 0 0" }}>
        {t("vermoegen.vorsorge.hinweis", klassen)}
      </p>
    </Card>
  );
}
