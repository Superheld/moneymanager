// Was auf einem Konto gebunden ist — Rücklagen (samt aufbauender Budgets), und was frei bleibt.
//
// Die Karte zeigt die Kontobelegung (`core/konten/kontobelegung`) und rechnet nichts
// selbst. Sie steht NEBEN der Kontenliste und nicht darin, und sie fehlt, wenn auf dem
// Konto niemand etwas beansprucht: eine Aufstellung „gebunden: 0" sagte nur, was die
// Spalte darüber schon sagt. Die Tabelle darin teilt sie mit der Karte „Wo das Geld
// liegt" im Bereich Rücklagen (`bausteine/BelegungTabelle`).

import { useTranslation } from "react-i18next";
import type { Kontobelegung } from "../../../application";
import { Card } from "../bausteine";
import { BelegungTabelle } from "../bausteine/BelegungTabelle";

export function BelegungKarte({
  belegung,
  namen,
  konto,
}: {
  belegung: Kontobelegung;
  namen: ReadonlyMap<string, string>;
  konto: string;
}) {
  const { t } = useTranslation();
  if (belegung.posten.length === 0) return null;

  return (
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      title={t("konten.belegung.titel", { konto })}
      subtitle={t("konten.belegung.untertitel")}
    >
      <BelegungTabelle belegung={belegung} namen={namen} />
    </Card>
  );
}
