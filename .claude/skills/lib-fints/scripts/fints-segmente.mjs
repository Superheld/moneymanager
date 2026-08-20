#!/usr/bin/env node
// Macht mitgeschnittene FinTS-Nachrichten lesbar.
//
// Nimmt base64-kodierte Nachrichten entgegen, dekodiert sie (Latin-1), packt den
// Binärblock des Segments HNVSD aus — darin stecken bei PIN/TAN die eigentlichen
// Nutzdaten — und zeigt die Segmente, wahlweise gefiltert und feldweise.
//
// Ohne das Auspacken sieht man nur HNHBK/HNVSK/HNVSD/HNHBS und keinen einzigen
// Geschäftsvorfall. Das ist der häufigste Grund, warum ein selbstgebauter Mitschnitt
// nutzlos aussieht.
//
// Aufruf:
//   node fints-segmente.mjs mitschnitt.json                 # alle Segmente
//   node fints-segmente.mjs mitschnitt.json HIUPD           # nur diese Art
//   node fints-segmente.mjs mitschnitt.json HIUPD --felder  # jedes Datenelement einzeln
//   cat nachricht.b64 | node fints-segmente.mjs - HIRMS
//
// Eingabeformate:
//   · JSON-Array aus { anfrage?, antwort?, nr? } mit base64-Werten
//   · JSON-Array aus base64-Strings
//   · eine einzelne base64-Nachricht als Rohtext (auch über stdin mit "-")
//
// ACHTUNG: Mitschnitte enthalten Kontonummern, Namen, Beträge, Verwendungszwecke und
// die PIN im Klartext. Nicht in Projektverzeichnisse legen, nach der Fehlersuche
// löschen.

import { readFileSync } from 'node:fs';

// ── FinTS-Syntax ─────────────────────────────────────────────────────────────
// '  beendet ein Segment          +  trennt Datenelemente
// :  trennt Gruppen innerhalb DE  ?  maskiert das folgende Zeichen
// @<länge>@ leitet einen Binärblock ein, in dem nichts davon gilt

/** Zerlegt eine Nachricht in Segmente. Zeichenweise, weil split() an ?' und an
 *  Binärblöcken scheitert. */
export function inSegmente(text) {
  const segmente = [];
  let aktuell = '';
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (z === '?') {
      aktuell += z + (text[++i] ?? '');
      continue;
    }
    if (z === '@') {
      const ende = text.indexOf('@', i + 1);
      const laenge = Number(text.slice(i + 1, ende));
      if (ende > 0 && Number.isFinite(laenge)) {
        aktuell += text.slice(i, ende + 1 + laenge);
        i = ende + laenge;
        continue;
      }
    }
    if (z === "'") {
      if (aktuell.trim()) segmente.push(aktuell);
      aktuell = '';
      continue;
    }
    aktuell += z;
  }
  if (aktuell.trim()) segmente.push(aktuell);
  return segmente;
}

/** Datenelemente eines Segments. Maskierung aufgelöst, Binärblöcke zusammengefasst. */
export function inFelder(segment) {
  const felder = [];
  let aktuell = '';
  for (let i = 0; i < segment.length; i++) {
    const z = segment[i];
    if (z === '?') {
      aktuell += segment[++i] ?? '';
      continue;
    }
    if (z === '@') {
      const ende = segment.indexOf('@', i + 1);
      const laenge = Number(segment.slice(i + 1, ende));
      if (ende > 0 && Number.isFinite(laenge)) {
        aktuell += `«${laenge} Bytes binär»`;
        i = ende + laenge;
        continue;
      }
    }
    if (z === '+') {
      felder.push(aktuell);
      aktuell = '';
      continue;
    }
    aktuell += z;
  }
  felder.push(aktuell);
  return felder;
}

export const kennung = (segment) =>
  segment.slice(0, segment.search(/[:+]/) >>> 0) || segment.slice(0, 5);

/** Ersetzt HNVSD durch die Segmente aus seinem Binärblock. */
export function auspacken(segmente) {
  const heraus = [];
  for (const s of segmente) {
    if (kennung(s) !== 'HNVSD') {
      heraus.push(s);
      continue;
    }
    const start = s.indexOf('@');
    const ende = s.indexOf('@', start + 1);
    const laenge = Number(s.slice(start + 1, ende));
    if (start < 0 || ende < 0 || !Number.isFinite(laenge)) {
      heraus.push(s);
      continue;
    }
    heraus.push(...inSegmente(s.slice(ende + 1, ende + 1 + laenge)));
  }
  return heraus;
}

const entschluessle = (b64) =>
  new TextDecoder('iso-8859-1').decode(Buffer.from(b64.trim(), 'base64'));

/** Holt aus den unterschiedlichen Eingabeformaten eine Liste { nr, richtung, b64 }. */
function lies(quelle) {
  const roh = quelle === '-' ? readFileSync(0, 'utf8') : readFileSync(quelle, 'utf8');
  let daten;
  try {
    daten = JSON.parse(roh);
  } catch {
    return [{ nr: 1, richtung: '', b64: roh }];
  }
  if (!Array.isArray(daten)) daten = [daten];

  const heraus = [];
  for (const [i, e] of daten.entries()) {
    if (typeof e === 'string') {
      heraus.push({ nr: i + 1, richtung: '', b64: e });
      continue;
    }
    if (e.anfrage) heraus.push({ nr: e.nr ?? i + 1, richtung: '→ an die Bank', b64: e.anfrage });
    if (e.antwort) heraus.push({ nr: e.nr ?? i + 1, richtung: '← von der Bank', b64: e.antwort });
  }
  return heraus;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const zeigeFelder = argv.includes('--felder');
  const frei = argv.filter((a) => !a.startsWith('--'));
  const quelle = frei[0];
  const filter = frei.slice(1).map((s) => s.toUpperCase());

  if (!quelle) {
    console.error('Aufruf: node fints-segmente.mjs <datei|-> [SEGMENTART …] [--felder]');
    process.exit(1);
  }

  let gezeigt = 0;
  for (const { nr, richtung, b64 } of lies(quelle)) {
    const segmente = auspacken(inSegmente(entschluessle(b64)));
    const passend = filter.length ? segmente.filter((s) => filter.includes(kennung(s))) : segmente;
    if (passend.length === 0) continue;

    console.log(`\n══ Nachricht ${nr} ${richtung} (${passend.length}/${segmente.length} Segmente)`);
    for (const s of passend) {
      console.log(`\n  ${s}`);
      if (zeigeFelder) inFelder(s).forEach((f, i) => console.log(`      [${String(i).padStart(2)}] ${f}`));
      gezeigt++;
    }
  }

  console.log(
    gezeigt === 0
      ? `\nKeine Segmente${filter.length ? ` der Art ${filter.join('/')}` : ''} gefunden.`
      : `\n${gezeigt} Segment(e).`,
  );
}
