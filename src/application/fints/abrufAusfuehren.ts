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
//  3. **Der Saldo der Bank wird immer mitgeholt**, in einem eigenen try: er ist die
//     zweite, unabhängige Aussage über das Konto und die einzige Möglichkeit zu merken,
//     dass eine Buchung fehlt. Scheitert er, laufen die Umsätze trotzdem — und umgekehrt.
//  4. **Was unverdächtig ist, wird SOFORT gebucht.** Bis hierher landete alles in einer
//     Warteliste am Konto und musste einzeln bestätigt werden — ein Schritt, der in der
//     Praxis nur aus Klicken bestand: was die Bank meldet, IST passiert, daran gibt es
//     nichts zu bestätigen. Was bleibt, ist die Frage, die man wirklich beantworten
//     muss: ob eine Zeile schon einmal da war. Deshalb wird alles ohne
//     Dublettenverdacht direkt verbucht, und in der Warteliste steht nur noch, was die
//     Dedup als möglichen Zwilling markiert hat. Ohne diese Trennung führte der Rückgriff
//     (Punkt 1) jeden Abruf zu Doppelbuchungen.

import type {
  ImportLaufRepository, KategorieRepository, LedgerPort, UmsatzRepository,
  VertragserkennungRepository, VertragszuordnungRepository, ZahlungskontoRepository,
} from "../ports";
import { zuordnungenAbgleichen } from "../vertragszuordnung";
import type { Vorschlagskontext } from "../import/vorschlag";
import { quelleKeyFuer } from "../import/kontoMatch";
import { umsaetzeUebernehmen, type UebernahmeErgebnis } from "../import/umsaetzeUebernehmen";
import { umsaetzeVerbuchen } from "../import/umsatzVerbuchen";
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
  /** Der von der Bank gemeldete Kontostand, falls sie ihn herausgibt. */
  readonly bankSaldo?: number;
  readonly bankSaldoDatum?: string;
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
  /**
   * Das Ledger — der Abruf bucht selbst. Bis 2026-08-19 legte er nur Entwürfe an, die
   * eine Warteliste am Konto abnicken musste; siehe den Kopfkommentar unter Punkt 4.
   */
  readonly ledgerRepo: LedgerPort;
  /**
   * Erkennung und Zuordnung der Verträge — der Abruf gleicht am Ende ab.
   *
   * Ohne das hingen die frisch gebuchten Zeilen an keinem Vertrag, bis jemand zufällig
   * einen Verträge-Screen öffnet. Seit der Abruf direkt verbucht, ist das der Normalfall
   * — und bis dahin zählte jede Vertragsrate gegen ihr Budget (siehe
   * `application/budgetsichten`). Optional, damit ältere Aufrufer nicht brechen; fehlt
   * es, wird nur nicht abgeglichen.
   */
  readonly erkennungRepo?: VertragserkennungRepository;
  readonly vertragszuordnungRepo?: VertragszuordnungRepository;
  readonly id: () => string;
  readonly kategorisierung?: Vorschlagskontext;
  /** Heute als ISO-Datum — von außen, damit der Ablauf prüfbar bleibt. */
  readonly heute: string;
  /**
   * Wie viele Tage zurück geholt werden soll — überschreibt den fortlaufenden Stand.
   *
   * Der Normalfall ist der Rückgriff auf `letzterAbrufBis`; er hält den Abruf klein. Wer
   * dagegen einen Altbestand aus einer Datei durch die Zeilen der Bank ersetzen will,
   * braucht den Zeitraum, den die Datei abdeckt — und das sind Monate, nicht Tage. Wie
   * weit die Bank überhaupt zurückreicht, sagt sie selbst (`speicherzeitraumTage`); was
   * darüber hinaus verlangt wird, liefert sie einfach nicht.
   */
  readonly rueckgriffTage?: number;
}

function tageVor(iso: string, tage: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t - tage));
  return d.toISOString().slice(0, 10);
}

/**
 * Ab wann für dieses Konto geholt wird.
 *
 * Ein ausdrücklich gewünschter Zeitraum gewinnt — auch gegen einen jüngeren Stand: wer
 * 180 Tage anfordert, will 180 Tage, nicht „ab letztem Abruf, aber höchstens 180".
 */
