// d3 is loaded by a <script> tag in index.html as the global `d3`.
import type * as D3 from 'd3';

declare global {
  const d3: typeof D3;
}
