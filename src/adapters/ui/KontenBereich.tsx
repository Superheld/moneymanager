// Konten — eigener Navigationspunkt mit Registern.
//
// Ein Konto war bisher an zwei Stellen: die kontozentrische Übersicht unter „Konten" und
// das Anlegen/Bearbeiten als Karte in den Einstellungen. Das ist dieselbe Sache, nur
// getrennt nach dem, was sie technisch war (Stammdatensatz) statt nach dem, was sie ist.
//
// Hier wachsen die weiteren Register an: Bankzugänge mit dauerhafter Verbindung und
// Abruf auf Knopfdruck.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IstBuchung, Person, Zahlungskonto } from "../../core";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqlitePersonRepository as personRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import type { ScreenId } from "./AppShell";
import { Bereich } from "./Bereich";
import { KontenScreen } from "./KontenScreen";
import { KontenVerwaltung } from "./KontenVerwaltung";

export function KontenBereich({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { t } = useTranslation();
  const [personen, setPersonen] = useState<Person[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);

  // Zusammen laden und zusammen setzen: gestaffelte setState lassen die abgeleiteten
  // Werte (realer Stand, Inhaber-Namen) kurz gegen leere Listen rechnen.
  async function laden() {
    const [p, k, i] = await Promise.all([personRepo.alle(), kontoRepo.alle(), ledgerRepo.alle()]);
    setPersonen(p);
    setKonten(k);
    setIst(i);
  }

  useEffect(() => {
    laden().catch(() => {
      /* reiner Browser-Modus ohne SQLite */
    });
  }, []);

  const personName = useMemo(() => new Map(personen.map((p) => [p.id, p.name])), [personen]);

  return (
    <Bereich
      titel={t("konten.titel")}
      register={[
        {
          id: "uebersicht",
          label: t("konten.registerUebersicht"),
          untertitel: t("konten.untertitel"),
          inhalt: () => <KontenScreen onNavigate={onNavigate} />,
        },
        {
          id: "verwaltung",
          label: t("konten.registerVerwaltung"),
          untertitel: t("einstellungen.konto.untertitel"),
          inhalt: () => (
            <KontenVerwaltung
              konten={konten}
              personen={personen}
              personName={personName}
              ist={ist}
              onChange={() => void laden()}
            />
          ),
        },
      ]}
    />
  );
}
