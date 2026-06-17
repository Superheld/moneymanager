// Konten (P3) — die kontozentrische Sicht. Oben alle Konten mit realem Stand; darunter
// das Register eines gewählten Kontos: Anfangsbestand → gebuchte Ist-Buchungen (laufender
// Saldo) → „heute" → geplante Buchungen der kommenden X Tage (abhakbar). Plus manuelle
// Buchung erfassen (ADR-0002 rev.: Bar dauerhaft, Bankkonten vorläufig bis Import).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  formatBetrag,
  istSummeKonto,
  kontoRegister,
  realerKontostand,
  fensterEnde,
  type Charakter,
  type IstBuchung,
  type Kategorie,
  type RegisterZeile,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { buchungErfassen, buchungLoeschen } from "../../application/buchungErfassen";
import { umbuchungErfassen, umbuchungLoeschen } from "../../application/umbuchungErfassen";
import { postenBezahltMarkieren, bezahltZuruecknehmen } from "../../application/bezahltMarkieren";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import type { ScreenId } from "./AppShell";
import { Button, Card, DataTable, FormField, Pill } from "./ds";
import { CategoryPicker } from "./CategoryPicker";
import { Modal } from "./Modal";
import { PageHead } from "./PageHead";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];
const TAGE_OPTIONEN = [14, 30, 60, 90];

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}
function betragFarbe(z: { betrag: number; charakter: Charakter }): string {
  if (z.betrag >= 0) return "var(--ok-deep)";
  return z.charakter === "Umschichtung" ? "var(--accent-deep)" : "var(--ink)";
}

