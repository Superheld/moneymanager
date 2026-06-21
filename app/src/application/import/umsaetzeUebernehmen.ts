// Use-Case „Übernehmen": aus geparsten RohUmsätzen + Konto-Auflösung wird der reversible
// Entwurfs-Stapel (TAKTIK-IMPORT). Legt fehlende Konten an, baut Kategorie-Vorschläge,
// dedupliziert gegen den Bestand und persistiert neue Umsätze + den ImportLauf. Berührt
// KEINE Salden — das passiert erst beim Verbuchen (Slice 4). Duplikate werden NICHT
// gespeichert, nur gezählt. Seiteneffekte laufen über injizierte Repos + id().

import type { Zahlungskonto } from "../../core";
import type {
  ImportLaufRepository,
  KategorieRepository,
  UmsatzRepository,
  ZahlungskontoRepository,
} from "../ports";
import { katalogNachName, vorschlagFuer } from "./vorschlag";
import { klassifiziere, rohHash } from "./rohHash";
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
}

export interface UebernahmeErgebnis {
  readonly laufId: string;
  readonly eingelesen: number;
  readonly neu: number;
  readonly duplikate: number;
  readonly ohneKonto: number;
  readonly angelegteKonten: number;
}

export interface UebernahmeDeps {
  readonly kontoRepo: ZahlungskontoRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
  readonly id: () => string;
}

export async function umsaetzeUebernehmen(
  eingabe: UebernahmeEingabe,
  deps: UebernahmeDeps,
): Promise<UebernahmeErgebnis> {
  const { kontoRepo, kategorieRepo, umsatzRepo, laufRepo, id } = deps;

  // 1. Konten auflösen / fehlende anlegen → Quell-Schlüssel → kontoId.
  const kontoVon = new Map<string, string>();
  let angelegteKonten = 0;
  for (const k of eingabe.konten) {
    if (k.kontoId) {
      kontoVon.set(k.quelleKey, k.kontoId);
    } else if (k.neu) {
      const neuesKonto: Zahlungskonto = {
        id: id(),
        bezeichnung: k.neu.bezeichnung,
        typ: k.neu.typ,
        iban: k.neu.iban,
        inhaberIds: [],
        saldo: 0,
      };
      await kontoRepo.speichern(neuesKonto);
      kontoVon.set(k.quelleKey, neuesKonto.id);
      angelegteKonten++;
    }
  }

  // 2. Katalog + Bestand laden.
  const katalog = katalogNachName(await kategorieRepo.alle());
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
    const zahlungskontoId = kontoVon.get(roh.kontoIban ?? "");
    if (!zahlungskontoId) {
      ohneKonto++;
      continue;
    }
    kandidaten.push({ roh, rohHash: rohHash(roh), nativeId: roh.nativeId, zahlungskontoId });
  }

  // 4. Dedup.
  const { neu, duplikate } = klassifiziere(kandidaten, bestand);

  // 5. Umsätze (Status neu) bauen.
  const umsaetze: Umsatz[] = neu.map((k) => ({
    id: id(),
    laufId,
    zahlungskontoId: k.zahlungskontoId,
    buchungstag: k.roh.buchungstag,
    valuta: k.roh.valuta,
    betrag: k.roh.betrag,
    waehrung: k.roh.waehrung,
    gegenpartei: k.roh.gegenpartei,
    verwendungszweck: k.roh.verwendungszweck,
    rohHash: k.rohHash,
    nativeId: k.nativeId,
    status: "neu",
    vorschlag: vorschlagFuer(k.roh, katalog),
  }));

  // 6. Persistieren: Umsätze + Lauf-Protokoll.
  await umsatzRepo.speichernViele(umsaetze);
  await laufRepo.speichern({
    id: laufId,
    quelle: eingabe.quelle,
    zeitpunkt: eingabe.zeitpunkt,
    dateiname: eingabe.dateiname,
    eingelesen: eingabe.rohUmsaetze.length,
    neu: umsaetze.length,
    duplikate: duplikate.length,
  });

  return {
    laufId,
    eingelesen: eingabe.rohUmsaetze.length,
    neu: umsaetze.length,
    duplikate: duplikate.length,
    ohneKonto,
    angelegteKonten,
  };
}
