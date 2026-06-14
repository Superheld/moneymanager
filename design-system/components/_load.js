/* Dev loader: render DS components in card previews WITHOUT the compiled _ds_bundle.js.
   Fetches the sibling .jsx sources, strips import/export, transpiles with Babel,
   and returns the components. Works the same before and after the DS is compiled. */
window.loadDS = async function(files){
  let combined = '';
  for (const f of files){
    let s = await (await fetch(f)).text();
    s = s.replace(/^[ \t]*import[^\n]*\n/gm, '')   // drop import lines
         .replace(/\bexport\s+/g, '');             // export function X -> function X
    combined += '\n' + s;
  }
  const names = [...new Set(
    [...combined.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1])
  )];
  const code = Babel.transform(combined, { presets: ['react'] }).code;
  const ns = new Function('React', code + '\nreturn {' + names.join(',') + '};')(window.React);
  window.DSNS = Object.assign(window.DSNS || {}, ns);
  return ns;
};
