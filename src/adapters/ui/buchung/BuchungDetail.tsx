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
// nur dieser Dialog braucht. „Selbst" heisst seit 2026-08-19: über `buchungsdetail()`
// aus der Anwendungsschicht, nicht über acht Repositories von Hand.

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
} from "../../../application";
import {
  alsDuplikat,
  passtAlsGegenbein,
  verwerfen,
  zuruecksetzen,
  type ImportLauf,
  type Umsatz,
} from "../../../application/import";
import {
  entwurfVerdacht,
  type Dublettenfreigabe,
  type Dublettenverdacht,
} from "../../../application";
import { offenerRest } from "../../../application/buchung/buchungSplitten";
import { vorzeichenbehaftet } from "../../../application/buchung/zahlungsregelAnlegen";
import { paarungsKandidaten, MAX_VORSCHLAG_TAGE } from "../../../application/buchung/umbuchungAusBuchung";
import {
  buchungBearbeiten,
  buchungErfassen,
  bankzeileVerwerfen,
  buchungLoeschen,
  pruefmarkerSetzen,
  buchungenPaaren,
  buchungSplitten,
  buchungsdetail,
  dublettenFreigabeAufheben,
  dublettenFreigeben,
  festlegungSpeichern,
  gegenbeinErzeugen,
  paarungLoesen,
  splitAufheben,
  umbuchungLoeschen,
  umbuchungsBeinBearbeiten,
  umsaetzeBuchen,
  umsatzSpeichern,
  vertragszuordnungenAbgleichen,
  vertragZuordnenVonHand,
  vertragZuordnungZuruecksetzen,
} from "../../dienste";
import { Button, FormField, Pill } from "../bausteine";
import { IconButton } from "../bausteine/IconButton";
import { formularAusBuchung, VertragModal } from "../vertraege/VertragModal";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { MerkmaleBlock } from "../training/MerkmaleBlock";
import { Modal } from "../bausteine/Modal";
import { useGeld, fehlerNachricht, type Geld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
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

/** Stabile Leerwerte — als Literal im useState-Aufruf wäre jeder Render ein neues Objekt. */
const LEERE_KARTE: ReadonlyMap<string, Dublettenverdacht> = new Map();
const LEERE_MENGE: ReadonlySet<string> = new Set();

/** Was die Dublettenprüfung zu dieser Buchung sagt — samt der Zeile, die sie meint. */
export interface Dublettenbefund {
  readonly verdacht: Dublettenverdacht;
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
 * entfernt, und „ist kein Duplikat" ist die dritte Antwort neben „eine davon löschen" und
 * „stehen lassen": der Finder rechnet mit Punkten und liegt manchmal daneben. Ohne diesen
 * Knopf stünde die Mahnung nach jedem Neuladen wieder da, denn geprüft wird bei jedem
 * Hinsehen neu.
 */
function DublettenBlock({
  befund,
  imLedger,
  onZwillingOeffnen,
  onKeinDuplikat,
}: {
  befund: Dublettenbefund;
  /** Gebuchte Zeile (beide stehen im Saldo) oder noch ein Entwurf? Der Hinweis unterscheidet sich. */
  imLedger: boolean;
  onZwillingOeffnen?: () => void;
  onKeinDuplikat?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const { verdacht, zwilling } = befund;
  const sicher = verdacht.urteil === "identisch";

  return (
    <div style={{ marginBottom: "var(--sp-4)", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--warn-wash, var(--surface-2))", border: "1px solid var(--warn, var(--line))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Pill variant="warn">{t(sicher ? "konten.neue.dubletteSicher" : "konten.neue.dublette")}</Pill>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
          {ddmm(zwilling.buchungstag)} · {zwilling.gegenpartei || t("konten.neue.ohneGegenpartei")}
        </span>
        <span className="num" style={{ fontWeight: 700, color: geldFarbe(zwilling.betrag) }}>{geld.formatMitSymbol(zwilling.betrag, { mitVorzeichen: true })}</span>
        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
          {t(`konten.neue.status.${zwilling.status}`)}
        </span>
        {onZwillingOeffnen && (
          <IconButton icon="oeffnen" label={t("konten.dublette.oeffnen")} onClick={onZwillingOeffnen} style={{ marginLeft: "auto" }} />
        )}
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
        {t("konten.neue.dubletteHinweis", { gruende: verdacht.gruende.join(", ") })}
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>
        {t(imLedger ? "konten.dublette.hinweisLedger" : "konten.dublette.hinweis")}
      </div>
      {onKeinDuplikat && (
        <button
          className="linkbtn"
          style={{ marginTop: 6, padding: 0 }}
          onClick={() => void onKeinDuplikat()}
        >
          {t("konten.dublette.keinDuplikat")}
        </button>
      )}
    </div>
  );
}

/**
 * Die Gegenprobe: hier wurde einmal entschieden, dass es KEIN Duplikat ist.
 *
 * Ohne diese Zeile wäre die Entscheidung unsichtbar und unumkehrbar — die Markierung
 * bliebe weg, und niemand wüsste warum. Wer sich vertan hat, hätte zwei Zeilen im Saldo
 * und nichts, was darauf zeigt.
 */
function FreigabeHinweis({ onAufheben }: { onAufheben: () => void | Promise<void> }) {
  const { t } = useTranslation();
  return (
    <div className="muted" style={{ marginBottom: "var(--sp-4)", fontSize: "var(--fs-xs)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span>{t("konten.dublette.freigegeben")}</span>
      <button className="linkbtn" style={{ padding: 0 }} onClick={() => void onAufheben()}>
        {t("konten.dublette.freigabeAufheben")}
      </button>
    </div>
  );
}

/**
 * Der Text fürs Betragsfeld — die HÖHE, ohne Vorzeichen.
 *
 * Die Richtung steht daneben als eigene Auswahl und nicht im Feld. Zwei Anläufe davor
 * haben sie im Feld untergebracht: erst als blosse Höhe mit einer Ableitung aus dem
 * Charakter dahinter, dann als eingetipptes Vorzeichen. Das erste war unsichtbar, das
 * zweite verlangte, dass man auf die Idee kommt, ein Minus zu tippen — und wies es bis
 * 2026-08-25 sogar ab. Eine Wahl, die man SIEHT und die zwei Möglichkeiten nebeneinander
 * zeigt, verlangt weder Wissen noch Vertrauen.
 *
 * Formatiert wird über `useGeld` und nicht über `String(minorZuMajor(…))`: das schrieb
 * einen Punkt als Dezimaltrenner und liess die zweite Nachkommastelle weg, also genau
 * das, was daneben in der Liste anders aussah.
 */
function betragsHoehe(cent: number, geld: Geld): string {
  return geld.format(Math.abs(cent));
}

/** Ab- oder Zufluss — die Richtung als eigene Grösse neben der Höhe. */
type Richtung = "ab" | "zu";

function richtungVon(cent: number): Richtung {
  return cent < 0 ? "ab" : "zu";
}

/**
 * Ein getipptes oder eingefügtes Vorzeichen ist eine Richtungsangabe und wird als solche
 * genommen: es wandert aus dem Feld in die Auswahl daneben, statt abgewiesen zu werden.
 *
 * Wer einen Betrag von woanders hereinkopiert, bringt das Vorzeichen mit — es dort stumm
 * zu verschlucken hiesse, die Hälfte der Angabe wegzuwerfen. Erkannt werden dieselben
 * Schreibweisen wie in `parseBetrag`: vorne, hinten, oder Klammern für negativ.
 */
function vorzeichenAbspalten(text: string): { rest: string; richtung?: Richtung } {
  const klammer = /^\s*\((.*)\)\s*$/.exec(text);
  if (klammer) return { rest: klammer[1], richtung: "ab" };
  const vorne = /^\s*([-\u2212+])\s*/.exec(text);
  if (vorne) return { rest: text.slice(vorne[0].length), richtung: vorne[1] === "+" ? "zu" : "ab" };
  const hinten = /\s*([-\u2212+])\s*$/.exec(text);
  if (hinten) return { rest: text.slice(0, hinten.index), richtung: hinten[1] === "+" ? "zu" : "ab" };
  return { rest: text };
}

/**
 * Die Richtungswahl — zwei Knöpfe, immer beide sichtbar.
 *
 * **Warum zwei Knöpfe und kein Kästchen.** Ein Kästchen zeigt eine Möglichkeit und
 * verschweigt die andere: „Geld kam zurück" ohne Haken heisst irgendetwas, und was, muss
 * man wissen. Genau daran ist der Vorgänger gescheitert. Zwei Knöpfe nebeneinander zeigen
 * beide Möglichkeiten und welche gerade gilt — dafür braucht es kein Vorwissen.
 *
 * **Warum kein `Auswahl`.** Es sind genau zwei Werte, und die passen nebeneinander. Eine
 * Klappliste versteckte die Hälfte der Antwort hinter einem Klick, um Platz zu sparen,
 * den es hier nicht zu sparen gibt.
 *
 * **Warum Farbe.** Ab und Zu sind dieselben Farben wie überall, wo ein Betrag steht
 * (`geldFarbe`): Minus in der Warnfarbe, Plus in Grün. Wer die Liste kennt, erkennt die
 * Wahl wieder, ohne das Wort zu lesen.
 *
 * **Warum es sichtbar bleibt, wenn es gesperrt ist.** Bei einer Bankzeile ist die
 * Richtung eine Tatsache — die soll man ablesen können. Ein Feld, das dann verschwindet,
 * beantwortet die Frage gar nicht.
 *
 * `radiogroup` und nicht zwei Umschalter: es ist EINE Frage mit zwei Antworten, und die
 * Pfeiltasten sollen zwischen ihnen wechseln.
 */
function Richtungswahl({
  wert,
  aufAenderung,
  deaktiviert,
}: {
  wert: Richtung;
  aufAenderung: (r: Richtung) => void;
  deaktiviert?: boolean;
}) {
  const { t } = useTranslation();
  const moeglichkeiten: readonly { r: Richtung; zeichen: string; textKey: string; farbe: string }[] = [
    { r: "ab", zeichen: "\u2212", textKey: "konten.buchung.richtungAb", farbe: "var(--warn-deep)" },
    { r: "zu", zeichen: "+", textKey: "konten.buchung.richtungZu", farbe: "var(--ok-deep)" },
  ];
  return (
    <div role="radiogroup" aria-label={t("konten.buchung.richtung")} style={{ display: "flex", gap: 6 }}>
      {moeglichkeiten.map((m) => {
        const aktiv = m.r === wert;
        return (
          <button
            key={m.r}
            type="button"
            role="radio"
            aria-checked={aktiv}
            aria-label={t(m.textKey)}
            disabled={deaktiviert}
            onClick={() => aufAenderung(m.r)}
            className="field"
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: deaktiviert ? "default" : "pointer",
              fontWeight: aktiv ? "var(--fw-bold)" : "var(--fw-semi)",
              // Die gewählte Seite trägt Farbe und Fläche, die andere bleibt ein blasses
              // Feld. Nur Fettschrift reichte nicht — nebeneinander sehen zwei Kästen mit
              // leicht verschiedener Strichstärke gleich aus.
              color: aktiv ? m.farbe : "var(--ink-3)",
              borderColor: aktiv ? m.farbe : "var(--line)",
              background: aktiv ? "color-mix(in oklab, currentColor 10%, transparent)" : "transparent",
              opacity: deaktiviert && !aktiv ? 0.5 : 1,
            }}
          >
            <span aria-hidden="true" style={{ fontWeight: "var(--fw-black)" }}>{m.zeichen}</span>
            {t(m.textKey)}
          </button>
        );
      })}
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
 *  • Bein einer Umbuchung — Konto, Betrag, Charakter und Kategorie sind FEST. Betrag und
 *    Charakter gehören dem PAAR: die beiden Beine tragen dieselbe Summe mit
 *    entgegengesetztem Vorzeichen, und eines davon allein zu ändern risse die Netto-Null
 *    der Umbuchung auf. Das Konto wiederum steht als Gegenkonto am anderen Bein; ein
 *    einseitiger Wechsel zöge die Paarung auf zwei verschiedene Aussagen auseinander.
 *    Datum und Notiz sind unkritisch (die beiden Beine dürfen ohnehin an verschiedenen
 *    Tagen liegen); dafür gibt es `umbuchungsBeinBearbeiten`.
 */
function BuchungFormular({ buchung, entwurf, andereEntwuerfe, alleBuchungen, vertraege, vorgabe, konten, kategorien, kontoName, kategorieName, umsatz, importLauf, regel, gegenbuchung, dublette, onZwillingOeffnen, onKeinDuplikat, onFreigabeAufheben, onClose, onSaved, onDelete, ausBankabruf, onlineKonten, aktuelle, onPruefmarker, onZurUmbuchung, vertragsBindung, onLoesen, onGegenbuchung, onSplitten, onSplitAufheben }: { buchung?: IstBuchung; entwurf?: Umsatz; andereEntwuerfe: readonly Umsatz[]; alleBuchungen: readonly IstBuchung[]; vertraege: readonly Vertrag[]; vorgabe: { kontoId: string; datum: string }; konten: Zahlungskonto[]; kategorien: Kategorie[]; kontoName: Map<string, string>; umsatz?: Umsatz; importLauf?: ImportLauf; regel?: Zahlungsregel; gegenbuchung?: IstBuchung; dublette?: Dublettenbefund; onZwillingOeffnen?: () => void; onKeinDuplikat?: () => void | Promise<void>; onFreigabeAufheben?: () => void | Promise<void>; kategorieName: Map<string, string>; onClose: () => void; onSaved: () => void; onDelete: () => void | Promise<void>; ausBankabruf?: boolean; onlineKonten: ReadonlySet<string>; aktuelle?: IstBuchung; onPruefmarker: (vorgemerkt: boolean) => Promise<void>; onZurUmbuchung: () => void; vertragsBindung?: VertragsBindung; onLoesen: () => void | Promise<void>; onGegenbuchung: (b: IstBuchung) => void; onSplitten: () => void; onSplitAufheben: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const istEntwurf = !!entwurf;
  const istNeu = !buchung && !entwurf;
  const [kontoId, setKontoId] = useState(buchung?.kontoId ?? entwurf?.zahlungskontoId ?? vorgabe.kontoId);
  const [datum, setDatum] = useState(buchung?.datum ?? entwurf?.buchungstag ?? vorgabe.datum);
  /**
   * HÖHE und RICHTUNG stehen getrennt — zwei Felder, beide sichtbar.
   *
   * Der Betrag im Ledger ist vorzeichenbehaftet; die Maske zerlegt ihn beim Öffnen und
   * setzt ihn beim Speichern wieder zusammen. Was dabei gewonnen ist: die Richtung ist
   * nicht mehr etwas, das man dem Feld ansehen (oder erraten) muss, sondern eine Wahl
   * mit zwei Möglichkeiten nebeneinander.
   *
   * `richtungVonHand` merkt sich, WER zuletzt gesprochen hat, und nur das. Solange
   * niemand die Auswahl angefasst hat, folgt sie der Kategorie — Aufwand fliesst ab,
   * Ertrag fliesst zu; sobald jemand sie anfasst, gilt seine Wahl und kein
   * Kategoriewechsel nimmt sie ihm wieder weg. Eine bestehende Buchung zählt von Anfang
   * an als von Hand gesetzt: ihre Richtung ist eine Tatsache (beim Import die der Bank),
   * und ein Kategoriewechsel darf sie nicht umdrehen.
   *
   * Das ist NICHT die alte Ableitung mit anderem Namen. Die lief unsichtbar hinter dem
   * Feld; diese hier bewegt einen Schalter, den man vor sich sieht, und man kann ihn
   * jederzeit zurückstellen.
   */
  const startBetrag = buchung?.betrag ?? entwurf?.betrag;
  const [betrag, setBetrag] = useState(startBetrag == null ? "" : betragsHoehe(startBetrag, geld));
  const [richtung, setRichtung] = useState<Richtung>(startBetrag == null ? "ab" : richtungVon(startBetrag));
  const [richtungVonHand, setRichtungVonHand] = useState(startBetrag != null);

  /**
   * Was ins Betragsfeld getippt wird, ist die Höhe. Bringt es ein Vorzeichen mit
   * (getippt oder eingefügt), wandert das in die Richtungsauswahl, statt im Feld
   * stehenzubleiben — dort hätte es keine Wirkung und sähe trotzdem aus, als hätte es
   * eine.
   */
  function betragTippen(text: string) {
    const { rest, richtung: gemeint } = vorzeichenAbspalten(text);
    setBetrag(rest);
    if (gemeint) {
      setRichtung(gemeint);
      setRichtungVonHand(true);
    }
  }

  function richtungWaehlen(gewaehlt: Richtung) {
    setRichtung(gewaehlt);
    setRichtungVonHand(true);
  }

  const [charakter, setCharakter] = useState<Charakter>(buchung?.charakter ?? entwurf?.vorschlag?.charakter ?? "Aufwand");
  const [kategorieId, setKategorieId] = useState(buchung?.kategorieId ?? entwurf?.vorschlag?.kategorieId ?? "");

  /**
   * Der Charakter wird nicht mehr GEWÄHLT, sondern folgt der Kategorie.
   *
   * Bis 2026-08-19 stand hier ein drittes Auswahlfeld („Aufwand / Ertrag / Sparen &
   * Vorsorge"). Es fragte nach etwas, das die Kategorie längst weiss — jede Kategorie
   * trägt ihren `defaultCharakter` —, und eine Antwort, die von der Kategorie abweicht,
   * hat keinen Ort, an dem sie richtig wäre: die Auswertungen gruppieren nach Charakter
   * UND nach Kategorie, und ein Widerspruch zwischen beiden erzeugt Zahlen, die sich
   * gegenseitig widersprechen.
   *
   * `Umschichtung` bleibt ausgenommen: die kommt nicht aus der Kategorie, sondern aus
   * der Umbuchung (zwei Beine, eigener Weg im Dialog darunter).
   */
  function kategorieSetzen(id: string) {
    setKategorieId(id);
    if (charakter === "Umschichtung") return;
    const gewaehlt = kategorien.find((k) => k.id === id);
    if (!gewaehlt) return;
    setCharakter(gewaehlt.defaultCharakter);
    // Die Richtung nur, solange sie niemand selbst gesetzt hat — siehe `richtungVonHand`.
    // Der Normalfall bleibt damit ein Handgriff: Kategorie wählen, Höhe tippen, fertig.
    if (!richtungVonHand) setRichtung(gewaehlt.defaultCharakter === "Ertrag" ? "zu" : "ab");
  }
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
  /**
   * Auf einem Konto mit Bankverbindung sind Datum und Betrag Tatsachen, keine Eingabe.
   *
   * Eine von Hand geänderte Zahl wäre eine Behauptung gegen den Kontoauszug: sie taucht
   * beim nächsten Abgleich als Abweichung auf, und dann weiss niemand mehr, dass sie von
   * Hand entstanden ist — sie sieht aus wie eine fehlende Buchung. Wer eine Bankzeile für
   * falsch hält, verwirft sie; korrigieren lässt sie sich nicht.
   *
   * Die EINORDNUNG bleibt frei: Bezeichnung, Kategorie, Vertrag, Aufteilung gehören dem
   * Nutzer, nicht der Bank. Beim Anlegen von Hand (`istNeu`) greift die Sperre nicht —
   * dort ist noch kein Konto gewählt, und die Auswahlliste bietet ohnehin nur offline an.
   */
  const kontoIstOnline = !istNeu && onlineKonten.has(kontoId);
  const istUmschichtung = charakter === "Umschichtung";
  /**
   * Was beim Speichern in den Ledger geht — Höhe mal Richtung, sonst nichts.
   *
   * Keine Ableitung mehr an dieser Stelle: was in der Auswahl steht, wird gebucht. Ein
   * Zufluss auf einer Aufwandskategorie ist damit erlaubt und richtig — eine Erstattung
   * oder Retoure gehört in die Kategorie der Ausgabe, dort entlastet sie deren Budget.
   */
  const gebuchterBetrag = (richtung === "ab" ? -1 : 1) * Math.abs(geld.parse(betrag) ?? 0);
  /** Floss das Geld entgegen dem, was die Einordnung erwarten lässt? (Erstattung, Storno) */
  const gegenDerEinordnung =
    gebuchterBetrag !== 0 && gebuchterBetrag !== vorzeichenbehaftet(gebuchterBetrag, charakter);
  /**
   * Konten, auf denen ein Gegenbein ERZEUGT werden darf.
   *
   * Nicht bloss „die anderen": auf einem abgerufenen Konto anzulegen hiesse, eine Buchung
   * zu erfinden, die es bei der Bank nicht gibt. Zwei abgerufene Konten brauchen das auch
   * gar nicht — beide Seiten meldet die Bank ohnehin, sie stehen als Gegenbuchung in der
   * Liste darüber und werden VERBUNDEN statt erzeugt.
   */
  const andereKonten = konten.filter((k) => k.id !== kontoId && !onlineKonten.has(k.id));

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
        await umsaetzeBuchen(auswahl);

        // Alles Weitere hängt an der Ist-Buchung, die es vorher nicht gab: Paarung mit
        // einer schon gebuchten Zeile, ein erzeugtes Gegenbein, die Vertragszuordnung.
        // Deshalb wird die frisch entstandene Buchung hier nachgeschlagen — im Dialog
        // entschieden, nach dem Verbuchen angewandt.
        const stand = await buchungsdetail();
        const frisch = stand.umsaetze.find((x) => x.id === entwurf.id);
        const neueBuchung = frisch?.istbuchungId
          ? stand.buchungen.find((b) => b.id === frisch.istbuchungId)
          : undefined;

        if (neueBuchung && istUmschichtung) {
          if (gegenGewaehlt.startsWith("b:")) {
            const gegen = alleBuchungen.find((b) => b.id === gegenGewaehlt.slice(2));
            if (gegen) await buchungenPaaren(neueBuchung, gegen);
          } else if (gegenGewaehlt === "__neu" && neuKontoGewaehlt) {
            await gegenbeinErzeugen(neueBuchung, neuKontoGewaehlt);
          }
        }

        // `umsaetzeBuchen` hat die Zuordnungen schon abgeglichen. ZULETZT die
        // Handentscheidung: sie überstimmt, was der Abgleich gerechnet hat.
        if (neueBuchung && vertragWahl && !istUmschichtung) {
          await vertragZuordnenVonHand(neueBuchung.id, vertragWahl === "__keiner" ? null : vertragWahl);
        }
      } else if (!buchung) {
        await buchungErfassen({ kontoId, datum, betrag: gebuchterBetrag, charakter, kategorieId: kategorieId || undefined, notiz });
      } else if (gepaart) {
        await umbuchungsBeinBearbeiten(buchung, { datum, notiz });
      } else {
        await buchungBearbeiten(buchung, { datum, betrag: gebuchterBetrag, charakter, kategorieId: kategorieId || undefined, notiz, kontoId });
        // Zieht das Konto um, zieht der Umsatz mit: sein `zahlungskontoId` ist das
        // Ergebnis des Konto-Matches beim Import, also eine Vermutung. Wer die Buchung
        // vor sich hat, korrigiert damit genau diese Vermutung — bliebe der Umsatz
        // stehen, zeigte die Herkunft weiter aufs alte Konto und die Dublettenprüfung
        // verglichen gegen den falschen Bestand.
        if (umsatz && kontoId !== umsatz.zahlungskontoId) {
          await umsatzSpeichern({ ...umsatz, zahlungskontoId: kontoId });
        }
        // Die Festlegung entsteht NACH der Buchung: schlüge das Speichern fehl, stünde
        // sonst eine Regel für eine Änderung, die es nicht gibt.
        if (immer && kategorieId && musterAngebot) {
          await festlegungSpeichern(musterAngebot, kategorieId);
        }
      }
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Weglegen — die Zeile bleibt gespeichert, markiert und wird übersprungen.
   *
   * Zwei Wörter, weil der Unterschied im Kontostand landet: „ist schon gebucht" heißt,
   * der Betrag steht bereits über eine andere Zeile im Ledger; „verwerfen" heißt, er
   * kommt nicht hinein, obwohl die Bank ihn meldet — danach weicht der Stand ab.
   */
  async function verwerfenEntwurf() {
    if (!entwurf) return;
    setFehler(null);
    setBusy(true);
    try {
      await umsatzSpeichern(dublette ? alsDuplikat(entwurf) : verwerfen(entwurf));
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
              {t(dublette ? "konten.neue.schonGebucht" : "konten.entwurf.verwerfen")}
            </button>
          )}
          {buchung && (
            <button
              className="linkbtn"
              style={{ marginLeft: "auto", color: "var(--warn-deep)" }}
              onClick={() => onDelete()}
            >
              {t(ausBankabruf ? "konten.detail.verwerfenBankzeile" : "konten.loeschen")}
            </button>
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
          <span className="num" style={{ fontSize: "var(--fs-h2, var(--fs-h3))", fontWeight: "var(--fw-black)", color: geldFarbe(buchung?.betrag ?? entwurf!.betrag) }}>
            {geld.formatMitSymbol(buchung?.betrag ?? entwurf!.betrag, { mitVorzeichen: true })}
          </span>
        </div>
      )}

      {/* Ganz oben, noch vor den Feldern: die Frage, ob es diese Buchung schon gibt. Sie
          geht allem voraus — an einer Zeile, die gar nicht bleiben soll, lohnt sich keine
          Korrektur. */}
      {dublette ? (
        <DublettenBlock
          befund={dublette}
          imLedger={!entwurf}
          onZwillingOeffnen={onZwillingOeffnen}
          onKeinDuplikat={onKeinDuplikat}
        />
      ) : (
        onFreigabeAufheben && <FreigabeHinweis onAufheben={onFreigabeAufheben} />
      )}

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
        <FormField label={t("konten.feldDatum")} required hint={istEntwurf || kontoIstOnline ? t("konten.entwurf.vonDerBank") : undefined}>
          <input className="field" type="date" aria-label={t("konten.feldDatum")} value={datum} disabled={istEntwurf || kontoIstOnline} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        {/* Das Feld nimmt die HÖHE, die Richtung steht als eigene Wahl daneben. Beide
            zusammen sind der Betrag; keins von beidem wird abgeleitet. */}
        <FormField
          label={t("konten.feldBetrag")}
          required
          hint={istEntwurf || kontoIstOnline ? t("konten.entwurf.vonDerBank") : undefined}
        >
          <input className="field" inputMode="decimal" aria-label={t("konten.feldBetrag")} value={betrag} disabled={gepaart || istEntwurf || kontoIstOnline} onChange={(e) => betragTippen(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        {/* Die Richtung — zwei Möglichkeiten nebeneinander, immer beide sichtbar.
            Sie steht auch da, wo sie gesperrt ist: was die Bank gebucht hat, soll man
            SEHEN können, ohne es ändern zu dürfen. Ein Feld, das nur erscheint, wenn man
            es bedienen darf, lässt die Frage sonst unbeantwortet. */}
        <FormField label={t("konten.buchung.richtung")} required>
          <Richtungswahl
            wert={richtung}
            aufAenderung={richtungWaehlen}
            deaktiviert={gepaart || istEntwurf || kontoIstOnline}
          />
        </FormField>
        {/* Der Rückfluss braucht einen Satz, kein Kästchen mehr: dass ein Zufluss auf einer
            Aufwandskategorie erlaubt IST, sieht man dem Feld nicht an — dass er dort auch
            richtig liegt, erst recht nicht. */}
        {!istEntwurf && !gepaart && !kontoIstOnline && !istUmschichtung && gegenDerEinordnung && (
          <div className="muted" style={{ fontSize: "var(--fs-xs)", margin: "-4px 0 6px" }}>
            {t("konten.buchung.gegenrichtungHinweis")}
          </div>
        )}
        {/* Die Bezeichnung gehört an die Ist-Buchung. Ein Entwurf trägt keine — er trägt
            den Verwendungszweck der Bank, und der steht unter „Herkunft".

            Der PLATZHALTER zeigt, was ohne eigene Angabe in der Registerzeile steht:
            Empfänger, sonst Verwendungszweck (dieselbe Kette wie in `registerSicht`). Ohne
            das ist nicht zu sehen, dass die Zeile schon eine Beschriftung HAT und dieses
            Feld sie überschreibt — man tippt dann ab, was ohnehin dasteht. Was hier leer
            bleibt, bleibt automatisch. */}
        {/* Der Prüfmarker wirkt SOFORT, nicht erst beim Speichern — wie die Pille im
            Register auch. Er ist eine Handlung („gesehen"), keine Eigenschaft, die man
            miterfasst; wer den Dialog ohne Speichern schliesst, hat ihn trotzdem gesetzt.
            Deshalb steht er als Kästchen und nicht im Formularraster darüber. */}
        {!istEntwurf && buchung && (
          <FormField label={t("konten.pruefenFeld")} hint={t("konten.pruefenHinweis")}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)", fontSize: "var(--fs-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!aktuelle?.zuPruefen}
                disabled={busy}
                onChange={async (e) => {
                  await onPruefmarker(e.target.checked);
                }}
                style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
              />
              {t("konten.pillPruefen")}
            </label>
          </FormField>
        )}
        {!istEntwurf && (
          <FormField label={t("konten.feldBezeichnung")} hint={t("konten.optional")}>
            <input
              className="field"
              aria-label={t("konten.feldBezeichnung")}
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder={umsatz?.gegenpartei || umsatz?.verwendungszweck || t("konten.buchung.notizPlatzhalter")}
            />
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
                  <span className="num" style={{ fontWeight: 700, color: geldFarbe(k.betrag) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
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
                  <span className="num" style={{ fontWeight: 700, color: geldFarbe(k.betrag) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
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
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", color: geldFarbe(a.betrag) }}>
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
                <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={kategorieSetzen} />
              </FormField>
              {kategorieGeaendert && kategorieId && musterAngebot && !istEntwurf && (
                <label style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", marginTop: 6, fontSize: "var(--fs-xs)" }}>
                  <input type="checkbox" aria-label={t("konten.festlegung.immerLabel")} checked={immer} onChange={(e) => setImmer(e.target.checked)} />
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
                  <span className="num" style={{ fontWeight: 700, color: geldFarbe(gegenbuchung.betrag) }}>
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

      {/* Die Folge des Verwerfens beziffert, nicht nur behauptet: ohne Gegenstück im
          Bestand fehlt danach genau dieser Betrag gegenüber dem, was die Bank sagt. */}
      {istEntwurf && !dublette && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)" }}>
          {t("konten.entwurf.verwerfenFolge", { betrag: geld.formatMitSymbol(entwurf!.betrag, { mitVorzeichen: true }) })}
        </div>
      )}

      {/* Was das Verwerfen kostet, beziffert und nicht nur behauptet — dieselbe Auskunft,
          die ein Entwurf oben bekommt. Die Zeile verschwindet aus dem Saldo, die Bank
          kennt sie weiterhin, also weicht der Stand danach um genau diesen Betrag ab. */}
      {buchung && ausBankabruf && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {t("konten.detail.verwerfenFolge", { betrag: geld.formatMitSymbol(-buchung.betrag, { mitVorzeichen: true }) })}
        </div>
      )}

      {/* „Löschen" sagt nicht die ganze Wahrheit, wenn die Buchung aus einer DATEI kam:
          die eingelesene Zeile bleibt und steht danach wieder in der Import-Inbox. */}
      {buchung?.quelle === "import" && !ausBankabruf && (
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
      await buchungSplitten(buchung, eingaben);
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
        <span className="num" style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-black)", color: geldFarbe(buchung.betrag) }}>
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
function ZurUmbuchungModal({ buchung, konten, onlineKonten, alleBuchungen, kontoName, umsatzByIst, onClose, onSaved }: { buchung: IstBuchung; konten: Zahlungskonto[]; onlineKonten: ReadonlySet<string>; alleBuchungen: IstBuchung[]; kontoName: Map<string, string>; umsatzByIst: Map<string, Umsatz>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const kandidaten = useMemo(() => paarungsKandidaten(alleBuchungen, buchung), [alleBuchungen, buchung]);
  // Erzeugt wird nur auf Konten ohne Bankverbindung — siehe `gegenbeinErzeugen`. Die
  // Gegenbuchungen darüber sind davon nicht betroffen: die existieren schon.
  const andereKonten = konten.filter((k) => k.id !== buchung.kontoId && !onlineKonten.has(k.id));
  // Vorauswahl: der beste Kandidat, sonst der Weg über ein neu erzeugtes Gegenbein — den
  // aber nur, wenn es überhaupt ein Konto gibt, auf dem erzeugt werden darf.
  const [wahl, setWahl] = useState<string>(kandidaten[0]?.id ?? (andereKonten.length > 0 ? "__neu" : ""));
  const [neuKontoId, setNeuKontoId] = useState(andereKonten[0]?.id ?? "");
  const nichtsZuTun = kandidaten.length === 0 && andereKonten.length === 0;
  const [fehler, setFehler] = useState<string | null>(null);

  /** Beschriftung einer Gegenbuchung: Empfänger aus dem Import, sonst Notiz. */
  function kandidatLabel(k: IstBuchung): string {
    return umsatzByIst.get(k.id)?.gegenpartei || k.notiz || "";
  }

  async function speichern() {
    setFehler(null);
    try {
      if (wahl === "__neu") {
        await gegenbeinErzeugen(buchung, neuKontoId);
      } else {
        const gegen = alleBuchungen.find((b) => b.id === wahl);
        if (!gegen) return;
        await buchungenPaaren(buchung, gegen);
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
      footer={<>
        {/* Gibt es weder eine Gegenbuchung noch ein Konto, auf dem erzeugt werden darf,
            hat der Knopf nichts zu bestätigen — dann führt nur der Weg zurück. */}
        {!nichtsZuTun && <Button variant="primary" onClick={speichern}>{t("konten.zurUmbuchung.bestaetigen")}</Button>}
        <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
        {fehler && <span className="err">{fehler}</span>}
      </>}
    >
      {/* Die Buchung, um die es geht */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", marginBottom: "var(--sp-4)" }}>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
          {ddmm(buchung.datum)} · {kandidatLabel(buchung) || kontoName.get(buchung.kontoId) || ""}
        </span>
        <span className="num" style={{ fontWeight: 700, color: geldFarbe(buchung.betrag) }}>
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
            <span className="num" style={{ fontWeight: 700, color: geldFarbe(k.betrag) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
          </label>
        ))
      )}

      {/* Ausweg: kein Gegenbein vorhanden (S-1a).

          Fällt ganz weg, wenn alle übrigen Konten an einer Bank hängen — dort darf nichts
          erzeugt werden, und ein Radio-Knopf über einer leeren Auswahlliste wäre eine
          Handlung, die nicht geht. Statt dessen steht dort, warum: die Gegenseite meldet
          die Bank ohnehin, sie muss nur verbunden werden. */}
      {andereKonten.length > 0 ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "var(--sp-4) 0 var(--sp-3)", color: "var(--ink-3)", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            {t("konten.zurUmbuchung.oder")}
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="radio" name="gegenbein" value="__neu" checked={wahl === "__neu"} onChange={() => setWahl("__neu")} style={{ accentColor: "var(--accent-deep)" }} />
            <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.zurUmbuchung.neu")}</span>
            <select className="field" aria-label={t("konten.zurUmbuchung.neu")} style={{ width: "auto" }} value={neuKontoId} onChange={(e) => { setNeuKontoId(e.target.value); setWahl("__neu"); }}>
              {andereKonten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
            </select>
          </label>
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.zurUmbuchung.neuHinweis")}</div>
        </>
      ) : (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-4)" }}>
          {t("konten.zurUmbuchung.nurVerbinden")}
        </div>
      )}

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
  /**
   * Diese Zeile kam aus einem BANKABRUF und wird nicht gelöscht, sondern verworfen.
   *
   * Der Unterschied steht im Use-Case (`bankzeileVerwerfen`) und ist kein Wording: gelöscht
   * käme sie beim nächsten Abruf zurück, verworfen bleibt sie als Entscheidung gespeichert.
   * Der Knopf heisst deshalb anders und der Hinweis darunter nennt die Folge für den Saldo.
   */
  ausBankabruf?: boolean;
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
  const ausBankabruf = "ausBankabruf" in props ? props.ausBankabruf : false;
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
  const [dublettenverdacht, setDublettenverdacht] = useState<ReadonlyMap<string, Dublettenverdacht>>(LEERE_KARTE);
  const [freigegeben, setFreigegeben] = useState<ReadonlySet<string>>(LEERE_MENGE);
  const [freigaben, setFreigaben] = useState<readonly Dublettenfreigabe[]>([]);
  const [onlineKonten, setOnlineKonten] = useState<ReadonlySet<string>>(LEERE_MENGE);

  async function laden() {
    const d = await buchungsdetail();
    setKonten([...d.konten]); setKategorien([...d.kategorien]); setRegeln([...d.regeln]);
    setUmsaetze([...d.umsaetze]); setLaeufe([...d.laeufe]); setAlle([...d.buchungen]);
    setVertraege([...d.vertraege]); setZuordnungen([...d.zuordnungen]);
    setDublettenverdacht(d.dublettenverdacht); setFreigegeben(d.freigegeben); setFreigaben(d.freigaben);
    setOnlineKonten(d.onlineKonten);
    // Die gezeigte Buchung aus dem frischen Stand nachziehen (nach dem Speichern).
    setAktuelle((b) => (b ? d.buchungen.find((x) => x.id === b.id) ?? b : undefined));
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
   * Die Antwort kommt aus der Anwendungsschicht und ist DIESELBE wie im Kontoauszug —
   * bis 2026-08-20 rechnete der Dialog sie sich hier selbst, gegen einen anderen Bestand,
   * und mahnte deshalb Zwillinge an, die längst gelöscht waren.
   *
   * Zwei Fragen, zwei Wege (beide in `dublettensicht`): eine gebuchte Zeile fragt „steht
   * das zweimal im Saldo?" — das ist die fertige Karte aus `buchungsdetail()`. Ein
   * Entwurf fragt „ist das schon bekannt?" und zählt auch Verworfenes mit; das hängt an
   * genau dieser Zeile und wird deshalb hier gerechnet.
   */
  const dublette = useMemo((): Dublettenbefund | undefined => {
    if (aktuellerEntwurf) {
      const verdacht = entwurfVerdacht(aktuellerEntwurf, umsaetze, freigegeben);
      const zwilling = verdacht && umsaetze.find((u) => u.id === verdacht.zwillingUmsatzId);
      return verdacht && zwilling ? { verdacht, zwilling } : undefined;
    }
    if (!aktuelle) return undefined;
    const verdacht = dublettenverdacht.get(aktuelle.id);
    const zwilling = verdacht && umsaetze.find((u) => u.id === verdacht.zwillingUmsatzId);
    return verdacht && zwilling ? { verdacht, zwilling } : undefined;
  }, [aktuellerEntwurf, aktuelle, umsaetze, dublettenverdacht, freigegeben]);

  /**
   * Der eigene Umsatz — die Freigabe wird zwischen zwei Umsätzen festgehalten, nicht
   * zwischen zwei Buchungen: geprüft wird über die Umsätze, und ein Entwurf hat noch gar
   * keine Buchung.
   */
  const eigenerUmsatz = aktuellerEntwurf ?? umsatz;

  /** Eine bestehende Freigabe zu DIESER Zeile — sichtbar, damit sie umkehrbar bleibt. */
  const freigabeHier = useMemo(
    () =>
      eigenerUmsatz
        ? freigaben.find((f) => f.umsatzA === eigenerUmsatz.id || f.umsatzB === eigenerUmsatz.id)
        : undefined,
    [freigaben, eigenerUmsatz],
  );

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
      if (u) await umsatzSpeichern(zuruecksetzen(u));
    }
  }

  /**
   * Löscht die Buchung — bei einer Umbuchung BEIDE Beine, sonst bliebe eines verwaist.
   *
   * Eine Zeile aus dem Bankabruf nimmt den anderen Weg: sie wird VERWORFEN, damit der
   * nächste Abruf sie nicht zurückholt (`bankzeileVerwerfen`). Der Use-Case löst dabei
   * eine Paarung selbst, nimmt das Gegenbein aber nicht mit — es kann aus einer Datei
   * stammen und ist von der Entscheidung über diese eine Zeile nicht betroffen.
   */
  async function entfernen() {
    if (!aktuelle) return;
    if (ausBankabruf) {
      await bankzeileVerwerfen(aktuelle.id);
    } else if (aktuelle.transferId) {
      const beine = alle.filter((x) => x.transferId === aktuelle.transferId);
      await umbuchungLoeschen(aktuelle.transferId);
      await umsaetzeZuruecksetzen(beine.map((x) => x.id));
    } else {
      await buchungLoeschen(aktuelle.id);
      await umsaetzeZuruecksetzen([aktuelle.id]);
    }
    await onGeaendert();
    onClose();
  }

  /** Setzt den „noch ansehen"-Marker oder nimmt ihn weg — sofort, ohne Speichern. */
  async function pruefmarkerUmschalten(vorgemerkt: boolean) {
    if (!aktuelle) return;
    await pruefmarkerSetzen(aktuelle.id, vorgemerkt);
    await nachAenderung();
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
        onlineKonten={onlineKonten}
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
      onKeinDuplikat={
        dublette && eigenerUmsatz
          ? async () => {
              await dublettenFreigeben(eigenerUmsatz.id, dublette.zwilling.id);
              // Nicht nur der Dialog: die Markierung steht auch im Auszug, und der Filter
              // „könnten doppelt sein" zählt sie. Wer hier entscheidet, schliesst danach
              // oft mit Abbrechen — ohne diesen Weg bliebe die Markierung dort stehen.
              await nachAenderung();
            }
          : undefined
      }
      onFreigabeAufheben={
        freigabeHier
          ? async () => {
              await dublettenFreigabeAufheben(freigabeHier.umsatzA, freigabeHier.umsatzB);
              await nachAenderung();
            }
          : undefined
      }
      onClose={onClose}
      onSaved={async () => { await nachAenderung(); onClose(); }}
      onDelete={entfernen}
      ausBankabruf={ausBankabruf}
      onlineKonten={onlineKonten}
      aktuelle={aktuelle}
      onPruefmarker={pruefmarkerUmschalten}
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
                await vertragZuordnenVonHand(aktuelle.id, vertragId);
                await nachAenderung();
              },
              zuruecksetzen: async () => {
                await vertragZuordnungZuruecksetzen(aktuelle.id);
                // Jetzt entscheidet wieder die Regel — also einmal rechnen lassen, sonst
                // bliebe die Buchung bis zum nächsten Anlass unzugeordnet stehen.
                await vertragszuordnungenAbgleichen();
                await nachAenderung();
              },
              neuAnlegen: () => setVertragAus(aktuelle),
            }
          : undefined
      }
      onLoesen={async () => { if (!aktuelle?.transferId) return; await paarungLoesen(aktuelle.transferId); await nachAenderung(); onClose(); }}
      onGegenbuchung={setAktuelle}
      onSplitten={() => aktuelle && setSplitten(aktuelle)}
      onSplitAufheben={async () => { if (!aktuelle) return; await splitAufheben(aktuelle); await nachAenderung(); onClose(); }}
    />
  );
}
