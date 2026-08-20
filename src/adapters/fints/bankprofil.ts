// Was die Bank kann, aus ihren eigenen Angaben — die Übersetzung der Bankparameter (BPD)
// in die Fachbegriffe des Ports.
//
// Warum das hier steht und nicht in der Anwendungsschicht: die Werte kommen aus
// `FinTSConfig.getTransactionParameters`, und `lib-fints` kennt nur der Adapter. Die
// Anwendungsschicht bekommt `Bankprofil` — Zahlen und Namen, kein Bibliotheksobjekt.
//
// Die Parametertypen sind hier NOCHMAL deklariert, obwohl `lib-fints` sie hat. Grund ist
// kein Übersehen: das Paket exportiert aus seiner Wurzel nur einen Teil, und seine
// `exports`-Map versperrt den tiefen Import auf `dist/types/segments/…`. Eine eigene
// Deklaration ist ehrlicher als ein Import, den das Paket nicht anbietet — und sie bricht
// nicht, wenn dort umbenannt wird. Sie ist zugleich der fünfte Kandidat für einen
// Upstream-PR: diese Typen gehören exportiert.

import type { FinTSConfig } from "lib-fints";
import type { Bankprofil, TanVerfahren, Vorfallprofil } from "../../application/fints/abrufPort";

/** `HIKAZS` — Umsätze im MT940-Format. */
interface HikazsParameter {
  maxDays?: number;
  entryCountAllowed?: boolean;
  allAccountsAllowed?: boolean;
}

/** `HICAZS` — Umsätze im CAMT-Format. Der Speicherzeitraum kann von HIKAZS abweichen. */
interface HicazsParameter {
  maxDays?: number;
  entryCountAllowed?: boolean;
  allAccountsAllowed?: boolean;
  supportedCamtFormats?: string[];
}

/** `HIWPDS` — Depotaufstellung. Die drei Flags sind genau die drei optionalen Argumente. */
interface HiwpdsParameter {
  entryCountAllowed?: boolean;
  currencySelectable?: boolean;
  priceQualitySelectable?: boolean;
}

/** `HIEKAS` — elektronische Kontoauszüge. */
interface HiekasParameter {
  indexAllowed?: boolean;
  receiptRequired?: boolean;
  maxEntryCountAllowed?: boolean;
  supportedFormats?: string[];
}

/** `HISPAS` — SEPA-Kontoinformation. Trägt die Regel für die Kontoverbindung. */
interface HispasParameter {
  individualAccountRetrievalAllowed?: boolean;
  nationalAccountAllowed?: boolean;
  supportedSepaFormats?: string[];
}

/**
 * Die Vorfälle, nach denen wir fragen.
 *
 * Eine feste Liste und keine Ableitung aus dem, was die Bank alles meldet: ein Institut
 * meldet Dutzende Segmente, von denen uns eine Handvoll etwas angeht. Was hier fehlt,
 * fehlt absichtlich — Überweisungen und Lastschriften kann die Bibliothek ohnehin nicht,
 * und eine App zum Auswerten braucht sie nicht.
 */
const VORFAELLE = ["HKSAL", "HKKAZ", "HKCAZ", "HKWPD", "DKKKU", "HKEKA", "HKSPA"] as const;

/**
 * Höchste Version, die Bank und Bibliothek gemeinsam können.
 *
 * `getMaxSupportedTransactionVersion` WIRFT für Geschäftsvorfälle ohne eigene
 * Segmentdefinition, statt `undefined` zu liefern. Der Unterschied zwischen „die Bank
 * bietet es nicht" und „die Bibliothek kann es nicht" geht dabei verloren — für das
 * Profil ist beides gleichbedeutend mit „steht nicht zur Verfügung".
 */
function version(config: FinTSConfig, segment: string): number | undefined {
  try {
    return config.getMaxSupportedTransactionVersion(segment);
  } catch {
    return undefined;
  }
}

function parameter<T>(config: FinTSConfig, segment: string): T | undefined {
  try {
    return config.getTransactionParameters<T>(segment);
  } catch {
    return undefined;
  }
}

/** Ein Vorfall mit dem, was die Bank zu ihm sagt. `undefined`, wenn sie ihn nicht kennt. */
function vorfallprofil(config: FinTSConfig, segment: string): Vorfallprofil | undefined {
  if (!config.isTransactionSupported(segment)) return undefined;

  const gemeinsam: Vorfallprofil = { segment, version: version(config, segment) };

  switch (segment) {
    case "HKKAZ": {
      const p = parameter<HikazsParameter>(config, segment);
      return {
        ...gemeinsam,
        speicherzeitraumTage: p?.maxDays,
        alleKontenAmStueck: p?.allAccountsAllowed,
        anzahlBegrenzbar: p?.entryCountAllowed,
      };
    }
    case "HKCAZ": {
      const p = parameter<HicazsParameter>(config, segment);
      return {
        ...gemeinsam,
        speicherzeitraumTage: p?.maxDays,
        alleKontenAmStueck: p?.allAccountsAllowed,
        anzahlBegrenzbar: p?.entryCountAllowed,
        formate: p?.supportedCamtFormats,
      };
    }
    case "HKWPD": {
      const p = parameter<HiwpdsParameter>(config, segment);
      return {
        ...gemeinsam,
        anzahlBegrenzbar: p?.entryCountAllowed,
        waehrungWaehlbar: p?.currencySelectable,
        kursqualitaetWaehlbar: p?.priceQualitySelectable,
      };
    }
    case "HKEKA": {
      const p = parameter<HiekasParameter>(config, segment);
      return { ...gemeinsam, anzahlBegrenzbar: p?.maxEntryCountAllowed, formate: p?.supportedFormats };
    }
    case "HKSPA": {
      const p = parameter<HispasParameter>(config, segment);
      return { ...gemeinsam, formate: p?.supportedSepaFormats };
    }
    default:
      return gemeinsam;
  }
}

function tanVerfahrenAus(config: FinTSConfig): TanVerfahren[] {
  return config.availableTanMethods.map((v) => ({
    id: v.id,
    name: v.name,
    decoupled: v.isDecoupled,
    // `TanMediaRequirement.Required` ist 2. Der Vergleich über die Zahl, weil `lib-fints`
    // das Enum in seiner Wurzel nicht re-exportiert — dasselbe gilt in `fintsAdapter.ts`.
    mediumPflicht: Number(v.tanMediaRequirement) === 2,
    medien: v.activeTanMedia ?? [],
  }));
}

/**
 * Das Profil erheben — reines Lesen aus den Bankparametern, kein Bankverkehr.
 *
 * `standAm` kommt von außen: der Adapter darf die Uhr lesen, aber eine Funktion, die es
 * selbst tut, lässt sich nicht prüfen.
 */
export function profilErheben(
  config: FinTSConfig,
  schluesselVon: (k: { accountNumber: string; subAccountId?: string }) => string,
  standAm: string,
): Bankprofil {
  const kontoVorfaelle: Record<string, readonly string[]> = {};
  for (const konto of config.bankingInformation.upd?.bankAccounts ?? []) {
    kontoVorfaelle[schluesselVon(konto)] = (konto.allowedTransactions ?? []).map((t) => t.transId);
  }

  return {
    standAm,
    tanVerfahren: tanVerfahrenAus(config),
    vorfaelle: VORFAELLE.map((s) => vorfallprofil(config, s)).filter(
      (v): v is Vorfallprofil => v !== undefined,
    ),
    kontoVorfaelle,
    nationaleFelderErlaubt: parameter<HispasParameter>(config, "HKSPA")?.nationalAccountAllowed,
  };
}
