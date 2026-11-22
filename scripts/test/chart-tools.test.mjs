import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../../chart-tools.js', import.meta.url), 'utf8'), context);
const { line, area, csv } = context.ChartTools;
test('SVG lines and fills leave a real break across missing measurements', () => {
  const points = [{x:0,y:3},{x:300,y:4},{x:3600,y:5},{x:3900,y:6}];
  assert.equal(line(points,x=>x,y=>y,'y',750), 'M0.0 3.0 L300.0 4.0 M3600.0 5.0 L3900.0 6.0');
  assert.equal((area(points,x=>x,y=>y,10,'y',750).match(/ Z/g)||[]).length, 2);
});
test('CSV preserves numbers and safely quotes formulas, commas and quotes', () => {
  assert.equal(csv(['Game','Players'],[['=SUM(A1)',123],['a,"b',null]]), '"Game","Players"\r\n"\'=SUM(A1)","123"\r\n"a,""b",""');
});
