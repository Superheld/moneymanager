// Budgets (P2.2) — Übersicht der Rahmen je Kategorie; Anlegen im Modal.
// Reset zum Periodenende (kein Übertrag). Plan/Ist seit ADR-0003: „verbraucht" =
// bestätigte Aufwands-Ist-Buchungen der Kategorie in der laufenden Periode (Matching
// automatisch über Kategorie × Periode); gedeckte Topf-Entnahmen (Umschichtung) zählen
// nicht doppelt.
//
// PILOT für ADR-0004: alle sichtbaren Strings laufen über t()/<Trans>, alles Geld über
// useGeld() (Parse bei Eingabe, Format + Symbol bei Anzeige).

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  budgetVerbrauch,
  geglaetteterMonatsabfluss,
  minorZuMajor,
  periodeFenster,
  type Budget,
  type BudgetPeriode,
  type IstBuchung,
  type Kategorie,
} from "../../core";
import { budgetAnlegen } from "../../application/budgetAnlegen";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";
import { useGeld, fehlerNachricht } from "./EinstellungenProvider";

const PERIODEN: BudgetPeriode[] = ["monatlich", "jaehrlich"];

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function BudgetsScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [kategorieId, setKategorieId] = useState("");
  const [rahmenText, setRahmenText] = useState("");
  const [periode, setPeriode] = useState<BudgetPeriode>("monatlich");
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setBudgets(await budgetRepo.alle());
    setKategorien(await kategorieRepo.alle());
    setIst(await ledgerRepo.alle());
  }

  function verbrauch(b: Budget): number {
    const { von, bis } = periodeFenster(b.periode, heute);
    return budgetVerbrauch(ist, b.kategorieId, von, bis);
  }
  useEffect(() => {
    laden();
  }, []);

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  function neu() {
    setEditId(null);
    setKategorieId("");
    setRahmenText("");
    setPeriode("monatlich");
    setFehler(null);
    setOffen(true);
  }
  function bearbeiten(b: Budget) {
    setEditId(b.id);
    setKategorieId(b.kategorieId);
    setRahmenText(String(minorZuMajor(b.rahmen, geld.waehrung)));
    setPeriode(b.periode);
    setFehler(null);
    setOffen(true);
  }
  async function speichern() {
    setFehler(null);
    try {
      await budgetAnlegen(
        budgetRepo,
        { kategorieId, rahmen: geld.parse(rahmenText) ?? 0, periode },
        editId ?? undefined,
      );
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <div className="screen">
      <PageHead
        title={t("budgets.titel")}
        subtitle={t("budgets.untertitel")}
        action={
          <Button variant="primary" plus onClick={neu}>
            {t("budgets.anlegen")}
          </Button>
        }
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
        <Trans i18nKey="budgets.erklaerung" components={{ b: <b style={{ color: "var(--ink)" }} /> }} />
      </p>
      <p className="muted" style={{ fontSize: "var(--fs-small)", maxWidth: 660, margin: "0 0 var(--sp-3)" }}>
        {t("budgets.verbrauchHinweis")}
      </p>

      <Card>
        {budgets.length === 0 ? (
          <div className="muted">{t("budgets.leer")}</div>
        ) : (
          <DataTable
            columns={[
              { key: "kategorie", label: t("budgets.spalteKategorie"), render: (b) => kategorieName.get(b.kategorieId) ?? "?" },
              { key: "periode", label: t("budgets.spaltePeriode"), render: (b) => t(`budgets.periode.${b.periode}`) },
              { key: "rahmen", label: `${t("budgets.spalteRahmen")} ${geld.symbol}`, align: "right", render: (b) => geld.format(b.rahmen) },
              { key: "geglaettet", label: `${t("budgets.spalteProMonat")} ${geld.symbol}`, align: "right", render: (b) => geld.format(geglaetteterMonatsabfluss(b)) },
              { key: "verbraucht", label: `${t("budgets.spalteVerbraucht")} ${geld.symbol}`, align: "right", render: (b) => geld.format(verbrauch(b)) },
              { key: "rest", label: `${t("budgets.spalteRest")} ${geld.symbol}`, align: "right", render: (b) => geld.format(b.rahmen - verbrauch(b)) },
              { key: "_e", label: "", align: "right", render: (b) => <button className="linkbtn" onClick={() => bearbeiten(b)}>{t("budgets.bearbeiten")}</button> },
              {
                key: "_x",
                label: "",
                align: "right",
                render: (b) => (
                  <button className="linkbtn" onClick={() => budgetRepo.loeschen(b.id).then(laden)}>
                    {t("budgets.loeschen")}
                  </button>
                ),
              },
            ]}
            rows={budgets}
          />
        )}
      </Card>

      {offen && (
        <Modal
          title={editId ? t("budgets.modalBearbeiten") : t("budgets.anlegen")}
          subtitle={t("budgets.modalUntertitel")}
          onClose={() => setOffen(false)}
          footer={
            <>
              <Button variant="primary" onClick={speichern}>
                {t("budgets.speichern")}
              </Button>
              <button className="linkbtn" onClick={() => setOffen(false)}>
                {t("budgets.abbrechen")}
              </button>
              {fehler && <span className="err">{fehler}</span>}
            </>
          }
        >
          <FormField label={t("budgets.feldKategorie")} required>
            <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
          </FormField>
          <FormField label={t("budgets.feldRahmen")} required hint={t("budgets.feldRahmenHinweis")}>
            <input className="field" inputMode="decimal" value={rahmenText} onChange={(e) => setRahmenText(e.target.value)} placeholder="0,00" />
          </FormField>
          <FormField label={t("budgets.feldPeriode")}>
            <select className="field" value={periode} onChange={(e) => setPeriode(e.target.value as BudgetPeriode)}>
              {PERIODEN.map((p) => (
                <option key={p} value={p}>
                  {t(`budgets.periode.${p}`)}
                </option>
              ))}
            </select>
          </FormField>
        </Modal>
      )}
    </div>
  );
}
