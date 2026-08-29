// Kontogruppen anlegen und pflegen.
//
// Eine Gruppe ist eine SICHT und keine Rechenregel — der Unterschied zur `Kontoklasse`
// steht im Kern (`core/konten/gruppe.ts`) und entscheidet, warum hier nichts gerechnet
// wird: die Klasse sagt, ob ein Saldo zu den liquiden Mitteln zählt, die Gruppe sagt nur,
// was man zusammen ansehen will. Deshalb darf ein Konto in mehreren Gruppen liegen, und
// deshalb steht hier eine Summe der Anfangsbestände und nicht der reale Stand: der
// gehört dorthin, wo auch die Buchungen sind.
//
// Der Ort ist die Verwaltung und nicht die Analyse: hier werden Konten geführt, und eine
// Gruppe ist eine Aussage über Konten. Ausgewertet wird sie woanders.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Gruppensicht, Zahlungskonto } from "../../../application";
import {
  kontogruppeLoeschen,
  kontogruppeSpeichern,
  kontogruppen as kontogruppenLaden,
  stammdaten,
} from "../../dienste";
import { Button, Card, FormField, Pill } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";
import { useLoeschfrage } from "../bausteine/Loeschfrage";

export function GruppenBereich() {
  const { t } = useTranslation();
  const geld = useGeld();
  const [sichten, setSichten] = useState<readonly Gruppensicht[]>([]);
  const [konten, setKonten] = useState<readonly Zahlungskonto[]>([]);
  const [bearbeitet, setBearbeitet] = useState<Gruppensicht | "neu" | null>(null);
  const loeschfrage = useLoeschfrage();

  async function laden() {
    const [g, s] = await Promise.all([kontogruppenLaden(), stammdaten()]);
    setSichten(g);
    setKonten(s.konten);
  }
  useEffect(() => {
    laden().catch(() => {
      /* reiner Browser-Modus ohne SQLite */
    });
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--sp-3)" }}>
        <Button variant="primary" plus onClick={() => setBearbeitet("neu")}>
          {t("konten.gruppen.anlegen")}
        </Button>
      </div>

      {sichten.length === 0 && (
        <Card>
          <div className="muted">{t("konten.gruppen.keine")}</div>
        </Card>
      )}

      {sichten.map((s) => (
        <Card
          key={s.gruppe.id}
          title={s.gruppe.bezeichnung}
          style={{ marginBottom: "var(--gap-card)" }}
          action={
            <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
              <button className="linkbtn" onClick={() => setBearbeitet(s)}>
                {t("konten.gruppen.bearbeiten")}
              </button>
              <button
                className="linkbtn"
                onClick={() =>
                  loeschfrage.stellen({
                    name: s.gruppe.bezeichnung,
                    // Die Konten bleiben — das ist die Auskunft, die hier fehlt, wenn man
                    // sie nicht hinschreibt: eine Gruppe zu löschen sieht danach aus, als
                    // nähme sie ihre Mitglieder mit.
                    folgen: t("konten.gruppen.loeschFolgen"),
                    ausfuehren: async () => {
                      await kontogruppeLoeschen(s.gruppe.id);
                      await laden();
                    },
                  })
                }
              >
                {t("konten.gruppen.loeschen")}
              </button>
            </span>
          }
        >
          {s.konten.length === 0 ? (
            <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
              {t("konten.gruppen.leer")}
            </div>
          ) : (
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              {s.konten.map((k) => (
                <Pill key={k.id} variant="neutral">
                  {k.bezeichnung}
                </Pill>
              ))}
            </div>
          )}
          <div className="muted" style={{ fontSize: "var(--fs-2xs)", marginTop: "var(--sp-3)" }}>
            {t("konten.gruppen.anfangsbestand", { betrag: geld.formatMitSymbol(s.anfangsbestand) })}
          </div>
        </Card>
      ))}

      {bearbeitet && (
        <GruppeModal
          gruppe={bearbeitet === "neu" ? undefined : bearbeitet.gruppe}
          konten={konten}
          onClose={() => setBearbeitet(null)}
          onGespeichert={async () => {
            setBearbeitet(null);
            await laden();
          }}
        />
      )}
      {loeschfrage.dialog}
    </div>
  );
}

function GruppeModal({
  gruppe,
  konten,
  onClose,
  onGespeichert,
}: {
  gruppe?: { id: string; bezeichnung: string; kontoIds: readonly string[] };
  konten: readonly Zahlungskonto[];
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [bezeichnung, setBezeichnung] = useState(gruppe?.bezeichnung ?? "");
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<string>>(new Set(gruppe?.kontoIds ?? []));
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function umschalten(id: string) {
    const neu = new Set(gewaehlt);
    if (neu.has(id)) neu.delete(id);
    else neu.add(id);
    setGewaehlt(neu);
  }

  async function speichern() {
    setFehler(null);
    setBusy(true);
    try {
      await kontogruppeSpeichern({ bezeichnung, kontoIds: [...gewaehlt] }, gruppe?.id);
      await onGespeichert();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={gruppe ? t("konten.gruppen.titelBearbeiten") : t("konten.gruppen.titelNeu")}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={busy ? () => {} : () => void speichern()}>
            {t("konten.speichern")}
          </Button>
          <button className="linkbtn" onClick={onClose}>
            {t("konten.abbrechen")}
          </button>
        </>
      }
    >
      {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
      <div className="form-grid">
        <FormField label={t("konten.gruppen.feldBezeichnung")} required>
          <input
            className="field"
            aria-label={t("konten.gruppen.feldBezeichnung")}
            value={bezeichnung}
            onChange={(e) => setBezeichnung(e.target.value)}
            autoFocus
          />
        </FormField>
      </div>

      {/* Kästchen und keine Mehrfachauswahl: welche Konten drin sind, ist die eigentliche
          Arbeit an einer Gruppe, und bei einer Handvoll Konten ist die vollständige Liste
          schneller zu lesen als ein Feld, das man erst aufklappen muss. */}
      <div style={{ marginTop: "var(--sp-3)" }}>
        <div
          style={{
            fontSize: "var(--fs-2xs)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
            color: "var(--ink-3)",
            marginBottom: "var(--sp-2)",
          }}
        >
          {t("konten.gruppen.feldKonten")}
        </div>
        {konten.map((k) => (
          <label
            key={k.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-2)",
              padding: "4px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={gewaehlt.has(k.id)}
              onChange={() => umschalten(k.id)}
              aria-label={k.bezeichnung}
            />
            <span>{k.bezeichnung}</span>
            <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>
              {t(`einstellungen.konto.klasse.${k.klasse}`)}
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
