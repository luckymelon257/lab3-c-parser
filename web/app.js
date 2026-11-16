// Web page logic: parse via the server, draw the AST with d3, run and translate in the browser.
import { toHierarchy } from './tree.js';
import { analyze } from '/js/semantic.js';
import { run } from '/js/interpreter.js';
import { toPython } from '/js/translator.js';

const $ = id => document.getElementById(id);
const code = $('code'), output = $('output'), python = $('python');

function show(pre, text, isError = false) {
  pre.textContent = text;
  pre.classList.toggle('error', isError);
}

// Sends the editor content to the server; returns the AST or null (error already shown).
async function parse() {
  const res = await fetch('/api/parse', { method: 'POST', body: code.value });
  const json = await res.json();
  if (json.ok) return json.ast;
  d3.select('#tree').selectAll('*').remove();
  show(output, json.error, true);
  return null;
}

// ---------- AST tree (d3) ----------

function renderTree(ast) {
  const sourceLines = code.value.split('\n');
  const svg = d3.select('#tree');
  svg.selectAll('*').remove();
  const g = svg.append('g');
  const zoom = d3.zoom().scaleExtent([0.2, 3]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);

  const root = d3.hierarchy(toHierarchy(ast));
  root.descendants().forEach((d, i) => { d.id = i; });
  const layout = d3.tree().nodeSize([26, 190]);   // [vertical gap, horizontal gap]
  const link = d3.linkHorizontal().x(d => d.y).y(d => d.x);

  function update() {
    layout(root);
    const nodes = root.descendants(), links = root.links();

    g.selectAll('path.link').data(links, d => d.target.id).join('path')
      .attr('class', 'link').attr('d', link);

    g.selectAll('text.edge-label').data(links, d => d.target.id).join('text')
      .attr('class', 'edge-label')
      .attr('x', d => d.target.y - 10)
      .attr('y', d => d.target.x - 8)
      .attr('text-anchor', 'end')
      .text(d => d.target.data.field);

    const node = g.selectAll('g.node').data(nodes, d => d.id).join(enter => {
      const e = enter.append('g');
      e.append('circle').attr('r', 6);
      e.append('text').attr('dy', '0.32em').attr('x', 10);
      e.append('title');
      e.on('click', (_, d) => {   // collapse / expand
        [d.children, d._children] = [d._children, d.children];
        update();
      });
      return e;
    });
    node.attr('class', d => `node ${d.data.category}${d._children ? ' collapsed' : ''}`)
      .attr('transform', d => `translate(${d.y},${d.x})`);
    node.select('text').text(d => d.data.label);
    node.select('title').text(d => `line ${d.data.line}: ${(sourceLines[d.data.line - 1] || '').trim()}`);
  }

  update();
  // Fit the whole tree into the panel (never enlarge past 100%).
  const { clientWidth: width, clientHeight: height } = svg.node();
  const box = g.node().getBBox();
  const scale = Math.max(0.2, Math.min(1, (width - 40) / box.width, (height - 20) / box.height));
  svg.call(zoom.transform, d3.zoomIdentity.translate(20 - box.x * scale, (height - box.height * scale) / 2 - box.y * scale).scale(scale));
}

// ---------- buttons ----------

$('parse').onclick = async () => {
  const ast = await parse();
  if (!ast) return;
  renderTree(ast);
  show(output, 'Parsed OK.');
};

$('run').onclick = async () => {
  const ast = await parse();
  if (!ast) return;
  renderTree(ast);
  try {
    const result = run(analyze(ast));
    show(output, `${result.output}\n[exit code ${result.exitCode}]`);
  } catch (e) {
    show(output, e.message, true);
  }
};
$('translate').onclick = async () => {
  const ast = await parse();
  if (!ast) return;
  renderTree(ast);
  try {
    show(python, toPython(analyze(ast)));
    show(output, 'Translated OK.');
  } catch (e) {
    show(python, '');
    show(output, e.message, true);
  }
};

// ---------- examples ----------

const examples = $('examples');
for (const name of await (await fetch('/api/examples')).json()) {
  examples.add(new Option(name, name));
}
examples.onchange = async () => {
  if (!examples.value) return;
  code.value = await (await fetch(`/examples/${examples.value}`)).text();
  $('parse').click();
};
