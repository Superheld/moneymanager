// Konten verwalten — Anlegen, Bearbeiten, Löschen, Bankverbindung.
//
// Getrennt von der Konten-ÜBERSICHT, und die Trennung folgt der Frage, was man gerade
// tut: die Übersicht ist die tägliche Sicht auf Stände und Buchungen, das hier ist der
// Ort, an dem ein Konto entsteht oder seine Verbindung bekommt. Deshalb steht sie unter
// Überblick und dieser Screen unter Verwaltung.
//
// Zwei Register: die Konten selbst und die Bankzugänge dahinter. Der Bankabruf-Screen lag
// bis 2026-08-18 unter Import — dort war er nur, weil er als Erprobung entstanden ist.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IstBuchung, Person, Zahlungskonto } from "../../core";
import {
  sqliteBankzugangRepository as zugangRepo,
  sqliteKontozuordnungRepository as zuordnungRepo,
} from "../persistence/sqliteBankzugangRepositories";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqlitePersonRepository as personRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import { Bereich } from "./Bereich";
import { BankzugaengeScreen } from "./BankzugaengeScreen";
import { KontenVerwaltung, type KontoVerbindung } from "./KontenVerwaltung";

export function KontenVerwaltungScreen() {
  const { t } = useTranslation();
  const [personen, setPersonen] = useState<Person[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [verbindungen, setVerbindungen] = useState<Map<string, KontoVerbindung>>(new Map());

  // Zusammen laden und zusammen setzen: gestaffelte setState lassen die abgeleiteten
  // Werte (realer Stand, Inhaber-Namen) kurz gegen leere Listen rechnen.
  async function laden() {
    const [p, k, i, zuordnungen, zugaenge] = await Promise.all([
      personRepo.alle(),
      kontoRepo.alle(),
      ledgerRepo.alle(),
      zuordnungRepo.alle(),
      zugangRepo.alle(),
    ]);
    setPersonen(p);
    setKonten(k);
    setIst(i);
    setVerbindungen(
      new Map(
        zuordnungen.map((z) => [
          z.zahlungskontoId,
          {
            zugangId: z.zugangId,
            zugangName: zugaenge.find((b) => b.id === z.zugangId)?.bezeichnung ?? z.zugangId,
            schluessel: z.schluessel,
            letzterAbrufBis: z.letzterAbrufBis,
          },
        ]),
      ),
    );
  }

  useEffect(() => {
    laden().catch(() => {
      /* reiner Browser-Modus ohne SQLite */
    });
  }, []);

  const personName = useMemo(() => new Map(personen.map((p) => [p.id, p.name])), [personen]);

  return (
    <Bereich
      titel={t("konten.verwaltungTitel")}
      register={[
        {
          id: "konten",
          label: t("konten.registerKonten"),
          untertitel: t("einstellungen.konto.untertitel"),
          inhalt: () => (
            <KontenVerwaltung
              konten={konten}
              personen={personen}
              personName={personName}
              ist={ist}
              verbindungen={verbindungen}
              onTrennen={async (v) => {
                // Nur die Zuordnung fällt weg — der Zugang bleibt, er kann weitere
                // Konten tragen. Was schon importiert wurde, bleibt ebenfalls stehen.
                await zuordnungRepo.loeschen(v.zugangId, v.schluessel);
                await laden();
              }}
              onChange={() => void laden()}
            />
          ),
        },
        {
          id: "zugaenge",
          label: t("konten.registerZugaenge"),
          untertitel: t("bankzugaenge.untertitel"),
          inhalt: () => <BankzugaengeScreen />,
        },
      ]}
    />
  );
}
