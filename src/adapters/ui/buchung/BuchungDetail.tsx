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

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  istGeteilt,
  type Buchungshistorie,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type Vertrag,
  type Vertragszuordnung,
  type Zahlungskonto,
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
import { SplitModal } from "./SplitModal";
import { ZurUmbuchungModal } from "./ZurUmbuchungModal";
import { vorzeichenbehaftet } from "../../../application/buchung/zahlungsregelAnlegen";
import { paarungsKandidaten } from "../../../application/buchung/umbuchungAusBuchung";
import {
  buchungBearbeiten,
  buchungErfassen,
  bankzeileVerwerfen,
  buchungLoeschen,
  pruefmarkerSetzen,
  buchungenPaaren,
  buchungshistorie,
  buchungsdetail,
  buchungZuruecksetzen,
  dublettenFreigabeAufheben,
  dublettenFreigeben,
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
import { formularAusBuchung, VertragModal } from "../vertraege/VertragModal";
import { useLoeschfrage } from "../bausteine/Loeschfrage";
import { Auswahl } from "../bausteine/Auswahl";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { MerkmaleBlock } from "../training/MerkmaleBlock";
import { Modal } from "../bausteine/Modal";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { ddmm } from "./ddmm";
import { BuchungsHerkunft } from "./BuchungsHerkunft";
import { JournalBlock } from "./JournalBlock";
import {
  betragsHoehe,
  richtungVon,
  Richtungswahl,
  vorzeichenAbspalten,
  type Richtung,
} from "./Richtungswahl";
import { DublettenBlock, FreigabeHinweis, type Dublettenbefund } from "./DublettenBlock";
import { VertragsBlock, type VertragsBindung } from "./VertragsBlock";

/** Stabile Leerwerte — als Literal im useState-Aufruf wäre jeder Render ein neues Objekt. */
const LEERE_KARTE: ReadonlyMap<string, Dublettenverdacht> = new Map();
const LEERE_MENGE: ReadonlySet<string> = new Set();

/**
 * Die Maske selbst — alle drei Rollen in EINEM Formular.
 *
 * WAS HIER LIEGT UND WAS DANEBEN. Die Datei war 1751 Zeilen lang, davon eine Funktion mit
 * 762; am 2026-08-25 ist sie entzerrt worden. Ausgezogen ist, was den Zustand der Maske
 * NICHT braucht — jeder dieser Teile bekommt seine Daten herein und meldet Entscheidungen
 * zurück, mehr nicht:
 *
 *   `VertragsBlock`      gehört diese Zahlung zu einem Vertrag?
 *   `DublettenBlock`     steht sie womöglich schon ein zweites Mal da?
 *   `BuchungsHerkunft`   woher sie kommt — reine Anzeige
 *   `Richtungswahl`      Höhe und Richtung des Betrags, samt der Zerlegung dahinter
 *   `SplitModal`         aufteilen (S-7)
 *   `ZurUmbuchungModal`  zur Umbuchung machen (S-1)
 *
 * Was BLIEB, ist das Formular: die Felder, ihr Zustand und der Weg zum Speichern. Es ist
 * immer noch die grösste Funktion im Bereich, und das ist kein Rest, den man noch
 * wegräumen könnte — es ist der Preis für einen Dialog in drei Rollen. Wer sie kleiner
 * haben will, muss den Dialog teilen, und dann fehlt genau das, wofür es ihn gibt: dass
 * jede Erweiterung an EINER Stelle ankommt statt an dreien (siehe oben).
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
/**
 * Was das Formular hereinbekommt.
 *
 * Ein benannter Typ statt einer Inline-Signatur, seit `BuchungDetail.tsx` 2026-08-25
 * entzerrt wurde. Vorher standen dreissig Eigenschaften in EINER Zeile mit über
 * zweitausend Zeichen — man konnte weder nachsehen, was das Formular braucht, noch etwas
 * ergänzen, ohne die Zeile vorher zu entziffern. Ein Diff darauf war unlesbar.
 *
 * Gruppiert nach der Frage, die jede Gruppe beantwortet, nicht alphabetisch: die Zahl der
 * Eigenschaften ist der Preis für EINEN Dialog in drei Rollen (siehe Kopf), und wer sie
 * senken will, muss den Dialog teilen — nicht die Liste umsortieren.
 */
interface FormularProps {
  // ── In welcher Rolle: genau eines von beiden, oder keins (neu anlegen) ──────────────
  buchung?: IstBuchung;
  entwurf?: Umsatz;
  /** Konto und Tag der Stelle, von der aus geöffnet wurde — Vorbelegung beim Anlegen. */
  vorgabe: { kontoId: string; datum: string };

  // ── Bezugsdaten, die der Dialog nicht selbst lädt ───────────────────────────────────
  konten: Zahlungskonto[];
  kategorien: Kategorie[];
  vertraege: readonly Vertrag[];
  kontoName: Map<string, string>;
  kategorieName: Map<string, string>;
  /** Konten mit Bankverbindung — dort sind Datum und Betrag Tatsachen, keine Eingabe. */
  onlineKonten: ReadonlySet<string>;

  // ── Was über DIESE Zeile bekannt ist ────────────────────────────────────────────────
  /** Der Beleg, falls die Buchung aus einem Import stammt. */
  umsatz?: Umsatz;
  importLauf?: ImportLauf;
  /** Das andere Bein, wenn die Buchung Teil einer Umbuchung ist. */
  gegenbuchung?: IstBuchung;
  /** Der frisch gelesene Stand — der Prüfmarker wirkt sofort, nicht erst beim Speichern. */
  aktuelle?: IstBuchung;
  /** Was mit dieser Zeile geschah — fehlt, solange sie noch nicht gespeichert ist. */
  historie?: Buchungshistorie;
  ausBankabruf?: boolean;

  // ── Dublettenverdacht ───────────────────────────────────────────────────────────────
  dublette?: Dublettenbefund;
  /** Die anderen Entwürfe desselben Laufs — für die Suche nach dem Gegenbein. */
  andereEntwuerfe: readonly Umsatz[];
  alleBuchungen: readonly IstBuchung[];
  onZwillingOeffnen?: () => void;
  onKeinDuplikat?: () => void | Promise<void>;
  onFreigabeAufheben?: () => void | Promise<void>;

  // ── Vertragszuordnung ───────────────────────────────────────────────────────────────
  vertragsBindung?: VertragsBindung;

  // ── Wege, die von hier ausgehen ─────────────────────────────────────────────────────
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void | Promise<void>;
  onPruefmarker: (vorgemerkt: boolean) => Promise<void>;
  onZurUmbuchung: () => void;
  onLoesen: () => void | Promise<void>;
  onGegenbuchung: (b: IstBuchung) => void;
  onSplitten: () => void;
  onSplitAufheben: () => void | Promise<void>;
  onZuruecksetzen: () => Promise<void>;
}

function BuchungFormular({
  buchung,
  entwurf,
  andereEntwuerfe,
  alleBuchungen,
  vertraege,
  vorgabe,
  konten,
  kategorien,
  kontoName,
  kategorieName,
  umsatz,
  importLauf,
  gegenbuchung,
  dublette,
  onZwillingOeffnen,
  onKeinDuplikat,
  onFreigabeAufheben,
  onClose,
  onSaved,
  onDelete,
  ausBankabruf,
  onlineKonten,
  aktuelle,
  onPruefmarker,
  onZurUmbuchung,
  vertragsBindung,
  onLoesen,
  onGegenbuchung,
  onSplitten,
  onSplitAufheben,
  historie,
  onZuruecksetzen,
}: FormularProps) {
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
  const gepaart = !!buchung?.transferId;
  const loeschfrage = useLoeschfrage();
  const geteilt = !!buchung && istGeteilt(buchung);
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
    <>
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
              // Die Rückfrage sitzt HIER und nicht in `entfernen`: dort ist schon
              // entschieden. Was hier weggeht, ist eine Tatsache über Geld — der
              // folgenreichste Löschweg der App, und bis 2026-08-27 der einzige ohne
              // jeden Zwischenschritt.
              onClick={() =>
                loeschfrage.stellen({
                  // Woran man die Buchung wiedererkennt — dieselbe Kette wie im
                  // Auszug: eigene Notiz, sonst Empfänger, sonst Verwendungszweck.
                  name:
                    notiz ||
                    umsatz?.gegenpartei ||
                    umsatz?.verwendungszweck ||
                    t("konten.dieseBuchungName"),
                  folgen: t(
                    ausBankabruf
                      ? "konten.detailVerwerfenFolgen"
                      : gepaart
                        ? "konten.detailLoeschenFolgenPaar"
                        : "konten.detailLoeschenFolgen",
                  ),
                  ausfuehren: () => onDelete(),
                })
              }
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
          <Auswahl
            ariaLabel={t("konten.detail.konto")}
            wert={kontoId}
            deaktiviert={gepaart}
            aufAenderung={setKontoId}
            optionen={konten.map((k) => ({ wert: k.id, text: k.bezeichnung }))}
          />
        </FormField>
        {/* Tag und Betrag der Bank sind Tatsachen, keine Eingabe — im Entwurf stehen sie
            nur da. Wer korrigieren muss, tut das nach dem Übernehmen an der Buchung. */}
        <FormField label={t("konten.feldDatum")} required hint={istEntwurf || kontoIstOnline ? t("konten.entwurf.vonDerBank") : undefined}>
          <Datumsfeld ariaLabel={t("konten.feldDatum")} wert={datum} deaktiviert={istEntwurf || kontoIstOnline} aufAenderung={setDatum} />
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
                  <span style={{ minWidth: 180 }}>
                    <Auswahl
                      ariaLabel={t("konten.zurUmbuchung.neu")}
                      wert={neuKontoGewaehlt}
                      aufAenderung={(v) => { setNeuKontoId(v); setGegenwahl("__neu"); }}
                      optionen={andereKonten.map((k) => ({ wert: k.id, text: k.bezeichnung }))}
                    />
                  </span>
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
          <Auswahl
            ariaLabel={t("konten.zuVertrag.waehlen")}
            wert={vertragWahl}
            aufAenderung={setVertragWahl}
            optionen={[
              { wert: "", text: t("konten.zuVertrag.offen") },
              { wert: "__keiner", text: t("konten.zuVertrag.keiner") },
              ...vertraege.map((v) => ({ wert: v.id, text: v.anbieter })),
            ]}
          />
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
            {vertragWahl ? t("konten.entwurf.vertragVorgemerkt") : t("konten.entwurf.vertragOffen")}
          </div>
        </div>
      )}

      {/* Verlauf — was an dieser Zeile geändert wurde, und der Weg zurück. Über der
          Herkunft, weil er die eigene Arbeit betrifft: „was habe ich hier verstellt"
          fragt man eher als „woher kam die Zeile". */}
      {buchung && (
        <JournalBlock
          historie={historie}
          aktuell={buchung}
          kontoName={kontoName}
          kategorieName={kategorieName}
          onZuruecksetzen={onZuruecksetzen}
        />
      )}

      {/* Herkunft — alles, was bekannt ist, aber hier nicht geändert wird. */}
      <BuchungsHerkunft
        buchung={buchung}
        entwurf={entwurf}
        umsatz={kopfUmsatz}
        importLauf={importLauf}
      />

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
      {/* Ausserhalb des Modals, als Geschwister: der Modal-Stapel gibt Escape dem
          OBERSTEN Dialog, und das soll hier die Rückfrage sein und nicht die Maske
          darunter. Ineinander verschachtelt hinge die Rückfrage am Lebenszyklus der
          Maske — sie verschwände beim Schliessen mit. */}
      {loeschfrage.dialog}
    </>
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
  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [laeufe, setLaeufe] = useState<ImportLauf[]>([]);
  const [alle, setAlle] = useState<IstBuchung[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [zuordnungen, setZuordnungen] = useState<Vertragszuordnung[]>([]);
  const [dublettenverdacht, setDublettenverdacht] = useState<ReadonlyMap<string, Dublettenverdacht>>(LEERE_KARTE);
  const [freigegeben, setFreigegeben] = useState<ReadonlySet<string>>(LEERE_MENGE);
  const [freigaben, setFreigaben] = useState<readonly Dublettenfreigabe[]>([]);
  const [onlineKonten, setOnlineKonten] = useState<ReadonlySet<string>>(LEERE_MENGE);
  const [historie, setHistorie] = useState<Buchungshistorie | undefined>(undefined);

  async function laden() {
    const d = await buchungsdetail();
    setKonten([...d.konten]); setKategorien([...d.kategorien]);
    setUmsaetze([...d.umsaetze]); setLaeufe([...d.laeufe]); setAlle([...d.buchungen]);
    setVertraege([...d.vertraege]); setZuordnungen([...d.zuordnungen]);
    setDublettenverdacht(d.dublettenverdacht); setFreigegeben(d.freigegeben); setFreigaben(d.freigaben);
    setOnlineKonten(d.onlineKonten);
    // Die gezeigte Buchung aus dem frischen Stand nachziehen (nach dem Speichern).
    setAktuelle((b) => (b ? d.buchungen.find((x) => x.id === b.id) ?? b : undefined));
  }
  useEffect(() => { laden(); }, []);

  // Die Historie hängt an der GEZEIGTEN Buchung, nicht am Dialog: der Sprung zur
  // Gegenbuchung wechselt sie. Deshalb ein eigener Effekt und nicht ein Feld in
  // `buchungsdetail()`, das einmal beim Öffnen geladen würde.
  useEffect(() => {
    if (!aktuelle) { setHistorie(undefined); return; }
    let verworfen = false;
    void buchungshistorie(aktuelle).then((h) => { if (!verworfen) setHistorie(h); });
    return () => { verworfen = true; };
  }, [aktuelle]);

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
    const belegHier = umsatzByIst.get(vertragAus.id);
    const anbieter = belegHier?.gegenpartei || vertragAus.notiz || "";
    return (
      <VertragModal
        start={formularAusBuchung(vertragAus, anbieter, geld, belegHier?.glaeubigerId)}
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
      // Kein `onClose()`: die Aufteilung aufzuheben ist ein Schritt IM Dialog, kein
      // Abschluss. Danach steht die Buchung ohne Kategorie da (siehe `splitAufheben`) —
      // also genau in dem Zustand, in dem man als Nächstes eine vergeben will. Der Dialog
      // schloss sich weg und man musste die Zeile im Auszug wiederfinden.
      // `nachAenderung` zieht die gezeigte Buchung nach, der Block wechselt von selbst
      // von der Teileliste auf das Kategoriefeld.
      onSplitAufheben={async () => { if (!aktuelle) return; await splitAufheben(aktuelle); await nachAenderung(); }}
      historie={historie}
      // Kein `onClose()`: das Zurücknehmen ist ein Schritt IM Dialog. Man will danach
      // sehen, was jetzt dasteht — dieselbe Überlegung wie beim Aufheben der Aufteilung.
      onZuruecksetzen={async () => { if (!aktuelle) return; await buchungZuruecksetzen(aktuelle); await nachAenderung(); }}
    />
  );
}
