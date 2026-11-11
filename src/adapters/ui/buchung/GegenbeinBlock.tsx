// Die Wahl der Gegenseite einer Umschichtung im Entwurf — die Liste, die vor dem Verbuchen
// sagt, welche Seite gewählt ist (sonst entstünde lautlos eine einseitige Umschichtung).
//
// Herausgezogen aus `BuchungFormular` (2026-11-10, K1 der Oberflächenliste): der Block
// bekommt seine Daten aus `useGegenbeinwahl` und meldet die Wahl dorthin zurück — dasselbe
// Kriterium wie bei `VertragsBlock` und `DublettenBlock`: er braucht den Zustand der Maske
// nicht, nur das, was über die Gegenseite feststeht.

import { useTranslation } from "react-i18next";
import { Auswahl } from "../bausteine/Auswahl";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { Option, Optionsgruppe } from "./Optionsgruppe";
import type { useGegenbeinwahl } from "./useGegenbeinwahl";

export function GegenbeinBlock({
  gegenbein,
  kontoName,
}: {
  gegenbein: ReturnType<typeof useGegenbeinwahl>;
  kontoName: ReadonlyMap<string, string>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  return (
    <>
      <Optionsgruppe wert={gegenbein.gewaehlt} aufAendern={gegenbein.waehlen} label={t("konten.zurUmbuchung.kandidatenTitel")}>
      {gegenbein.entwurfKandidaten.map((k) => (
        <Option key={k.id} wert={`e:${k.id}`} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
          <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{datum.ohneJahr(k.buchungstag)}</span>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semi)", flex: 1, minWidth: 0 }}>
            {kontoName.get(k.zahlungskontoId) ?? "?"}
            <span className="muted" style={{ marginLeft: 8, fontSize: "var(--fs-xs)" }}>{t("konten.neue.status.neu")}</span>
          </span>
          <span className="num" style={{ fontWeight: 700, color: geldFarbe(k.betrag) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
        </Option>
      ))}

      {gegenbein.buchungKandidaten.map((k) => (
        <Option key={k.id} wert={`b:${k.id}`} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
          <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{datum.ohneJahr(k.datum)}</span>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semi)", flex: 1, minWidth: 0 }}>
            {kontoName.get(k.kontoId) ?? "?"}
            <span className="muted" style={{ marginLeft: 8, fontSize: "var(--fs-xs)" }}>{t("konten.neue.status.verbucht")}</span>
          </span>
          <span className="num" style={{ fontWeight: 700, color: geldFarbe(k.betrag) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
        </Option>
      ))}

      {/* Ausweg: kein Gegenbein vorhanden (S-1a) — typisch Bargeld. */}
      {gegenbein.andereKonten.length > 0 && (
        <Option wert="__neu" style={{ display: "flex", gap: 10, padding: "8px 0", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semi)" }}>{t("konten.zurUmbuchung.neu")}</span>
          <span style={{ minWidth: 180 }}>
            <Auswahl
              ariaLabel={t("konten.zurUmbuchung.neu")}
              wert={gegenbein.neuKontoGewaehlt}
              aufAenderung={gegenbein.neuKontoWaehlen}
              optionen={gegenbein.andereKonten.map((k) => ({ wert: k.id, text: k.bezeichnung }))}
            />
          </span>
        </Option>
      )}

      <Option wert="__einseitig" style={{ display: "flex", gap: 10, padding: "8px 0" }}>
        <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semi)" }}>{t("konten.entwurf.einseitig")}</span>
      </Option>
      </Optionsgruppe>

      <div className="hinweis" style={{ marginTop: 6 }}>
        {gegenbein.gewaehlt === "__einseitig" ? t("konten.neue.ohneGegenbein") : t("konten.zurUmbuchung.neuHinweis")}
      </div>
    </>
  );
}
