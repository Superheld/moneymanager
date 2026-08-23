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
import { klassifiziere, rohHash } from "./rohHash";
import { ordneZu } from "./dublette";
import type { RohUmsatz } from "./rohUmsatz";
import { ergaenze, type Umsatz } from "./umsatz";

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
    katalogNachName: katalogNachName(kategorien),
    kategorieNachId: katalogNachId(kategorien),
  };
  const bestand = await umsatzRepo.bestandsSchluessel();
  const laufId = id();

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
    kandidaten.push({ roh, rohHash: rohHash(roh), nativeId: roh.nativeId, zahlungskontoId });
  }

  // 4. Der Dublettenfinder gegen den vorhandenen Umsatzbestand — VOR der Schlüsselprüfung.
  //
  //    Die Reihenfolge ist keine Kosmetik: liefe die exakte Prüfung zuerst, fiele der
  //    Reimport derselben Datei sofort als Dublette heraus, und genau dann könnte nichts
  //    mehr ergänzt werden. Der Finder kennt die Buchungs-ID als oberste Stufe selbst,
  //    liefert aber zusätzlich die ZEILE, auf die sie zeigt — und die braucht es zum
  //    Nachtragen.
  //
  //    Verglichen wird nur innerhalb desselben Zahlungskontos: die Kontogrenze ist hart
  //    und spart zugleich den Großteil der Vergleiche.
  const vorhandeneProKonto = new Map<string, Umsatz[]>();
  for (const u of await umsatzRepo.alle()) {
    const liste = vorhandeneProKonto.get(u.zahlungskontoId);
    if (liste) liste.push(u);
    else vorhandeneProKonto.set(u.zahlungskontoId, [u]);
  }

  const gefunden: Kandidat[] = [];
  const verdacht = new Map<Kandidat, { auf: Umsatz; gruende: readonly string[] }>();
  const zuErgaenzen: Umsatz[] = [];

  const proKonto = new Map<string, Kandidat[]>();
  for (const k of kandidaten) {
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
        // Nicht anlegen, sondern die vorhandene Zeile um das ergänzen, was diese Quelle
        // mehr weiß. Ist nichts zu ergänzen, passiert gar nichts.
        const ergaenzt = ergaenze(t.bestand, k.roh);
        if (ergaenzt) zuErgaenzen.push(ergaenzt);
        return;
      }
      if (t.bewertung.urteil === "verdacht" && t.bestand) {
        verdacht.set(k, { auf: t.bestand, gruende: t.bewertung.gruende });
      }
      gefunden.push(k);
    });
  }

  // 5. Was der Finder durchgelassen hat, geht noch durch die exakte Schlüsselprüfung.
  //
  //    Sie fängt zwei Fälle, die der Finder nicht sehen kann: Roh-Hashes VERBUCHTER
  //    Ist-Buchungen, zu denen kein offener Umsatz mehr gehört, und Wiederholungen
  //    INNERHALB derselben Datei — dort wächst der Bestand während des Laufs mit.
  const { neu: anzulegen, duplikate } = klassifiziere(gefunden, bestand);

  // 6. Umsätze (Status neu) bauen. Ein Verdacht wird angelegt UND angeschrieben: er ist
  //    keine Sperre, sondern ein Hinweis für die Durchsicht.
  const umsaetze: Umsatz[] = anzulegen.map((k) => ({
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
    verwendungszweck: k.roh.verwendungszweck,
    rohHash: k.rohHash,
    nativeId: k.nativeId,
    status: "neu",
    vorschlag: vorschlagFuer(k.roh, kontext, k.zahlungskontoId),
  }));

  // 7. Persistieren: Lauf-Protokoll, Ergänzungen, neue Umsätze.
  //
  // Der LAUF ZUERST. Jede neue Zeile verweist über `lauf_id` auf ihn, und seit das Schema
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
    // Als Dublette zählt beides: der exakte Schlüsseltreffer und der Fund des Finders.
    duplikate: duplikate.length + (kandidaten.length - gefunden.length),
    ...eingabe.herkunft,
  });
  for (const u of zuErgaenzen) await umsatzRepo.ergaenzen(u);
  await umsatzRepo.anlegenViele(umsaetze);

  return {
    laufId,
    eingelesen: eingabe.rohUmsaetze.length,
    neu: umsaetze.length,
    duplikate: duplikate.length + (kandidaten.length - gefunden.length),
    ergaenzt: zuErgaenzen.length,
    verdacht: verdacht.size,
    ohneKonto,
    angelegteKonten,
  };
}
