// Budgets (P2.2) — Übersicht der Rahmen je Kategorie; Anlegen im Modal.
// Plan-only; Reset zum Periodenende (kein Übertrag). Ist-Wirkung ab P3.
//
// PILOT für ADR-0004: alle sichtbaren Strings laufen über t()/<Trans>, alles Geld über
// useGeld() (Parse bei Eingabe, Format + Symbol bei Anzeige). Dieser Screen ist das
// Muster, an dem die übrigen Screens nachgezogen werden — bis dahin nutzen sie weiter
// die EUR-festen Back-compat-Helfer.

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  geglaetteterMonatsabfluss,
  minorZuMajor,
  type Budget,
  type BudgetPeriode,
  type Kategorie,
} from "../../core";
import { budgetAnlegen } from "../../application/budgetAnlegen";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { Button, Card, DataTable, FormField } from "./ds";
import { PageHead } from "./PageHead";
import { Modal } from "./Modal";
import { CategoryPicker } from "./CategoryPicker";
import { useGeld, fehlerNachricht } from "./EinstellungenProvider";

const PERIODEN: BudgetPeriode[] = ["monatlich", "jaehrlich"];

export function BudgetsScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [offen, setOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [kategorieId, setKategorieId] = useState("");
  const [rahmenText, setRahmenText] = useState("");
  const [periode, setPeriode] = useState<BudgetPeriode>("monatlich");
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setBudgets(await budgetRepo.alle());
    setKategorien(await kategorieRepo.alle());
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
