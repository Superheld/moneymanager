// Der Buchungsdialog — EINE Maske für drei Rollen, samt der Wege, die von dort ausgehen:
// aufteilen (S-7), zur Umbuchung machen (S-1), Vertrag daraus machen, Paarung lösen.
//
//   • anlegen   — von Hand, es gibt noch nichts.        [Speichern]
//   • Entwurf   — eine Zeile von der Bank.  [Übernehmen] … [Verwerfen]
//   • bearbeiten— eine gebuchte Ist-Buchung. [Speichern] … [Löschen]
//
// Ein Dialog statt dreier: alle drei zeigen dieselben Felder, und jede Erweiterung wäre
// sonst mehrfach zu bauen oder bliebe auf einer Seite liegen — genau so fehlte im Anlegen
// das Konto. Was eine bestehende Buchung VORAUSSETZT (Aufteilung, Paarung, Vertragsspur,
// Merkmale), erscheint nur dort: vorher gibt es nichts, woran es hängen könnte.
//
// Der Entwurfs-Modus ist der wichtigste Unterschied zu vorher. Er schreibt NICHTS, bis
// man drückt: Öffnen, Ansehen, Wegklicken lässt die Zeile unverändert stehen. Vorher lief
// „bestätigen & bearbeiten" — erst verbuchen, dann den Bearbeiten-Dialog auf dem Ergebnis
// öffnen. Aus Nutzersicht verschwand die Zeile beim bloßen Hinsehen aus der Liste, und der
// einzige Ausweg hieß „Löschen", tat aber etwas anderes (siehe `entfernen`). Was die Bank
// gesagt hat — Tag und Betrag — ist im Entwurf FEST: das ist ihre Aussage, keine Eingabe.
// Korrigieren lässt sich beides nach dem Übernehmen, dann aber sichtbar an der Buchung.
//
// Eigene Datei, weil sie an mehreren Stellen gebraucht wird: im Konto-Auszug UND in der
// Übersicht, wo man beim Durchsehen einer Kategorie auf eine Buchung stößt, die korrigiert
// gehört. Sie lädt ihre Bezugsdaten (Konten, Kategorien, Umsätze, Import-Läufe, Regeln)
// deshalb SELBST, statt sie sich von jedem Aufrufer durchreichen zu lassen — ein Dialog
// wird selten geöffnet, und die Alternative wäre, jeden Screen mit Daten zu belasten, die
// nur dieser Dialog braucht.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  istGeteilt,
  minorZuMajor,
  musterVorschlag,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type Vertrag,
  type Vertragszuordnung,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { buchungBearbeiten, buchungErfassen, buchungLoeschen } from "../../application/buchungErfassen";
import {
  passtAlsGegenbein,
  ordneZu,
  umsaetzeVerbuchen,
  verwerfen,
  zuruecksetzen,
  type Bewertung,
  type ImportLauf,
  type Umsatz,
} from "../../application/import";
import { umbuchungLoeschen } from "../../application/umbuchungErfassen";
import { buchungSplitten, offenerRest, splitAufheben } from "../../application/buchungSplitten";
import {
  buchungenPaaren,
  gegenbeinErzeugen,
  paarungLoesen,
  paarungsKandidaten,
  umbuchungsBeinBearbeiten,
  MAX_VORSCHLAG_TAGE,
} from "../../application/umbuchungAusBuchung";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import {
  sqliteVertragszuordnungRepository as zuordnungRepo,
  vertragsAbgleichDeps as abgleichDeps,
} from "../persistence/sqliteVertragZuordnungRepositories";
import {
  zuordnungenAbgleichen,
  zuordnungVonHand,
  zuordnungZuruecksetzen,
} from "../../application/vertragszuordnung";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqliteUmsatzRepository as umsatzRepo,
  sqliteImportLaufRepository as importLaufRepo,
} from "../persistence/sqliteImportRepositories";
import { Button, FormField, Pill } from "./ds";
import { formularAusBuchung, VertragModal } from "./VertragModal";
import { CategoryPicker } from "./CategoryPicker";
import { MerkmaleBlock } from "./MerkmaleBlock";
import { festlegungSetzen } from "../../application/kategoriefestlegungen";
import { sqliteKategoriefestlegungRepository as festlegungRepo } from "../persistence/sqliteKategoriefestlegungRepository";
import { Modal } from "./Modal";
import { useGeld, useCharakterLabel, fehlerNachricht } from "./einstellungenKontext";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];

function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}
function betragFarbe(z: { betrag: number; charakter: Charakter }): string {
  if (z.betrag >= 0) return "var(--ok-deep)";
  return z.charakter === "Umschichtung" ? "var(--accent-deep)" : "var(--ink)";
}

/** Ein Label/Wert-Paar im Herkunfts-Abschnitt. Lange Werte (Hash, Zweck) dürfen umbrechen. */
function Infozeile({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "var(--sp-3)", padding: "5px 0", alignItems: "baseline" }}>
      <span style={{ flex: "0 0 34%", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: "var(--fw-semi)" }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, wordBreak: "break-word", fontFamily: mono ? "var(--font-mono, monospace)" : undefined, color: mono ? "var(--ink-2)" : "var(--ink)" }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Alles, was diese Buchung mit einem Vertrag verbindet — und die Wege, das zu ändern.
 * Als eigenes Objekt gebündelt, weil es sonst fünf weitere Einzel-Props an einem Modal
 * wären, das schon reichlich davon trägt.
 */
interface VertragsBindung {
  /** Der zugeordnete Vertrag, falls es einen gibt. */
  readonly vertrag?: Vertrag;
  /** Die gespeicherte Zuordnung — ihre Herkunft entscheidet, was angeboten wird. */
  readonly zuordnung?: Vertragszuordnung;
  /** Alle Verträge, zur Auswahl von Hand. */
  readonly alle: readonly Vertrag[];
  /** Von Hand setzen; `null` heißt „gehört ausdrücklich zu keinem Vertrag". */
  readonly zuordnen: (vertragId: string | null) => void | Promise<void>;
  /** Handentscheidung zurücknehmen — ab dann entscheidet wieder die Automatik. */
  readonly zuruecksetzen: () => void | Promise<void>;
  /** Aus dieser Buchung einen neuen Vertrag machen. */
  readonly neuAnlegen: () => void;
}

/**
 * Der Vertragsblock im Buchungsdialog. Drei Zustände an EINER Stelle, weil es dieselbe
 * Frage ist: gehört diese Zahlung zu einem Vertrag, zu keinem, oder soll sie einer werden?
 *
 * Sichtbar ist immer auch die HERKUNFT der Antwort. Das ist kein Beiwerk: „automatisch
 * erkannt" darf man überstimmen und der nächste Abgleich rechnet es neu, „von Hand"
 * bleibt stehen, bis man es zurücknimmt. Wer den Unterschied nicht sieht, weiß nicht,
 * ob seine Korrektur hält.
 */
