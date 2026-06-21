import React from 'react';

/**
 * DataTable — the hairline table used across Verträge, Liquidität, Analysen, Stammdaten.
 * `columns` define key, label, align ('left'|'right'), and an optional cell renderer.
 * Right-aligned numeric columns get tabular figures automatically.
 */
export function DataTable({ columns, rows, onRowClick, istAktiv }) {
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
      <thead><tr>{columns.map(function(c,i){
        return <th key={i} style={{ textAlign:c.align==='right'?'right':'left', fontSize:'var(--fs-2xs)',
          fontWeight:'var(--fw-bold)', textTransform:'uppercase', letterSpacing:'.04em', color:'var(--ink-3)',
          padding:'8px 10px', borderBottom:'1px solid var(--line)' }}>{c.label}</th>;
      })}</tr></thead>
      <tbody>{rows.map(function(row,ri){
        var aktiv = istAktiv ? istAktiv(row) : false;
        return <tr key={ri} onClick={onRowClick?function(){onRowClick(row);}:undefined}
          style={{ cursor:onRowClick?'pointer':'default', background:aktiv?'var(--accent-soft, rgba(20,160,160,.10))':'transparent' }}>{columns.map(function(c,ci){
          var v=c.render?c.render(row):row[c.key];
          return <td key={ci} style={{ padding:'10px', borderBottom:'1px solid var(--line-soft)',
            textAlign:c.align==='right'?'right':'left', fontVariantNumeric:c.align==='right'?'tabular-nums':'normal',
            fontWeight:ci===0?'var(--fw-bold)':'var(--fw-regular)', color:'var(--ink)' }}>{v}</td>;
        })}</tr>;
      })}</tbody>
    </table>
  );
}
