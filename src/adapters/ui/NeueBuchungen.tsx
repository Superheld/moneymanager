// Neue Buchungen eines Kontos — abgerufen, noch nicht bestätigt.
//
// Sie stehen hier und NICHT in der Import-Inbox, und das ist eine bewusste Trennung:
// Die Inbox ist der Ort für den gelegentlichen Dateiimport, bei dem man einen ganzen
// Stapel am Stück durchsieht. Ein Bankabruf ist dagegen der Alltag — was die Bank
// gebracht hat, gehört dorthin, wo man auf das Konto schaut, und nicht in einen
// zweiten Arbeitsschritt an anderer Stelle.
//
// Angezeigt wird zu jeder Zeile, was die App über sie zu wissen glaubt:
//
//  • welche Kategorie sie bekommen hat und WOHER dieser Vorschlag stammt (Festlegung,
//    Vertrag, Modell …) — sonst ist eine automatische Kategorie eine Behauptung ohne
//    Absender,
//  • ob sie eine Dublette sein könnte, mit den Gründen des Finders im Klartext.
//
// Bestätigen heißt verbuchen: erst dann wird aus dem Abruf eine Ist-Buchung, die im
// Saldo steht. Bis dahin ist nichts passiert, was sich nicht folgenlos verwerfen ließe.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Kategorie } from "../../core";
import { umsaetzeVerbuchen, verwerfen, type Umsatz } from "../../application/import";
import { zuordnungenAbgleichen } from "../../application/vertragszuordnung";
import { vertragsAbgleichDeps } from "../persistence/sqliteVertragZuordnungRepositories";
import { sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { CategoryPicker } from "./CategoryPicker";
import { Button, Card, Pill } from "./ds";
import { useGeld } from "./einstellungenKontext";

/** Quellen, die als Bankabruf gelten — deren Umsätze landen hier statt in der Inbox. */
export const ABRUF_QUELLEN = new Set(["fints"]);

export function NeueBuchungen({
  zeilen,
  alleOffenen,
  kategorien,
  onGeaendert,
}: {
  /** Die offenen Abruf-Buchungen DIESES Kontos. */
  zeilen: readonly Umsatz[];
  /** Alle offenen — zum Auflösen des vermuteten Zwillings, der woanders liegen kann. */
  alleOffenen: readonly Umsatz[];
  kategorien: readonly Kategorie[];
  onGeaendert: () => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Zeile, deren Kategorie gerade geändert wird. */
  const [aendertId, setAendertId] = useState<string | null>(null);

  const kategorieName = new Map(kategorien.map((k) => [k.id, k.name]));

  async function bestaetigen(auswahl: readonly Umsatz[]) {
    if (auswahl.length === 0) return;
    setBusy(true);
    setFehler(null);
    try {
      await umsaetzeVerbuchen(auswahl, {
        ledgerRepo: sqliteLedgerRepository,
        umsatzRepo: sqliteUmsatzRepository,
        id: () => crypto.randomUUID(),
      });
      // Frisch verbuchte Zahlungen den Verträgen zuordnen — derselbe Schritt wie in der
      // Inbox. Er gehört nicht in den Verbuchen-Use-Case: der schreibt Fakten, die
      // Zuordnung ist eine Interpretation darüber.
      await zuordnungenAbgleichen(vertragsAbgleichDeps);
      onGeaendert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verwerfenEiner(u: Umsatz) {
    await sqliteUmsatzRepository.speichern(verwerfen(u));
    onGeaendert();
  }

  async function kategorieSetzen(u: Umsatz, kategorieId: string) {
    const kategorie = kategorien.find((k) => k.id === kategorieId);
    await sqliteUmsatzRepository.speichern({
      ...u,
      // Von Hand gewählt ist von Hand gewählt — die Quelle wird mitgeführt, damit später
      // sichtbar bleibt, was das Modell wusste und was der Mensch entschieden hat.
      vorschlag: {
        kategorieId,
        charakter: kategorie?.defaultCharakter ?? u.vorschlag?.charakter ?? "Aufwand",
        quelle: "manuell",
      },
    });
    setAendertId(null);
    onGeaendert();
  }

  if (zeilen.length === 0) return null;

  const ohneVerdacht = zeilen.filter((u) => !u.verdachtAufId);

  return (
    <Card
      style={{ marginTop: "var(--gap-card)" }}
      title={t("konten.neue.titel", { n: zeilen.length })}
      subtitle={t("konten.neue.untertitel")}
      action={
        ohneVerdacht.length > 0 ? (
          <Button variant="primary" onClick={() => void bestaetigen(ohneVerdacht)}>
            {busy ? t("konten.neue.laeuft") : t("konten.neue.alleBestaetigen", { n: ohneVerdacht.length })}
          </Button>
        ) : undefined
      }
    >
      {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}

      {zeilen.map((u) => {
        const zwilling = u.verdachtAufId ? alleOffenen.find((x) => x.id === u.verdachtAufId) : undefined;
        return (
          <div key={u.id} style={{ borderTop: "1px solid var(--line-soft)", padding: "var(--sp-3) 0" }}>
            <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{u.buchungstag}</span>
              <strong>{u.gegenpartei || t("konten.neue.ohneGegenpartei")}</strong>
              <span style={{ marginLeft: "auto", fontWeight: "var(--fw-bold)" }}>{geld.format(u.betrag)}</span>
            </div>

            <div className="muted" style={{ fontSize: "var(--fs-xs)", margin: "var(--sp-1) 0" }}>
              {u.verwendungszweck}
            </div>

            <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
              {/* Die Kategorie MIT Absender: eine automatische Zuordnung ohne sichtbaren
                  Grund ist eine Behauptung, die man nicht prüfen kann. */}
              <Pill variant={u.vorschlag?.kategorieId ? "ok" : "warn"}>
                {u.vorschlag?.kategorieId
                  ? (kategorieName.get(u.vorschlag.kategorieId) ?? "?")
                  : t("konten.neue.ohneKategorie")}
              </Pill>
              {u.vorschlag && (
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t(`konten.neue.quelle.${u.vorschlag.quelle}`)}
                </span>
              )}
              <button className="linkbtn" onClick={() => setAendertId(aendertId === u.id ? null : u.id)}>
                {t("konten.neue.kategorieAendern")}
              </button>

              <span style={{ marginLeft: "auto", display: "flex", gap: "var(--sp-3)" }}>
                <button className="linkbtn" onClick={() => void bestaetigen([u])}>
                  {t("konten.neue.bestaetigen")}
                </button>
                <button className="linkbtn" onClick={() => void verwerfenEiner(u)}>
                  {t("konten.neue.verwerfen")}
                </button>
              </span>
            </div>

            {aendertId === u.id && (
              <div style={{ marginTop: "var(--sp-2)", maxWidth: 320 }}>
                <CategoryPicker
                  kategorien={[...kategorien]}
                  value={u.vorschlag?.kategorieId ?? ""}
                  onChange={(id) => void kategorieSetzen(u, id)}
                />
              </div>
            )}

            {u.verdachtAufId && (
              <div style={{ marginTop: "var(--sp-2)" }}>
                <Pill variant="warn">{t("konten.neue.dublette")}</Pill>{" "}
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t("konten.neue.dubletteHinweis", { gruende: (u.verdachtGruende ?? []).join(", ") })}
                  {zwilling && ` — ${zwilling.buchungstag} ${zwilling.gegenpartei}`}
                </span>
              </div>
            )}
          </div>
        );
      })}

    </Card>
  );
}
