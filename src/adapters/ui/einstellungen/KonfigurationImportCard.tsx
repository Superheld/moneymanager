// Eine Ordnung einlesen — die Gegenrichtung zur Karte darüber.
//
// **Zwei Schritte, nicht einer.** Die Datei wird zuerst nur ANGESEHEN: die Karte zeigt,
// was passieren würde, und erst ein zweiter Klick lässt es passieren. Ein Import, der
// beim Dateiwählen losläuft, nimmt einem die einzige Gelegenheit, ihn nicht zu wollen —
// und die Datei kommt von woanders, man weiss also nicht, was drinsteht.
//
// **Die Datei kommt über die Dateiauswahl des Systems**, nicht aus einem Verzeichnis, das
// die App kennt. Dieselbe Naht wie beim Dateiimport (`ImportScreen`), und derselbe
// Gewinn: der Webview bekommt keinen Lesezugriff aufs Dateisystem, sondern genau die eine
// Datei, die jemand ausgesucht hat.

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Importplan } from "../../../application";
import { Button, Card, Pill } from "../bausteine";
import { konfigurationImport, konfigurationPlan } from "../../dienste";
import { fehlerNachricht } from "../bausteine/einstellungenKontext";

export function KonfigurationImportCard() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [dateiname, setDateiname] = useState<string | null>(null);
  const [plan, setPlan] = useState<Importplan | null>(null);
  const [angelegt, setAngelegt] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    // Zurücksetzen, sonst löst dieselbe Datei beim zweiten Mal kein `change` aus.
    if (inputRef.current) inputRef.current.value = "";
    if (!datei) return;
    setDateiname(datei.name);
    setPlan(null);
    setAngelegt(null);
    setFehler(null);
    const inhalt = await datei.text();
    try {
      setPlan(await konfigurationPlan(inhalt));
      setText(inhalt);
    } catch (e) {
      setText(null);
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function uebernehmen() {
    if (!text) return;
    setLaeuft(true);
    setFehler(null);
    try {
      setAngelegt(await konfigurationImport(text));
      setPlan(null);
      setText(null);
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card title={t("einstellungen.import.konfiguration.titel")}>
      <p className="muted">{t("einstellungen.import.konfiguration.text")}</p>
      <p className="muted">{t("einstellungen.import.konfiguration.hinweis")}</p>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={dateiGewaehlt}
          style={{ display: "none" }}
          aria-label={t("einstellungen.import.dateiWaehlen")}
        />
        <Button onClick={() => inputRef.current?.click()}>{t("einstellungen.import.dateiWaehlen")}</Button>
        {dateiname && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{dateiname}</span>}
      </div>

      {plan && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
            <Pill variant={plan.neu > 0 ? "ok" : "neutral"}>
              {t("einstellungen.import.zaehlerNeu", { n: plan.neu })}
            </Pill>
            <Pill variant="neutral">{t("einstellungen.import.zaehlerVorhanden", { n: plan.vorhanden })}</Pill>
            {plan.abweichend > 0 && (
              <Pill variant="warn">{t("einstellungen.import.zaehlerAbweichend", { n: plan.abweichend })}</Pill>
            )}
          </div>

          {/* Nur die Zeilen, bei denen etwas passiert oder etwas auffällt. Eine Liste, in
              der neunzig von hundert Zeilen „schon da" sagen, verdeckt die zehn. */}
          <ul style={{ margin: 0, paddingLeft: "var(--sp-4)", fontSize: "var(--fs-xs)" }}>
            {plan.befunde
              .filter((b) => b.befund !== "vorhanden")
              .map((b) => (
                <li key={`${b.befund}-${b.name}`} style={{ marginBottom: 2 }}>
                  {b.eltern ? `${b.eltern} › ${b.name}` : b.name}{" "}
                  {b.befund === "neu" ? (
                    <span className="muted">{t("einstellungen.import.wirdAngelegt")}</span>
                  ) : (
                    <span className="muted">
                      {t("einstellungen.import.bleibtWieEsIst", {
                        datei: b.charakter,
                        bestand: b.charakterImBestand ?? "",
                      })}
                    </span>
                  )}
                </li>
              ))}
          </ul>

          <Button
            variant="primary"
            onClick={() => !laeuft && void uebernehmen()}
            style={{ marginTop: "var(--sp-3)" }}
          >
            {laeuft
              ? t("einstellungen.import.laeuft")
              : t("einstellungen.import.uebernehmen", { n: plan.neu })}
          </Button>
        </div>
      )}

      {angelegt !== null && (
        <p style={{ marginBottom: 0 }}>{t("einstellungen.import.fertig", { n: angelegt })}</p>
      )}
      {fehler && <p className="zugang-fehler">{fehler}</p>}
    </Card>
  );
}