function VertragsBlock({ bindung }: { bindung: VertragsBindung }) {
  const { t } = useTranslation();
  const { vertrag, zuordnung, alle } = bindung;
  const vonHand = zuordnung?.herkunft === "manuell";
  // Ausdrücklich zu keinem Vertrag: eine Aussage, kein fehlender Wert.
  const ausgeschlossen = vonHand && zuordnung?.vertragId === null;

  return (
    <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
        {vertrag ? (
          <>
            <Pill variant="ok">{t("konten.zuVertrag.gehoertZu")}</Pill>
            <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{vertrag.anbieter}</span>
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
              {t(vonHand ? "konten.zuVertrag.vonHand" : "konten.zuVertrag.automatisch")}
            </span>
          </>
        ) : ausgeschlossen ? (
          <>
            <Pill variant="neutral">{t("konten.zuVertrag.keiner")}</Pill>
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.zuVertrag.vonHand")}</span>
          </>
        ) : (
          <Button onClick={bindung.neuAnlegen}>{t("konten.zuVertrag.aktion")}</Button>
        )}
      </div>

      {/* Zuordnen von Hand — auch der Weg zurück: „kein Vertrag" ist eine gültige Wahl. */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <select
          className="field"
          style={{ width: "auto", maxWidth: "100%" }}
          aria-label={t("konten.zuVertrag.waehlen")}
          value={vertrag?.id ?? (ausgeschlossen ? "__keiner" : "")}
          onChange={(e) =>
            bindung.zuordnen(e.target.value === "__keiner" || e.target.value === "" ? null : e.target.value)
          }
        >
          <option value="">{t("konten.zuVertrag.offen")}</option>
          <option value="__keiner">{t("konten.zuVertrag.keiner")}</option>
          {alle.map((v) => (
            <option key={v.id} value={v.id}>{v.anbieter}</option>
          ))}
        </select>
        {vonHand && (
          <button className="linkbtn" onClick={() => bindung.zuruecksetzen()}>
            {t("konten.zuVertrag.zuruecksetzen")}
          </button>
        )}
      </div>

      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
        {t(vonHand ? "konten.zuVertrag.vonHandHinweis" : vertrag ? "konten.zuVertrag.gehoertZuHinweis" : "konten.zuVertrag.untertitel")}
      </div>
    </div>
  );
}

/** Was die Dublettenprüfung zu dieser Buchung sagt — samt der Zeile, die sie meint. */
export interface Dublettenbefund {
  readonly bewertung: Bewertung;
  readonly zwilling: Umsatz;
}

/**
 * Dublettenprüfung im Dialog: steht dasselbe womöglich schon ein zweites Mal im Bestand?
 *
 * Der Block erscheint NUR, wenn es etwas zu sagen gibt — der Finder urteilt „identisch"
 * oder „verdacht". Gerechnet wird beim Hinsehen und nicht einmalig beim Import: der
 * Verdacht, den ein Import an die Zeile schreibt, gilt für den Stand von damals, und was
 * später aus einer anderen Quelle dazukam, würde nie nachträglich angeschrieben.
 *
 * Er entscheidet nichts. Die Gründe stehen im Klartext da, das Gegenstück ist einen Klick
 * entfernt — beides zusammen ist die Auskunft, die man braucht, um selbst zu entscheiden,
 * welche der beiden Zeilen bleibt.
 */
function DublettenBlock({ befund, onZwillingOeffnen }: { befund: Dublettenbefund; onZwillingOeffnen?: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const { bewertung, zwilling } = befund;
  const sicher = bewertung.urteil === "identisch";

  return (
    <div style={{ marginBottom: "var(--sp-4)", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--warn-wash, var(--surface-2))", border: "1px solid var(--warn, var(--line))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Pill variant="warn">{t(sicher ? "konten.neue.dubletteSicher" : "konten.neue.dublette")}</Pill>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
          {ddmm(zwilling.buchungstag)} · {zwilling.gegenpartei || t("konten.neue.ohneGegenpartei")}
        </span>
        <span className="num" style={{ fontWeight: 700 }}>{geld.formatMitSymbol(zwilling.betrag, { mitVorzeichen: true })}</span>
        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
          {t(`konten.neue.status.${zwilling.status}`)}
        </span>
        {onZwillingOeffnen && (
          <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={onZwillingOeffnen}>
            {t("konten.dublette.oeffnen")}
          </button>
        )}
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
        {t("konten.neue.dubletteHinweis", { gruende: bewertung.gruende.join(", ") })}
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>{t("konten.dublette.hinweis")}</div>
    </div>
  );
}

/**
 * Die Maske selbst — alle drei Rollen in EINEM Formular.
 *
 * Welche gilt, entscheidet sich an den Daten, die hereinkommen:
 *  • weder `buchung` noch `entwurf` → anlegen (`buchungErfassen`)
 *  • `entwurf` → eine Bankzeile prüfen (`umsaetzeVerbuchen` bzw. `verwerfen`)
 *  • `buchung` → eine gebuchte Zeile ändern (`buchungBearbeiten`)
 *
 * Was daran hängt:
 *  1. Was man ändern darf — Konto, Datum, Betrag, Charakter, Notiz.
 *  2. Kategorie ODER Aufteilung (S-7) — eine Entscheidung, ein Block.
 *  3. Umbuchung — Einstieg (S-1) bzw. Gegenbuchung und Paarung lösen.
 *  4. Herkunft — was über die Zeile bekannt ist, aber nirgends änderbar.
 *
 * 2 (Aufteilung) und 3 setzen eine gespeicherte Buchung voraus und fehlen davor. Die
 * Kategorie ist überall wählbar, die Herkunft steht überall, wo es einen Umsatz gibt.
 *
 * Zu 4: Empfänger und Verwendungszweck hängen NICHT an der `IstBuchung`, sondern am
 * `Umsatz` (Import-Kontext, siehe ADR-0002) — hereingereicht statt hier nachgeladen,
 * der Screen hat die Zuordnung ohnehin schon.
 *
 * Zwei Gesichter beim Bearbeiten:
 *  • frei — alle Felder editierbar, plus der Einstieg „Zur Umbuchung machen" (S-1).
 *  • Bein einer Umbuchung — Konto, Betrag, Charakter und Kategorie sind FEST.
 *    `buchungBearbeiten` leitet das Vorzeichen über `vorzeichenbehaftet()` aus dem
 *    Charakter ab, und das macht eine Umschichtung immer negativ: das Zugangs-Bein (+500)
 *    würde beim Speichern auf −500 kippen und die Netto-Null der Umbuchung brechen. Das
 *    Konto wiederum steht als Gegenkonto am anderen Bein; ein einseitiger Wechsel zöge die
 *    Paarung auf zwei verschiedene Aussagen auseinander. Datum und Notiz sind unkritisch
 *    (die beiden Beine dürfen ohnehin an verschiedenen Tagen liegen).
 */
function BuchungFormular({ buchung, entwurf, andereEntwuerfe, alleBuchungen, vertraege, vorgabe, konten, kategorien, kontoName, kategorieName, umsatz, importLauf, regel, gegenbuchung, dublette, onZwillingOeffnen, onClose, onSaved, onDelete, onZurUmbuchung, vertragsBindung, onLoesen, onGegenbuchung, onSplitten, onSplitAufheben }: { buchung?: IstBuchung; entwurf?: Umsatz; andereEntwuerfe: readonly Umsatz[]; alleBuchungen: readonly IstBuchung[]; vertraege: readonly Vertrag[]; vorgabe: { kontoId: string; datum: string }; konten: Zahlungskonto[]; kategorien: Kategorie[]; kontoName: Map<string, string>; umsatz?: Umsatz; importLauf?: ImportLauf; regel?: Zahlungsregel; gegenbuchung?: IstBuchung; dublette?: Dublettenbefund; onZwillingOeffnen?: () => void; kategorieName: Map<string, string>; onClose: () => void; onSaved: () => void; onDelete: () => void | Promise<void>; onZurUmbuchung: () => void; vertragsBindung?: VertragsBindung; onLoesen: () => void | Promise<void>; onGegenbuchung: (b: IstBuchung) => void; onSplitten: () => void; onSplitAufheben: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const charakterLabel = useCharakterLabel();
  const istEntwurf = !!entwurf;
  const istNeu = !buchung && !entwurf;
  const [kontoId, setKontoId] = useState(buchung?.kontoId ?? entwurf?.zahlungskontoId ?? vorgabe.kontoId);
  const [datum, setDatum] = useState(buchung?.datum ?? entwurf?.buchungstag ?? vorgabe.datum);
  const startBetrag = buchung?.betrag ?? entwurf?.betrag;
  const [betrag, setBetrag] = useState(startBetrag == null ? "" : String(minorZuMajor(Math.abs(startBetrag), geld.waehrung)));
  const [charakter, setCharakter] = useState<Charakter>(buchung?.charakter ?? entwurf?.vorschlag?.charakter ?? "Aufwand");
  const [kategorieId, setKategorieId] = useState(buchung?.kategorieId ?? entwurf?.vorschlag?.kategorieId ?? "");
  const [notiz, setNotiz] = useState(buchung?.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // „Immer bei diesem Empfänger" — nur angeboten, wenn die Kategorie hier gerade
  // GEÄNDERT wird. Ein dauerhaft sichtbarer Haken wäre eine Einladung, beim Durchsehen
  // nebenbei Regeln anzulegen; die Festlegung soll aus einer Korrektur entstehen.
  const [immer, setImmer] = useState(false);
  const gepaart = !!buchung?.transferId;
  const geteilt = !!buchung && istGeteilt(buchung);
  const musterAngebot = musterVorschlag(umsatz?.gegenpartei ?? "");
  const kategorieGeaendert = kategorieId !== (buchung?.kategorieId ?? entwurf?.vorschlag?.kategorieId ?? "");
  const konto = konten.find((k) => k.id === kontoId);
  const istUmschichtung = charakter === "Umschichtung";
  const andereKonten = konten.filter((k) => k.id !== kontoId);

  // ── Gegenbein-Suche im Entwurf ──────────────────────────────────────────────────────
  //
  // Eine Umschichtung hat zwei Seiten, und die zweite liegt auf einem anderen Konto. Wo
  // sie steckt, ist offen: sie kann als zweiter Entwurf danebenliegen, längst gebucht
  // sein (das andere Bein kam mit einem früheren Abruf), gar nicht existieren (Bargeld
  // wird nicht importiert) — oder es ist wirklich nur eine Seite.
  //
  // ZWEI Zeitfenster, und das ist kein Versehen: Entwürfe werden beim Übernehmen von
  // `paareUmbuchungen` verknüpft, und die Regel dort erlaubt 3 Tage. Ein weiter entfernter
  // Entwurf ließe sich hier auswählen, würde beim Verbuchen aber nicht gepaart — zwei
  // halbe Umschichtungen. Bei gebuchten Zeilen paart `buchungenPaaren` auf Zuruf, ohne
  // Fenster; da gilt das großzügigere Vorschlags-Fenster wie im Umbuchungs-Dialog.
  const entwurfKandidaten = useMemo(
    () =>
      istEntwurf && istUmschichtung
        ? andereEntwuerfe.filter((x) => passtAlsGegenbein({ ...entwurf!, zahlungskontoId: kontoId }, x))
        : [],
    [istEntwurf, istUmschichtung, andereEntwuerfe, entwurf, kontoId],
  );
  const buchungKandidaten = useMemo(
    () =>
      istEntwurf && istUmschichtung
        ? paarungsKandidaten(alleBuchungen, {
            id: "", datum: entwurf!.buchungstag, betrag: entwurf!.betrag,
            kontoId, charakter: "Umschichtung", quelle: "import",
          })
        : [],
    [istEntwurf, istUmschichtung, alleBuchungen, entwurf, kontoId],
  );

  /** Auswahlwerte: `e:<id>` Entwurf, `b:<id>` gebucht, `__neu` erzeugen, `__einseitig`. */
  const gegenOptionen = [
    ...entwurfKandidaten.map((x) => `e:${x.id}`),
    ...buchungKandidaten.map((x) => `b:${x.id}`),
    ...(andereKonten.length > 0 ? ["__neu"] : []),
    "__einseitig",
  ];
  const [gegenwahl, setGegenwahl] = useState<string>("");
  // Leer starten und beim Lesen auffüllen: die Kontenliste wird asynchron nachgeladen,
  // ein useState-Initialwert liefe gegen die noch leere Liste und bliebe dann leer.
  const [neuKontoId, setNeuKontoId] = useState("");
  const neuKontoGewaehlt = andereKonten.some((k) => k.id === neuKontoId) ? neuKontoId : (andereKonten[0]?.id ?? "");
  // Das Konto zu wechseln ändert die Kandidatenliste. Statt die Wahl per Effekt
  // nachzuziehen (und dabei einen Render mit ungültigem Wert zu riskieren) wird sie beim
  // Lesen geprüft: was nicht mehr angeboten wird, fällt auf die beste Vorgabe zurück.
  const gegenGewaehlt = gegenOptionen.includes(gegenwahl) ? gegenwahl : (gegenOptionen[0] ?? "__einseitig");

  /** Vorgemerkte Vertragszuordnung — gesetzt wird sie erst nach dem Übernehmen. */
  const [vertragWahl, setVertragWahl] = useState<string>("");

  /**
   * Der Umsatz mit dem, was hier entschieden wurde — Konto und Vorschlag.
   *
   * Tag und Betrag fehlen absichtlich: sie sind die Aussage der Bank. Die Quelle des
   * Vorschlags springt nur auf „manuell", wenn wirklich etwas geändert wurde; sonst bliebe
   * von der Herkunft („vom Modell erkannt", „durch deine Festlegung") nichts übrig,
   * nur weil jemand den Dialog geöffnet hat.
   */
  function entwurfMitEntscheidung(u: Umsatz): Umsatz {
    const geaendert = kategorieId !== (u.vorschlag?.kategorieId ?? "") || charakter !== (u.vorschlag?.charakter ?? "Aufwand");
    return {
      ...u,
      zahlungskontoId: kontoId,
      vorschlag:
        charakter === "Umschichtung"
          ? { charakter: "Umschichtung", quelle: "umbuchung" }
          : {
              kategorieId: kategorieId || undefined,
              charakter,
              quelle: geaendert ? "manuell" : (u.vorschlag?.quelle ?? "manuell"),
            },
    };
  }

  async function speichern() {
    setFehler(null);
    setBusy(true);
    try {
      if (entwurf) {
        // Ein Entwurfs-Gegenbein kommt in DENSELBEN Lauf: `paareUmbuchungen` verknüpft die
        // beiden Seiten, indem es sie zusammen sieht. Einzeln übernommen entstünden zwei
        // halbe Umschichtungen statt eines Übertrags.
        const partnerEntwurf = gegenGewaehlt.startsWith("e:")
          ? andereEntwuerfe.find((x) => x.id === gegenGewaehlt.slice(2))
          : undefined;
        const auswahl = partnerEntwurf
          ? [entwurfMitEntscheidung(entwurf), { ...partnerEntwurf, vorschlag: { charakter: "Umschichtung" as const, quelle: "umbuchung" as const } }]
          : [entwurfMitEntscheidung(entwurf)];
        await umsaetzeVerbuchen(auswahl, {
          ledgerRepo,
          umsatzRepo,
          id: () => crypto.randomUUID(),
        });

        // Alles Weitere hängt an der Ist-Buchung, die es vorher nicht gab: Paarung mit
        // einer schon gebuchten Zeile, ein erzeugtes Gegenbein, die Vertragszuordnung.
        // Deshalb wird die frisch entstandene Buchung hier nachgeschlagen — im Dialog
        // entschieden, nach dem Verbuchen angewandt.
        const frisch = (await umsatzRepo.alle()).find((x) => x.id === entwurf.id);
        const neueBuchung = frisch?.istbuchungId
          ? (await ledgerRepo.alle()).find((b) => b.id === frisch.istbuchungId)
          : undefined;

        if (neueBuchung && istUmschichtung) {
          if (gegenGewaehlt.startsWith("b:")) {
            const gegen = alleBuchungen.find((b) => b.id === gegenGewaehlt.slice(2));
            if (gegen) await buchungenPaaren(ledgerRepo, neueBuchung, gegen);
          } else if (gegenGewaehlt === "__neu" && neuKontoGewaehlt) {
            await gegenbeinErzeugen(ledgerRepo, neueBuchung, neuKontoGewaehlt);
          }
        }

        // Frisch verbuchte Zahlungen den Verträgen zuordnen — derselbe Schritt wie in der
        // Inbox. Er gehört nicht in den Verbuchen-Use-Case: der schreibt Fakten, die
        // Zuordnung ist eine Interpretation darüber.
        await zuordnungenAbgleichen(abgleichDeps);
        // ZULETZT die Handentscheidung: sie überstimmt, was der Abgleich gerechnet hat.
        if (neueBuchung && vertragWahl && !istUmschichtung) {
          await zuordnungVonHand(zuordnungRepo, neueBuchung.id, vertragWahl === "__keiner" ? null : vertragWahl);
        }
      } else if (!buchung) {
        await buchungErfassen(ledgerRepo, { kontoId, datum, betrag: geld.parse(betrag) ?? 0, charakter, kategorieId: kategorieId || undefined, notiz });
      } else if (gepaart) {
        await umbuchungsBeinBearbeiten(ledgerRepo, buchung, { datum, notiz });
      } else {
        await buchungBearbeiten(ledgerRepo, buchung, { datum, betrag: geld.parse(betrag) ?? 0, charakter, kategorieId: kategorieId || undefined, notiz, kontoId });
        // Zieht das Konto um, zieht der Umsatz mit: sein `zahlungskontoId` ist das
        // Ergebnis des Konto-Matches beim Import, also eine Vermutung. Wer die Buchung
        // vor sich hat, korrigiert damit genau diese Vermutung — bliebe der Umsatz
        // stehen, zeigte die Herkunft weiter aufs alte Konto und die Dublettenprüfung
        // verglichen gegen den falschen Bestand.
        if (umsatz && kontoId !== umsatz.zahlungskontoId) {
          await umsatzRepo.speichern({ ...umsatz, zahlungskontoId: kontoId });
        }
        // Die Festlegung entsteht NACH der Buchung: schlüge das Speichern fehl, stünde
        // sonst eine Regel für eine Änderung, die es nicht gibt.
        if (immer && kategorieId && musterAngebot) {
          await festlegungSetzen(festlegungRepo, musterAngebot, kategorieId);
        }
      }
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  /** Verworfen ist verworfen: die Zeile bleibt gespeichert, aber markiert und übersprungen. */
  async function verwerfenEntwurf() {
    if (!entwurf) return;
    setFehler(null);
    setBusy(true);
    try {
      await umsatzRepo.speichern(verwerfen(entwurf));
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  const kopfUmsatz = entwurf ?? umsatz;

  return (
    <Modal
      title={
        istEntwurf
          ? t("konten.entwurf.titel")
          : istNeu
            ? t("konten.buchung.titel", { konto: konto?.bezeichnung ?? "" })
            : t("konten.detail.titel")
      }
      subtitle={
        istEntwurf
          ? t("konten.entwurf.untertitel")
          : istNeu
            ? konto && konto.typ !== "Bargeld"
              ? t("konten.buchung.untertitelVorlaeufig")
              : t("konten.buchung.untertitelBargeld")
            : buchung?.quelle === "import"
              ? t("konten.editUntertitelImport")
              : undefined
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>
            {istEntwurf ? (busy ? t("konten.entwurf.laeuft") : t("konten.entwurf.uebernehmen")) : t("konten.speichern")}
          </Button>
          <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
          {istEntwurf && (
            <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={() => verwerfenEntwurf()}>
              {t("konten.entwurf.verwerfen")}
            </button>
          )}
          {buchung && (
            <button className="linkbtn" style={{ marginLeft: "auto", color: "var(--danger, #c0392b)" }} onClick={() => onDelete()}>{t("konten.loeschen")}</button>
          )}
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      {/* Kopf: worum es geht — Empfänger und Betrag, die beiden Dinge, an denen man
          eine Buchung wiedererkennt. Der Empfänger kommt aus dem Umsatz. Beim Anlegen
          von Hand gibt es beides noch nicht; dort steht direkt das Formular. */}
      {(buchung || entwurf) && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-h)" }}>
              {kopfUmsatz?.gegenpartei || buchung?.notiz || kontoName.get(kontoId) || ""}
            </span>
            <span className="muted" style={{ display: "block", fontSize: "var(--fs-xs)", marginTop: 4 }}>
              {ddmm(buchung?.datum ?? entwurf!.buchungstag)} · {kontoName.get(kontoId) ?? "?"}
            </span>
          </span>
          <span className="num" style={{ fontSize: "var(--fs-h2, var(--fs-h3))", fontWeight: "var(--fw-black)", color: betragFarbe({ betrag: buchung?.betrag ?? entwurf!.betrag, charakter }) }}>
            {geld.formatMitSymbol(buchung?.betrag ?? entwurf!.betrag, { mitVorzeichen: true })}
          </span>
        </div>
      )}

      {/* Ganz oben, noch vor den Feldern: die Frage, ob es diese Buchung schon gibt. Sie
          geht allem voraus — an einer Zeile, die gar nicht bleiben soll, lohnt sich keine
          Korrektur. */}
      {dublette && <DublettenBlock befund={dublette} onZwillingOeffnen={onZwillingOeffnen} />}

      <div className="form-grid">
        {/* Das Konto ist änderbar (außer bei einer Paarung): bei importierten Buchungen ist
            es geraten, und beim Erfassen von Hand muss es überhaupt erst gewählt werden. */}
        <FormField label={t("konten.detail.konto")} required hint={gepaart ? t("konten.detail.kontoGepaart") : undefined}>
          {/* aria-label, weil das DS-FormField sein <label> nicht mit dem Feld verknüpft
              (kein htmlFor, kein Umschließen) — ohne das hat die Auswahl für Screenreader
              gar keinen Namen. Gilt für die drei Felder hier; die DS-Lücke selbst gehört
              dort behoben. */}
          <select className="field" aria-label={t("konten.detail.konto")} value={kontoId} disabled={gepaart} onChange={(e) => setKontoId(e.target.value)}>
            {konten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
          </select>
        </FormField>
        {/* Tag und Betrag der Bank sind Tatsachen, keine Eingabe — im Entwurf stehen sie
            nur da. Wer korrigieren muss, tut das nach dem Übernehmen an der Buchung. */}
        <FormField label={t("konten.feldDatum")} required hint={istEntwurf ? t("konten.entwurf.vonDerBank") : undefined}>
          <input className="field" type="date" aria-label={t("konten.feldDatum")} value={datum} disabled={istEntwurf} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        <FormField
          label={t("konten.feldBetrag")}
          required
          hint={istEntwurf ? t("konten.entwurf.vonDerBank") : istNeu ? t("konten.buchung.betragHinweis") : undefined}
        >
          <input className="field" inputMode="decimal" aria-label={t("konten.feldBetrag")} value={betrag} disabled={gepaart || istEntwurf} onChange={(e) => setBetrag(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        {!gepaart && (
          <FormField label={t("konten.feldCharakter")}>
            <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
              {CHARAKTERE.map((c) => (<option key={c} value={c}>{charakterLabel(c)}</option>))}
            </select>
          </FormField>
        )}
        {/* Die Notiz gehört an die Ist-Buchung. Ein Entwurf trägt keine — er trägt den
            Verwendungszweck der Bank, und der steht unter „Herkunft". */}
        {!istEntwurf && (
          <FormField label={t("konten.feldNotiz")} hint={t("konten.optional")}>
            <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.buchung.notizPlatzhalter")} />
          </FormField>
        )}
      </div>

      {/* Umbuchung im Entwurf (S-1 vor dem Verbuchen). Derselbe Zuschnitt wie im
          Umbuchungs-Dialog der gebuchten Zeile: die Liste beantwortet die Frage, welcher
          Fall vorliegt, statt sie vorher zu verlangen. Welche Seite gewählt ist, muss VOR
          dem Drücken dastehen — sonst entsteht lautlos eine einseitige Umschichtung. */}
      {istEntwurf && (
        <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
          {!istUmschichtung ? (
            <>
              <Button onClick={() => setCharakter("Umschichtung")}>{t("konten.zurUmbuchung.aktion")}</Button>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("konten.zurUmbuchung.untertitel")}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
                <Pill variant="um">{t("konten.paarung.titel")}</Pill>
                <span style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)" }}>
                  {t("konten.zurUmbuchung.kandidatenTitel")}
                </span>
                <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={() => setCharakter("Aufwand")}>
                  {t("konten.entwurf.dochKeineUmbuchung")}
                </button>
              </div>

              {entwurfKandidaten.map((k) => (
                <label key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}>
                  <input type="radio" name="entwurfGegenbein" checked={gegenGewaehlt === `e:${k.id}`} onChange={() => setGegenwahl(`e:${k.id}`)} style={{ accentColor: "var(--accent-deep)" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(k.buchungstag)}</span>
                  <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)", flex: 1, minWidth: 0 }}>
                    {kontoName.get(k.zahlungskontoId) ?? "?"}
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{t("konten.neue.status.neu")}</span>
                  </span>
                  <span className="num" style={{ fontWeight: 700 }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
                </label>
              ))}

              {buchungKandidaten.map((k) => (
                <label key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}>
                  <input type="radio" name="entwurfGegenbein" checked={gegenGewaehlt === `b:${k.id}`} onChange={() => setGegenwahl(`b:${k.id}`)} style={{ accentColor: "var(--accent-deep)" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(k.datum)}</span>
                  <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)", flex: 1, minWidth: 0 }}>
                    {kontoName.get(k.kontoId) ?? "?"}
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{t("konten.neue.status.verbucht")}</span>
                  </span>
                  <span className="num" style={{ fontWeight: 700, color: betragFarbe(k) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
                </label>
              ))}

              {/* Ausweg: kein Gegenbein vorhanden (S-1a) — typisch Bargeld. */}
              {andereKonten.length > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer", flexWrap: "wrap" }}>
                  <input type="radio" name="entwurfGegenbein" checked={gegenGewaehlt === "__neu"} onChange={() => setGegenwahl("__neu")} style={{ accentColor: "var(--accent-deep)" }} />
                  <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.zurUmbuchung.neu")}</span>
                  <select className="field" style={{ width: "auto" }} aria-label={t("konten.zurUmbuchung.neu")} value={neuKontoGewaehlt} onChange={(e) => { setNeuKontoId(e.target.value); setGegenwahl("__neu"); }}>
                    {andereKonten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
                  </select>
                </label>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
                <input type="radio" name="entwurfGegenbein" checked={gegenGewaehlt === "__einseitig"} onChange={() => setGegenwahl("__einseitig")} style={{ accentColor: "var(--accent-deep)" }} />
                <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.entwurf.einseitig")}</span>
              </label>

              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {gegenGewaehlt === "__einseitig" ? t("konten.neue.ohneGegenbein") : t("konten.zurUmbuchung.neuHinweis")}
              </div>
            </>
          )}
        </div>
      )}

      {/* Kategorie ODER Aufteilung — nie beides. `buchungSplitten` löscht die Kategorie,
          wenn Teile entstehen; die Aufteilung ist ab dann die Wahrheit. Solange beides
          getrennt im Dialog stand (Kategorie oben, Aufteilung unter der Umbuchung), sah es
          aus wie zwei unabhängige Angaben — und man konnte einer geteilten Buchung wieder
          eine Kategorie geben, also genau den Zustand herstellen, den das Modell ausschließt.
          Jetzt EIN Block, der zeigt, welcher der beiden Fälle gerade gilt. */}
      {!gepaart && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          {geteilt && buchung ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)" }}>
                  {t("konten.split.abschnitt")}
                </span>
                <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={onSplitten}>{t("konten.split.bearbeiten")}</button>
                <button className="linkbtn" onClick={() => onSplitAufheben()}>{t("konten.split.aufheben")}</button>
              </div>
              {(buchung.aufteilungen ?? []).map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", padding: "5px 0", borderBottom: "1px solid var(--line-soft)" }}>
                  <span style={{ fontSize: 13, minWidth: 0 }}>
                    {kategorieName.get(a.kategorieId) ?? "?"}
                    {a.notiz && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{a.notiz}</span>}
                  </span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {geld.formatMitSymbol(a.betrag, { mitVorzeichen: true })}
                  </span>
                </div>
              ))}
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.split.stattKategorie")} {t("konten.split.aufhebenHinweis")}</div>
            </>
          ) : charakter === "Umschichtung" && istEntwurf ? (
            // Verschobenes Geld zählt nicht ins Budget — eine Kategorie gäbe es nicht.
            <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.zurUmbuchung.kategorieHinweis")}</div>
          ) : (
            <>
              <FormField label={t("konten.feldKategorie")} hint={t("konten.optional")}>
                <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
              </FormField>
              {kategorieGeaendert && kategorieId && musterAngebot && !istEntwurf && (
                <label style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", marginTop: 6, fontSize: "var(--fs-xs)" }}>
                  <input type="checkbox" checked={immer} onChange={(e) => setImmer(e.target.checked)} />
                  <span>
                    {t("konten.festlegung.immer", { muster: musterAngebot })}
                    <span className="muted" style={{ display: "block" }}>{t("konten.festlegung.hinweis")}</span>
                  </span>
                </label>
              )}
              {/* Aufteilen setzt eine gespeicherte Buchung voraus — es verteilt deren
                  Betrag, und der ist vorher noch nicht gebucht. */}
              {buchung && (
                <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                  <button className="linkbtn" onClick={onSplitten}>{t("konten.split.aktion")}</button>
                  {" · "}
                  {t("konten.split.untertitel")}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Was die automatische Erkennung aus dieser Buchung macht — und die Stelle, an
          der sich ihre Wortlisten am konkreten Fall pflegen lassen. */}
      {buchung && <MerkmaleBlock buchung={buchung} umsatz={umsatz} />}

      {/* Umbuchungs-Abschnitt: Einstieg (S-1) bzw. Gegenbuchung und Paarung lösen. Beides
          braucht eine gespeicherte Buchung — gepaart wird im Ledger. */}
      {buchung && (
        <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
          {gepaart ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <Pill variant="um">{t("konten.paarung.titel")}</Pill>
                <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
                  {t("konten.paarung.gegenkonto")}: {kontoName.get(buchung.gegenkontoId ?? "") ?? "?"}
                </span>
                <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={() => onLoesen()}>{t("konten.paarung.loesen")}</button>
              </div>

              {/* Sprung ins andere Bein — derselbe Dialog, andere Buchung. */}
              {gegenbuchung && (
                <button
                  className="linkbtn"
                  title={t("konten.paarung.gegenbuchungOeffnen")}
                  onClick={() => onGegenbuchung(gegenbuchung)}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, marginTop: 8, padding: "8px 10px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", textAlign: "left" }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(gegenbuchung.datum)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
                    {t("konten.paarung.gegenbuchung")} · {kontoName.get(gegenbuchung.kontoId) ?? "?"}
                  </span>
                  <span className="num" style={{ fontWeight: 700, color: betragFarbe(gegenbuchung) }}>
                    {geld.formatMitSymbol(gegenbuchung.betrag, { mitVorzeichen: true })}
                  </span>
                  <span aria-hidden style={{ color: "var(--ink-3)" }}>›</span>
                </button>
              )}

              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("konten.paarung.loesenHinweis")} {t("konten.paarung.loeschtBeide")}
              </div>
            </>
          ) : (
            <>
              <Button onClick={onZurUmbuchung}>{t("konten.zurUmbuchung.aktion")}</Button>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("konten.zurUmbuchung.untertitel")}
              </div>
            </>
          )}
        </div>
      )}

      {/* Vertrag — nicht bei Umbuchungs-Beinen: eine Umbuchung aufs eigene Sparkonto ist
          perfekt regelmäßig und trotzdem kein Vertrag (dieselbe Grenze zieht die
          Erkennung, siehe core/vertragZuordnung#passtZu). */}
      {!gepaart && vertragsBindung && <VertragsBlock bindung={vertragsBindung} />}

      {/* Vertrag im Entwurf: eine VORMERKUNG. Die Zuordnung hängt an der Ist-Buchung
          (`Vertragszuordnung.istbuchungId`), die es hier noch nicht gibt — also wird die
          Wahl gemerkt und direkt nach dem Übernehmen gesetzt, nach dem automatischen
          Abgleich, damit die Handentscheidung das letzte Wort behält.
          Kein „Vertrag daraus machen": das öffnet einen zweiten Dialog, und der Entwurf
          verlöre dabei alles hier Eingestellte, weil noch nichts gespeichert ist. Aus
          einer übernommenen Buchung geht es weiterhin. */}
      {istEntwurf && !istUmschichtung && (
        <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
            {t("konten.zuVertrag.gehoertZu")}
          </div>
          <select
            className="field"
            style={{ width: "auto", maxWidth: "100%" }}
            aria-label={t("konten.zuVertrag.waehlen")}
            value={vertragWahl}
            onChange={(e) => setVertragWahl(e.target.value)}
          >
            <option value="">{t("konten.zuVertrag.offen")}</option>
            <option value="__keiner">{t("konten.zuVertrag.keiner")}</option>
            {vertraege.map((v) => (<option key={v.id} value={v.id}>{v.anbieter}</option>))}
          </select>
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
            {vertragWahl ? t("konten.entwurf.vertragVorgemerkt") : t("konten.entwurf.vertragOffen")}
          </div>
        </div>
      )}

      {/* Herkunft — alles, was bekannt ist, aber hier nicht geändert wird. */}
      {(buchung || entwurf) && (
        <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
            {t("konten.detail.herkunft")}
          </div>

          {buchung && <Infozeile label={t("konten.detail.erfasstUeber")}>{t(`konten.quelleName.${buchung.quelle}`)}</Infozeile>}

          {kopfUmsatz ? (
            <>
              <Infozeile label={t("konten.detail.empfaenger")}>{kopfUmsatz.gegenpartei || "—"}</Infozeile>
              <Infozeile label={t("konten.detail.zweck")}>{kopfUmsatz.verwendungszweck || "—"}</Infozeile>
              {importLauf && (
                <Infozeile label={t("konten.detail.importlauf")}>
                  {t("konten.detail.importlaufWert", {
                    quelle: importLauf.dateiname || importLauf.quelle,
                    zeitpunkt: importLauf.zeitpunkt.slice(0, 10),
                  })}
                </Infozeile>
              )}
              {kopfUmsatz.nativeId && <Infozeile label={t("konten.detail.nativeId")} mono>{kopfUmsatz.nativeId}</Infozeile>}
              <Infozeile label={t("konten.detail.rohHash")} mono>{kopfUmsatz.rohHash}</Infozeile>
            </>
          ) : (
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.detail.ohneImport")}</div>
          )}

          {buchung?.planRef && (
            <Infozeile label={t("konten.detail.planbezug")}>
              {t("konten.detail.planbezugWert", {
                regel: regel?.bezeichnung ?? buchung.planRef.quelleId,
                faelligkeit: ddmm(buchung.planRef.faelligkeit),
              })}
            </Infozeile>
          )}
        </div>
      )}

      {/* Was hier NICHT geht und warum — statt Knöpfen, die ins Leere greifen. */}
      {istEntwurf && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {t("konten.entwurf.spaeterHinweis")}
        </div>
      )}

      {/* „Löschen" sagt nicht die ganze Wahrheit, wenn die Buchung aus einem Import
          stammt: die Bankzeile bleibt und steht danach wieder unter den Entwürfen. Wer
          sie endgültig weghaben will, verwirft sie dort. */}
      {buchung?.quelle === "import" && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {t("konten.detail.loeschenHinweis")}
        </div>
      )}
    </Modal>
  );
}

/**
 * S-7 — Buchung auf mehrere Kategorien aufteilen. Der Betrag der Buchung bleibt, was er
 * ist; verteilt wird nur die Kategorie-Zuordnung. Der Dialog lässt sich nicht speichern,
 * solange der Rest nicht null ist — die Invariante steht im Use-Case, hier wird sie nur
 * früh genug sichtbar gemacht.
 *
 * Beträge werden POSITIV eingegeben; das Vorzeichen kommt von der Buchung.
 */
function SplitModal({ buchung, kategorien, onClose, onSaved }: { buchung: IstBuchung; kategorien: Kategorie[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();

  /** Vorbelegung: eine bestehende Aufteilung weiterbearbeiten, sonst zwei leere Zeilen. */
  const [zeilen, setZeilen] = useState<{ kategorieId: string; betrag: string; notiz: string }[]>(() =>
    buchung.aufteilungen?.length
      ? buchung.aufteilungen.map((a) => ({
          kategorieId: a.kategorieId,
          betrag: String(minorZuMajor(Math.abs(a.betrag), geld.waehrung)),
          notiz: a.notiz ?? "",
        }))
      : [
          { kategorieId: buchung.kategorieId ?? "", betrag: String(minorZuMajor(Math.abs(buchung.betrag), geld.waehrung)), notiz: "" },
          { kategorieId: "", betrag: "", notiz: "" },
        ],
  );
  const [fehler, setFehler] = useState<string | null>(null);

  const eingaben = zeilen.map((z) => ({ kategorieId: z.kategorieId, betrag: geld.parse(z.betrag) ?? 0, notiz: z.notiz }));
  const rest = offenerRest(buchung, eingaben);
  const verteilt = Math.abs(buchung.betrag) - rest;

  function aendere(i: number, feld: "kategorieId" | "betrag" | "notiz", wert: string) {
    setZeilen((zs) => zs.map((z, j) => (j === i ? { ...z, [feld]: wert } : z)));
  }

  /** Den offenen Rest in eine Zeile übernehmen — spart das Kopfrechnen bei drei Teilen. */
  function restEinsetzen(i: number) {
    const schon = geld.parse(zeilen[i].betrag) ?? 0;
    setZeilen((zs) => zs.map((z, j) => (j === i ? { ...z, betrag: String(minorZuMajor(schon + rest, geld.waehrung)) } : z)));
  }

  async function speichern() {
    setFehler(null);
    try {
      await buchungSplitten(ledgerRepo, buchung, eingaben);
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.split.titel")}
      subtitle={t("konten.split.untertitel")}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button>
          <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.split.gesamt")}</span>
        <span className="num" style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-black)", color: betragFarbe(buchung) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      {zeilen.map((z, i) => (
        <div key={i} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
          <span style={{ flex: "2 1 180px", minWidth: 150 }}>
            <CategoryPicker kategorien={kategorien} value={z.kategorieId} onChange={(v) => aendere(i, "kategorieId", v)} />
          </span>
          <input
            className="field"
            inputMode="decimal"
            style={{ flex: "0 1 110px", minWidth: 90 }}
            value={z.betrag}
            onChange={(e) => aendere(i, "betrag", e.target.value)}
            placeholder={geld.format(0)}
            aria-label={`${t("konten.split.spalteBetrag")} ${i + 1}`}
          />
          {rest !== 0 && (
            <button className="linkbtn" title={t("konten.split.restVerteilen")} onClick={() => restEinsetzen(i)} style={{ padding: "6px 4px" }}>+</button>
          )}
          {zeilen.length > 2 && (
            <button className="linkbtn" onClick={() => setZeilen((zs) => zs.filter((_, j) => j !== i))}>
              {t("konten.split.zeileEntfernen")}
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: "var(--sp-3)" }}>
        <Button plus onClick={() => setZeilen((zs) => [...zs, { kategorieId: "", betrag: "", notiz: "" }])}>
          {t("konten.split.zeileHinzufuegen")}
        </Button>
        <span style={{ fontSize: 13, fontWeight: "var(--fw-bold)", color: rest === 0 ? "var(--ok-deep)" : "var(--warn-deep)" }}>
          {rest === 0
            ? t("konten.split.restPasst")
            : rest > 0
              ? t("konten.split.restOffen", { betrag: geld.formatMitSymbol(rest) })
              : t("konten.split.restZuviel", { betrag: geld.formatMitSymbol(-rest) })}
        </span>
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
        {t("konten.split.hinweisPositiv")} · {t("konten.split.verteilt")}: {geld.formatMitSymbol(verteilt)}
      </div>
    </Modal>
  );
}

/**
 * S-1 — macht aus einer bestehenden Buchung eine Umbuchung. EIN Dialog für beide Fälle:
 * oben die passenden Gegenbuchungen (S-1b, nachträgliche Paarung), darunter der Ausweg
 * „Gegenbein neu erzeugen" (S-1a, Zielkonto wird nicht importiert). Der Nutzer soll nicht
 * vorher wissen müssen, welcher Fall vorliegt — die Liste beantwortet das.
 */
function ZurUmbuchungModal({ buchung, konten, alleBuchungen, kontoName, umsatzByIst, onClose, onSaved }: { buchung: IstBuchung; konten: Zahlungskonto[]; alleBuchungen: IstBuchung[]; kontoName: Map<string, string>; umsatzByIst: Map<string, Umsatz>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const kandidaten = useMemo(() => paarungsKandidaten(alleBuchungen, buchung), [alleBuchungen, buchung]);
  const andereKonten = konten.filter((k) => k.id !== buchung.kontoId);
  // Vorauswahl: der beste Kandidat, sonst der Weg über ein neu erzeugtes Gegenbein.
  const [wahl, setWahl] = useState<string>(kandidaten[0]?.id ?? "__neu");
  const [neuKontoId, setNeuKontoId] = useState(andereKonten[0]?.id ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  /** Beschriftung einer Gegenbuchung: Empfänger aus dem Import, sonst Notiz. */
  function kandidatLabel(k: IstBuchung): string {
    return umsatzByIst.get(k.id)?.gegenpartei || k.notiz || "";
  }

  async function speichern() {
    setFehler(null);
    try {
      if (wahl === "__neu") {
        await gegenbeinErzeugen(ledgerRepo, buchung, neuKontoId);
      } else {
        const gegen = alleBuchungen.find((b) => b.id === wahl);
        if (!gegen) return;
        await buchungenPaaren(ledgerRepo, buchung, gegen);
      }
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.zurUmbuchung.titel")}
      subtitle={t("konten.zurUmbuchung.untertitel")}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("konten.zurUmbuchung.bestaetigen")}</Button><button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      {/* Die Buchung, um die es geht */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", marginBottom: "var(--sp-4)" }}>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
          {ddmm(buchung.datum)} · {kandidatLabel(buchung) || kontoName.get(buchung.kontoId) || ""}
        </span>
        <span className="num" style={{ fontWeight: 700, color: betragFarbe(buchung) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
        {t("konten.zurUmbuchung.kandidatenTitel")}
      </div>
      {kandidaten.length === 0 ? (
        <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.zurUmbuchung.keineKandidaten", { tage: MAX_VORSCHLAG_TAGE })}</div>
      ) : (
        kandidaten.map((k) => (
          <label key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}>
            <input type="radio" name="gegenbein" value={k.id} checked={wahl === k.id} onChange={() => setWahl(k.id)} style={{ accentColor: "var(--accent-deep)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(k.datum)}</span>
            <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)", flex: 1, minWidth: 0 }}>
              {kontoName.get(k.kontoId) ?? "?"}
              {kandidatLabel(k) && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{kandidatLabel(k)}</span>}
            </span>
            <span className="num" style={{ fontWeight: 700, color: betragFarbe(k) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
          </label>
        ))
      )}

      {/* Ausweg: kein Gegenbein vorhanden (S-1a) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "var(--sp-4) 0 var(--sp-3)", color: "var(--ink-3)", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        {t("konten.zurUmbuchung.oder")}
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input type="radio" name="gegenbein" value="__neu" checked={wahl === "__neu"} onChange={() => setWahl("__neu")} style={{ accentColor: "var(--accent-deep)" }} />
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.zurUmbuchung.neu")}</span>
        <select className="field" style={{ width: "auto" }} value={neuKontoId} onChange={(e) => { setNeuKontoId(e.target.value); setWahl("__neu"); }}>
          {andereKonten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
        </select>
      </label>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.zurUmbuchung.neuHinweis")}</div>

      {buchung.kategorieId && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line-soft)" }}>
          {t("konten.zurUmbuchung.kategorieHinweis")}
        </div>
      )}
    </Modal>
  );
}

/**
 * Einstiegspunkt: zeigt die Zeile und führt die Folge-Dialoge.
 *
 * Drei Aufrufformen, EIN Dialog:
 *  • `buchung` — die bestehende Ist-Buchung bearbeiten.
 *  • `entwurf` — eine abgerufene Bankzeile prüfen und übernehmen oder verwerfen.
 *  • `vorgabe` — eine neue von Hand anlegen, vorbelegt mit Konto und Tag der Stelle, von
 *    der aus geöffnet wurde.
 *
 * `onGeaendert` wird gerufen, wenn sich in der Datenbank etwas geändert hat — der
 * aufrufende Screen lädt dann seine eigenen Daten neu. `onClose` schließt ohne Änderung;
 * im Entwurfs-Fall heißt das ausdrücklich: es ist NICHTS passiert.
 */
export function BuchungDetail(props: {
  buchung: IstBuchung;
  entwurf?: undefined;
  vorgabe?: undefined;
  onClose: () => void;
  onGeaendert: () => void | Promise<void>;
} | {
  buchung?: undefined;
  entwurf: Umsatz;
  vorgabe?: undefined;
  onClose: () => void;
  onGeaendert: () => void | Promise<void>;
} | {
  buchung?: undefined;
  entwurf?: undefined;
  vorgabe: { kontoId: string; datum: string };
  onClose: () => void;
  onGeaendert: () => void | Promise<void>;
}) {
  const { buchung, entwurf, vorgabe, onClose, onGeaendert } = props;
  const { t } = useTranslation();
  const geld = useGeld();
  // Welche Buchung gerade gezeigt wird — der Sprung zur Gegenbuchung (und zum Zwilling
  // aus der Dublettenprüfung) ändert das, ohne dass der aufrufende Screen etwas davon
  // wissen muss. Beim Anlegen steht hier nichts, bis gespeichert wurde.
  const [aktuelle, setAktuelle] = useState<IstBuchung | undefined>(buchung);
  const [splitten, setSplitten] = useState<IstBuchung | null>(null);
  const [umbuchenAus, setUmbuchenAus] = useState<IstBuchung | null>(null);
  const [vertragAus, setVertragAus] = useState<IstBuchung | null>(null);

  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [laeufe, setLaeufe] = useState<ImportLauf[]>([]);
  const [alle, setAlle] = useState<IstBuchung[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [zuordnungen, setZuordnungen] = useState<Vertragszuordnung[]>([]);

  async function laden() {
    const [ks, kats, rs, us, ls, bs, vs, zs] = await Promise.all([
      kontoRepo.alle(), kategorieRepo.alle(), regelRepo.alle(),
      umsatzRepo.alle(), importLaufRepo.alle(), ledgerRepo.alle(), vertragRepo.alle(),
      zuordnungRepo.alle(),
    ]);
    setKonten(ks); setKategorien(kats); setRegeln(rs);
    setUmsaetze(us); setLaeufe(ls); setAlle(bs); setVertraege(vs); setZuordnungen(zs);
    // Die gezeigte Buchung aus dem frischen Stand nachziehen (nach dem Speichern).
    setAktuelle((b) => (b ? bs.find((x) => x.id === b.id) ?? b : undefined));
  }
  useEffect(() => { laden(); }, []);

  const kontoName = useMemo(() => new Map(konten.map((k) => [k.id, k.bezeichnung])), [konten]);
  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const umsatzByIst = useMemo(() => {
    const m = new Map<string, Umsatz>();
    for (const u of umsaetze) if (u.istbuchungId) m.set(u.istbuchungId, u);
    return m;
  }, [umsaetze]);

  const umsatz = aktuelle ? umsatzByIst.get(aktuelle.id) : undefined;
  /** Der Entwurf im frischesten Stand — der Dialog kann ihn selbst geändert haben. */
  const aktuellerEntwurf = entwurf ? (umsaetze.find((u) => u.id === entwurf.id) ?? entwurf) : undefined;
  /** Alle anderen offenen Entwürfe — Grundlage der Gegenbein-Suche bei Umschichtungen. */
  const andereEntwuerfe = useMemo(
    () => umsaetze.filter((u) => u.status === "neu" && u.id !== entwurf?.id),
    [umsaetze, entwurf?.id],
  );

  /**
   * Ist das hier womöglich schon einmal gebucht worden?
   *
   * Verglichen wird gegen alles, was auf DEMSELBEN Konto liegt — verbucht, offen oder
   * verworfen. Der Finder kostet praktisch nichts (gemessen: 60 gegen 5279 Zeilen in
   * 2 ms), hier ist es eine Zeile gegen den Kontobestand.
   *
   * Nur für importierte Buchungen: eine von Hand erfasste hat weder Empfänger noch
   * Verwendungszweck, und ohne die bliebe vom Vergleich nur „gleicher Betrag am gleichen
   * Tag" übrig — zu wenig für eine Aussage, aber genug für ständigen Fehlalarm.
   */
  const dublette = useMemo(() => {
    const geprueft = aktuellerEntwurf ?? umsatz;
    if (!geprueft) return undefined;
    const bestand = umsaetze.filter((u) => u.id !== geprueft.id && u.zahlungskontoId === geprueft.zahlungskontoId);
    const [treffer] = ordneZu([geprueft], bestand);
    if (!treffer?.bestand || treffer.bewertung.urteil === "verschieden") return undefined;
    return { bewertung: treffer.bewertung, zwilling: treffer.bestand };
  }, [aktuellerEntwurf, umsatz, umsaetze]);

  /**
   * Gehört die Zahlung zu einem Vertrag? Jetzt aus der gespeicherten ZUORDNUNG, nicht
   * mehr aus dem Empfängernamen abgeleitet: der Name konnte zwei Verträge beim selben
   * Anbieter nicht unterscheiden, und eine Korrektur von Hand hatte nirgends Platz.
   */
  const zuordnung = useMemo(
    () => zuordnungen.find((z) => z.istbuchungId === aktuelle?.id),
    [zuordnungen, aktuelle?.id],
  );
  const vertrag = useMemo(
    () => (zuordnung?.vertragId ? vertraege.find((v) => v.id === zuordnung.vertragId) : undefined),
    [vertraege, zuordnung],
  );
  const gegenbuchung = aktuelle?.transferId
    ? alle.find((x) => x.transferId === aktuelle.transferId && x.id !== aktuelle.id)
    : undefined;

  /** Importierte Buchungen tragen einen Umsatz — der muss zurück in die Inbox. */
  async function umsaetzeZuruecksetzen(istIds: string[]) {
    for (const id of istIds) {
      const u = umsaetze.find((x) => x.istbuchungId === id);
      if (u) await umsatzRepo.speichern(zuruecksetzen(u));
    }
  }

  /** Löscht die Buchung — bei einer Umbuchung BEIDE Beine, sonst bliebe eines verwaist. */
  async function entfernen() {
    if (!aktuelle) return;
    if (aktuelle.transferId) {
      const beine = alle.filter((x) => x.transferId === aktuelle.transferId);
      await umbuchungLoeschen(ledgerRepo, aktuelle.transferId);
      await umsaetzeZuruecksetzen(beine.map((x) => x.id));
    } else {
      await buchungLoeschen(ledgerRepo, aktuelle.id);
      await umsaetzeZuruecksetzen([aktuelle.id]);
    }
    await onGeaendert();
    onClose();
  }

  async function nachAenderung() {
    await laden();
    await onGeaendert();
  }

  if (splitten) {
    return (
      <SplitModal
        buchung={splitten}
        kategorien={kategorien}
        onClose={() => setSplitten(null)}
        onSaved={async () => { setSplitten(null); await nachAenderung(); }}
      />
    );
  }

  if (vertragAus) {
    // Der Anbieter ist das, woran man die Zahlung wiedererkennt: der Empfänger aus dem
    // Import, sonst die Notiz. Leer lassen wäre schlechter als ein Vorschlag, den man
    // überschreibt — Pflichtfeld ist er ohnehin.
    const anbieter = umsatzByIst.get(vertragAus.id)?.gegenpartei || vertragAus.notiz || "";
    return (
      <VertragModal
        start={formularAusBuchung(vertragAus, anbieter, geld)}
        hinweis={t("konten.zuVertrag.hinweis")}
        onClose={() => setVertragAus(null)}
        onSaved={async () => { setVertragAus(null); await nachAenderung(); }}
      />
    );
  }

  if (umbuchenAus) {
    return (
      <ZurUmbuchungModal
        buchung={umbuchenAus}
        konten={konten}
        alleBuchungen={alle}
        kontoName={kontoName}
        umsatzByIst={umsatzByIst}
        onClose={() => setUmbuchenAus(null)}
        onSaved={async () => { setUmbuchenAus(null); await nachAenderung(); }}
      />
    );
  }

  /** Die Buchung hinter dem Dubletten-Zwilling — nur verbuchte lassen sich öffnen. */
  const zwillingBuchung = dublette?.zwilling.istbuchungId
    ? alle.find((x) => x.id === dublette.zwilling.istbuchungId)
    : undefined;

  return (
    <BuchungFormular
      // Ohne key bliebe beim Sprung zur Gegenbuchung der Formular-State der ALTEN
      // Buchung stehen — useState-Initialwerte laufen nur beim Mount.
      key={aktuelle?.id ?? entwurf?.id ?? "neu"}
      buchung={aktuelle}
      entwurf={aktuellerEntwurf}
      andereEntwuerfe={andereEntwuerfe}
      alleBuchungen={alle}
      vertraege={vertraege}
      vorgabe={vorgabe ?? { kontoId: aktuelle?.kontoId ?? "", datum: aktuelle?.datum ?? "" }}
      konten={konten}
      kategorien={kategorien}
      kontoName={kontoName}
      kategorieName={kategorieName}
      umsatz={umsatz}
      importLauf={(() => { const q = aktuellerEntwurf ?? umsatz; return q ? laeufe.find((l) => l.id === q.laufId) : undefined; })()}
      regel={aktuelle?.planRef ? regeln.find((r) => r.id === aktuelle.planRef!.quelleId) : undefined}
      gegenbuchung={gegenbuchung}
      dublette={dublette}
      onZwillingOeffnen={zwillingBuchung ? () => setAktuelle(zwillingBuchung) : undefined}
      onClose={onClose}
      onSaved={async () => { await nachAenderung(); onClose(); }}
      onDelete={entfernen}
      onZurUmbuchung={() => aktuelle && setUmbuchenAus(aktuelle)}
      vertragsBindung={
        aktuelle
          ? {
              vertrag,
              zuordnung,
              alle: vertraege,
              // Von Hand gesetzte Zuordnungen überleben jeden Abgleich — deshalb reicht
              // hier das Neuladen, es muss nichts nachgerechnet werden.
              zuordnen: async (vertragId) => {
                await zuordnungVonHand(zuordnungRepo, aktuelle.id, vertragId);
                await nachAenderung();
              },
              zuruecksetzen: async () => {
                await zuordnungZuruecksetzen(zuordnungRepo, aktuelle.id);
                // Jetzt entscheidet wieder die Regel — also einmal rechnen lassen, sonst
                // bliebe die Buchung bis zum nächsten Anlass unzugeordnet stehen.
                await zuordnungenAbgleichen(abgleichDeps);
                await nachAenderung();
              },
              neuAnlegen: () => setVertragAus(aktuelle),
            }
          : undefined
      }
      onLoesen={async () => { if (!aktuelle?.transferId) return; await paarungLoesen(ledgerRepo, aktuelle.transferId); await nachAenderung(); onClose(); }}
      onGegenbuchung={setAktuelle}
      onSplitten={() => aktuelle && setSplitten(aktuelle)}
      onSplitAufheben={async () => { if (!aktuelle) return; await splitAufheben(ledgerRepo, aktuelle); await nachAenderung(); onClose(); }}
    />
  );
}
