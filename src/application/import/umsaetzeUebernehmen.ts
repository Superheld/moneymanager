// Use-Case „Übernehmen": aus geparsten RohUmsätzen + Konto-Auflösung wird der reversible
// Entwurfs-Stapel (TAKTIK-IMPORT). Legt fehlende Konten an, baut Kategorie-Vorschläge,
// dedupliziert gegen den Bestand und persistiert neue Umsätze + den ImportLauf. Berührt
// KEINE Salden — das passiert erst beim Verbuchen (Slice 4). Duplikate werden NICHT
// gespeichert, nur gezählt. Seiteneffekte laufen über injizierte Repos + id().

import { klasseVorschlag, normalisiereIban } from "../../core";
import type { Zahlungskonto } from "../../core";
import type {
  ImportLaufRepository,
  KategorieRepository,
  UmsatzRepository,
  ZahlungskontoRepository,
} from "../ports";
import { katalogNachId, katalogNachName, vorschlagFuer, type Vorschlagskontext } from "./vorschlag";
import { quelleKeyFuer } from "./kontoMatch";
import { neueBelege, rohHash } from "./rohHash";
import { traegtNeues } from "./belege";
import { ordneZu } from "./dublette";
import type { RohUmsatz } from "./rohUmsatz";
import type { Umsatz } from "./umsatz";

/** Auflösung eines Quell-Kontos: entweder bestehendes wählen ODER neues anlegen. */
export interface UebernahmeKonto {
  readonly quelleKey: string;
  readonly kontoId?: string;
  readonly neu?: { readonly bezeichnung: string; readonly typ: Zahlungskonto["typ"]; readonly iban?: string };
}

export interface UebernahmeEingabe {
  readonly quelle: string;
  readonly dateiname?: string;
  readonly zeitpunkt: string; // ISO-Datetime (vom Aufrufer; Webview-Date)
  readonly rohUmsaetze: readonly RohUmsatz[];
  readonly konten: readonly UebernahmeKonto[];
  /**
   * Fremder Kategoriename → unsere Kategorie-Id, für DIESEN Lauf.
   *
   * Vorbelegt aus der Übersetzung des Adapters, geändert in der Import-Ansicht. Sie steht
   * hier und nicht an den Rohzeilen, weil sie kein Teil des Belegs ist: die Datei sagt
   * „Restaurants", was daraus wird, entscheiden wir. Dieselbe Trennung wie zwischen
   * `umsatz_roh` und `umsatz_verarbeitung`.
   *
   * **Sie wird nicht gespeichert.** Beim nächsten Import steht wieder die Vorbelegung da.
   * Das ist der bewusst kleine Schritt: sichtbar und änderbar zuerst, gemerkt später —
   * dafür braucht es eine eigene Tabelle, denn ein fremdes Vokabular gehört zur QUELLE
   * und nicht zum Katalog.
   */
  readonly fremdkategorien?: Readonly<Record<string, string>>;
  /**
   * Woher der Lauf kam — nur ein ABRUF weiss das.
   *
   * Steht am Lauf und wird nicht aus den Umsätzen hergeleitet: gerade die Läufe ohne
   * Ergebnis sind interessant („was habe ich wann abgefragt"), und die haben keine
   * Umsätze, aus denen sich etwas ableiten liesse.
   */
  readonly herkunft?: {
    readonly zugangId?: string;
    readonly zahlungskontoId?: string;
    readonly format?: string;
    /** Die Bank hat die Trefferzahl gedeckelt — es gibt mehr, als hier ankam. */
    readonly abgeschnitten?: boolean;
  };
}

export interface UebernahmeErgebnis {
  readonly laufId: string;
  readonly eingelesen: number;
  readonly neu: number;
  readonly duplikate: number;
  /** Bekannte Zeilen, auf denen Felder nachgetragen wurden. */
  readonly ergaenzt: number;
  /** Angelegt, aber mit Verdacht auf eine vorhandene Buchung angeschrieben. */
  readonly verdacht: number;
  readonly ohneKonto: number;
  readonly angelegteKonten: number;
}

