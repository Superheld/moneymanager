// Abgerufene Zeilen eines Kontos, die noch eine Entscheidung brauchen.
//
// Seit 2026-08-19 ist das die AUSNAHME, nicht der Normalfall: der Abruf verbucht direkt
// (siehe application/fints/abrufAusfuehren, Punkt 4). Was die Bank meldet, ist passiert
// — daran gibt es nichts zu bestätigen, und der frühere Bestätigen-Schritt bestand in
// der Praxis nur aus Klicken. Hier landet deshalb nur noch, was die Dublettenprüfung als
// möglichen Zwilling markiert hat: die eine Frage, die man wirklich beantworten muss.
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
// Bestätigen heißt hier: „doch keine Dublette" — erst dann wird aus der Zeile eine
// Ist-Buchung, die im Saldo steht. Bis dahin ist nichts passiert, was sich nicht
// folgenlos verwerfen ließe.

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Kategorie, Zahlungskonto } from "../../application";
import { umsaetzeBuchen, umsatzSpeichern } from "../dienste";
import {
  alsDuplikat,
  gegenbeinFuer,
  ordneZu,
  verwerfen,
  zurueckholen,
  type Bewertung,
  type Umsatz,
} from "../../application/import";
import { CategoryPicker } from "./CategoryPicker";
import { Card, Pill } from "./ds";
import { useGeld } from "./einstellungenKontext";

/** Quellen, die als Bankabruf gelten — deren Umsätze landen hier statt in der Inbox. */
export const ABRUF_QUELLEN = new Set(["fints"]);