export function abrufStart(zuordnung: Kontozuordnung, heute: string, rueckgriffTage?: number): string {
  if (rueckgriffTage != null) return tageVor(heute, rueckgriffTage);
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
    const von = abrufStart(z, deps.heute, deps.rueckgriffTage);

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

    // Der Saldo in EIGENEM try: er ist die Kontrollzahl und darf weder an einem
    // Umsatzfehler scheitern noch einen verursachen. Banken, die HKSAL nicht anbieten,
    // liefern schlicht null — dann bleibt der letzte bekannte Stand stehen.
    let saldo: Awaited<ReturnType<typeof sitzung.saldo>> = null;
    try {
      saldo = await sitzung.saldo(bankkonto);
    } catch {
      saldo = null;
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

      // Direkt verbuchen, was keinen Dublettenverdacht trägt. Nur die Verdachtsfälle
      // bleiben als Entwurf stehen und warten auf eine Entscheidung — sie sind der
      // einzige Fall, in dem es überhaupt etwas zu entscheiden gibt.
      const frisch = (await deps.umsatzRepo.offene()).filter(
        (u) => u.laufId === ergebnis.laufId && !u.verdachtAufId,
      );
      if (frisch.length > 0) {
        await umsaetzeVerbuchen(frisch, {
          ledgerRepo: deps.ledgerRepo,
          umsatzRepo: deps.umsatzRepo,
          id: deps.id,
          // Auch ohne Kategorievorschlag: was die Bank meldet, ist geflossen. Die
          // Kategorie darf danach kommen — sie fehlt sonst als Grund, eine Tatsache
          // nicht zu buchen.
          auchOhneKategorie: true,
        });
      }

      await deps.zuordnungRepo.speichern({
        ...z,
        letzterAbrufBis: deps.heute,
        bankSaldo: saldo?.betrag ?? z.bankSaldo,
        bankSaldoDatum: saldo?.datum ?? z.bankSaldoDatum,
      });
      befunde.push({
        zahlungskontoId: z.zahlungskontoId,
        bezeichnung,
        von,
        bis: deps.heute,
        format: abruf.format,
        ergebnis,
        bankSaldo: saldo?.betrag,
        bankSaldoDatum: saldo?.datum,
      });
    } catch (e) {
      // Auch im Fehlerfall wird ein geholter Saldo festgehalten: er sagt bereits, ob
      // etwas fehlt, selbst wenn die Umsätze nicht kamen. `letzterAbrufBis` bleibt
      // dagegen stehen — der Zeitraum wurde ja nicht geholt.
      if (saldo) {
        await deps.zuordnungRepo.speichern({ ...z, bankSaldo: saldo.betrag, bankSaldoDatum: saldo.datum });
      }
      befunde.push({
        zahlungskontoId: z.zahlungskontoId,
        bezeichnung,
        von,
        bis: deps.heute,
        bankSaldo: saldo?.betrag,
        bankSaldoDatum: saldo?.datum,
        fehler: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Die frisch gebuchten Zeilen an ihre Verträge hängen. EIN Lauf über den Bestand,
  // nicht einer je Zeile: der Abgleich ist idempotent und schreibt nur Deltas.
  //
  // Das gehört hierher und nicht in die Oberfläche. Ohne diesen Aufruf trüge eine
  // abgerufene Vertragsrate keine Zuordnung, bis jemand einen Verträge-Screen öffnet —
  // und zählte bis dahin gegen das Budget ihrer Kategorie, obwohl sie im Ausblick schon
  // als Vertrag steht.
  if (deps.erkennungRepo && deps.vertragszuordnungRepo) {
    await zuordnungenAbgleichen({
      ledger: deps.ledgerRepo,
      umsatzRepo: deps.umsatzRepo,
      erkennungRepo: deps.erkennungRepo,
      zuordnungRepo: deps.vertragszuordnungRepo,
    });
  }

  // Zum Schluss noch einmal: die Bank hat während der Aufträge womöglich neue Parameter
  // nachgeschoben.
  await deps.zugangRepo.speichern({ ...zugang, bankparameter: sitzung.bankparameter() });
  return befunde;
}