export function KontenScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const heute = useMemo(heuteIso, []);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [aktivId, setAktivId] = useState("");
  const [tage, setTage] = useState(30);
  const [buchenOffen, setBuchenOffen] = useState(false);
  const [umbuchenOffen, setUmbuchenOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    const ks = await kontoRepo.alle();
    setKonten(ks);
    setIst(await ledgerRepo.alle());
    setRegeln(await regelRepo.alle());
    setKategorien(await kategorieRepo.alle());
    setAktivId((id) => id || ks[0]?.id || "");
  }
  useEffect(() => {
    laden();
  }, []);

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const kontoName = useMemo(() => new Map(konten.map((k) => [k.id, k.bezeichnung])), [konten]);
  const aktiv = konten.find((k) => k.id === aktivId);
  const register = useMemo(
    () => (aktiv ? kontoRegister(aktiv, ist, regeln, heute, tage) : null),
    [aktiv, ist, regeln, heute, tage],
  );

  async function abhaken(z: RegisterZeile, schonBezahlt: boolean) {
    if (!z.planRef) return;
    setFehler(null);
    try {
      if (schonBezahlt) {
        await bezahltZuruecknehmen(ledgerRepo, z.planRef.quelleId, z.planRef.faelligkeit);
      } else {
        const regel = regeln.find((r) => r.id === z.planRef!.quelleId);
        if (regel) await postenBezahltMarkieren(ledgerRepo, { regel, faelligkeit: z.planRef.faelligkeit, kontoId: aktivId });
      }
      setIst(await ledgerRepo.alle());
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function zeileEntfernen(z: RegisterZeile) {
    if (z.transferId) await umbuchungLoeschen(ledgerRepo, z.transferId);
    else if (z.istId) await buchungLoeschen(ledgerRepo, z.istId);
    setIst(await ledgerRepo.alle());
  }

  return (
    <div className="screen">
      <PageHead title="Konten" subtitle="Kontostände, gebuchte und voraussichtliche Buchungen je Konto" />

      <Card
        title="Deine Konten"
        subtitle="Anfangsbestand + bestätigte Ist-Buchungen = realer Stand"
        action={<Button plus onClick={() => onNavigate("stammdaten")}>Konto anlegen</Button>}
      >
        {konten.length === 0 ? (
          <div className="muted">Noch keine Konten — leg in Stammdaten → Konten eines an.</div>
        ) : (
          <DataTable
            columns={[
              { key: "bezeichnung", label: "Bezeichnung", render: (k) => (<span style={{ fontWeight: k.id === aktivId ? "var(--fw-bold)" : "var(--fw-semi)" }}>{k.bezeichnung}</span>) },
              { key: "typ", label: "Typ", render: (k) => <Pill variant="neutral">{k.typ}</Pill> },
              { key: "anfang", label: "Anfangsbestand €", align: "right", render: (k) => formatBetrag(k.saldo) },
              { key: "ist", label: "Σ Ist €", align: "right", render: (k) => (istSummeKonto(ist, k.id) ? formatBetrag(istSummeKonto(ist, k.id), true) : "—") },
              { key: "real", label: "realer Stand €", align: "right", render: (k) => <span style={{ fontWeight: "var(--fw-bold)" }}>{formatBetrag(realerKontostand(k, ist))}</span> },
              { key: "_v", label: "", align: "right", render: (k) => <button className="linkbtn" onClick={() => setAktivId(k.id)}>{k.id === aktivId ? "ausgewählt" : "ansehen"}</button> },
            ]}
            rows={konten}
          />
        )}
      </Card>

      {aktiv && register && (
        <Card
          title={`Register · ${aktiv.bezeichnung}`}
          subtitle={`realer Stand ${formatBetrag(register.standHeute)} € · Vorschau bis ${ddmm(fensterEnde(heute, tage))}`}
          style={{ marginTop: "var(--gap-card)" }}
          action={
            <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
              <select className="field" style={{ width: "auto" }} value={tage} onChange={(e) => setTage(Number(e.target.value))}>
                {TAGE_OPTIONEN.map((t) => (<option key={t} value={t}>kommende {t} Tage</option>))}
              </select>
              {konten.length >= 2 && <Button plus onClick={() => { setFehler(null); setUmbuchenOffen(true); }}>Umbuchen</Button>}
              <Button variant="primary" plus onClick={() => { setFehler(null); setBuchenOffen(true); }}>Buchung</Button>
            </span>
          }
        >
          {/* Anfangsbestand */}
          <Zeile links={<span style={{ color: "var(--ink-3)", fontWeight: 600 }}>Anfangsbestand</span>} saldo={aktiv.saldo} />

          {/* Gebuchtes Ist */}
          {register.gebucht.map((z) => (
            <Zeile
              key={z.istId}
              links={
                <>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(z.datum)}</span>
                  {z.bezeichnung}
                  {z.gegenkontoId && <span className="muted" style={{ fontSize: 12 }}>{z.betrag < 0 ? "→" : "←"} {kontoName.get(z.gegenkontoId) ?? "?"}</span>}
                  {z.kategorieId && <span className="muted" style={{ fontSize: 12 }}>· {kategorieName.get(z.kategorieId) ?? "?"}</span>}
                  {z.gegenkontoId ? <Pill variant="um">Umbuchung</Pill> : z.quelle === "manuell" ? <Pill variant="neutral">manuell</Pill> : z.quelle === "bezahlt-markiert" ? <Pill variant="neutral">bezahlt</Pill> : null}
                  {z.quelle === "manuell" && <button className="linkbtn" style={{ marginLeft: 4 }} onClick={() => zeileEntfernen(z)}>löschen</button>}
                </>
              }
              betrag={z.betrag}
              charakter={z.charakter}
              saldo={z.saldo}
            />
          ))}

          {/* Trenner heute */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0 8px", color: "var(--ink-3)", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--ls-wide, .04em)" }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            heute · realer Stand {formatBetrag(register.standHeute)} €
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>

          {/* Geplante Vorschau */}
          {register.geplant.length === 0 ? (
            <div className="muted" style={{ paddingTop: 4 }}>Keine geplanten Buchungen in den nächsten {tage} Tagen für dieses Konto.</div>
          ) : (
            register.geplant.map((z, i) => (
              <Zeile
                key={`g${i}`}
                faint
                links={
                  <>
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => abhaken(z, false)}
                      title="als bezahlt markieren"
                      style={{ cursor: "pointer", accentColor: "var(--accent-deep)" }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(z.datum)}</span>
                    {z.bezeichnung}
                    {z.charakter === "Umschichtung" && <Pill variant="um">Umschichtung</Pill>}
                  </>
                }
                betrag={z.betrag}
                charakter={z.charakter}
                saldo={z.saldo}
              />
            ))
          )}

          {fehler && <div className="err" style={{ marginTop: 10 }}>{fehler}</div>}
        </Card>
      )}

      {buchenOffen && aktiv && (
        <BuchungModal
          konto={aktiv}
          kategorien={kategorien}
          heute={heute}
          onClose={() => setBuchenOffen(false)}
          onSaved={async () => { setBuchenOffen(false); setIst(await ledgerRepo.alle()); }}
        />
      )}

      {umbuchenOffen && aktiv && (
        <UmbuchungModal
          konten={konten}
          vonId={aktivId}
          heute={heute}
          onClose={() => setUmbuchenOffen(false)}
          onSaved={async () => { setUmbuchenOffen(false); setIst(await ledgerRepo.alle()); }}
        />
      )}
    </div>
  );
}

