// Neue Buchungen eines Kontos — abgerufen, noch nicht bestätigt.
//
// Sie stehen hier und NICHT in der Import-Inbox, und das ist eine bewusste Trennung:
// Die Inbox ist der Ort für den gelegentlichen Dateiimport, bei dem man einen ganzen
// Stapel am Stück durchsieht. Ein Bankabruf ist dagegen der Alltag — was die Bank
// gebracht hat, gehört dorthin, wo man auf das Konto schaut, und nicht in einen
// zweiten Arbeitsschritt an anderer Stelle.
//
// Angezeigt wird zu jeder Zeile, was die App über sie zu wissen glaubt:
//
//  • welche Kategorie sie bekommen hat und WOHER dieser Vorschlag stammt (Festlegung,
//    Vertrag, Modell …) — sonst ist eine automatische Kategorie eine Behauptung ohne
//    Absender,
//  • ob sie eine Dublette sein könnte, mit den Gründen des Finders im Klartext.
//
// Bestätigen heißt verbuchen: erst dann wird aus dem Abruf eine Ist-Buchung, die im
// Saldo steht. Bis dahin ist nichts passiert, was sich nicht folgenlos verwerfen ließe.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Kategorie, Zahlungskonto } from "../../core";
import {
  gegenbeinFuer,
  ordneZu,
  umsaetzeVerbuchen,
  verwerfen,
  type Bewertung,
  type Umsatz,
} from "../../application/import";
import { zuordnungenAbgleichen } from "../../application/vertragszuordnung";
import { vertragsAbgleichDeps } from "../persistence/sqliteVertragZuordnungRepositories";
import { sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { CategoryPicker } from "./CategoryPicker";
import { Button, Card, Pill } from "./ds";
import { useGeld } from "./einstellungenKontext";

/** Quellen, die als Bankabruf gelten — deren Umsätze landen hier statt in der Inbox. */
export const ABRUF_QUELLEN = new Set(["fints"]);

export function NeueBuchungen({
  zeilen,
  bestand,
  alleNeuen,
  konten,
  kategorien,
  onOeffnen,
  onGeaendert,
}: {
  /** Die offenen Abruf-Buchungen DIESES Kontos. */
  zeilen: readonly Umsatz[];
  /** Alle übrigen Umsätze des Kontos — Grundlage der Dublettenprüfung in der Anzeige. */
  bestand: readonly Umsatz[];
  /**
   * ALLE offenen Abrufbuchungen, auch die anderer Konten. Ohne sie wäre eine Umbuchung
   * nicht als solche zu bestätigen: ihr Gegenbein liegt per Definition auf dem anderen
   * Konto und damit in einem anderen Block.
   */
  alleNeuen: readonly Umsatz[];
  konten: readonly Zahlungskonto[];
  kategorien: readonly Kategorie[];
  /**
   * Öffnet den Entwurf im Buchungsdialog — OHNE ihn vorher zu verbuchen. Übernommen wird
   * dort, oder gar nicht.
   */
  onOeffnen: (entwurf: Umsatz) => void;
  onGeaendert: () => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Zeile, deren Kategorie gerade geändert wird. */
  const [aendertId, setAendertId] = useState<string | null>(null);

  const kategorieName = new Map(kategorien.map((k) => [k.id, k.name]));
  const kontoName = new Map(konten.map((k) => [k.id, k.bezeichnung]));

  // Die Dublettenprüfung läuft HIER in der Anzeige und nicht nur beim Import.
  //
  // Der Grund ist praktisch: der Verdacht, den der Import an die Zeile schreibt, gilt für
  // den Stand von damals. Zeilen, die vor dem Finder hereinkamen, tragen gar keinen — und
  // eine Buchung, die inzwischen aus anderer Quelle dazukam, würde nie nachträglich
  // angeschrieben. Der Vergleich kostet nichts (gemessen: 60 gegen 5279 Zeilen in 2 ms),
  // also wird er beim Hinsehen gerechnet statt einmalig konserviert.
  //
  // Verworfene Zeilen bleiben im Bestand und zählen mit: „das habe ich schon einmal
  // weggeworfen" ist genau die Auskunft, die man hier braucht.
  const geprueft = new Map<string, { bewertung: Bewertung; zwilling?: Umsatz }>();
  const neuSortiert = [...zeilen].sort((a, b) => b.buchungstag.localeCompare(a.buchungstag));
  ordneZu(neuSortiert, bestand).forEach((t, i) => {
    if (t.bewertung.urteil !== "verschieden") {
      geprueft.set(neuSortiert[i].id, { bewertung: t.bewertung, zwilling: t.bestand });
    }
  });

  /**
   * Zu jeder als Umbuchung markierten Zeile das Gegenbein dazunehmen — auch wenn es auf
   * einem anderen Konto liegt und hier gar nicht angezeigt wird.
   *
   * Das ist die Antwort auf ein Loch, das sich beim Benutzen zeigte: `paareUmbuchungen`
   * verknüpft die zwei Beine, indem es sie im SELBEN Verbuchungslauf sieht. Wer nur eine
   * Seite bestätigt, bekommt eine einseitige Umschichtung, und die zweite Seite später
   * noch eine — zwei Halbe statt eines Übertrags. Im Ledger ließe sich das nachträglich
   * paaren, aber nur, wenn beide Beine dort schon liegen; solange beide Entwürfe sind,
   * gibt es dort nichts zu verknüpfen.
   */
  function mitGegenbeinen(auswahl: readonly Umsatz[]): Umsatz[] {
    const gewaehlt = new Map(auswahl.map((u) => [u.id, u]));
    for (const u of auswahl) {
      if (u.vorschlag?.quelle !== "umbuchung") continue;
      const gegen = gegenbeinFuer(
        u,
        alleNeuen.filter((x) => !gewaehlt.has(x.id) && x.vorschlag?.quelle === "umbuchung"),
      );
      if (gegen) gewaehlt.set(gegen.id, gegen);
    }
    return [...gewaehlt.values()];
  }

  async function bestaetigen(roheAuswahl: readonly Umsatz[]) {
    const auswahl = mitGegenbeinen(roheAuswahl);
    if (auswahl.length === 0) return;
    setBusy(true);
    setFehler(null);
    try {
      await umsaetzeVerbuchen(auswahl, {
        ledgerRepo: sqliteLedgerRepository,
        umsatzRepo: sqliteUmsatzRepository,
        id: () => crypto.randomUUID(),
      });
      // Frisch verbuchte Zahlungen den Verträgen zuordnen — derselbe Schritt wie in der
      // Inbox. Er gehört nicht in den Verbuchen-Use-Case: der schreibt Fakten, die
      // Zuordnung ist eine Interpretation darüber.
      await zuordnungenAbgleichen(vertragsAbgleichDeps);
      onGeaendert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Markiert die Zeile als Umbuchung — und gleich das passende Gegenbein mit.
   *
   * Beides zusammen zu markieren ist kein Automatismus über den Kopf des Nutzers hinweg,
   * sondern die einzige Form, in der die Aussage überhaupt Sinn ergibt: eine Umbuchung
   * hat zwei Seiten. Was hier nicht passt, findet auch `paareUmbuchungen` nicht.
   */
  async function alsUmbuchung(u: Umsatz) {
    const alsUm = (x: Umsatz): Umsatz => ({
      ...x,
      vorschlag: { charakter: "Umschichtung", quelle: "umbuchung" },
    });
    await sqliteUmsatzRepository.speichern(alsUm(u));
    const gegen = gegenbeinFuer(u, alleNeuen.filter((x) => x.id !== u.id));
    if (gegen) await sqliteUmsatzRepository.speichern(alsUm(gegen));
    onGeaendert();
  }

  async function verwerfenEiner(u: Umsatz) {
    await sqliteUmsatzRepository.speichern(verwerfen(u));
    onGeaendert();
  }

  async function kategorieSetzen(u: Umsatz, kategorieId: string) {
    const kategorie = kategorien.find((k) => k.id === kategorieId);
    await sqliteUmsatzRepository.speichern({
      ...u,
      // Von Hand gewählt ist von Hand gewählt — die Quelle wird mitgeführt, damit später
      // sichtbar bleibt, was das Modell wusste und was der Mensch entschieden hat.
      vorschlag: {
        kategorieId,
        charakter: kategorie?.defaultCharakter ?? u.vorschlag?.charakter ?? "Aufwand",
        quelle: "manuell",
      },
    });
    setAendertId(null);
    onGeaendert();
  }

  if (zeilen.length === 0) return null;

  const ohneVerdacht = neuSortiert.filter((u) => !geprueft.has(u.id));

  return (
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      title={t("konten.neue.titel", { n: zeilen.length })}
      subtitle={t("konten.neue.untertitel")}
      action={
        ohneVerdacht.length > 0 ? (
          <Button variant="primary" onClick={() => void bestaetigen(ohneVerdacht)}>
            {busy ? t("konten.neue.laeuft") : t("konten.neue.alleBestaetigen", { n: ohneVerdacht.length })}
          </Button>
        ) : undefined
      }
    >
      {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}

      {neuSortiert.map((u) => {
        const verdacht = geprueft.get(u.id);
        return (
          <div key={u.id} style={{ borderTop: "1px solid var(--line-soft)", padding: "var(--sp-3) 0" }}>
            <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{u.buchungstag}</span>
              <strong>{u.gegenpartei || t("konten.neue.ohneGegenpartei")}</strong>
              <span style={{ marginLeft: "auto", fontWeight: "var(--fw-bold)" }}>{geld.format(u.betrag)}</span>
            </div>

            <div className="muted" style={{ fontSize: "var(--fs-xs)", margin: "var(--sp-1) 0" }}>
              {u.verwendungszweck}
            </div>

            <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
              {/* Die Kategorie MIT Absender: eine automatische Zuordnung ohne sichtbaren
                  Grund ist eine Behauptung, die man nicht prüfen kann. */}
              <Pill variant={u.vorschlag?.kategorieId ? "ok" : "warn"}>
                {u.vorschlag?.kategorieId
                  ? (kategorieName.get(u.vorschlag.kategorieId) ?? "?")
                  : t("konten.neue.ohneKategorie")}
              </Pill>
              {u.vorschlag && (
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t(`konten.neue.quelle.${u.vorschlag.quelle}`)}
                </span>
              )}
              <button className="linkbtn" onClick={() => setAendertId(aendertId === u.id ? null : u.id)}>
                {t("konten.neue.kategorieAendern")}
              </button>

              <button className="linkbtn" onClick={() => void alsUmbuchung(u)}>
                {t("konten.neue.alsUmbuchung")}
              </button>

              <span style={{ marginLeft: "auto", display: "flex", gap: "var(--sp-3)" }}>
                <button className="linkbtn" onClick={() => void bestaetigen([u])}>
                  {t("konten.neue.bestaetigen")}
                </button>
                <button className="linkbtn" onClick={() => onOeffnen(u)}>
                  {t("konten.neue.bearbeiten")}
                </button>
                <button className="linkbtn" onClick={() => void verwerfenEiner(u)}>
                  {t("konten.neue.verwerfen")}
                </button>
              </span>
            </div>

            {aendertId === u.id && (
              <div style={{ marginTop: "var(--sp-2)", maxWidth: 320 }}>
                <CategoryPicker
                  kategorien={[...kategorien]}
                  value={u.vorschlag?.kategorieId ?? ""}
                  onChange={(id) => void kategorieSetzen(u, id)}
                />
              </div>
            )}

            {u.vorschlag?.quelle === "umbuchung" && (
              <div style={{ marginTop: "var(--sp-2)" }}>
                {(() => {
                  const gegen = gegenbeinFuer(u, alleNeuen.filter((x) => x.id !== u.id));
                  return gegen ? (
                    <>
                      <Pill variant="um">{t("konten.neue.umbuchung")}</Pill>{" "}
                      <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                        {t("konten.neue.gegenbein", {
                          konto: kontoName.get(gegen.zahlungskontoId) ?? "?",
                          datum: gegen.buchungstag,
                          betrag: geld.format(gegen.betrag),
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Pill variant="warn">{t("konten.neue.umbuchung")}</Pill>{" "}
                      <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                        {t("konten.neue.ohneGegenbein")}
                      </span>
                    </>
                  );
                })()}
              </div>
            )}

            {verdacht && (
              <div style={{ marginTop: "var(--sp-2)" }}>
                <Pill variant="warn">
                  {verdacht.bewertung.urteil === "identisch"
                    ? t("konten.neue.dubletteSicher")
                    : t("konten.neue.dublette")}
                </Pill>{" "}
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t("konten.neue.dubletteHinweis", { gruende: verdacht.bewertung.gruende.join(", ") })}
                  {verdacht.zwilling &&
                    ` — ${verdacht.zwilling.buchungstag} ${verdacht.zwilling.gegenpartei} (${t(
                      `konten.neue.status.${verdacht.zwilling.status}`,
                    )})`}
                </span>
              </div>
            )}
          </div>
        );
      })}

    </Card>
  );
}
