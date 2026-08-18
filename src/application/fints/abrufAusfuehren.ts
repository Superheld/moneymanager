// Abruf ausführen — die Klammer um eine Sitzung: anmelden, je zugeordnetem Konto holen,
// durch die bestehende Import-Kette schicken, Stand fortschreiben.
//
// Bewusst hier und nicht im Screen: das ist Ablauf, kein Anzeigen. Der Screen fragt die
// PIN ab und zeigt das Ergebnis; was dazwischen passiert, gehört in die Anwendungsschicht
// und ist damit ohne Oberfläche prüfbar.
//
// Zwei Entscheidungen, die im Ablauf stecken und nicht offensichtlich sind:
//
//  1. **Rückgriff statt exakt ab dem letzten Stand.** Ein Abruf startet einige Tage VOR
//     dem zuletzt geholten Tag. Banken tragen Buchungen nach, verschieben Valuta über
//     das Wochenende und stellen Kartenzahlungen verzögert ein — wer exakt am letzten
//     Tag ansetzt, verliert genau diese Nachzügler, und zwar unbemerkt. Der Preis sind
//     Dubletten, und die fängt die Dedup ab; das ist der billigere Fehler.
//  2. **Der Stand wird nur bei Erfolg fortgeschrieben.** Bricht ein Konto ab, bleibt
//     sein `letzterAbrufBis` stehen, und der nächste Lauf holt den Zeitraum erneut.

import type { ImportLaufRepository, KategorieRepository, UmsatzRepository, ZahlungskontoRepository } from "../ports";
import type { Vorschlagskontext } from "../import/vorschlag";
import { quelleKeyFuer } from "../import/kontoMatch";
import { umsaetzeUebernehmen, type UebernahmeErgebnis } from "../import/umsaetzeUebernehmen";
import type { Abrufadapter, Bankzugang, TanFrager } from "./abrufPort";
import type { Kontozuordnung, KontozuordnungRepository } from "./bankzugangPort";
import type { BankzugangRepository } from "./bankzugangPort";

/** Tage, die vor dem zuletzt abgerufenen Stand nochmals mitgeholt werden. Siehe Kopf. */
export const RUECKGRIFF_TAGE = 7;

/** Zeitraum eines Erstabrufs, wenn für ein Konto noch nie etwas geholt wurde. */
export const ERSTABRUF_TAGE = 30;

export interface AbrufBefund {
  readonly zahlungskontoId: string;
  readonly bezeichnung: string;
  readonly von: string;
  readonly bis: string;
  readonly format?: string;
  readonly ergebnis?: UebernahmeErgebnis;
  /** Gesetzt, wenn dieses Konto nicht abgerufen werden konnte — der Rest läuft weiter. */
  readonly fehler?: string;
}

export interface AbrufDeps {
  readonly adapter: Abrufadapter;
  readonly zugangRepo: BankzugangRepository;
  readonly zuordnungRepo: KontozuordnungRepository;
  readonly kontoRepo: ZahlungskontoRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly umsatzRepo: UmsatzRepository;
  readonly laufRepo: ImportLaufRepository;
  readonly id: () => string;
  readonly kategorisierung?: Vorschlagskontext;
  /** Heute als ISO-Datum — von außen, damit der Ablauf prüfbar bleibt. */
  readonly heute: string;
}

function tageVor(iso: string, tage: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t - tage));
  return d.toISOString().slice(0, 10);
}

/** Ab wann für dieses Konto geholt wird. */
export function abrufStart(zuordnung: Kontozuordnung, heute: string): string {
  return zuordnung.letzterAbrufBis
    ? tageVor(zuordnung.letzterAbrufBis, RUECKGRIFF_TAGE)
    : tageVor(heute, ERSTABRUF_TAGE);
}

/**
 * Holt für einen Zugang alle zugeordneten Konten und übernimmt sie.
 *
 * Die PIN wird durchgereicht und nirgends abgelegt. Fehlt einem Konto die Verbindung
 * (die Bank meldet es nicht mehr, oder es ist nicht adressierbar), wird das als Befund
 * zurückgegeben statt geworfen — ein Konto darf den Lauf der anderen nicht kippen.
 */
export async function abrufAusfuehren(
  zugang: Bankzugang,
  pin: string,
  frageTan: TanFrager,
  deps: AbrufDeps,
): Promise<AbrufBefund[]> {
  const zuordnungen = await deps.zuordnungRepo.nachZugang(zugang.id);
  if (zuordnungen.length === 0) return [];

  const sitzung = await deps.adapter.anmelden(zugang, pin, frageTan);

  // Bankparameter direkt nach der Anmeldung sichern: BPD/UPD können sich bei jedem
  // Auftrag ändern, und ein späterer Abbruch soll den frischen Stand nicht verwerfen.
  await deps.zugangRepo.speichern({ ...zugang, bankparameter: sitzung.bankparameter() });

  const konten = await deps.kontoRepo.alle();
  const befunde: AbrufBefund[] = [];

  for (const z of zuordnungen) {
    const bankkonto = sitzung.konten.find((k) => k.schluessel === z.schluessel);
    const zahlungskonto = konten.find((k) => k.id === z.zahlungskontoId);
    const bezeichnung = zahlungskonto?.bezeichnung ?? bankkonto?.bezeichnung ?? z.schluessel;
    const von = abrufStart(z, deps.heute);

    if (!bankkonto) {
      befunde.push({
        zahlungskontoId: z.zahlungskontoId,
        bezeichnung,
        von,
        bis: deps.heute,
        fehler: `Die Bank meldet das zugeordnete Konto (${z.schluessel}) nicht mehr.`,
      });
      continue;
    }
    if (!zahlungskonto) {
      befunde.push({
        zahlungskontoId: z.zahlungskontoId,
        bezeichnung,
        von,
        bis: deps.heute,
        fehler: "Das verknüpfte Konto der App gibt es nicht mehr.",
      });
      continue;
    }

    try {
      const abruf = await sitzung.umsaetze(bankkonto, von, deps.heute);

      // Das Ziel steht fest — es kommt aus der Zuordnung, nicht aus einem Konto-Match
      // über die IBAN. Deshalb wird hier auch nichts angelegt.
      const ergebnis = await umsaetzeUebernehmen(
        {
          quelle: abruf.ergebnis.quelle,
          dateiname: `${zugang.bezeichnung} · ${bezeichnung} · ${von} bis ${deps.heute}`,
          zeitpunkt: new Date().toISOString(),
          rohUmsaetze: abruf.ergebnis.umsaetze,
          konten: [{ quelleKey: quelleKeyFuer(bankkonto.iban), kontoId: zahlungskonto.id }],
        },
        {
          kontoRepo: deps.kontoRepo,
          kategorieRepo: deps.kategorieRepo,
          umsatzRepo: deps.umsatzRepo,
          laufRepo: deps.laufRepo,
          id: deps.id,
          kategorisierung: deps.kategorisierung,
        },
      );

      await deps.zuordnungRepo.speichern({ ...z, letzterAbrufBis: deps.heute });
      befunde.push({
        zahlungskontoId: z.zahlungskontoId,
        bezeichnung,
        von,
        bis: deps.heute,
        format: abruf.format,
        ergebnis,
      });
    } catch (e) {
      befunde.push({
        zahlungskontoId: z.zahlungskontoId,
        bezeichnung,
        von,
        bis: deps.heute,
        fehler: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Zum Schluss noch einmal: die Bank hat während der Aufträge womöglich neue Parameter
  // nachgeschoben.
  await deps.zugangRepo.speichern({ ...zugang, bankparameter: sitzung.bankparameter() });
  return befunde;
}
