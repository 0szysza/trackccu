/* Shared SVG geometry and an optional accessible table. No chart dependency. */
(() => {
  'use strict';
  function split(points, maxGap = Infinity) {
    const segments = [];
    for (const point of points) {
      if (!Number.isFinite(point.x)) continue;
      const last = segments.at(-1);
      if (!last || point.x - last.at(-1).x > maxGap) segments.push([point]);
      else last.push(point);
    }
    return segments;
  }
  function line(points, x, y, key = 'y', maxGap = Infinity) {
    return split(points.filter(point => Number.isFinite(point[key])), maxGap).map(segment => segment.map((point, i) => `${i ? 'L' : 'M'}${x(point.x).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(' ')).join(' ');
  }
  function area(points, x, y, baseline, key = 'y', maxGap = Infinity) {
    return split(points.filter(point => Number.isFinite(point[key])), maxGap).map(segment => `${line(segment, x, y, key)} L${x(segment.at(-1).x).toFixed(1)} ${baseline.toFixed(1)} L${x(segment[0].x).toFixed(1)} ${baseline.toFixed(1)} Z`).join(' ');
  }
  function csv(headers, rows) {
    const cell = value => {
      let text = value == null ? '' : String(value);
      if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  }
  function dataView(panel, { headers, rows, filename = 'trackccu.csv' }) {
    const details = document.createElement('details'); details.className = 'chart-data-view';
    const summary = document.createElement('summary'); summary.textContent = 'View data';
    const content = document.createElement('div'); content.className = 'chart-data-content';
    const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Download CSV';
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = 'Previous';
    const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Next';
    const controls = document.createElement('div'); controls.className = 'chart-data-controls'; controls.append(download, status, previous, next);
    const wrap = document.createElement('div'); wrap.className = 'chart-data-scroll';
    const table = document.createElement('table'); table.setAttribute('aria-label', 'Measurements in the selected chart period'); wrap.append(table);
    content.append(controls, wrap); details.append(summary, content); panel.append(details);
    let page = 0;
    function update() {
      if (!details.open) return;
      const data = rows(), columns = headers();
      page = Math.max(0, Math.min(page, Math.ceil(data.length / 100) - 1));
      const head = document.createElement('thead'), header = document.createElement('tr');
      for (const name of columns) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = name; header.append(th); }
      head.append(header);
      const body = document.createElement('tbody');
      for (const values of data.slice(page * 100, (page + 1) * 100)) {
        const row = document.createElement('tr');
        for (const value of values) { const cell = document.createElement('td'); cell.textContent = value == null ? '—' : String(value); row.append(cell); }
        body.append(row);
      }
      table.replaceChildren(head, body);
      status.textContent = data.length ? `${page * 100 + 1}–${Math.min(data.length, (page + 1) * 100)} of ${data.length}` : 'No measurements in this period.';
      previous.disabled = page === 0; next.disabled = (page + 1) * 100 >= data.length; download.disabled = !data.length;
    }
    details.addEventListener('toggle', update);
    previous.addEventListener('click', () => { page--; update(); }); next.addEventListener('click', () => { page++; update(); });
    download.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob(['\ufeff', csv(headers(), rows())], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    return { update };
  }
  globalThis.ChartTools = { split, line, area, csv, dataView };
})();
