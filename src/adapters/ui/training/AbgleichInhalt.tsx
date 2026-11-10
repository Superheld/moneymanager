// Die vierte Karte der Kategorisierung: den Bestand abgleichen. Der Rahmen, der sie lädt
// und zusammenhält, steht in `KategorisierungCards.tsx`.

import {
  charakterWechsel,
  uebergaenge,
  type Abgleichsplan,
} from "../../../application/kategorien/kategorieAbgleich";
import { Button, KPIStat, Pill } from "../bausteine";
import { Abschnitt, type Hilfe } from "./kartenteile";

/**
 * Der rückwirkende Abgleich: erst rechnen, zeigen, dann auf Bestätigung schreiben.
 *
 * Bewusst OHNE `beiOeffnen`-Nachladen: die anderen vier Karten zeigen Zustand, diese
 * verändert ihn. Ein Lauf über den ganzen Bestand soll starten, weil jemand ihn startet —
 * nicht, weil jemand eine Karte aufgeklappt hat.
 */
export function AbgleichInhalt({
  t, kategorieName, zahl, plan, angewendet, rechnet, schreibt, aufVorschau, aufUebernehmen,
}: Hilfe & {
  plan: Abgleichsplan | null;
  angewendet: number | null;
  rechnet: boolean;
  schreibt: boolean;
  aufVorschau: () => void;
  aufUebernehmen: () => void;
}) {
  const name = (id?: string) => (id ? kategorieName.get(id) ?? id : t("einstellungen.abgleich.ohneKategorie"));
  const gruppen = plan ? uebergaenge(plan) : [];
  const charakter = plan ? charakterWechsel(plan) : [];

  return (
    <>
      <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
        {t("einstellungen.abgleich.hinweis")}
      </div>

      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" }}>
        <Button onClick={aufVorschau} laeuft={rechnet}>
          {rechnet ? t("einstellungen.abgleich.rechnet") : t("einstellungen.abgleich.vorschau")}
        </Button>
        {angewendet !== null && (
          <span className="muted">{t("einstellungen.abgleich.fertig", { anzahl: zahl(angewendet) })}</span>
        )}
      </div>

      {plan && plan.setzen.length === 0 && (
        <div className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {t("einstellungen.abgleich.nichtsZuTun", { unveraendert: zahl(plan.unveraendert) })}
        </div>
      )}

      {plan && plan.setzen.length > 0 && (
        <>
          <div style={{ display: "flex", gap: "var(--sp-6)", flexWrap: "wrap", marginTop: "var(--sp-4)" }}>
            <KPIStat
              size="tile"
              tone="warn"
              label={t("einstellungen.abgleich.aenderungen")}
              value={zahl(plan.setzen.length)}
              meta={t("einstellungen.abgleich.aenderungenMeta", { gruppen: gruppen.length })}
            />
            <KPIStat
              size="tile"
              label={t("einstellungen.abgleich.unveraendert")}
              value={zahl(plan.unveraendert)}
              meta={t("einstellungen.abgleich.unveraendertMeta")}
            />
          </div>

          <Abschnitt titel={t("einstellungen.abgleich.uebergaengeTitel")}>
            <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
              {t("einstellungen.abgleich.uebergaengeHinweis")}
            </div>
            {gruppen.map((g) => (
              <div key={`${g.vonKategorieId ?? ""}-${g.nachKategorieId}`} style={{ marginBottom: "var(--sp-3)" }}>
                <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "var(--fw-bold)", minWidth: "5ch", textAlign: "right" }}>
                    {zahl(g.anzahl)} ×
                  </span>
                  <span>{name(g.vonKategorieId)}</span>
                  <span className="muted">→</span>
                  <span style={{ fontWeight: "var(--fw-semi)" }}>{name(g.nachKategorieId)}</span>
                </div>
                <div className="muted" style={{ fontSize: "var(--fs-xs)", marginLeft: "6ch" }}>
                  {g.beispiele.map((b) => b.gegenpartei || t("einstellungen.abgleich.ohneEmpfaenger")).join(" · ")}
                  {g.anzahl > g.beispiele.length && " …"}
                </div>
              </div>
            ))}
          </Abschnitt>

          {charakter.length > 0 && (
            <Abschnitt titel={t("einstellungen.abgleich.charakterTitel")}>
              <div className="muted" style={{ marginBottom: "var(--sp-2)" }}>
                {t("einstellungen.abgleich.charakterHinweis", { anzahl: zahl(charakter.length) })}
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {charakter.slice(0, 10).map((w) => (
                  <div key={w.istbuchungId} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                    <span>{w.gegenpartei || t("einstellungen.abgleich.ohneEmpfaenger")}</span>
                    <Pill>{t(`charakter.${w.vonCharakter}`)}</Pill>
                    <span className="muted">→</span>
                    <Pill variant="warn">{t(`charakter.${w.charakter}`)}</Pill>
                    <span className="muted">{name(w.nachKategorieId)}</span>
                  </div>
                ))}
              </div>
            </Abschnitt>
          )}

          <Abschnitt titel={t("einstellungen.abgleich.uebersprungenTitel")}>
            <div style={{ display: "grid", gap: 4 }}>
              {(["handverlesen", "umschichtung", "ohneVorschlag"] as const).map((grund) => (
                <div key={grund} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "baseline" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "5ch", textAlign: "right" }}>
                    {zahl(plan.uebersprungen[grund])}
                  </span>
                  <span className="muted">{t(`einstellungen.abgleich.uebersprungen.${grund}`)}</span>
                </div>
              ))}
            </div>
          </Abschnitt>

          <div style={{ marginTop: "var(--sp-4)" }}>
            <Button variant="primary" onClick={aufUebernehmen} laeuft={schreibt}>
              {schreibt
                ? t("einstellungen.abgleich.schreibt")
                : t("einstellungen.abgleich.uebernehmen", { anzahl: zahl(plan.setzen.length) })}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
