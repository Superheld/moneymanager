// Die Dublettenprüfung im Buchungsdialog — steht das womöglich schon ein zweites Mal da?
//
// Eigene Datei seit dem Entzerren von `BuchungDetail.tsx` (2026-08-25), aus demselben
// Grund wie beim Vertragsblock: der Befund kommt herein, die Entscheidungen gehen hinaus,
// vom Zustand der Maske haengt nichts ab.
//
// `FreigabeHinweis` liegt daneben, weil es die GEGENSEITE derselben Sache ist: der eine
// Block zeigt einen Verdacht, der andere, dass einer ausdruecklich abgeraeumt wurde.

import { useTranslation } from "react-i18next";
import type { Dublettenverdacht } from "../../../application";
import type { Umsatz } from "../../../application/import";
import { Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { IconButton } from "../bausteine/IconButton";
import { ddmm } from "./ddmm";

/** Was die Dublettenprüfung zu dieser Buchung sagt — samt der Zeile, die sie meint. */
export interface Dublettenbefund {
  readonly verdacht: Dublettenverdacht;
  readonly zwilling: Umsatz;
}

/**
 * Dublettenprüfung im Dialog: steht dasselbe womöglich schon ein zweites Mal im Bestand?
 *
 * Der Block erscheint NUR, wenn es etwas zu sagen gibt — der Finder urteilt „identisch"
 * oder „verdacht". Gerechnet wird beim Hinsehen und nicht einmalig beim Import: der
 * Verdacht, den ein Import an die Zeile schreibt, gilt für den Stand von damals, und was
 * später aus einer anderen Quelle dazukam, würde nie nachträglich angeschrieben.
 *
 * Er entscheidet nichts. Die Gründe stehen im Klartext da, das Gegenstück ist einen Klick
 * entfernt, und „ist kein Duplikat" ist die dritte Antwort neben „eine davon löschen" und
 * „stehen lassen": der Finder rechnet mit Punkten und liegt manchmal daneben. Ohne diesen
 * Knopf stünde die Mahnung nach jedem Neuladen wieder da, denn geprüft wird bei jedem
 * Hinsehen neu.
 */
export function DublettenBlock({
  befund,
  imLedger,
  onZwillingOeffnen,
  onKeinDuplikat,
}: {
  befund: Dublettenbefund;
  /** Gebuchte Zeile (beide stehen im Saldo) oder noch ein Entwurf? Der Hinweis unterscheidet sich. */
  imLedger: boolean;
  onZwillingOeffnen?: () => void;
  onKeinDuplikat?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const { verdacht, zwilling } = befund;
  const sicher = verdacht.urteil === "identisch";

  return (
    <div style={{ marginBottom: "var(--sp-4)", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--warn-wash, var(--surface-2))", border: "1px solid var(--warn, var(--line))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Pill variant="warn">{t(sicher ? "konten.neue.dubletteSicher" : "konten.neue.dublette")}</Pill>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
          {ddmm(zwilling.buchungstag)} · {zwilling.gegenpartei || t("konten.neue.ohneGegenpartei")}
        </span>
        <span className="num" style={{ fontWeight: 700, color: geldFarbe(zwilling.betrag) }}>{geld.formatMitSymbol(zwilling.betrag, { mitVorzeichen: true })}</span>
        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
          {t(`konten.neue.status.${zwilling.status}`)}
        </span>
        {onZwillingOeffnen && (
          <IconButton icon="oeffnen" label={t("konten.dublette.oeffnen")} onClick={onZwillingOeffnen} style={{ marginLeft: "auto" }} />
        )}
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
        {t("konten.neue.dubletteHinweis", { gruende: verdacht.gruende.join(", ") })}
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>
        {t(imLedger ? "konten.dublette.hinweisLedger" : "konten.dublette.hinweis")}
      </div>
      {onKeinDuplikat && (
        <button
          className="linkbtn"
          style={{ marginTop: 6, padding: 0 }}
          onClick={() => void onKeinDuplikat()}
        >
          {t("konten.dublette.keinDuplikat")}
        </button>
      )}
    </div>
  );
}

/**
 * Die Gegenprobe: hier wurde einmal entschieden, dass es KEIN Duplikat ist.
 *
 * Ohne diese Zeile wäre die Entscheidung unsichtbar und unumkehrbar — die Markierung
 * bliebe weg, und niemand wüsste warum. Wer sich vertan hat, hätte zwei Zeilen im Saldo
 * und nichts, was darauf zeigt.
 */
export function FreigabeHinweis({ onAufheben }: { onAufheben: () => void | Promise<void> }) {
  const { t } = useTranslation();
  return (
    <div className="muted" style={{ marginBottom: "var(--sp-4)", fontSize: "var(--fs-xs)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span>{t("konten.dublette.freigegeben")}</span>
      <button className="linkbtn" style={{ padding: 0 }} onClick={() => void onAufheben()}>
        {t("konten.dublette.freigabeAufheben")}
      </button>
    </div>
  );
}

