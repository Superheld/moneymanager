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
//  4. **Alles wird SOFORT gebucht — auch die Verdachtsfälle.** Bis hierher landete alles
//     in einer Warteliste am Konto und musste einzeln bestätigt werden; ein Schritt, der
//     in der Praxis nur aus Klicken bestand: was die Bank meldet, IST passiert, daran
//     gibt es nichts zu bestätigen. Seit 2026-08-19 blieben immerhin die Verdachtsfälle
//     dort stehen — die Frage „war das schon einmal da?" ist die einzige, die man
//     wirklich beantworten muss.
//
//     Seit 2026-08-20 steht sie am richtigen Ort: im Kontoauszug selbst. Beide Zeilen
//     tragen dort die Markierung, mit Gründen, mit dem Weg zum Gegenstück und mit „kein
//     Duplikat" für den Fall, dass der Finder danebenlag. Das ist mehr Zusammenhang, als
//     eine Warteliste vor dem Saldo je hatte — und es macht die Warteliste überflüssig.
//     Der Preis: eine mögliche Dublette zählt kurz im Saldo mit, bis du sie ansiehst.
//     Der Rückgriff (Punkt 1) erzeugt genau solche Zeilen, deshalb ist die Markierung
//     kein Nebenweg, sondern der Hauptweg.

import type {
  ImportLaufRepository, KategorieRepository, KontostandsankerRepository, LedgerPort,
  UmsatzRepository, VertragserkennungRepository, VertragszuordnungRepository,
  ZahlungskontoRepository,
} from "../ports";
import { zuordnungenAbgleichen } from "../vertraege/vertragszuordnung";
import type { Vorschlagskontext } from "../import/vorschlag";
import { quelleKeyFuer } from "../import/kontoMatch";
import { umsaetzeUebernehmen, type UebernahmeErgebnis } from "../import/umsaetzeUebernehmen";
import { umsaetzeVerbuchen } from "../import/umsatzVerbuchen";
import { bankAnker } from "../../core";
import type { Abrufadapter, Bankprofil, Bankzugang, TanFrager } from "./abrufPort";
import { abruffenster, erstabrufTage } from "./bankprofil";
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
  /**
   * Gesetzt, wenn die Bank den gewünschten Zeitraum beschnitten hat — der Wert ist ihre
   * Grenze in Tagen. Ohne das liest sich ein an der Grenze abgeschnittener Abruf wie ein
   * vollständiger.
   */
  readonly speicherzeitraumErreicht?: number;
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
  /** Die Kontostands-Anker — jeder Abruf legt einen dazu, sofern die Bank einen Saldo gibt. */
  readonly ankerRepo: KontostandsankerRepository;
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

/** Ganze Tage von `von` bis `bis`. Nie negativ — ein Stand aus der Zukunft heißt „null Tage". */
function tageZwischen(von: string, bis: string): number {
  const zahl = (iso: string) => {
    const [j, m, t] = iso.split("-").map(Number);
    return Date.UTC(j, m - 1, t);
  };
  return Math.max(0, Math.round((zahl(bis) - zahl(von)) / 86_400_000));
}

/** Von wann bis heute geholt wird — und ob die Bank den Wunsch beschnitten hat. */
export interface Abrufzeitraum {
  readonly von: string;
  /** true, wenn der Speicherzeitraum der Bank vor dem gewünschten Start endet. */
  readonly gedeckelt: boolean;
  /** Die Grenze der Bank in Tagen, sofern sie eine genannt hat. */
  readonly grenze?: number;
}

/**
 * Ab wann für dieses Konto geholt wird.
 *
 * Drei Fälle, in dieser Reihenfolge:
 *
 *  1. Ein ausdrücklich gewünschter Zeitraum gewinnt — auch gegen einen jüngeren Stand: wer
 *     180 Tage anfordert, will 180 Tage, nicht „ab letztem Abruf, aber höchstens 180".
 *  2. Ein Erstabruf holt, was die Bank vorhält. Bis hierher waren das feste 30 Tage, und
 *     bei einem Institut mit langem Speicherzeitraum blieb der Rest liegen, bis jemand
 *     ihn ausdrücklich nachholte — was niemand tut, der nicht weiß, dass er etwas
 *     verpasst hat. Sagt die Bank nichts, bleibt es bei der Vorgabe.
 *  3. Sonst der fortlaufende Stand mit Rückgriff.
 *
 * Am Ende wird in jedem Fall an dem gemessen, was die Bank überhaupt hergibt. Das ändert
 * die geholte Menge nicht — mehr liefert sie ohnehin nicht —, aber es macht den
 * Unterschied zwischen „in diesen Monaten war nichts" und „diese Monate hat die Bank
 * nicht mehr" sichtbar.
 */
