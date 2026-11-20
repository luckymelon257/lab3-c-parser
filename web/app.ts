// Web page logic: parse via the server, draw the AST with d3, run and translate in the browser.

import { TREE_NODE_SIZE, TREE_ZOOM_EXTENT } from '../src/constants.js';
import { run } from '../src/interpreter.js';
import { analyze } from '../src/semantic.js';
import { toPython } from '../src/translator.js';
import type { ParseResponse, Program, TreeDatum, TreeNode } from '../src/types.js';
import { toHierarchy } from './tree.js';

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const code = $<HTMLTextAreaElement>('code');
const output = $<HTMLPreElement>('output');
const python = $<HTMLPreElement>('python');
const examples = $<HTMLSelectElement>('examples');

function show(pre: HTMLPreElement, text: string, isError = false): void {
  pre.textContent = text;
  pre.classList.toggle('error', isError);
}

/** Sends the editor content to the server; returns the AST or null (error already shown). */
async function parse(): Promise<Program | null> {
  const res = await fetch('/api/parse', { method: 'POST', body: code.value });
  const json = (await res.json()) as ParseResponse;
  if (json.ok) return json.ast;

  d3.select('#tree').selectAll('*').remove();
  show(output, json.error, true);
  return null;
}

// ---------- AST tree (d3) ----------

function renderTree(ast: Program): void {
  const sourceLines = code.value.split('\n');

  const svg = d3.select<SVGSVGElement, unknown>('#tree');
  svg.selectAll('*').remove();
  const g = svg.append('g');

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent(TREE_ZOOM_EXTENT)
    .on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);

  const layout = d3.tree<TreeNode>().nodeSize(TREE_NODE_SIZE);
  const root = layout(d3.hierarchy(toHierarchy(ast))) as TreeDatum;
  root.descendants().forEach((d, i) => {
    (d as TreeDatum).uid = i;
  });

  const link = d3
    .linkHorizontal<unknown, TreeDatum>()
    .x(d => d.y)
    .y(d => d.x);

  function update(): void {
    layout(root);
    const nodes = root.descendants() as TreeDatum[];
    const links = root.links() as { source: TreeDatum; target: TreeDatum }[];

    g.selectAll<SVGPathElement, (typeof links)[number]>('path.link')
      .data(links, d => d.target.uid)
      .join('path')
      .attr('class', 'link')
      .attr('d', link);

    g.selectAll<SVGTextElement, (typeof links)[number]>('text.edge-label')
      .data(links, d => d.target.uid)
      .join('text')
      .attr('class', 'edge-label')
      .attr('x', d => d.target.y - 10)
      .attr('y', d => d.target.x - 8)
      .attr('text-anchor', 'end')
      .text(d => d.target.data.field ?? '');

    const node = g
      .selectAll<SVGGElement, TreeDatum>('g.node')
      .data(nodes, d => d.uid)
      .join(enter => {
        const e = enter.append('g');
        e.append('circle').attr('r', 6);
        e.append('text').attr('dy', '0.32em').attr('x', 10);
        e.append('title');

        // Click collapses / expands a node.
        e.on('click', (_, d) => {
          [d.children, d._children] = [d._children, d.children];
          update();
        });
        return e;
      });

    node
      .attr('class', d => `node ${d.data.category}${d._children ? ' collapsed' : ''}`)
      .attr('transform', d => `translate(${d.y},${d.x})`);
    node.select('text').text(d => d.data.label);
    node.select('title').text(d => {
      const line = (sourceLines[d.data.line - 1] ?? '').trim();
      return `line ${d.data.line}: ${line}`;
    });
  }

  update();

  // Fit the whole tree into the panel (never enlarge past 100%).
  const svgEl = svg.node() as SVGSVGElement;
  const { clientWidth: width, clientHeight: height } = svgEl;
  const box = (g.node() as SVGGElement).getBBox();
  const scale = Math.max(0.2, Math.min(1, (width - 40) / box.width, (height - 20) / box.height));
  const x = 20 - box.x * scale;
  const y = (height - box.height * scale) / 2 - box.y * scale;
  svg.call(zoom.transform, d3.zoomIdentity.translate(x, y).scale(scale));
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
    show(output, (e as Error).message, true);
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
    show(output, (e as Error).message, true);
  }
};

// ---------- examples ----------

const names = (await (await fetch('/api/examples')).json()) as string[];
for (const name of names) {
  examples.add(new Option(name, name));
}

examples.onchange = async () => {
  if (!examples.value) return;
  code.value = await (await fetch(`/examples/${examples.value}`)).text();
  $('parse').click();
};
