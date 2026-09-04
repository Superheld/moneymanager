// Die Vertrags-Maske als eigene Komponente — eine Maske erzeugt Vertrag (Stammdaten) +
// abgeleitete Zahlungsregel (Planung).
//
// Eigene Datei, weil sie an zwei Stellen gebraucht wird: im Vertrags-Screen (anlegen,
// bearbeiten, Vorschlag übernehmen) UND in den Buchungsdetails, wo man beim Durchsehen
// auf eine wiederkehrende Zahlung stößt, die noch kein Vertrag ist. Sie lädt ihre
// Stammdaten (Personen, Kategorien, Konten) deshalb SELBST — dieselbe Abwägung wie beim
// Buchungsdialog: ein Modal geht selten auf, und die Alternative wäre, jeden Aufrufer
// mit Daten zu belasten, die nur diese Maske braucht.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  erkennungProbieren,
  minorZuMajor,
  type Charakter,
  type Kategorie,
  type Person,
  type Rhythmus,
  type Verlaengerungsart,
  type Vertragsart,
  type Vertrag,
  type Vertragskandidat,
  type Zahlungskonto,
  type Zahlungsregel,
  type Zahlungsspur,
} from "../../../application";
import {
  spuren as spurenLaden,
  stammdaten,
  vertragAktualisieren,
  vertragAnlegen,
  vertragserkennungen,
  vertragserkennungSpeichern,
  vertragszuordnungenAbgleichen,
} from "../../dienste";
import {
  ErkennungsBereich,
  erkennungAusRegel,
  regelAusErkennung,
  type ErkennungFormular,
} from "./ErkennungsBereich";
import { Button, FormField } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { Auswahl } from "../bausteine/Auswahl";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { useGeld, fehlerNachricht, type Geld } from "../bausteine/einstellungenKontext";

const RHYTHMEN: Rhythmus[] = ["monatlich", "quartalsweise", "halbjaehrlich", "jaehrlich"];
const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];

/**
 * Der Formularzustand als eigener Typ. Die Beträge und Monatszahlen stehen als TEXT
 * darin, nicht als Zahl: solange getippt wird, ist „1,2" ein legitimer Zwischenstand,
 * den kein Cent-Integer abbilden kann. Umgerechnet wird beim Speichern.
 */
export interface VertragFormular {
  anbieter: string;
  inhaberId: string;
  beginn: string;
  ersteZahlung: string;
  mindestlaufzeit: string;
  verlaengerung: Verlaengerungsart;
  verlaengerungMonate: string;
  art: Vertragsart;
  kuendigungsfrist: string;
  betragText: string;
  rhythmus: Rhythmus;
  charakter: Charakter;
  kategorieId: string;
  kontoId: string;
  /**
   * Zielkonto einer Umbuchung. Steht nur zur Wahl, wenn der Charakter „Umschichtung"
   * ist — bei Aufwand oder Ertrag verlässt das Geld den erfassten Bereich, und ein
   * Zielkonto behauptete etwas anderes.
   */
  gegenkontoId: string;
  /**
   * SEPA-Gläubiger-ID aus einem übernommenen Vorschlag. Kein Eingabefeld — sie wird
   * durchgereicht, nicht getippt. Sie landet in der Erkennungsregel des Vertrags, wo sie
   * der präziseste Schlüssel ist, den es gibt (siehe core/vertragZuordnung).
   */
  glaeubigerId: string;
}

/** Leere Maske; `heute` belegt Beginn und erste Zahlung vor. */
export function leeresFormular(heute: string): VertragFormular {
  return {
    anbieter: "",
    inhaberId: "",
    beginn: heute,
    ersteZahlung: heute,
    mindestlaufzeit: "",
    verlaengerung: "automatisch",
    verlaengerungMonate: "12",
    art: "abo",
    kuendigungsfrist: "",
    betragText: "",
    rhythmus: "monatlich",
    charakter: "Aufwand",
    kategorieId: "",
    kontoId: "",
    gegenkontoId: "",
    glaeubigerId: "",
  };
}