export interface UebernahmeDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
  readonly id: () => string;
  /**
   * Die weiteren Quellen der Kategorisierungs-Kette (Verträge, Modell,
   * Merkmalskonfiguration) — geladen über `kategorisierungsquellen`.
   *
   * Optional, damit dieser Use-Case nicht von vier Repositories abhängt, die er selbst
   * nie befragt. Fehlt der Kontext, bleiben Umbuchungs-Erkennung und Remapping übrig —
   * genau das Verhalten von vor der Kette.
   */
  readonly kategorisierung?: Vorschlagskontext;
}

/**
 * Serialisiert Übernahmen. Zwischen "Bestand lesen" und "Umsätze schreiben" liegt ein
 * Zeitfenster; zwei gleichzeitige Läufe lasen beide denselben (leeren) Bestand und legten
 * dieselbe Buchung doppelt an. Die DB stützt die Invariante nicht ab — die Indizes auf
 * roh_hash und native_id sind bewusst nicht eindeutig.
 *
 * Die App läuft in einem einzigen Prozess, deshalb genügt hier eine Promise-Kette. Ein
 * eindeutiger Index wäre der härtere Schutz, verlangt aber vorher eine Bereinigung
 * etwaiger Alt-Duplikate — das gehört zur Datenmigration vor der nächsten Quelle.
 */
let uebernahmeKette: Promise<unknown> = Promise.resolve();

export async function umsaetzeUebernehmen(
  eingabe: UebernahmeEingabe,
  deps: UebernahmeDeps,
): Promise<UebernahmeErgebnis> {
  const vorgaenger = uebernahmeKette;
  let freigeben: () => void = () => {};
  uebernahmeKette = new Promise<void>((r) => (freigeben = r));
  await vorgaenger.catch(() => undefined);
  try {
    return await uebernahmeIntern(eingabe, deps);
  } finally {
    freigeben();
  }
}