export function abrufZeitraum(
  zuordnung: Kontozuordnung,
  heute: string,
  rueckgriffTage?: number,
  profil?: Bankprofil,
): Abrufzeitraum {
  const gewuenscht =
    rueckgriffTage != null
      ? rueckgriffTage
      : zuordnung.letzterAbrufBis
        ? tageZwischen(zuordnung.letzterAbrufBis, heute) + RUECKGRIFF_TAGE
        : erstabrufTage(profil, ERSTABRUF_TAGE);

  const fenster = abruffenster(profil, gewuenscht);
  return { von: tageVor(heute, fenster.tage), gedeckelt: fenster.gedeckelt, grenze: fenster.grenze };
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
  // Das Profil geht mit — es ist aus denselben Parametern abgeleitet und wäre sonst
  // genau dann veraltet, wenn sich etwas geändert hat.
  const profil = sitzung.profil;
  await deps.zugangRepo.speichern({
    ...zugang,
    bankparameter: sitzung.bankparameter(),
    profil: JSON.stringify(profil),
  });

  const konten = await deps.kontoRepo.alle();
  const befunde: AbrufBefund[] = [];

  for (const z of zuordnungen) {
    const bankkonto = sitzung.konten.find((k) => k.schluessel === z.schluessel);
    const zahlungskonto = konten.find((k) => k.id === z.zahlungskontoId);
    const bezeichnung = zahlungskonto?.bezeichnung ?? bankkonto?.bezeichnung ?? z.schluessel;
    const zeitraum = abrufZeitraum(z, deps.heute, deps.rueckgriffTage, profil);
    const von = zeitraum.von;

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
    // liefern schlicht null — dann kommt für diesen Tag eben kein Anker dazu.
    let saldo: Awaited<ReturnType<typeof sitzung.saldo>> = null;
    try {
      saldo = await sitzung.saldo(bankkonto);
    } catch {
      saldo = null;
    }

    /**
     * Den gemeldeten Stand als ANKER festhalten — aufgehoben, nicht überschrieben.
     *
     * Jeder Abruf ist ein Messpunkt gegen eine unabhängige Quelle. Wer sie wegwirft, kann
     * hinterher nur sagen „hier fehlen 600 Euro", nicht „zwischen dem 31.07. und dem
     * 31.08." — und die zweite Auskunft ist die, mit der man etwas anfangen kann.
     *
     * Auch dann, wenn die Umsätze scheitern: der Saldo allein sagt bereits, ob etwas
     * fehlt. Ohne Datum von der Bank gilt der Abruftag; das ist die Aussage, die sie
     * gerade gemacht hat.
     */
    async function ankerFesthalten() {
      if (!saldo) return;
      await deps.ankerRepo.speichern(
        bankAnker(z.zahlungskontoId, saldo.betrag, saldo.datum ?? deps.heute, new Date().toISOString()),
      );
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

      // Alles aus diesem Lauf direkt verbuchen. Ein Verdacht hält nichts mehr auf: er
      // steht am Umsatz und wird im Auszug an BEIDEN Zeilen gezeigt (siehe Kopf, 4).
      const frisch = (await deps.umsatzRepo.offene()).filter((u) => u.laufId === ergebnis.laufId);
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

      await ankerFesthalten();
      // Das getragene Format mit fortschreiben: hat CAMT hier nicht getragen, ist die
      // erste Runde beim nächsten Mal absehbar vergeblich.
      await deps.zuordnungRepo.speichern({
        ...z,
        letzterAbrufBis: deps.heute,
        letztesFormat: abruf.format,
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
        speicherzeitraumErreicht: zeitraum.gedeckelt ? zeitraum.grenze : undefined,
      });
    } catch (e) {
      // Auch im Fehlerfall wird ein geholter Saldo festgehalten (siehe `ankerFesthalten`).
      // `letzterAbrufBis` bleibt dagegen stehen — der Zeitraum wurde ja nicht geholt.
      await ankerFesthalten();
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
  await deps.zugangRepo.speichern({
    ...zugang,
    bankparameter: sitzung.bankparameter(),
    profil: JSON.stringify(sitzung.profil),
  });
  return befunde;
}
