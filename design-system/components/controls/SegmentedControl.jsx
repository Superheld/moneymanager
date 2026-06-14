import React from 'react';

/**
 * SegmentedControl — pill-bordered group of mutually-exclusive options; active = teal wash.
 */
export function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{ display:'inline-flex', border:'1px solid var(--line)', borderRadius:'var(--r-md)', overflow:'hidden', background:'var(--surface)' }}>
      {options.map(function(opt,i){
        var val = typeof opt==='string'?opt:opt.value;
        var lbl = typeof opt==='string'?opt:opt.label;
        var on = val===value;
        return <button key={i} onClick={function(){onChange&&onChange(val);}}
          style={{ padding:'7px 13px', fontSize:'12px', fontWeight:'var(--fw-bold)', border:'none',
            borderRight:i<options.length-1?'1px solid var(--line)':'none', cursor:'pointer', fontFamily:'var(--font-ui)',
            background:on?'var(--accent-wash)':'transparent', color:on?'var(--accent-deep)':'var(--ink-3)' }}>{lbl}</button>;
      })}
    </div>
  );
}