/** Eine Registerzeile: linke Beschreibung, Betrag, laufender Saldo rechts. */
function Zeile({ links, betrag, charakter, saldo, faint }: { links: ReactNode; betrag?: number; charakter?: Charakter; saldo: number; faint?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid var(--line-soft)", opacity: faint ? 0.62 : 1 }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, minWidth: 0, flexWrap: "wrap" }}>{links}</span>
      <span style={{ display: "flex", gap: 18, whiteSpace: "nowrap" }}>
        {betrag != null && charakter != null && (
          <span className="num" style={{ fontSize: 13.5, fontWeight: 700, color: betragFarbe({ betrag, charakter }), minWidth: 92, textAlign: "right" }}>{formatBetrag(betrag, true)} €</span>
        )}
        <span className="num" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", minWidth: 92, textAlign: "right" }}>{formatBetrag(saldo)} €</span>
      </span>
    </div>
  );
}

function UmbuchungModal({ konten, vonId, heute, onClose, onSaved }: { konten: Zahlungskonto[]; vonId: string; heute: string; onClose: () => void; onSaved: () => void }) {
  const [von, setVon] = useState(vonId);
  const [nach, setNach] = useState(konten.find((k) => k.id !== vonId)?.id ?? "");
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await umbuchungErfassen(ledgerRepo, { vonKontoId: von, nachKontoId: nach, datum, betragEuro: Number(betrag.replace(",", ".")), notiz });
      onSaved();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal
      title="Umbuchen"
      subtitle="Übertrag zwischen zwei Konten — Vermögensumschichtung, keine Ausgabe"
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>Speichern</Button><button className="linkbtn" onClick={onClose}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label="Von Konto" required>
          <select className="field" value={von} onChange={(e) => setVon(e.target.value)}>
            {konten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
          </select>
        </FormField>
        <FormField label="Nach Konto" required>
          <select className="field" value={nach} onChange={(e) => setNach(e.target.value)}>
            {konten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
          </select>
        </FormField>
        <FormField label="Datum" required>
          <input className="field" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        <FormField label="Betrag" required>
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0,00" />
        </FormField>
        <FormField label="Notiz" hint="optional">
          <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Sparrate, Rücklage" />
        </FormField>
      </div>
    </Modal>
  );
}

function BuchungModal({ konto, kategorien, heute, onClose, onSaved }: { konto: Zahlungskonto; kategorien: Kategorie[]; heute: string; onClose: () => void; onSaved: () => void }) {
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [charakter, setCharakter] = useState<Charakter>("Aufwand");
  const [kategorieId, setKategorieId] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const vorlaeufig = konto.typ !== "Bargeld";

  async function speichern() {
    setFehler(null);
    try {
      await buchungErfassen(ledgerRepo, {
        kontoId: konto.id,
        datum,
        betragEuro: Number(betrag.replace(",", ".")),
        charakter,
        kategorieId: kategorieId || undefined,
        notiz,
      });
      onSaved();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal
      title={`Buchung erfassen · ${konto.bezeichnung}`}
      subtitle={vorlaeufig ? "vorläufig — der spätere Bankimport gleicht sie ab" : "Bargeld — manuelle Erfassung ist hier die Dauerquelle"}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>Speichern</Button><button className="linkbtn" onClick={onClose}>Abbrechen</button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label="Datum" required>
          <input className="field" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        <FormField label="Betrag" hint="positiv — Richtung aus Charakter" required>
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0,00" />
        </FormField>
        <FormField label="Charakter">
          <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
            {CHARAKTERE.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </FormField>
        <FormField label="Kategorie" hint="optional">
          <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
        </FormField>
        <FormField label="Notiz" hint="optional">
          <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Bäcker, Tankstelle" />
        </FormField>
      </div>
    </Modal>
  );
}
