// Die erste Karte der Kategorisierung: die Daten sichten. Der Rahmen, der sie lädt und
// zusammenhält, steht in `KategorisierungCards.tsx`.

import { type Ausschlussgrund } from "../../../application/kategorien/trainingsmaterial";
import { KPIStat, Pill } from "../bausteine";
import { Abschnitt, type Hilfe } from "./kartenteile";

export function DatenInhalt({ t, daten, kategorieName, zahl }: Hilfe) {
  if (!daten) return <div className="muted">…</div>;
  const { material } = daten;
  if (material.gesamt === 0) return <div className="muted">{t("einstellungen.lernmaterial.leer")}</div>;

  const ausgeschlossen = (Object.entries(material.ausgeschlossen) as [Ausschlussgrund, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div style={{ display: "flex", gap: "var(--sp-6)", flexWrap: "wrap" }}>
        <KPIStat
          size="tile"
          label={t("einstellungen.lernmaterial.brauchbar")}
          value={zahl(material.beispiele.length)}
          meta={t("einstellungen.lernmaterial.brauchbarMeta", { gesamt: zahl(material.gesamt) })}
        />
        <KPIStat
          size="tile"
          label={t("einstellungen.lernmaterial.kategorien")}
          value={zahl(material.kategorien)}
          meta={t("einstellungen.lernmaterial.kategorienMeta", { duenn: material.duenneKategorien.length })}
          tone={material.duenneKategorien.length > 0 ? "warn" : "default"}
        />
        <KPIStat
          size="tile"
          label={t("einstellungen.lernmaterial.vokabular")}
          value={zahl(material.vokabular.groesse)}
          meta={t("einstellungen.lernmaterial.vokabularMeta", { einmalige: zahl(material.vokabular.einmalige) })}
        />
      </div>

      {material.beispiele.length === 0 && (
        <div className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {t("einstellungen.lernmaterial.keineBeispiele")}
        </div>
      )}

      {ausgeschlossen.length > 0 && (
        <Abschnitt titel={t("einstellungen.lernmaterial.ausgeschlossenTitel")}>
          {ausgeschlossen.map(([grund, n]) => (
            <div key={grund} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "baseline" }}>
              <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "4ch", textAlign: "right" }}>{zahl(n)}</span>
              <span className="muted">{t(`einstellungen.lernmaterial.grund.${grund}`)}</span>
            </div>
          ))}
        </Abschnitt>
      )}

      {material.duenneKategorien.length > 0 && (
        <Abschnitt titel={t("einstellungen.lernmaterial.duenneTitel")}>
          <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {t("einstellungen.lernmaterial.duenneHinweis")}
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            {material.duenneKategorien.map((d) => (
              <Pill key={d.kategorieId} variant="warn">
                {kategorieName.get(d.kategorieId) ?? d.kategorieId} · {d.anzahl}
              </Pill>
            ))}
          </div>
        </Abschnitt>
      )}
    </>
  );
}

// ------------------------------------------------------------------- 2 · Wörter
