// Deckung (P2, plan-basiert) — „Sind meine Töpfe finanziert?". Globale Deckung =
// freie Liquidität (liquide Mittel − Σ Topf-Sollstände); darf ins Minus (Überplanung).
// Plus je Topf der Sollstand-Fortschritt. Die konten-zentrische Ist-Sicht (echte
// Salden) kommt mit dem Ist-Schritt (P3) — ein Konto ist „nur eine Zahl".
//
// i18n + Mehrwährung nach ADR-0004: sichtbare Strings über t()/<Trans>, Geld-Anzeige
// über useGeld() (Format + Symbol). Reiner Anzeige-Screen — keine Geld-Eingabe.

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  bezahlteSchluessel,
  centZuEuro,
  liquideMittelReal,
  projiziereLiquiditaet,
  sollstand,
  zielwert,
  type Budget,
  type IstBuchung,
  type Topf,
  type TopfTyp,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteTopfRepository as topfRepo } from "../persistence/sqliteTopfRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { Card, CoverageTrack, KPIStat, Pill } from "./ds";
import { PageHead } from "./PageHead";
import { useGeld } from "./EinstellungenProvider";

function aktuellerMonatAb(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}
function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function DeckungScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const TYP_LABEL: Record<TopfTyp, string> = {
    ersatz: t("deckung.typErsatz"),
    puffer: t("deckung.typPuffer"),
    spartopf: t("deckung.typSpartopf"),
  };
  const ab = useMemo(aktuellerMonatAb, []);
  const heute = useMemo(heuteIso, []);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [toepfe, setToepfe] = useState<Topf[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);

  useEffect(() => {
    (async () => {
      setRegeln(await regelRepo.alle());
      setBudgets(await budgetRepo.alle());
      setToepfe(await topfRepo.alle());
      setKonten(await kontoRepo.alle());
      setIst(await ledgerRepo.alle());
    })();
  }, []);

  // Liquide Mittel = realer Stand (Anfangsbestand + Σ Ist); bezahlte Posten ausgeschlossen.
  const bezahlt = useMemo(() => bezahlteSchluessel(ist), [ist]);
  const mittel = useMemo(() => liquideMittelReal(konten, ist), [konten, ist]);
  const jetzt = useMemo(() => projiziereLiquiditaet(regeln, budgets, toepfe, ab, 1, mittel, bezahlt)[0], [regeln, budgets, toepfe, ab, mittel, bezahlt]);
  const planSaldo = jetzt?.kontosaldo ?? mittel;
  const sollSumme = jetzt?.sollSumme ?? 0;
  const frei = jetzt?.freieLiquiditaet ?? planSaldo;
  const deckung = sollSumme > 0 ? Math.max(0, Math.min(100, Math.round((planSaldo / sollSumme) * 100))) : 100;
  const sollToepfe = toepfe.filter((t) => zielwert(t) != null);

  return (
    <div className="screen">
      <PageHead title={t("deckung.titel")} subtitle={t("deckung.untertitel")} />

      <div className="kpis">
        <KPIStat size="hero" label={t("deckung.kpiFreieLiquiditaet")} value={geld.format(frei, { mitVorzeichen: true })} unit={geld.symbol} tone={frei < 0 ? "warn" : "plan"} />
        <KPIStat size="chip" label={t("deckung.kpiLiquideMittel")} value={geld.format(mittel)} unit={geld.symbol} />
        <KPIStat size="chip" label={t("deckung.kpiSollSumme")} value={geld.format(sollSumme)} unit={geld.symbol} />
        <KPIStat size="chip" label={t("deckung.kpiDeckungsgrad")} value={String(deckung)} unit="%" tone={frei < 0 ? "warn" : "plan"} />
      </div>

      <Card title={t("deckung.globalTitel")} subtitle={t("deckung.globalUntertitel")}>
        <CoverageTrack
          value={centZuEuro(mittel)}
          max={Math.max(1, centZuEuro(sollSumme))}
          over={frei < 0}
          label={frei < 0 ? t("deckung.ueberplanung") : t("deckung.gedeckt")}
          right={`${geld.format(mittel)} / ${geld.format(sollSumme)} ${geld.symbol}`}
        />
        <p className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {konten.length === 0 ? (
            t("deckung.hinweisKeineKonten")
          ) : frei < 0 ? (
            <Trans
              i18nKey="deckung.hinweisUeberplanung"
              values={{ betrag: `${geld.format(frei)} ${geld.symbol}` }}
              components={{ b: <b style={{ color: "var(--ink)" }} /> }}
            />
          ) : (
            <Trans
              i18nKey="deckung.hinweisGedeckt"
              values={{ betrag: `${geld.format(frei, { mitVorzeichen: true })} ${geld.symbol}` }}
              components={{ b: <b style={{ color: "var(--ink)" }} /> }}
            />
          )}
          {" "}
          {t("deckung.hinweisKontensicht")}
        </p>
      </Card>

      <Card title={t("deckung.detailTitel")} subtitle={t("deckung.detailUntertitel")}>
        {sollToepfe.length === 0 ? (
          <div className="muted">{t("deckung.detailLeer")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
            {sollToepfe.map((t) => {
              const ziel = zielwert(t)!;
              const soll = sollstand(t, heute) ?? 0;
              return (
                <div key={t.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {t.bezeichnung} <Pill variant="neutral">{TYP_LABEL[t.typ]}</Pill>
                    </span>
                  </div>
                  <CoverageTrack value={centZuEuro(soll)} max={centZuEuro(ziel)} right={`${geld.format(soll)} / ${geld.format(ziel)} ${geld.symbol}`} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
