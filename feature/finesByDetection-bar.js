// feature/finesByDetection-bar.js
// Unified toolbox, BW dropdowns, annual dual-slider with quick selects, monthly simple dropdowns.
// Drop-in replacement.

(function () {
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const SLIDER_MIN = 2008;
  const SLIDER_MAX = 2024;

  function fmt(n){ return n == null ? "0" : n.toLocaleString(); }

  // create black & white dropdown (multi or single)
  function createBWDropdown(parent, labelText, multi = true) {
    const group = parent.append('div').attr('class','filter-group bw');
    group.append('div').attr('class','filter-label').text(labelText);
    const button = group.append('button').attr('type','button').attr('class','filter-button bw-btn').text('All');
    const menu = group.append('div').attr('class','filter-menu bw-menu');
    button.on('click', (e) => { e.stopPropagation(); const open = group.classed('is-open'); d3.selectAll('.filter-group').classed('is-open', false); group.classed('is-open', !open); });
    return { group, button, menu, multi };
  }

  // attach checkbox logic (same behavior as other charts)
  function attachCheckboxLogic(menu, button, selectionSet, defaultLabel, onChangeExtra) {
    const inputs = menu.selectAll('input');
    inputs.on('change', function() {
      const val = this.value;
      if (val === '__all__') {
        const checked = this.checked;
        selectionSet.clear();
        inputs.each(function(){ if (this.value !== '__all__') this.checked = false; });
        if (!checked) this.checked = true;
      } else {
        inputs.each(function(){ if (this.value === '__all__') this.checked = false; });
        if (this.checked) selectionSet.add(val); else selectionSet.delete(val);
        if (selectionSet.size === 0) {
          inputs.each(function(){ if (this.value === '__all__') this.checked = true; });
        }
      }
      // label
      if (selectionSet.size === 0) button.text(defaultLabel + ' ');
      else if (selectionSet.size === 1) button.text(Array.from(selectionSet)[0] + ' ');
      else button.text(`${selectionSet.size} selected `);
      if (onChangeExtra) onChangeExtra();
    });
    // initial
    button.text(defaultLabel + ' ');
  }

  window.renderFinesByDetectionBar = function(selector) {
    const container = d3.select(selector);
    container.selectAll('*').remove();

    // Controls
    const controls = container.append('div').attr('class','chart-controls');
    const toggle = controls.append('div').attr('class','speed-toggle');
    const btnAnnual = toggle.append('button').attr('class','toggle-btn active').text('Annual');
    const btnMonthly = toggle.append('button').attr('class','toggle-btn').text('Monthly');

    const filterRow = controls.append('div').attr('class','filter-row');

    // Slider block (kept, but hidden when monthly)
    const sliderBlock = filterRow.append('div').attr('class','filter-group slider-group');
    sliderBlock.append('div').attr('class','filter-label').text('Year range');
    const sliderHtml = `
      <div class="dual-slider-wrap" style="display:flex;align-items:center;gap:10px;">
        <div style="display:flex;flex-direction:column;align-items:center;">
          <input id="det_yearStart" type="range" min="${SLIDER_MIN}" max="${SLIDER_MAX}" step="1" value="${SLIDER_MIN}" />
          <small id="det_yearStartLabel">${SLIDER_MIN}</small>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;">
          <input id="det_yearEnd" type="range" min="${SLIDER_MIN}" max="${SLIDER_MAX}" step="1" value="${SLIDER_MAX}" />
          <small id="det_yearEndLabel">${SLIDER_MAX}</small>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="det_quick5" class="quick-btn tiny">Last 5y</button>
          <button id="det_quick10" class="quick-btn tiny">Last 10y</button>
          <button id="det_quickAll" class="quick-btn tiny">All</button>
        </div>
      </div>
    `;
    sliderBlock.append('div').html(sliderHtml);

    // Jurisdiction dropdown (BW)
    const jurisDD = createBWDropdown(filterRow, 'Jurisdiction', true);

    // Detection method dropdown (BW)
    const methodDD = createBWDropdown(filterRow, 'Detection methods', true);

    // Year selector for monthly (single)
    const yearGroup = filterRow.append('div').attr('class','filter-group');
    yearGroup.append('div').attr('class','filter-label').text('Year (monthly)');
    const yearSelect = yearGroup.append('select').attr('class','filter-year-select');

    // Month selector for monthly
    const monthGroup = filterRow.append('div').attr('class','filter-group');
    monthGroup.append('div').attr('class','filter-label').text('Month');
    const monthSelect = monthGroup.append('select').attr('class','filter-year-select');
    monthSelect.selectAll('option').data(['All'].concat(MONTH_LABELS)).enter().append('option').attr('value',(d,i)=>i).text(d=>d);
    monthSelect.node().value = 0;

    container.append('p').attr('class','toggle-note small-text')
      .text('Annual: grouped bars across selected year range. Monthly: choose year + month.');

    // Layout & SVG
    const layout = container.append('div').attr('class','chart-layout');
    const svgW = 960, svgH = 480;
    const margin = { top: 40, right: 20, bottom: 120, left: 120 };
    const svg = layout.append('svg').attr('viewBox', `0 0 ${svgW} ${svgH}`).attr('preserveAspectRatio','xMidYMid meet').style('width','100%').style('height','auto');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const innerW = svgW - margin.left - margin.right;
    const innerH = svgH - margin.top - margin.bottom;
    const xAxisG = svg.append('g').attr('class','x-axis').attr('transform', `translate(${margin.left},${svgH - margin.bottom})`);
    const yAxisG = svg.append('g').attr('class','y-axis').attr('transform', `translate(${margin.left},${margin.top})`);

    const tooltip = container.append('div').attr('class','tooltip').style('position','absolute').style('pointer-events','none').style('background','#fff').style('border','1px solid #111').style('padding','8px').style('font-size','0.9rem').style('opacity',0).style('border-radius','6px').style('box-shadow','0 2px 8px rgba(0,0,0,0.12)');

    const color = d3.scaleOrdinal(d3.schemeSet2);

    // load data
    window.SpeedingData.loadExtendedAnnualWithMonthly().then(({ annual, monthly }) => {
      const annualData = (annual || []).map(d => ({ year: +d.year, jurisdiction: d.jurisdiction, detectionMethod: d.detectionMethod, fines: +d.fines }));
      const monthlyData = (monthly || []).map(d => ({ year: +d.year, month: d.month != null && d.month !== '' ? +d.month : null, jurisdiction: d.jurisdiction, detectionMethod: d.detectionMethod, fines: +d.fines }));

      const allJurisdictions = Array.from(new Set([...annualData, ...monthlyData].map(d => d.jurisdiction))).sort();
      const allMethods = Array.from(new Set([...annualData, ...monthlyData].map(d => d.detectionMethod))).sort();
      const monthlyYears = Array.from(new Set(monthlyData.map(d => d.year))).sort((a,b)=>a-b);

      // state
      let mode = 'annual';
      const selectedJurisdictions = new Set(); // empty = all
      const selectedMethods = new Set(); // empty = all
      let sliderStart = SLIDER_MIN, sliderEnd = SLIDER_MAX;
      if (sliderEnd < SLIDER_MIN) sliderEnd = SLIDER_MIN;

      // populate jurisdiction menu
      jurisDD.menu.selectAll('*').remove();
      const jurisAll = jurisDD.menu.append('label').attr('class','filter-option');
      jurisAll.append('input').attr('type','checkbox').attr('value','__all__').property('checked', true);
      jurisAll.append('span').text('All');
      const jurisItems = jurisDD.menu.selectAll('label.item').data(allJurisdictions).enter().append('label').attr('class','filter-option item');
      jurisItems.append('input').attr('type','checkbox').attr('value', d=>d);
      jurisItems.append('span').text(d=>d);
      attachCheckboxLogic(jurisDD.menu, jurisDD.button, selectedJurisdictions, 'All', updateMethodOptions);

      // populate method menu (initial based on full set)
      methodDD.menu.selectAll('*').remove();
      const methodAll = methodDD.menu.append('label').attr('class','filter-option');
      methodAll.append('input').attr('type','checkbox').attr('value','__all__').property('checked', true);
      methodAll.append('span').text('All');
      const methodItems = methodDD.menu.selectAll('label.item').data(allMethods).enter().append('label').attr('class','filter-option item');
      methodItems.append('input').attr('type','checkbox').attr('value', d=>d);
      methodItems.append('span').text(d=>d);
      attachCheckboxLogic(methodDD.menu, methodDD.button, selectedMethods, 'All', null);

      // populate yearSelect for monthly
      yearSelect.selectAll('option').remove();
      yearSelect.selectAll('option').data(monthlyYears).enter().append('option').attr('value', d=>d).text(d=>d);
      if (monthlyYears.length) yearSelect.node().value = monthlyYears[monthlyYears.length-1];

      // slider elements
      const startEl = document.getElementById('det_yearStart');
      const endEl = document.getElementById('det_yearEnd');
      const startLabel = document.getElementById('det_yearStartLabel');
      const endLabel = document.getElementById('det_yearEndLabel');
      const q5 = document.getElementById('det_quick5');
      const q10 = document.getElementById('det_quick10');
      const qAll = document.getElementById('det_quickAll');

      function clampAndSync() {
        let s = +startEl.value, e = +endEl.value;
        if (s > e) { const t = s; s = e; e = t; }
        sliderStart = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, s));
        sliderEnd = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, e));
        startEl.value = sliderStart; endEl.value = sliderEnd;
        startLabel.textContent = sliderStart; endLabel.textContent = sliderEnd;
      }

      startEl.addEventListener('input', () => { clampAndSync(); draw(); });
      endEl.addEventListener('input', () => { clampAndSync(); draw(); });

      q5.addEventListener('click', () => {
        sliderEnd = SLIDER_MAX;
        sliderStart = Math.max(SLIDER_MIN, SLIDER_MAX - 4);
        startEl.value = sliderStart; endEl.value = sliderEnd;
        startLabel.textContent = sliderStart; endLabel.textContent = sliderEnd;
        draw();
      });
      q10.addEventListener('click', () => {
        sliderEnd = SLIDER_MAX;
        sliderStart = Math.max(SLIDER_MIN, SLIDER_MAX - 9);
        startEl.value = sliderStart; endEl.value = sliderEnd;
        startLabel.textContent = sliderStart; endLabel.textContent = sliderEnd;
        draw();
      });
      qAll.addEventListener('click', () => {
        sliderStart = SLIDER_MIN; sliderEnd = SLIDER_MAX;
        startEl.value = sliderStart; endEl.value = sliderEnd;
        startLabel.textContent = sliderStart; endLabel.textContent = sliderEnd;
        draw();
      });

      clampAndSync();

      // update method options dynamically when jurisdiction/year changes
      function updateMethodOptions() {
        // base set depends on mode
        let base = mode === 'annual' ? annualData.slice() : monthlyData.slice();
        if (selectedJurisdictions.size > 0) base = base.filter(d => selectedJurisdictions.has(d.jurisdiction));
        if (mode === 'monthly') {
          const selY = +yearSelect.node().value;
          base = base.filter(d => d.year === selY);
        }
        const methods = Array.from(new Set(base.map(d => d.detectionMethod))).sort();
        methodDD.menu.selectAll('*').remove();
        const allLab = methodDD.menu.append('label').attr('class','filter-option');
        allLab.append('input').attr('type','checkbox').attr('value','__all__').property('checked', true);
        allLab.append('span').text('All');
        const items = methodDD.menu.selectAll('label.item').data(methods).enter().append('label').attr('class','filter-option item');
        items.append('input').attr('type','checkbox').attr('value', d=>d);
        items.append('span').text(d=>d);
        selectedMethods.clear();
        attachCheckboxLogic(methodDD.menu, methodDD.button, selectedMethods, 'All', null);
        color.domain(methods.length ? methods : allMethods);
      }

      // draw function
      function draw() {
        g.selectAll('*').remove(); xAxisG.selectAll('*').remove(); yAxisG.selectAll('*').remove();

        // hide slider if monthly
        if (mode === 'monthly') sliderBlock.style('display','none'); else sliderBlock.style('display','inline-block');

        if (mode === 'annual') {
          const years = d3.range(sliderStart, sliderEnd + 1);
          // gather rows
          let rows = annualData.slice();
          if (selectedJurisdictions.size > 0) rows = rows.filter(d => selectedJurisdictions.has(d.jurisdiction));
          if (selectedMethods.size > 0) rows = rows.filter(d => selectedMethods.has(d.detectionMethod));
          // methods list to display
          const methods = Array.from(new Set(rows.map(d => d.detectionMethod))).sort();
          const methodsList = methods.length ? methods : color.domain().length ? color.domain() : allMethods;
          // build per-year method aggregates (fill zero)
          const dataByYear = years.map(y => {
            const map = new Map(); methodsList.forEach(m => map.set(m, 0));
            rows.filter(r => r.year === y).forEach(r => { map.set(r.detectionMethod, (map.get(r.detectionMethod)||0) + r.fines); });
            return { year: y, methods: Array.from(map.entries()).map(([method, fines]) => ({ method, fines })) };
          });

          const x0 = d3.scaleBand().domain(years).range([0, innerW]).padding(0.18);
          const x1 = d3.scaleBand().domain(methodsList).range([0, x0.bandwidth()]).padding(0.06);
          const maxY = d3.max(dataByYear, d => d3.max(d.methods, m => m.fines)) || 1;
          const y = d3.scaleLinear().domain([0, maxY * 1.1]).nice().range([innerH, 0]);

          const xAxis = d3.axisBottom(x0).tickFormat(d3.format('d'));
          const yAxis = d3.axisLeft(y).ticks(6).tickFormat(d => d.toLocaleString());

          xAxisG.attr('transform', `translate(${margin.left},${svgH - margin.bottom})`).call(xAxis).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end');
          yAxisG.attr('transform', `translate(${margin.left},${margin.top})`).call(yAxis);

          const yearGroups = g.selectAll('g.year-group').data(dataByYear).join('g').attr('class','year-group').attr('transform', d => `translate(${x0(d.year)},0)`);

          yearGroups.selectAll('rect').data(d => d.methods.map(m => ({ year:d.year, method:m.method, fines:m.fines }))).join(
            enter => enter.append('rect')
              .attr('x', d => x1(d.method))
              .attr('y', y(0))
              .attr('width', x1.bandwidth())
              .attr('height', 0)
              .attr('rx', 4)
              .attr('fill', d => color(d.method))
              .on('mousemove', function(event,d){
                const header = `Year: ${d.year}`;
                const html = `<strong>${header}</strong><br/><span style="display:inline-block;width:10px;height:10px;background:${color(d.method)};margin-right:6px"></span>${d.method}: ${fmt(d.fines)}`;
                tooltip.style('opacity',1).html(html).style('left', (event.pageX+12)+'px').style('top',(event.pageY-40)+'px');
              })
              .on('mouseleave', ()=> tooltip.style('opacity',0))
              .transition().duration(420).attr('y', d => y(d.fines)).attr('height', d => innerH - y(d.fines)),
            update => update.transition().duration(300).attr('x', d => x1(d.method)).attr('y', d => y(d.fines)).attr('width', x1.bandwidth()).attr('height', d => innerH - y(d.fines)).attr('fill', d => color(d.method)),
            exit => exit.transition().duration(200).attr('y', y(0)).attr('height', 0).remove()
          );

        } else {
          // monthly: require year + month selection
          const selYear = +yearSelect.node().value;
          const selMonth = +monthSelect.node().value; // 0 => All months
          if (!selYear) { return; }

          // filter rows by selYear and selected jurisdictions/methods
          let rows = monthlyData.filter(d => d.year === selYear);
          if (selectedJurisdictions.size > 0) rows = rows.filter(d => selectedJurisdictions.has(d.jurisdiction));
          if (selMonth > 0) rows = rows.filter(d => d.month === selMonth);
          if (selectedMethods.size > 0) rows = rows.filter(d => selectedMethods.has(d.detectionMethod));

          const byMethod = d3.rollup(rows, v => d3.sum(v, d => d.fines), d => d.detectionMethod);
          const methods = Array.from(new Set([...Array.from(byMethod.keys()), ...color.domain(), ...allMethods]));
          const data = methods.map(m => ({ method: m, fines: byMethod.get(m) || 0 }));

          const x = d3.scaleBand().domain(data.map(d=>d.method)).range([0, innerW]).padding(0.22);
          const maxY = d3.max(data, d=>d.fines) || 1;
          const y = d3.scaleLinear().domain([0, maxY * 1.1]).nice().range([innerH, 0]);

          const xAxis = d3.axisBottom(x);
          const yAxis = d3.axisLeft(y).ticks(6).tickFormat(d => d.toLocaleString());

          xAxisG.attr('transform', `translate(${margin.left},${svgH - margin.bottom})`).call(xAxis).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end');
          yAxisG.attr('transform', `translate(${margin.left},${margin.top})`).call(yAxis);

          const bars = g.selectAll('rect.bar').data(data, d=>d.method);
          bars.exit().transition().duration(200).attr('y', y(0)).attr('height', 0).remove();
          bars.enter().append('rect').attr('class','bar')
            .attr('x', d => x(d.method))
            .attr('y', y(0))
            .attr('width', x.bandwidth())
            .attr('height', 0)
            .attr('rx', 5)
            .attr('fill', d => color(d.method))
            .on('mousemove', function(event,d){
              const header = selMonth > 0 ? `${MONTH_LABELS[selMonth-1]} ${selYear}` : `${selYear} (All months)`;
              const html = `<strong>${header}</strong><br/><span style="display:inline-block;width:10px;height:10px;background:${color(d.method)};margin-right:6px"></span>${d.method}: ${fmt(d.fines)}`;
              tooltip.style('opacity',1).html(html).style('left', (event.pageX+12)+'px').style('top',(event.pageY-40)+'px');
            })
            .on('mouseleave', ()=> tooltip.style('opacity',0))
            .transition().duration(420).attr('y', d => y(d.fines)).attr('height', d => innerH - y(d.fines));

          bars.transition().duration(300).attr('x', d => x(d.method)).attr('y', d => y(d.fines)).attr('width', x.bandwidth()).attr('height', d => innerH - y(d.fines)).attr('fill', d => color(d.method));
        }
      } // draw end

      // event wiring
      btnAnnual.on('click', ()=> {
        mode = 'annual';
        btnAnnual.classed('active', true); btnMonthly.classed('active', false);
        yearGroup.style('display','none'); monthGroup.style('display','none');
        // ensure slider shows; and method options update
        updateMethodOptions();
        draw();
      });

      btnMonthly.on('click', ()=> {
        mode = 'monthly';
        btnAnnual.classed('active', false); btnMonthly.classed('active', true);
        yearGroup.style('display','inline-block'); monthGroup.style('display','inline-block');
        // ensure single year selected: keep yearSelect.current
        updateMethodOptions();
        draw();
      });

      // input wiring: jurisdiction & method checkboxes already call updateMethodOptions/draw
      jurisDD.menu.selectAll('input').on('change', () => { updateMethodOptions(); draw(); });
      methodDD.menu.selectAll('input').on('change', () => draw());

      yearSelect.on('change', () => { if (mode === 'monthly') { updateMethodOptions(); draw(); } });
      monthSelect.on('change', () => { if (mode === 'monthly') draw(); });

      // initial visibility
      yearGroup.style('display','none'); monthGroup.style('display','none');
      updateMethodOptions();
      draw();

      // click outside to close menus
      d3.select('body').on('click', () => d3.selectAll('.filter-group').classed('is-open', false));

    }).catch(err => console.error('Error loading data for finesByDetectionBar:', err));
  };
})();