export function NeueBuchungen({
  zeilen,
  weggelegte,
  bestand,
  alleNeuen,
  konten,
  kategorien,
  onOeffnen,
  onGeaendert,
}: {
  /** Die offenen Abruf-Buchungen DIESES Kontos. */
  zeilen: readonly Umsatz[];
  /**
   * Die weggelegten Abruf-Zeilen dieses Kontos (verworfen oder als Dublette markiert).
   *
   * Sie standen bisher nirgends. Das ist die Sorte Lücke, die erst auffällt, wenn sie
   * zuschlägt: eine versehentlich verworfene Bankzeile nahm den Betrag aus dem Kontostand
   * mit, und weder war zu sehen, dass sie existiert, noch gab es einen Weg zurück.
   */
  weggelegte: readonly Umsatz[];
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
  const [fehler, setFehler] = useState<string | null>(null);
  /** Zeile, deren Kategorie gerade geändert wird. */
  const [aendertId, setAendertId] = useState<string | null>(null);
  /** Der Weggelegt-Bereich ist zugeklappt — er ist der Rückweg, nicht der Alltag. */
  const [zeigeWeggelegt, setZeigeWeggelegt] = useState(false);

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

  // Dieselbe Prüfung für die weggelegten Zeilen — sie ist dort sogar die WICHTIGERE
  // Auskunft: ob eine Zeile zu Recht weggelegt wurde, entscheidet sich daran, ob es ihr
  // Gegenstück im Bestand wirklich gibt. Fehlt es, fehlt der Betrag im Kontostand.
  // Verglichen wird gegen den Bestand OHNE die weggelegten selbst; sonst erklärten zwei
  // weggelegte Zeilen einander für vorhanden, und beide fehlten trotzdem.
  const weggelegteIds = new Set(weggelegte.map((u) => u.id));
  const bestandOhneWeggelegte = bestand.filter((u) => !weggelegteIds.has(u.id));
  const geprueftWeggelegt = new Map<string, { bewertung: Bewertung; zwilling?: Umsatz }>();
  const weggelegtSortiert = [...weggelegte].sort((a, b) => b.buchungstag.localeCompare(a.buchungstag));
  ordneZu(weggelegtSortiert, bestandOhneWeggelegte).forEach((t, i) => {
    if (t.bewertung.urteil !== "verschieden") {
      geprueftWeggelegt.set(weggelegtSortiert[i].id, { bewertung: t.bewertung, zwilling: t.bestand });
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
    setFehler(null);
    try {
      await umsaetzeBuchen(auswahl);
      onGeaendert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
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
    await umsatzSpeichern(alsUm(u));
    const gegen = gegenbeinFuer(u, alleNeuen.filter((x) => x.id !== u.id));
    if (gegen) await umsatzSpeichern(alsUm(gegen));
    onGeaendert();
  }

  /**
   * Weglegen — mit dem Unterschied, der für den Kontostand zählt.
   *
   * „ist schon gebucht" (Status `duplikat`) heißt: der Betrag steht bereits im Ledger,
   * über eine andere Zeile. Der Kontostand bleibt richtig.
   * „verwerfen" heißt: der Betrag kommt NICHT ins Ledger, obwohl die Bank ihn meldet —
   * danach weicht der Kontostand ab. Deshalb sind es zwei Wörter und nicht eines.
   */
  async function weglegen(u: Umsatz, alsDublette: boolean) {
    await umsatzSpeichern(alsDublette ? alsDuplikat(u) : verwerfen(u));
    onGeaendert();
  }

  async function zurueck(u: Umsatz) {
    await umsatzSpeichern(zurueckholen(u));
    onGeaendert();
  }

  async function kategorieSetzen(u: Umsatz, kategorieId: string) {
    const kategorie = kategorien.find((k) => k.id === kategorieId);
    await umsatzSpeichern({
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

  if (zeilen.length === 0 && weggelegte.length === 0) return null;

  return (
    // Kein Sammel-Knopf mehr: was hier steht, ist je Zeile eine eigene Frage („ist das
    // dieselbe Buchung?"). Ein „alle bestätigen" darüber wäre genau die Geste, die den
    // Dublettenschutz aushebelt.
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      // Ohne wartende Zeile ist das hier keine Aufgabe mehr, sondern nur noch das
      // Archiv der weggelegten. Ein Kopf „Zu prüfen (0)" über 42 alten Zeilen las sich
      // wie offene Arbeit, wo keine ist — seit der Abruf direkt verbucht, ist das der
      // Normalzustand.
      title={
        zeilen.length > 0
          ? t("konten.neue.titel", { n: zeilen.length })
          : t("konten.neue.nurWeggelegtTitel")
      }
      subtitle={zeilen.length > 0 ? t("konten.neue.untertitel") : t("konten.neue.nurWeggelegtUntertitel")}
    >
      {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}

      {neuSortiert.map((u) => (
        <Zeile
          key={u.id}
          u={u}
          verdacht={geprueft.get(u.id)}
          kategorieName={kategorieName}
          kontoName={kontoName}
          gegenbein={
            u.vorschlag?.quelle === "umbuchung"
              ? gegenbeinFuer(u, alleNeuen.filter((x) => x.id !== u.id))
              : undefined
          }
          aktionen={
            <>
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
                <button className="linkbtn" onClick={() => void weglegen(u, !!geprueft.get(u.id))}>
                  {t(geprueft.get(u.id) ? "konten.neue.schonGebucht" : "konten.neue.verwerfen")}
                </button>
              </span>
            </>
          }
          nachtrag={
            aendertId === u.id ? (
              <div style={{ marginTop: "var(--sp-2)", maxWidth: 320 }}>
                <CategoryPicker
                  kategorien={[...kategorien]}
                  value={u.vorschlag?.kategorieId ?? ""}
                  onChange={(id) => void kategorieSetzen(u, id)}
                />
              </div>
            ) : undefined
          }
        />
      ))}

      {/* Ein Satz zur Folge, dauerhaft sichtbar statt einer Warnung pro Zeile: was
          verworfen wird, fehlt danach im Kontostand. */}
      {zeilen.length > 0 && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {t("konten.neue.verwerfenHinweis")}
        </div>
      )}

      {/* Der Rückweg. Zugeklappt, weil er kein Alltagsweg ist — aber vorhanden, sichtbar
          und mit Anzahl, damit man weiß, dass dort etwas liegt.
          Aufgeklappt steht dort DIESELBE Zeile wie oben, mit derselben Dublettenprüfung.
          Das ist der Punkt: ob eine weggelegte Zeile zurück soll, entscheidet sich genau
          daran, ob es ihr Gegenstück im Bestand wirklich gibt. Eine Zeile ohne Zwilling
          fehlt im Kontostand — und ohne die Prüfung sähe man ihr das nicht an. */}
      {weggelegte.length > 0 && (
        <div style={{ marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
          <button className="linkbtn" onClick={() => setZeigeWeggelegt((x) => !x)}>
            {t("konten.neue.weggelegt", { n: weggelegte.length })}
          </button>
          {zeigeWeggelegt && (
            <>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", margin: "var(--sp-2) 0" }}>
                {t("konten.neue.weggelegtHinweis")}
              </div>
              {weggelegtSortiert.map((u) => (
                <Zeile
                  key={u.id}
                  u={u}
                  verdacht={geprueftWeggelegt.get(u.id)}
                  kategorieName={kategorieName}
                  kontoName={kontoName}
                  status={t(`konten.neue.weggelegtStatus.${u.status}`)}
                  aktionen={
                    <span style={{ marginLeft: "auto" }}>
                      <button className="linkbtn" onClick={() => void zurueck(u)}>
                        {t("konten.neue.zurueckholen")}
                      </button>
                    </span>
                  }
                  hinweis={
                    geprueftWeggelegt.has(u.id)
                      ? t("konten.neue.weggelegtMitZwilling")
                      : t("konten.neue.weggelegtOhneZwilling", { betrag: geld.format(u.betrag) })
                  }
                />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Eine Zeile — für wartende UND weggelegte dieselbe.
 *
 * Bewusst eine Komponente und nicht zwei: die Frage, die man an eine weggelegte Zeile
 * hat, ist dieselbe wie an eine wartende — was steht drin, welche Kategorie hat sie
 * bekommen und woher, und gibt es das schon einmal? Zwei Darstellungen würden genau an
 * der Stelle auseinanderlaufen, an der man vergleicht.
 *
 * Unterschiedlich sind nur die Knöpfe (`aktionen`) und was darunter noch kommt.
 */
function Zeile({ u, verdacht, kategorieName, kontoName, gegenbein, status, aktionen, nachtrag, hinweis }: {
  u: Umsatz;
  verdacht?: { bewertung: Bewertung; zwilling?: Umsatz };
  kategorieName: Map<string, string>;
  kontoName: Map<string, string>;
  /** Das gefundene Gegenbein, wenn die Zeile als Umbuchung markiert ist. */
  gegenbein?: Umsatz;
  /** Eigener Status als Text — nur bei weggelegten, wo er die Auskunft ist. */
  status?: string;
  aktionen: ReactNode;
  nachtrag?: ReactNode;
  hinweis?: ReactNode;
}) {
  const { t } = useTranslation();
  const geld = useGeld();

  return (
    <div style={{ borderTop: "1px solid var(--line-soft)", padding: "var(--sp-3) 0" }}>
      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "baseline", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{u.buchungstag}</span>
        <strong>{u.gegenpartei || t("konten.neue.ohneGegenpartei")}</strong>
        {status && <Pill variant="neutral">{status}</Pill>}
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
        {aktionen}
      </div>

      {nachtrag}

      {u.vorschlag?.quelle === "umbuchung" && (
        <div style={{ marginTop: "var(--sp-2)" }}>
          {gegenbein ? (
            <>
              <Pill variant="um">{t("konten.neue.umbuchung")}</Pill>{" "}
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                {t("konten.neue.gegenbein", {
                  konto: kontoName.get(gegenbein.zahlungskontoId) ?? "?",
                  datum: gegenbein.buchungstag,
                  betrag: geld.format(gegenbein.betrag),
                })}
              </span>
            </>
          ) : (
            <Pill variant="um">{t("konten.neue.umbuchung")}</Pill>
          )}
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

      {hinweis && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)" }}>{hinweis}</div>
      )}
    </div>
  );
}
