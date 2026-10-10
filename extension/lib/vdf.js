// Port of @node-steam/vdf 2.2.0 parse() (MIT), which desktop uses for the CS2
// schema. Objects have no prototype, so keys such as "__proto__" in the
// downloaded file stay plain data.

const LINE = new RegExp('^("((?:\\\\.|[^\\\\"])+)"|([a-z0-9\\-\\_]+))'
  + '([ \t]*('
  + '"((?:\\\\.|[^\\\\"])*)(")?'
  + '|([a-z0-9\\-\\_]+)'
  + '))?');

export function parseVdf(text) {
  const lines = text.split('\n');
  const root = Object.create(null);
  const stack = [root];
  let expectBrace = false;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('/*') && line.endsWith('*/')) continue;
    if (line.startsWith('/*')) { inComment = true; continue; }
    if (line.endsWith('*/')) { inComment = false; continue; }
    if (inComment || line === '' || line[0] === '/') continue;
    if (line[0] === '{') { expectBrace = false; continue; }
    if (expectBrace) throw new SyntaxError(`VDF: invalid syntax on line ${i + 1}`);
    if (line[0] === '}') {
      if (stack.length === 1) throw new SyntaxError(`VDF: unbalanced brace on line ${i + 1}`);
      stack.pop();
      continue;
    }

    for (;;) {
      const m = LINE.exec(line);
      if (m === null) throw new SyntaxError(`VDF: invalid syntax on line ${i + 1}`);
      const key = m[2] !== undefined ? m[2] : m[3];
      let value = m[6] !== undefined ? m[6] : m[8];
      const parent = stack[stack.length - 1];
      if (value === undefined) {
        if (typeof parent[key] !== 'object' || parent[key] === null) parent[key] = Object.create(null);
        stack.push(parent[key]);
        expectBrace = true;
      } else {
        if (m[7] === undefined && m[8] === undefined) {
          if (i + 1 >= lines.length) throw new SyntaxError('VDF: unterminated string');
          line += `\n${lines[++i]}`;
          continue;
        }
        if (value !== '' && !Number.isNaN(Number(value))) value = Number(value);
        else if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value === 'null') value = null;
        parent[key] = value;
      }
      break;
    }
  }
  if (stack.length !== 1) throw new SyntaxError('VDF: unclosed brace');
  return root;
}