/**
 * Bestehender Vertrag + seine Regel → Maske. Der Betrag kommt POSITIV in die Maske;
 * die Richtung trägt der Charakter, und `vertragAnlegen` setzt das Vorzeichen daraus.
 */
export function formularAusVertrag(v: Vertrag, r: Zahlungsregel | undefined, geld: Geld): VertragFormular {
  return {
    anbieter: v.anbieter,
    inhaberId: v.inhaberId ?? "",
    beginn: v.beginn,
    // Die erste Fälligkeit steht an der Regel, nicht am Vertrag: der Beginn trägt die
    // Fristen, die erste Zahlung den Takt der Planung.
    ersteZahlung: r?.startdatum ?? v.beginn,
    mindestlaufzeit: v.mindestlaufzeitMonate != null ? String(v.mindestlaufzeitMonate) : "",
    verlaengerung: v.verlaengerung,
    verlaengerungMonate: v.verlaengerungMonate != null ? String(v.verlaengerungMonate) : "12",
    art: v.art ?? "abo",
    kuendigungsfrist: v.kuendigungsfristMonate != null ? String(v.kuendigungsfristMonate) : "",
    betragText: r ? String(minorZuMajor(Math.abs(r.betrag), geld.waehrung)) : "",
    rhythmus: r?.rhythmus ?? "monatlich",
    charakter: r?.charakter ?? "Aufwand",
    kategorieId: r?.kategorieId ?? "",
    kontoId: r?.kontoId ?? "",
    gegenkontoId: r?.gegenkontoId ?? "",
    // Beim Bearbeiten steht die Erkennungsregel nicht zur Debatte — sie hat ihre eigene
    // Maske und darf hier nicht überschrieben werden.
    glaeubigerId: "",
  };
}

/** Erkannter Kandidat → Maske. Bestätigt wird in der Maske, nicht in der Vorschlagsliste. */
export function formularAusKandidat(k: Vertragskandidat, heute: string, geld: Geld): VertragFormular {
  return {
    ...leeresFormular(heute),
    anbieter: k.anbieter,
    beginn: k.ersteZahlung,
    ersteZahlung: k.ersteZahlung,
    betragText: String(minorZuMajor(k.betrag, geld.waehrung)),
    rhythmus: k.rhythmus,
    charakter: k.charakter,
    kategorieId: k.kategorieId ?? "",
    // Das Konto, über das die erkannten Zahlungen tatsächlich liefen — steht in den
    // Buchungen und muss nicht noch einmal gesucht werden.
    kontoId: k.kontoId ?? "",
    glaeubigerId: k.glaeubigerId ?? "",
  };
}

/**
 * Gebuchte Zahlung → Maske. Der Weg dahin ist die Buchungsansicht: man stößt beim
 * Durchsehen auf eine Zahlung, die offensichtlich wiederkehrt, und will sie in die
 * Planung heben, ohne Empfänger und Betrag abzutippen.
 *
 * Was die Buchung NICHT weiß, ist der Rhythmus — eine einzelne Zahlung hat keinen. Er
 * bleibt auf „monatlich" und gehört in der Maske geprüft. Wer den Takt aus dem Bestand
 * hergeleitet haben will, nimmt den Vorschlag im Vertrags-Screen; der rechnet über alle
 * Zahlungen derselben Gegenpartei.
 *
 * `datum` wird Beginn UND erste Fälligkeit: eine schon erfolgte Zahlung ist der beste
 * Anker für den Takt, und die Fristen lassen sich in der Maske nachtragen.
 */
export function formularAusBuchung(
  e: { datum: string; betrag: number; charakter: Charakter; kategorieId?: string; kontoId: string },
  anbieter: string,
  geld: Geld,
  glaeubigerId?: string,
): VertragFormular {
  return {
    ...leeresFormular(e.datum),
    anbieter,
    // Die Gläubiger-ID vom BELEG, wenn es eine gibt. Sie ist das einzige Merkmal, das den
    // Einzieher eindeutig benennt — der Empfängername ist Text mit Unschärfe. Sie hier
    // wegzulassen hiess: der Beleg trug die belastbare Angabe, und die Regel, die aus ihm
    // entsteht, verliess sich trotzdem allein auf den Namen.
    glaeubigerId: glaeubigerId ?? "",
    betragText: String(minorZuMajor(Math.abs(e.betrag), geld.waehrung)),
    charakter: e.charakter,
    kategorieId: e.kategorieId ?? "",
    kontoId: e.kontoId,
  };
}

