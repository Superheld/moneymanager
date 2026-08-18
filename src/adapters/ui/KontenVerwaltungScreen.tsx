// Konten verwalten — Anlegen, Bearbeiten, Löschen, Bankverbindung.
//
// Getrennt von der Konten-ÜBERSICHT, und die Trennung folgt der Frage, was man gerade
// tut: die Übersicht ist die tägliche Sicht auf Stände und Buchungen, das hier ist der
// Ort, an dem ein Konto entsteht oder seine Verbindung bekommt. Deshalb steht sie unter
// Überblick und dieser Screen unter Verwaltung.
//
// Register bekommt dieser Punkt, sobald die Bankzugänge als eigene Liste dazukommen —
// dauerhafte Verbindungen mit Abruf auf Knopfdruck.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IstBuchung, Person, Zahlungskonto } from "../../core";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqlitePersonRepository as personRepo,
  sqliteZahlungskontoRepository as kontoRepo,
} from "../persistence/sqliteStammdatenRepositories";
import { KontenVerwaltung } from "./KontenVerwaltung";
import { PageHead } from "./PageHead";

export function KontenVerwaltungScreen() {
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
    <div className="screen">
      <PageHead title={t("konten.verwaltungTitel")} subtitle={t("einstellungen.konto.untertitel")} />
      <KontenVerwaltung
        konten={konten}
        personen={personen}
        personName={personName}
        ist={ist}
        onChange={() => void laden()}
      />
    </div>
  );
}
