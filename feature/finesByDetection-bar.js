// finesDetection-bar.js
// Reworked to include dual-handle year range slider (2008-2024) + quick-selects
// Uses SpeedingData.loadExtendedAnnualWithMonthly()

(function () {
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmt(n){ return n == null ? "0" : n.toLocaleString(); }

  // Reusable dropdown-with-checkbox creator (copied/adapted from your multiLine)
  function createDropdownFilter(parent, labelText, items, namesMap) {
    const group = parent.append('div').attr('class','filter-group');
    group.append('div').attr('class','filter-label').text(labelText);
    const button = group.append('button').attr('type','button').attr('class','filter-button').text('All ');
    const menu = group.append('div').attr('class','filter-menu');

    const allLabel = menu.append('label').attr('class','filter-option');
    allLabel.append('input').attr('type','checkbox').attr('value','__all__').property('checked', true);
    allLabel.append('span').text('All');

    const itemLabels = menu.selectAll('label.item').data(items).enter().append('label').attr('class','filter-option item');
    itemLabels.append('input').attr('type','checkbox').attr('value', d => d);
    itemLabels.append('span').text(d => (namesMap && namesMap[d]) ? namesMap[d] : d);

    button.on('click', (event) => {
      event.stopPropagation();
      const isOpen = group.classed('is-open');
      d3.selectAll('.filter-group').classed('is-open', false);
      group.classed('is-open', !isOpen);
    });

    return { group, button, menu };
  }

  function attachCheckboxLogic(menu, button, selectionSet, defaultLabel, onChangeExtra) {
    const inputs = menu.selectAll('input');
    inputs.on('change', function() {
      const value = this.value;
      if (value === '__all__') {
        const checked = this.checked;
        selectionSet.clear();
        inputs.each(function() { if (this.value !== '__all__') this.checked = false; });
        if (!checked) this.checked = true;
      } else {
        inputs.each(function(){ if (this.value === '__all__') this.checked = false; });
        if (this.checked) selectionSet.add(value); else selectionSet.delete(value);
        if (selectionSet.size === 0) {
          inputs.each(function(){ if (this.value === '__all__') this.checked = true; });
        }
      }
      if (selectionSet.size === 0) button.text(defaultLabel + ' ');
      else if (selectionSet.size === 1) button.text(Array.from(selectionSet)[0] + ' ');
      else button.text(selectionSet.size + ' selected ');
      if (onChangeExtra) onChangeExtra();
    });
    if (selectionSet.size === 0) button.text(defaultLabel + ' ');
  }

  window.renderFinesByDetectionBar = function(selector) {
    const container = d3.select(selector);
    container.selectAll('*').remove();

    const controls = container.append('div').attr('class','chart-controls');

    // Toggle buttons
    const toggle = controls.append('div').attr('class','speed-toggle');
    const btnAnnual = toggle.append('button').attr('id','mode-annual').attr('type','button').attr('class','toggle-btn active').text('Annual');
    const btnMonthly = toggle.append('button').attr('id','mode-monthly').attr('type','button').attr('class','toggle-btn').text('Monthly');

    // Filter row
    const filterRow = controls.append('div').attr('class','filter-row');

    // --- DUAL RANGE SLIDER UI (2008-2024) + Quick buttons ---
    const sliderBlock = filterRow.append('div').attr('class','filter-group slider-group');
    sliderBlock.append('div').attr('class','filter-label').text('Year range');

    // create container for dual-range elements using raw HTML injection (simpler)
    const sliderHtml = `
      <div class="dual-slider-wrap" style="display:flex;align-items:center;gap:10px;">
        <div style="display:flex;flex-direction:column;align-items:center;">
          <input id="yearStartRange_det" type="range" min="2008" max="2024" step="1" value="2008" />
          <small id="yearStartLabel_det">2008</small>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;">
          <input id="yearEndRange_det" type="range" min="2008" max="2024" step="1" value="2024" />
          <small id="yearEndLabel_det">2024</small>
        </div>
        <div>
          <button id="quick5_det" class="quick-btn">Last 5y</button>
          <button id="quick10_det" class="quick-btn">Last 10y</button>
          <button id="quickAll_det" class="quick-btn">All</button>
        </div>
      </div>
    `;
    sliderBlock.append('div').html(sliderHtml);

    // Jurisdiction dropdown (checkboxes)
    // We'll populate after data load
    const jurisFilter = createDropdownFilter(filterRow, 'Select jurisdiction', []);

    // Detection method dropdown (dynamic)
    const methodGroup = filterRow.append('div').attr('class','filter-group');
    methodGroup.append('div').attr('class','filter-label').text('Select detection method');
    const methodButton = methodGroup.append('button').attr('type','button').attr('class','filter-button').text('All ');
    const methodMenu = methodGroup.append('div').attr('class','filter-menu');
    methodButton.on('click', (event) => { event.stopPropagation(); const isOpen = methodGroup.classed('is-open'); d3.selectAll('.filter-group').classed('is-open', false); methodGroup.classed('is-open', !isOpen); });
    const methodFilter = { group: methodGroup, button: methodButton, menu: methodMenu };

    // Year select for monthly mode (kept)
    const yearGroup = filterRow.append('div').attr('class','filter-group');
    yearGroup.append('div').attr('class','filter-label').text('Select year (monthly)');
    const yearSelect = yearGroup.append('select').attr('class','filter-year-select');

    // Month select (for monthly)
    const monthGroup = filterRow.append('div').attr('class','filter-group');
    monthGroup.append('div').attr('class','filter-label').text('Select month');
    const monthSelect = monthGroup.append('select').attr('class','filter-year-select');
    monthSelect.selectAll('option').data(['All'].concat(MONTH_LABELS)).enter().append('option').attr('value',(d,i)=>i).text(d=>d);
    monthSelect.node().value = 0;

    container.append('p').attr('class','toggle-note small-text').text('Annual: grouped bars across selected year range. Monthly: choose year + month.');

    // Layout & SVG
    const layout = container.append('div').attr('class','chart-layout');
    const svgW = 960, svgH = 480; const margin = {top:40, right:20, bottom:120, left:120};
    const svg = layout.append('svg').attr('viewBox', `0 0 ${svgW} ${svgH}`).attr('preserveAspectRatio','xMidYMid meet').style('width','100%').style('height','auto');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const innerW = svgW - margin.left - margin.right;
    const innerH = svgH - margin.top - margin.bottom;

    const xAxisG = svg.append('g').attr('class','x-axis').attr('transform', `translate(${margin.left},${svgH - margin.bottom})`);
    const yAxisG = svg.append('g').attr('class','y-axis').attr('transform', `translate(${margin.left},${margin.top})`);

    const tooltip = container.append('div').attr('class','tooltip').style('position','absolute').style('pointer-events','none').style('background','white').style('border','1px solid #000').style('padding','6px 8px').style('font-size','0.9rem').style('opacity',0);

    // colors
    const color = d3.scaleOrdinal(d3.schemeSet2);

    // Load extended data (merged 2008-2024)
    window.SpeedingData.loadExtendedAnnualWithMonthly().then(({ annual, monthly }) => {
      // Normalize
      const annualData = (annual || []).map(d => ({ year: +d.year, jurisdiction: d.jurisdiction, detectionMethod: d.detectionMethod, fines: +d.fines }));
      const monthlyData = (monthly || []).map(d => ({ year: +d.year, month: d.month != null && d.month !== '' ? +d.month : null, jurisdiction: d.jurisdiction, detectionMethod: d.detectionMethod, fines: +d.fines }));

      // Domains
      const ALL_YEARS = d3.range(2008, 2025); // fixed domain for slider
      const monthlyYears = Array.from(new Set(monthlyData.map(d => d.year))).sort((a,b)=>a-b);
      const allJurisdictions = Array.from(new Set([...annualData, ...monthlyData].map(d => d.jurisdiction))).sort();
      // initial set of methods from merged dataset
      const allMethods = Array.from(new Set([...annualData, ...monthlyData].map(d => d.detectionMethod))).sort();

      // state
      let currentMode = 'annual';
      const selectedJurisdictions = new Set(); // empty means All
      const selectedMethods = new Set(); // empty = All
      let sliderStart = 2008, sliderEnd = 2024;

      // populate jurisdiction menu
      jurisFilter.menu.selectAll('*').remove();
      const allLabel = jurisFilter.menu.append('label').attr('class','filter-option');
      allLabel.append('input').attr('type','checkbox').attr('value','__all__').property('checked', true);
      allLabel.append('span').text('All');
      const jurisLabels = jurisFilter.menu.selectAll('label.item').data(allJurisdictions).enter().append('label').attr('class','filter-option item');
      jurisLabels.append('input').attr('type','checkbox').attr('value', d=>d);
      jurisLabels.append('span').text(d=>d);
      attachCheckboxLogic(jurisFilter.menu, jurisFilter.button, selectedJurisdictions, 'All', updateMethodOptions);

      // populate yearSelect (monthly mode)
      yearSelect.selectAll('option').remove();
      yearSelect.selectAll('option').data(monthlyYears).enter().append('option').attr('value', d=>d).text(d=>d);
      if (monthlyYears.length) yearSelect.node().value = monthlyYears[monthlyYears.length-1];

      // method options builder
      function updateMethodOptions() {
        // base set depends on currentMode
        let base = currentMode === 'annual' ? annualData.slice() : monthlyData.slice();
        if (selectedJurisdictions.size > 0) base = base.filter(d => selectedJurisdictions.has(d.jurisdiction));
        if (currentMode === 'monthly') {
          const selY = +yearSelect.node().value;
          base = base.filter(d => d.year === selY);
        }
        const methods = Array.from(new Set(base.map(d => d.detectionMethod))).sort();
        methodMenu.selectAll('*').remove();
        const allLabel = methodMenu.append('label').attr('class','filter-option');
        allLabel.append('input').attr('type','checkbox').attr('value','__all__').property('checked', true);
        allLabel.append('span').text('All');
        const itemLabels = methodMenu.selectAll('label.item').data(methods).enter().append('label').attr('class','filter-option item');
        itemLabels.append('input').attr('type','checkbox').attr('value', d => d);
        itemLabels.append('span').text(d => d);
        // reset selectedMethods
        selectedMethods.clear();
        attachCheckboxLogic(methodMenu, methodButton, selectedMethods, 'All', null);
        // update color domain
        color.domain(methods.length ? methods : allMethods);
      }

      // slider wiring - elements
      const startEl = document.getElementById('yearStartRange_det');
      const endEl = document.getElementById('yearEndRange_det');
      const startLabel = document.getElementById('yearStartLabel_det');
      const endLabel = document.getElementById('yearEndLabel_det');
      const quick5 = document.getElementById('quick5_det');
      const quick10 = document.getElementById('quick10_det');
      const quickAll = document.getElementById('quickAll_det');

      function clampAndSync() {
        let s = +startEl.value;
        let e = +endEl.value;
        if (s > e) {
          // swap to keep start <= end
          const tmp = s; s = e; e = tmp;
        }
        sliderStart = Math.max(2008, Math.min(2024, s));
        sliderEnd = Math.max(2008, Math.min(2024, e));
        startEl.value = sliderStart; endEl.value = sliderEnd;
        startLabel.textContent = sliderStart;
        endLabel.textContent = sliderEnd;
      }

      startEl.addEventListener('input', () => { clampAndSync(); drawChart(); });
      endEl.addEventListener('input', () => { clampAndSync(); drawChart(); });

      quick5.addEventListener('click', () => {
        sliderEnd = 2024; sliderStart = Math.max(2008, 2024 - 4);
        startEl.value = sliderStart; endEl.value = sliderEnd;
        startLabel.textContent = sliderStart; endLabel.textContent = sliderEnd;
        drawChart();
      });
      quick10.addEventListener('click', () => {
        sliderEnd = 2024; sliderStart = Math.max(2008, 2024 - 9);
        startEl.value = sliderStart; endEl.value = sliderEnd;
        startLabel.textContent = sliderStart; endLabel.textContent = sliderEnd;
        drawChart();
      });
      quickAll.addEventListener('click', () => {
        sliderStart = 2008; sliderEnd = 2024;
        startEl.value = sliderStart; endEl.value = sliderEnd;
        startLabel.textContent = sliderStart; endLabel.textContent = sliderEnd;
        drawChart();
      });

      // initial sync
      clampAndSync();
      updateMethodOptions();

      // DRAW
      function drawChart() {
        g.selectAll('*').remove();
        xAxisG.selectAll('*').remove();
        yAxisG.selectAll('*').remove();

        if (currentMode === 'annual') {
          // years to show are sliderStart..sliderEnd inclusive
          const years = d3.range(sliderStart, sliderEnd + 1);

          // filter annualData by jurisdiction & method selection
          let rows = annualData.slice();
          if (selectedJurisdictions.size > 0) rows = rows.filter(d => selectedJurisdictions.has(d.jurisdiction));
          if (selectedMethods.size > 0) rows = rows.filter(d => selectedMethods.has(d.detectionMethod));

          // ensure we have entries for all years and methods (fill zeros)
          const methods = Array.from(new Set(rows.map(d => d.detectionMethod)));
          // If filters removed all methods, fallback to color.domain()
          const methodsList = methods.length ? methods : color.domain();

          const dataByYear = years.map(y => {
            const byMethod = new Map();
            methodsList.forEach(m => byMethod.set(m, 0));
            rows.filter(d => d.year === y).forEach(d => {
              byMethod.set(d.detectionMethod, (byMethod.get(d.detectionMethod) || 0) + d.fines);
            });
            return { year: y, methods: Array.from(byMethod.entries()).map(([method, fines]) => ({ method, fines })) };
          });

          const x0 = d3.scaleBand().domain(years).range([0, innerW]).padding(0.2);
          const x1 = d3.scaleBand().domain(methodsList).range([0, x0.bandwidth()]).padding(0.05);
          const maxY = d3.max(dataByYear, d => d3.max(d.methods, m => m.fines)) || 1;
          const y = d3.scaleLinear().domain([0, maxY * 1.1]).range([innerH, 0]).nice();

          const xAxis = d3.axisBottom(x0).tickFormat(d3.format('d'));
          const yAxis = d3.axisLeft(y).ticks(6).tickFormat(d => d.toLocaleString());

          xAxisG.attr('transform', `translate(${margin.left},${svgH - margin.bottom})`).call(xAxis).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end');
          yAxisG.attr('transform', `translate(${margin.left},${margin.top})`).call(yAxis);

          const yearGroups = g.selectAll('g.year-group').data(dataByYear).join('g').attr('class','year-group').attr('transform', d => `translate(${x0(d.year)},0)`);

          yearGroups.selectAll('rect').data(d => d.methods.map(m => ({ year: d.year, method: m.method, fines: m.fines }))).join(
            enter => enter.append('rect')
              .attr('x', d => x1(d.method))
              .attr('y', y(0))
              .attr('width', x1.bandwidth())
              .attr('height', 0)
              .attr('fill', d => color(d.method))
              .on('mousemove', function(event,d){
                const header = `Year: ${d.year}`;
                const html = `<strong>${header}</strong><br/><span style="display:inline-block;width:10px;height:10px;background:${color(d.method)};margin-right:6px"></span>${d.method}: ${fmt(d.fines)}`;
                tooltip.style('opacity',1).html(html).style('left', (event.pageX+12)+'px').style('top',(event.pageY-40)+'px');
              })
              .on('mouseleave', ()=> tooltip.style('opacity',0))
              .transition().duration(400).attr('y', d => y(d.fines)).attr('height', d => innerH - y(d.fines)),
            update => update.transition().duration(300).attr('x', d => x1(d.method)).attr('y', d => y(d.fines)).attr('width', x1.bandwidth()).attr('height', d => innerH - y(d.fines)).attr('fill', d => color(d.method)),
            exit => exit.transition().duration(200).attr('y', y(0)).attr('height', 0).remove()
          );

        } else {
          // monthly mode: require specific year + month
          const selYear = +yearSelect.node().value;
          const selMonth = +monthSelect.node().value; // 0 = All

          if (!selYear || selMonth <= 0) {
            g.selectAll('*').remove(); xAxisG.selectAll('*').remove(); yAxisG.selectAll('*').remove(); tooltip.style('opacity',0);
            return;
          }

          let rows = monthlyData.filter(d => d.year === selYear && d.month === selMonth);
          if (selectedJurisdictions.size > 0) rows = rows.filter(d => selectedJurisdictions.has(d.jurisdiction));
          if (selectedMethods.size > 0) rows = rows.filter(d => selectedMethods.has(d.detectionMethod));

          const byMethod = d3.rollup(rows, v => d3.sum(v, d=>d.fines), d => d.detectionMethod);
          const methods = Array.from(new Set([...byMethod.keys(), ...color.domain()]));
          const data = methods.map(m => ({ method: m, fines: byMethod.get(m) || 0 }));

          const x = d3.scaleBand().domain(data.map(d=>d.method)).range([0, innerW]).padding(0.25);
          const maxY = d3.max(data, d => d.fines) || 1;
          const y = d3.scaleLinear().domain([0, maxY * 1.1]).range([innerH, 0]).nice();

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
            .attr('fill', d => color(d.method))
            .on('mousemove', function(event,d){
              const header = `${MONTH_LABELS[selMonth-1]} ${selYear}`;
              const html = `<strong>${header}</strong><br/><span style="display:inline-block;width:10px;height:10px;background:${color(d.method)};margin-right:6px"></span>${d.method}: ${fmt(d.fines)}`;
              tooltip.style('opacity',1).html(html).style('left', (event.pageX+12)+'px').style('top',(event.pageY-40)+'px');
            })
            .on('mouseleave', ()=> tooltip.style('opacity',0))
            .transition().duration(400).attr('y', d => y(d.fines)).attr('height', d => innerH - y(d.fines));

          bars.transition().duration(300).attr('x', d=>x(d.method)).attr('y', d=>y(d.fines)).attr('width', x.bandwidth()).attr('height', d => innerH - y(d.fines)).attr('fill', d => color(d.method));
        }
      }

      // Event wiring
      btnAnnual.on('click', () => {
        currentMode = 'annual';
        btnAnnual.classed('active', true); btnMonthly.classed('active', false);
        yearGroup.style('visibility','hidden'); monthGroup.style('visibility','hidden');
        // show slider UI (kept visible by CSS since we built it in filterRow)
        updateMethodOptions(); drawChart();
      });

      btnMonthly.on('click', () => {
        currentMode = 'monthly';
        btnAnnual.classed('active', false); btnMonthly.classed('active', true);
        yearGroup.style('visibility','visible'); monthGroup.style('visibility','visible');
        if (!yearSelect.node().value && monthlyYears.length) yearSelect.node().value = monthlyYears[monthlyYears.length-1];
        updateMethodOptions(); drawChart();
      });

      // wire jurisdiction changes (attachCheckboxLogic already calls updateMethodOptions)
      jurisFilter.menu.selectAll('input').on('change', () => { updateMethodOptions(); drawChart(); });
      // method menu changes will cause draw via attachCheckboxLogic -> we passed null so attach manual draw
      methodMenu.on('change', () => drawChart());

      yearSelect.on('change', () => { if (currentMode === 'monthly') { updateMethodOptions(); drawChart(); } });
      monthSelect.on('change', () => { if (currentMode === 'monthly') drawChart(); });

      // init
      yearGroup.style('visibility','hidden'); monthGroup.style('visibility','hidden');
      updateMethodOptions(); drawChart();

    }).catch(err => console.error('Error loading data for finesByDetection bar:', err));
  };
})();