/**
 * Ein abgesetzter Block in der Maske. Die Felder eines Vertrags zerfallen in zwei
 * Gruppen, die verschieden viel wiegen: was in die Planung rechnet (Betrag, Rhythmus,
 * Fälligkeit, Konto) und was nur die Konditionen beschreibt (Laufzeit, Fristen). Als
 * eine durchgehende Wand aus Eingabefeldern sah beides gleich wichtig aus.
 *
 * `einklappbar` geht noch einen Schritt weiter: die Konditionen sind beim Anlegen fast
 * immer leer und werden selten angefasst — ausgeklappt kosten sie die halbe Maske für
 * Felder, die niemand ausfüllt. Zugeklappt bleiben sie EINE Zeile, die sagt, dass es
 * sie gibt. Aufgeklappt wird bewusst, nicht beim Scrollen.
 *
 * Auch beim Bearbeiten bleibt der Block zu: was drinsteht, sagt der `hinweis` in der
 * zugeklappten Zeile. Aufklappen muss nur, wer ÄNDERN will.
 *
 * Bewusst kein `<details>`: dessen Marker und Bündigkeit lassen sich über Browser
 * hinweg nicht verlässlich an die übrigen Abschnittsköpfe angleichen.
 */
function Abschnitt({ titel, hinweis, einklappbar, children }: {
  titel: string;
  hinweis?: string;
  einklappbar?: boolean;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(!einklappbar);
  const zugeklappt = einklappbar && !offen;

  const kopf = (
    <>
      <h4 style={{ margin: 0, fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-black)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-2)" }}>
        {einklappbar && <span aria-hidden style={{ marginRight: 6, color: "var(--ink-3)" }}>{offen ? "▾" : "▸"}</span>}
        {titel}
      </h4>
      {hinweis && <span style={{ fontSize: "12px", color: "var(--ink-3)" }}>{hinweis}</span>}
    </>
  );

  const kopfStil = { display: "flex", alignItems: "baseline", gap: 8, borderTop: "1px solid var(--line)", paddingTop: "var(--sp-3)" } as const;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: zugeklappt ? 0 : "var(--sp-3)" }}>
      {einklappbar ? (
        <button
          type="button"
          aria-expanded={offen}
          onClick={() => setOffen((o) => !o)}
          style={{ ...kopfStil, width: "100%", background: "none", border: "none", borderTop: "1px solid var(--line)", textAlign: "left", cursor: "pointer", fontFamily: "var(--font-ui)", paddingLeft: 0, paddingRight: 0, paddingBottom: zugeklappt ? "var(--sp-3)" : 0 }}
        >
          {kopf}
        </button>
      ) : (
        <div style={kopfStil}>{kopf}</div>
      )}
      {!zugeklappt && children}
    </section>
  );
}

/**
 * `editId` gesetzt → bestehenden Vertrag ändern, sonst anlegen. `start` ist der
 * Anfangszustand der Maske; ab dem Öffnen gehört der Zustand der Maske (deshalb
 * useState-Initialwert und kein Effekt — wer die Vorbelegung wechseln will, gibt der
 * Komponente einen anderen `key`).
 */