async function uebernahmeIntern(
  eingabe: UebernahmeEingabe,
  deps: UebernahmeDeps,
): Promise<UebernahmeErgebnis> {
  const { kontoRepo, kategorieRepo, umsatzRepo, laufRepo, id } = deps;

  // 1. Konten auflösen / fehlende anlegen → Quell-Schlüssel → kontoId.
  //
  // Dieselbe IBAN darf nur EIN Konto erzeugen, auch wenn sie in zwei Schreibweisen
  // hereinkommt: ein doppelt angelegtes Bankkonto verteilt Saldo und Umsätze auf zwei
  // Einträge und ist per Nachimport nicht mehr zu heilen.
  const kontoVon = new Map<string, string>();
  const angelegtPerIban = new Map<string, string>();
  let angelegteKonten = 0;
  for (const k of eingabe.konten) {
    if (k.kontoId) {
      kontoVon.set(k.quelleKey, k.kontoId);
    } else if (k.neu) {
      const ibanKey = k.neu.iban ? normalisiereIban(k.neu.iban) : "";
      const schonAngelegt = ibanKey ? angelegtPerIban.get(ibanKey) : undefined;
      if (schonAngelegt) {
        kontoVon.set(k.quelleKey, schonAngelegt);
        continue;
      }
      const neuesKonto: Zahlungskonto = {
        id: id(),
        bezeichnung: k.neu.bezeichnung,
        typ: k.neu.typ,
        // Beim Anlegen aus einer Quelle gibt es niemanden zu fragen — der Vorschlag aus
        // dem Typ ist das Beste, was hier zu haben ist, und in der Verwaltung änderbar.
        klasse: klasseVorschlag(k.neu.typ),
        iban: k.neu.iban,
        inhaberIds: [],
        saldo: 0,
      };
      await kontoRepo.speichern(neuesKonto);
      kontoVon.set(k.quelleKey, neuesKonto.id);
      if (ibanKey) angelegtPerIban.set(ibanKey, neuesKonto.id);
      angelegteKonten++;
    }
  }

  // 2. Katalog + Bestand laden. Der Kategorie-Katalog wird auch dann gebraucht, wenn ein
  // Kontext mitkam — dessen Indizes könnten aus einem älteren Stand stammen.
  const kategorien = await kategorieRepo.alle();
  const kontext: Vorschlagskontext = {
    ...deps.kategorisierung,
    kategorieNachId: katalogNachId(kategorien),
    kategorieNachName: katalogNachName(kategorien),
  };
  const laufId = id();

  // Die Zuordnung aus der Import-Ansicht. Getrimmt wird hier UND beim Zählen in
  // `fremdkategorienInDatei` — sonst zeigt die Ansicht einen Namen an, der beim
  // Übernehmen an einem Leerzeichen vorbeigreift.
  const gewaehlt = eingabe.fremdkategorien ?? {};
  const zugeordnet = (fremd: string | undefined) =>
    fremd ? gewaehlt[fremd.trim()] : undefined;

  // 3. Kandidaten bauen (Konto auflösen, Hash, Vorschlag). Ohne Konto → übersprungen.
  interface Kandidat {
    roh: RohUmsatz;
    rohHash: string;
    nativeId?: string;
    zahlungskontoId: string;
  }
  const kandidaten: Kandidat[] = [];
  let ohneKonto = 0;
  for (const roh of eingabe.rohUmsaetze) {
    const zahlungskontoId = kontoVon.get(quelleKeyFuer(roh.kontoIban));
    if (!zahlungskontoId) {
      ohneKonto++;
      continue;
    }
    // Das Konto wird NACHGEREICHT: liefert die Quelle keine IBAN, begänne der Hash sonst
    // mit einem leeren Kontofeld, und zwei Zeilen verschiedener Konten trügen denselben.
    kandidaten.push({
      roh,
      rohHash: rohHash(roh, zahlungskontoId),
      nativeId: roh.nativeId,
      zahlungskontoId,
    });
  }

  // 4. Wiederholungen INNERHALB dieses Laufs.
  //
  //    Eine Datei kann dieselbe Zeile zweimal enthalten. Der Finder unten sieht das nicht
  //    — er vergleicht gegen den BESTAND, und die zweite Zeile fände die erste dort noch
  //    nicht. Ohne diesen Schritt entstünden aus einem Lauf zwei gleiche Zahlungen.
  //
  //    Gegen den Bestand wird hier NICHT geprüft: was schon dasteht, findet der Finder,
  //    und ob die Zeile dann etwas beiträgt, entscheidet ein Inhaltsvergleich weiter
  //    unten. Ein Schlüsselvergleich reichte dafür nicht — `rohHash` deckt fünf Felder ab
  //    und ändert sich nicht, wenn eine Quelle eine Spalte NACHLIEFERT.
  const { neu: tragenNeues, bekannt: imLaufDoppelt } = neueBelege(kandidaten, eingabe.quelle, {
    belegSchluessel: [],
  });

  // 5a. Aus einem Kandidaten wird eine Zeile.
  //
  //    DIESELBE Abbildung für beide Wege — eine neue Zahlung und ein Beleg, der sich an
  //    eine vorhandene hängt, tragen genau dieselben Belegfelder. Zwei Abbildungen
  //    nebeneinander wären die Stelle, an der später ein Feld nur auf einem der beiden
  //    Wege ankommt, und das fiele erst beim Auswerten auf.
  const zeileAus = (k: Kandidat): Umsatz => ({
    id: id(),
    laufId,
    zahlungskontoId: k.zahlungskontoId,
    buchungstag: k.roh.buchungstag,
    valuta: k.roh.valuta,
    betrag: k.roh.betrag,
    waehrung: k.roh.waehrung,
    gegenpartei: k.roh.gegenpartei,
    glaeubigerId: k.roh.glaeubigerId,
    gegenparteiIban: k.roh.gegenparteiIban,
    mandatsreferenz: k.roh.mandatsreferenz,
    e2eReferenz: k.roh.e2eReferenz,
    umsatzart: k.roh.umsatzart,
    buchungsschluessel: k.roh.buchungsschluessel,
    zweckCode: k.roh.zweckCode,
    endempfaenger: k.roh.endempfaenger,
    bankreferenz: k.roh.bankreferenz,
    eintragReferenz: k.roh.eintragReferenz,
    bankBuchungscode: k.roh.bankBuchungscode,
    transaktionsId: k.roh.transaktionsId,
    strukturierteReferenz: k.roh.strukturierteReferenz,
    sammelposten: k.roh.sammelposten,
    buchungsstand: k.roh.buchungsstand,
    istStorno: k.roh.istStorno,
    originalBetrag: k.roh.originalBetrag,
    originalWaehrung: k.roh.originalWaehrung,
    wechselkurs: k.roh.wechselkurs,
    gebuehrBetrag: k.roh.gebuehrBetrag,
    gebuehrWaehrung: k.roh.gebuehrWaehrung,
    ruecklaufCode: k.roh.ruecklaufCode,
    ruecklaufText: k.roh.ruecklaufText,
    kundenreferenz: k.roh.kundenreferenz,
    bankfelder: k.roh.bankfelder,
    verwendungszweck: k.roh.verwendungszweck,
    rohHash: k.rohHash,
    nativeId: k.nativeId,
    status: "neu",
  });

  // 5b. Der Dublettenfinder gegen den vorhandenen Bestand.
  //
  //    Verglichen wird nur innerhalb desselben Zahlungskontos: die Kontogrenze ist hart
  //    und spart zugleich den Großteil der Vergleiche.
  //
  //    Was sich am 06.09.2026 geändert hat, ist die Folge des Urteils `identisch`. Vorher
  //    wurde die eingehende Zeile WEGGEWORFEN und die vorhandene um ihre fehlenden Felder
  //    ergänzt; die zweite Fassung war danach nirgends mehr. Jetzt hängt sie als eigener
  //    Beleg an derselben Zahlung, und welcher Wert gilt, entscheidet das Lesen.
  const vorhandeneProKonto = new Map<string, Umsatz[]>();
  for (const u of await umsatzRepo.alle()) {
    const liste = vorhandeneProKonto.get(u.zahlungskontoId);
    if (liste) liste.push(u);
    else vorhandeneProKonto.set(u.zahlungskontoId, [u]);
  }

  /**
   * Wo eine Quelle IHRE Zeilen selbst kennzeichnet, brauchen wir keine Heuristik.
   *
   * Der Index geht bewusst über ALLE Konten hinweg — und das ist kein Bruch der
   * Kontogrenze, sondern eine andere Frage. Die Grenze gilt, wenn zwei VERSCHIEDENE
   * Zahlungen verglichen werden; hier steht fest, dass es dieselbe Zeile derselben Quelle
   * ist, weil die Quelle sie so benannt hat. Ohne das entstünde bei einer geänderten
   * Kontozuordnung eine zweite Zahlung aus derselben Dateizeile.
   */
  const nachQuellId = new Map<string, Umsatz>();
  for (const liste of vorhandeneProKonto.values()) {
    for (const u of liste) {
      for (const b of u.belege ?? []) {
        if (b.nativeId) nachQuellId.set(`${b.quelle}\u0000${b.nativeId}`, u);
      }
    }
  }

  const anzulegen: Kandidat[] = [];
  const anzuhaengen: { zahlungId: string; kandidat: Kandidat }[] = [];
  /** Belege, die in genau dieser Form schon von dieser Quelle vorliegen. */
  let unveraendert = 0;
  const verdacht = new Map<Kandidat, { auf: Umsatz; gruende: readonly string[] }>();

  /** Nimmt einen Beleg an eine bekannte Zahlung — oder zählt ihn als unverändert. */
  const zuordnen = (zahlung: Umsatz, k: Kandidat) => {
    if (traegtNeues(zahlung.belege, zeileAus(k), eingabe.quelle)) {
      anzuhaengen.push({ zahlungId: zahlung.id, kandidat: k });
    } else {
      unveraendert++;
    }
  };

  const proKonto = new Map<string, Kandidat[]>();
  for (const k of tragenNeues) {
    // Zuerst die harte Kennung. Trifft sie, ist der Fall entschieden und der Finder wird
    // gar nicht erst gefragt.
    const bekannteZahlung = k.nativeId
      ? nachQuellId.get(`${eingabe.quelle}\u0000${k.nativeId}`)
      : undefined;
    if (bekannteZahlung) {
      zuordnen(bekannteZahlung, k);
      continue;
    }
    const liste = proKonto.get(k.zahlungskontoId);
    if (liste) liste.push(k);
    else proKonto.set(k.zahlungskontoId, [k]);
  }

  for (const [kontoId, gruppe] of proKonto) {
    const treffer = ordneZu(
      gruppe.map((k) => k.roh),
      vorhandeneProKonto.get(kontoId) ?? [],
    );
    treffer.forEach((t, i) => {
      const k = gruppe[i];
      if (t.bewertung.urteil === "identisch" && t.bestand) {
        // Dieselbe Zahlung — aber sagt dieser Beleg etwas, das seine Quelle noch nicht
        // gesagt hat? Der zehnte Reimport derselben unveränderten Datei lehrt nichts;
        // dieselbe Datei mit einer nachgetragenen Spalte sehr wohl.
        //
        // Verglichen wird in der BELEGFORM und nicht in der Rohform: ein `RohUmsatz`
        // trägt Felder, die nie an einem Beleg stehen (die Konto-IBAN, den fremden
        // Kategoriehinweis). Gegen einen Beleg gehalten wäre er immer verschieden, und
        // die Grenze griffe nie.
        zuordnen(t.bestand, k);
        return;
      }
      if (t.bewertung.urteil === "verdacht" && t.bestand) {
        verdacht.set(k, { auf: t.bestand, gruende: t.bewertung.gruende });
      }
      anzulegen.push(k);
    });
  }

  // 6. Ein Verdacht wird angelegt UND angeschrieben: er ist keine Sperre, sondern ein
  // Hinweis für die Durchsicht.
  const umsaetze: Umsatz[] = anzulegen.map((k) => ({
    ...zeileAus(k),
    vorschlag: vorschlagFuer(
      { ...k.roh, kategorieVorschlagId: zugeordnet(k.roh.kategorieHinweis) },
      kontext,
      k.zahlungskontoId,
    ),
  }));

  // 7. Persistieren: Lauf-Protokoll, angehängte Belege, neue Zahlungen.
  //
  // Der LAUF ZUERST. Jede Belegzeile verweist über `lauf_id` auf ihn, und seit das Schema
  // Fremdschlüssel trägt, ist die Reihenfolge keine Geschmacksfrage mehr: andersherum
  // zeigen die Zeilen auf einen Lauf, den es noch nicht gibt, und die ganze Übernahme
  // scheitert mit „FOREIGN KEY constraint failed".
  //
  // Dass es vorher gutging, lag an der Testumgebung: sql.js prüft Fremdschlüssel nicht,
  // die App tut es. Ein grüner Test war hier also nie eine Aussage über diesen Fall —
  // aufgefallen ist es erst beim ersten echten Abruf nach der Schema-Umstellung.
  await laufRepo.speichern({
    id: laufId,
    quelle: eingabe.quelle,
    zeitpunkt: eingabe.zeitpunkt,
    dateiname: eingabe.dateiname,
    eingelesen: eingabe.rohUmsaetze.length,
    neu: umsaetze.length,
    // „Schon bekannt" heisst ab jetzt nur noch eines: dieser Beleg lag in dieser Form
    // schon von dieser Quelle vor. Ein Beleg, der sich an eine vorhandene Zahlung hängt,
    // zählt NICHT mehr hierher — er trägt etwas bei und steht in `ergaenzt`.
    duplikate: imLaufDoppelt.length + unveraendert,
    ...eingabe.herkunft,
  });
  for (const { zahlungId, kandidat } of anzuhaengen) {
    await umsatzRepo.belegAnhaengen(zahlungId, zeileAus(kandidat));
  }
  await umsatzRepo.anlegenViele(umsaetze);

  return {
    laufId,
    eingelesen: eingabe.rohUmsaetze.length,
    neu: umsaetze.length,
    duplikate: imLaufDoppelt.length + unveraendert,
    ergaenzt: anzuhaengen.length,
    verdacht: verdacht.size,
    ohneKonto,
    angelegteKonten,
  };
}