export function VertragModal({ editId, start, onClose, onSaved, hinweis }: {
  editId?: string | null;
  start: VertragFormular;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  /** Optionaler Satz über der Maske — etwa, woher die Vorbelegung stammt. */
  hinweis?: ReactNode;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [f, setF] = useState<VertragFormular>(start);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  /**
   * Die Erkennung — `null`, solange sie nicht geladen ist, und beim ANLEGEN dauerhaft.
   *
   * Der Unterschied traegt: gespeichert wird sie nur, wenn hier etwas steht. Sonst
   * schriebe ein Dialog, der die Regel nie zu sehen bekam, eine leere Regel zurueck und
   * schaltete die Erkennung des Vertrags stillschweigend ab.
   */
  const [erkennung, setErkennung] = useState<ErkennungFormular | null>(null);
  const [spuren, setSpuren] = useState<Zahlungsspur[]>([]);

  useEffect(() => {
    // Zusammen laden und zusammen setzen — gestaffelte setState lassen die Auswahllisten
    // kurz leer erscheinen und die Vorbelegung damit ins Nichts zeigen.
    (async () => {
      const d = await stammdaten();
      const [p, k, ko] = [[...d.personen], [...d.kategorien], [...d.konten]];
      setPersonen(p);
      setKategorien(k);
      setKonten(ko);
    })();
  }, []);

  /**
   * Die Erkennung und die Zahlungsspuren — nur beim BEARBEITEN.
   *
   * Ein Vertrag, den es noch nicht gibt, hat weder eine Regel noch eine Id, an der eine
   * haengen koennte; eine Vorschau haette nichts zu zeigen und die Merkmalsliste keinen
   * Ort. `vertragAnlegen` legt die Standardregel beim Speichern an — danach steht der
   * Abschnitt da, mit allem drin.
   *
   * Die Spuren kommen hierher und nicht in den Abschnitt, weil die zugeklappte Zeile die
   * Trefferzahl mitnennt: sonst muesste man aufklappen, um zu sehen, ob es etwas zu
   * sehen gibt — derselbe Grund, aus dem die Konditionen ihre Zusammenfassung tragen.
   */
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const [regeln, sp] = await Promise.all([vertragserkennungen(), spurenLaden()]);
      setErkennung(erkennungAusRegel(regeln.find((e) => e.vertragId === editId), geld.waehrung));
      setSpuren(sp);
    })();
  }, [editId]);

  /** Regel aus der Maske und was sie trifft — beides brauchen Kopfzeile und Abschnitt. */
  const regel = useMemo(
    () => (editId && erkennung ? regelAusErkennung(editId, erkennung, geld.parse) : null),
    [editId, erkennung, geld],
  );
  const probe = useMemo(() => erkennungProbieren(regel, spuren), [regel, spuren]);

  /**
   * Was in den Konditionen steht, in einer Zeile — die Beschriftung des zugeklappten
   * Abschnitts. Leer, wenn nichts drinsteht; dann greift der Standard-Hinweis.
   */
  const konditionen = [
    f.mindestlaufzeit && t("vertraege.zusammenMindestlaufzeit", { monate: f.mindestlaufzeit }),
    f.kuendigungsfrist && t("vertraege.zusammenKuendigungsfrist", { monate: f.kuendigungsfrist }),
    f.verlaengerung === "keine" ? t("vertraege.zusammenKeineVerlaengerung") : null,
    f.inhaberId ? personen.find((p) => p.id === f.inhaberId)?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function setze<K extends keyof VertragFormular>(feld: K, wert: VertragFormular[K]) {
    setF((v) => ({ ...v, [feld]: wert }));
  }

  /**
   * Die Art „Umbuchung" zieht den Charakter mit.
   *
   * Sonst gäbe es den Zustand „Umbuchungsvertrag mit Charakter Aufwand" — eine
   * Vereinbarung, die sagt, das Geld verlasse den erfassten Bereich, und zugleich, es
   * bleibe darin. Das Zielkonto erschiene dann nicht, und der Vertrag bliebe stumm ein
   * gewöhnlicher.
   */
  function artWaehlen(art: Vertragsart) {
    setF((v) => ({ ...v, art, charakter: art === "umbuchung" ? "Umschichtung" : v.charakter }));
  }

  /** Kategorie wählen belegt den Charakter mit — er folgt fast immer der Kategorie. */
  function kategorieWaehlen(id: string) {
    const k = kategorien.find((x) => x.id === id);
    setF((v) => ({ ...v, kategorieId: id, charakter: k ? k.defaultCharakter : v.charakter }));
  }

  async function speichern() {
    setFehler(null);
    const eingabe = {
      anbieter: f.anbieter,
      inhaberId: f.inhaberId || undefined,
      beginn: f.beginn,
      ersteZahlung: f.ersteZahlung || undefined,
      mindestlaufzeitMonate: f.mindestlaufzeit ? Number(f.mindestlaufzeit) : undefined,
      verlaengerung: f.verlaengerung,
      verlaengerungMonate: f.verlaengerungMonate ? Number(f.verlaengerungMonate) : undefined,
      art: f.art,
      kuendigungsfristMonate: f.kuendigungsfrist ? Number(f.kuendigungsfrist) : undefined,
      betrag: geld.parse(f.betragText) ?? 0,
      rhythmus: f.rhythmus,
      charakter: f.charakter,
      kategorieId: f.kategorieId || undefined,
      kontoId: f.kontoId || undefined,
      gegenkontoId: f.gegenkontoId || undefined,
      glaeubigerId: f.glaeubigerId || undefined,
    };
    try {
      if (editId) await vertragAktualisieren(editId, eingabe);
      else await vertragAnlegen(eingabe);
      // Die Erkennung NACH dem Vertrag: `vertragAnlegen` legt fuer einen Vertrag ohne
      // Regel die Standardregel an, und die soll nicht die gerade bearbeitete
      // ueberschreiben. Beim Anlegen ist `regel` null — dann bleibt es bei der
      // Standardregel, die dort entsteht.
      if (regel) await vertragserkennungSpeichern(regel);
      // Der frisch erfasste Vertrag muss RÜCKWIRKEND greifen: seine Zahlungen liegen
      // längst im Bestand. Ohne diesen Lauf trüge nur, was danach gebucht wird, seine
      // Zuordnung — und der Vertrag stünde in der Liste, ohne je eine Buchung zu kennen.
      await vertragszuordnungenAbgleichen();
      await onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={editId ? t("vertraege.modalBearbeiten") : t("vertraege.anlegen")}
      subtitle={t("vertraege.modalUntertitel")}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>
            {t("vertraege.speichern")}
          </Button>
          <button className="linkbtn" onClick={onClose}>
            {t("vertraege.abbrechen")}
          </button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      {hinweis && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-3)" }}>
          {hinweis}
        </div>
      )}

      <FormField label={t("vertraege.feldAnbieter")} required>
        <input className="field" value={f.anbieter} onChange={(e) => setze("anbieter", e.target.value)} placeholder={t("vertraege.feldAnbieterPlatzhalter")} />
      </FormField>

      <Abschnitt titel={t("vertraege.abschnittZahlung")} hinweis={t("vertraege.abschnittZahlungHinweis")}>
        <div className="form-grid">
          <FormField label={`${t("vertraege.feldBetrag")} ${geld.symbol}`} required hint={t("vertraege.feldBetragHinweis")}>
            <input className="field" inputMode="decimal" value={f.betragText} onChange={(e) => setze("betragText", e.target.value)} placeholder={geld.format(0)} />
          </FormField>
          <FormField label={t("vertraege.feldRhythmus")}>
            <Auswahl
              ariaLabel={t("vertraege.feldRhythmus")}
              wert={f.rhythmus}
              aufAenderung={(v) => setze("rhythmus", v as Rhythmus)}
              optionen={RHYTHMEN.map((r) => ({ wert: r, text: t(`vertraege.rhythmus.${r}`) }))}
            />
          </FormField>
          <FormField label={t("vertraege.feldErsteZahlung")} hint={t("vertraege.feldErsteZahlungHinweis")}>
            <Datumsfeld ariaLabel={t("vertraege.feldErsteZahlung")} wert={f.ersteZahlung} aufAenderung={(v) => setze("ersteZahlung", v)} />
          </FormField>
          <FormField label={t("vertraege.feldKonto")} hint={t("vertraege.optional")}>
            <Auswahl
              ariaLabel={t("vertraege.feldKonto")}
              wert={f.kontoId}
              aufAenderung={(v) => setze("kontoId", v)}
              optionen={[{ wert: "", text: "—" }, ...konten.map((k) => ({ wert: k.id, text: k.bezeichnung }))]}
            />
          </FormField>
          <FormField label={t("vertraege.feldKategorie")} hint={t("vertraege.feldKategorieHinweis")}>
            <CategoryPicker kategorien={kategorien} value={f.kategorieId} onChange={kategorieWaehlen} />
          </FormField>
          <FormField label={t("vertraege.feldCharakter")}>
            <Auswahl
              ariaLabel={t("vertraege.feldCharakter")}
              wert={f.charakter}
              aufAenderung={(v) => setze("charakter", v as Charakter)}
              optionen={CHARAKTERE.map((c) => ({ wert: c, text: t(`charakter.${c}`) }))}
            />
          </FormField>
          {/* Das Zielkonto erscheint nur bei einer Umschichtung — und genau daran wird
              ein Umbuchungsvertrag später wiedererkannt: nicht am Empfänger (bei einer
              Zahlung zwischen zwei eigenen Konten steht dort je nach Bank die eigene
              IBAN, der eigene Name oder nichts), sondern am WEG. Ohne Zielkonto bleibt
              die Regel ein Plan ohne Ist. */}
          {f.charakter === "Umschichtung" && (
            <FormField label={t("vertraege.feldZielkonto")} hint={t("vertraege.feldZielkontoHinweis")}>
              <Auswahl
                ariaLabel={t("vertraege.feldZielkonto")}
                wert={f.gegenkontoId}
                aufAenderung={(v) => setze("gegenkontoId", v)}
                optionen={[
                  { wert: "", text: "—" },
                  ...konten.filter((k) => k.id !== f.kontoId).map((k) => ({ wert: k.id, text: k.bezeichnung })),
                ]}
              />
            </FormField>
          )}
        </div>
      </Abschnitt>

      {/* Die Erkennung — beim BEARBEITEN als eigener Abschnitt, beim Anlegen nur als
          Satz. Sie steht direkt hinter der Zahlung, weil sie an ihr haengt: wer den
          Betrag aendert, muss die Betragsspanne im selben Atemzug sehen koennen, sonst
          faellt der Vertrag nach dem Speichern aus seiner eigenen Regel.

          Bis hierher lag das hinter einem eigenen Knopf in der Vertragsliste — an einem
          Ort, an dem niemand nach den Eigenschaften eines Vertrags sucht, und mit einem
          zweiten Speichern-Knopf, der eine zweite Gelegenheit war, das eine zu sichern
          und das andere zu verwerfen.

          Bei einem UMBUCHUNGSVERTRAG steht statt des Abschnitts ein Satz. Er wird nicht
          an Merkmalen erkannt, sondern am WEG (Konto → Gegenkonto, siehe
          `umbuchungErkennung`) — eine Merkmalsliste waere dort nicht bloss nutzlos,
          sondern eine Falle: `erkennungSicherstellen` legt auch ihm die Standardregel
          aus dem Anbieternamen an, die nie trifft, und die Zeile meldete dann „trifft
          nie" an einer Einstellung, die voellig richtig ist. Wer das „behebt", tippt
          Muster ein, die nie greifen koennen. */}
      {editId && f.art === "umbuchung" && (
        <p className="muted" style={{ fontSize: "var(--fs-xs)", margin: "var(--sp-3) 0 0" }}>
          {t("vertraege.regel.umbuchungHinweis")}
        </p>
      )}
      {editId && erkennung && f.art !== "umbuchung" && (
        <Abschnitt
          titel={t("vertraege.regel.abschnitt")}
          hinweis={t("vertraege.regel.zusammen", {
            merkmale: regel?.merkmale.length ?? 0,
            count: probe.treffer.length,
          })}
          einklappbar
        >
          <ErkennungsBereich
            anbieter={f.anbieter}
            konten={konten}
            f={erkennung}
            aufAenderung={setErkennung}
            probe={probe}
          />
        </Abschnitt>
      )}
      {!editId && (
        <p className="muted" style={{ fontSize: "var(--fs-xs)", margin: "var(--sp-3) 0 0" }}>
          {t("vertraege.regel.entstehtBeimSpeichern")}
        </p>
      )}

      {/* Konditionen zugeklappt: beim Anlegen sind sie fast immer leer, beim Bearbeiten
          geht es meist um Betrag oder Kategorie. Damit nichts unsichtbar wird, was
          drinsteht, trägt die zugeklappte Zeile eine Zusammenfassung — sonst müsste man
          aufklappen, nur um zu sehen, ob es etwas zu sehen gibt. */}
      <Abschnitt
        titel={t("vertraege.abschnittVertrag")}
        hinweis={konditionen || t("vertraege.abschnittVertragHinweis")}
        einklappbar
      >
        <div className="form-grid">
          {/* Die Art steht VOR den Fristen: sie entscheidet, ob die Kündigungswarnung
              überhaupt gemeint ist. */}
          <FormField label={t("vertraege.feldArt")} hint={t(`vertraege.artHinweis.${f.art}`)}>
            <Auswahl
              ariaLabel={t("vertraege.feldArt")}
              wert={f.art}
              aufAenderung={(v) => artWaehlen(v as Vertragsart)}
              optionen={[
                { wert: "abo", text: t("vertraege.art.abo") },
                { wert: "dauervertrag", text: t("vertraege.art.dauervertrag") },
                { wert: "umbuchung", text: t("vertraege.art.umbuchung") },
              ]}
            />
          </FormField>
          <FormField label={t("vertraege.feldBeginn")} hint={t("vertraege.feldBeginnHinweis")}>
            <Datumsfeld ariaLabel={t("vertraege.feldBeginn")} wert={f.beginn} aufAenderung={(v) => setze("beginn", v)} />
          </FormField>
          <FormField label={t("vertraege.feldInhaber")} hint={t("vertraege.optional")}>
            <Auswahl
              ariaLabel={t("vertraege.feldInhaber")}
              wert={f.inhaberId}
              aufAenderung={(v) => setze("inhaberId", v)}
              optionen={[{ wert: "", text: "—" }, ...personen.map((p) => ({ wert: p.id, text: p.name }))]}
            />
          </FormField>
          <FormField label={t("vertraege.feldMindestlaufzeit")} hint={t("vertraege.optional")}>
            <input className="field" inputMode="numeric" value={f.mindestlaufzeit} onChange={(e) => setze("mindestlaufzeit", e.target.value)} placeholder={t("vertraege.feldMindestlaufzeitPlatzhalter")} />
          </FormField>
          <FormField label={t("vertraege.feldKuendigungsfrist")} hint={t("vertraege.optional")}>
            <input className="field" inputMode="numeric" value={f.kuendigungsfrist} onChange={(e) => setze("kuendigungsfrist", e.target.value)} placeholder={t("vertraege.feldKuendigungsfristPlatzhalter")} />
          </FormField>
          <FormField label={t("vertraege.feldVerlaengerung")}>
            <Auswahl
              ariaLabel={t("vertraege.feldVerlaengerung")}
              wert={f.verlaengerung}
              aufAenderung={(v) => setze("verlaengerung", v as Verlaengerungsart)}
              optionen={[
                { wert: "automatisch", text: t("vertraege.verlaengerung.automatisch") },
                { wert: "keine", text: t("vertraege.verlaengerung.keine") },
              ]}
            />
          </FormField>
          {/* Ohne automatische Verlängerung hat der Schritt keine Bedeutung — ein Feld,
              das nichts tut, kostet in jeder Maske Aufmerksamkeit. */}
          {f.verlaengerung === "automatisch" && (
            <FormField label={t("vertraege.feldVerlaengerungMonate")} hint={t("vertraege.feldVerlaengerungMonateHinweis")}>
              <input className="field" inputMode="numeric" value={f.verlaengerungMonate} onChange={(e) => setze("verlaengerungMonate", e.target.value)} placeholder={t("vertraege.feldVerlaengerungMonatePlatzhalter")} />
            </FormField>
          )}
        </div>
      </Abschnitt>
    </Modal>
  );
}
