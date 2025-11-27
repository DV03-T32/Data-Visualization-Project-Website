// finesByAgeGroup-bar.js (FULL, corrected)
// Annual + Monthly modes, dropdown-checkbox menus, tooltip, single-month M1 mode

(function () {
  function formatNumber(n) {
    return n == null ? "0" : n.toLocaleString();
  }

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  window.renderFinesByAgeGroupBar = function (selector) {
    window.SpeedingData.loadMonthly().then((monthly) => {
      const container = d3.select(selector);
      container.selectAll("*").remove();

      // Prepare lists
      const jurisdictions = Array.from(new Set(monthly.map(d => d.jurisdiction))).sort();
      const ageGroups = Array.from(new Set(monthly.map(d => (d.ageGroup && d.ageGroup.trim()) ? d.ageGroup : 'Unknown'))).sort();
      const years = Array.from(new Set(monthly.map(d => +d.year))).sort((a,b) => a - b);
      const months = d3.range(1,13);

      // Derive annual aggregation: {jurisdiction, ageGroup, year, fines}
      const annualRows = [];
      const roll = d3.rollup(
        monthly,
        v => d3.sum(v, d => d.fines),
        d => d.jurisdiction,
        d => (d.ageGroup && d.ageGroup.trim()) ? d.ageGroup : 'Unknown',
        d => +d.year
      );

      for (const [jur, ageMap] of roll) {
        for (const [ageGroup, yearMap] of ageMap) {
          for (const [yr, fines] of yearMap) {
            annualRows.push({ jurisdiction: jur, ageGroup, year: +yr, fines });
          }
        }
      }

      // State
      const state = {
        mode: 'annual', // 'annual' | 'monthly'
        selectedJurisdiction: jurisdictions.length > 0 ? jurisdictions[0] : null, // Single jurisdiction
        selectedYears: new Set(years), // Multiple years
        selMonth: 1,
        selectedAgeGroups: new Set(ageGroups) // All age groups by default (not filtered)
      };

      // Controls
      const controls = container.append('div').attr('class', 'chart-controls');

      const toggle = controls.append('div').attr('class','speed-toggle');
      const btnAnnual = toggle.append('button').attr('type','button').attr('class','toggle-btn active').text('Annual');
      const btnMonthly = toggle.append('button').attr('type','button').attr('class','toggle-btn').text('Monthly');

      // Filters row
      const filterRow = controls.append('div').attr('class','filter-row');

      // Reusable dropdown creator
      function createDropdown(parent, label) {
        const group = parent.append('div').attr('class','filter-group');
        group.append('div').attr('class','filter-label').text(label);
        const button = group.append('button').attr('type','button').attr('class','filter-button').text('All ');
        const menu = group.append('div').attr('class','filter-menu');
        button.on('click', (e) => { e.stopPropagation(); const open = group.classed('is-open'); d3.selectAll('.filter-group').classed('is-open', false); group.classed('is-open', !open); });
        return { group, button, menu };
      }

      // Jurisdiction dropdown (single select)
      const jurisFilter = createDropdown(filterRow, 'Select jurisdiction');
      (function populateJur() {
        const items = jurisFilter.menu.selectAll('label.item').data(jurisdictions).enter().append('label').attr('class','filter-option item');
        const inputs = items.append('input').attr('type','radio').attr('name','jurisdiction').attr('value', d => d);
        items.append('span').text(d => d);
        
        // Set initial selection
        jurisFilter.menu.selectAll('input').property('checked', d => d === state.selectedJurisdiction);
        jurisFilter.button.text(state.selectedJurisdiction + ' ');

        // Radio button logic
        jurisFilter.menu.selectAll('input').on('change', function() {
          if (this.checked) {
            state.selectedJurisdiction = this.value;
            jurisFilter.button.text(state.selectedJurisdiction + ' ');
            draw();
          }
        });
      })();

      // Year checkbox filter (multi-select)
      const yearFilter = createDropdown(filterRow, 'Select years');
      (function populateYears() {
        const allLabel = yearFilter.menu.append('label').attr('class','filter-option');
        allLabel.append('input').attr('type','checkbox').attr('value','__all__').property('checked', true);
        allLabel.append('span').text('All');

        const items = yearFilter.menu.selectAll('label.item').data(years).enter().append('label').attr('class','filter-option item');
        items.append('input').attr('type','checkbox').attr('value', d => d).property('checked', true);
        items.append('span').text(d => d);

        attachCheckboxLogic(yearFilter.menu, yearFilter.button, state.selectedYears, 'All', () => { draw(); });
      })();

      // Year & Month selects
      const monthGroup = filterRow.append('div').attr('class','filter-group');
      monthGroup.append('div').attr('class','filter-label').text('Month');
      const monthSelect = monthGroup.append('select').attr('class','filter-year-select');
      monthSelect.append('option').attr('value', 0).text('All');
      MONTH_LABELS.forEach((m, i) => monthSelect.append('option').attr('value', i+1).text(m));
      monthSelect.on('change', function() { state.selMonth = +this.value; draw(); });

      // Initially hide month for annual (year filter is dropdown, not hidden)
      monthGroup.style('display','none');

      // SVG setup
      const width = 960, height = 480; const margin = { top: 40, right: 20, bottom: 120, left: 120 };
      const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio','xMidYMid meet').style('width','100%').style('height','auto');
      const chartG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const innerW = width - margin.left - margin.right; const innerH = height - margin.top - margin.bottom;

      const xAxisG = svg.append('g').attr('class','x-axis').attr('transform', `translate(${margin.left},${height - margin.bottom})`);
      const yAxisG = svg.append('g').attr('class','y-axis').attr('transform', `translate(${margin.left},${margin.top})`);

      // Tooltip
      const tooltip = d3.select('body').append('div').attr('class','tooltip').style('position','absolute').style('pointer-events','none').style('background','white').style('border','1px solid #000').style('padding','6px 8px').style('font-size','0.9rem').style('opacity',0);

      // Color scale (years)
      const color = d3.scaleOrdinal(d3.schemeSet2);

      // Attach toggle events
      btnAnnual.on('click', () => { state.mode = 'annual'; btnAnnual.classed('active', true); btnMonthly.classed('active', false); monthGroup.style('display','none'); updateMethodAndDraw(); });
      btnMonthly.on('click', () => { state.mode = 'monthly'; btnAnnual.classed('active', false); btnMonthly.classed('active', true); monthGroup.style('display','inline-block'); if (!state.selMonth || state.selMonth === 0) state.selMonth = 1; updateMethodAndDraw(); });

      // Helper: checkbox logic (copied from earlier pattern)
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
            inputs.each(function() { if (this.value === '__all__') this.checked = false; });
            if (this.checked) selectionSet.add(value); else selectionSet.delete(value);
            if (selectionSet.size === 0) inputs.each(function() { if (this.value === '__all__') this.checked = true; });
          }

          // update button label
          if (selectionSet.size === 0) button.text(defaultLabel + ' ');
          else if (selectionSet.size === 1) button.text(Array.from(selectionSet)[0] + ' ');
          else button.text(selectionSet.size + ' selected ');

          if (onChangeExtra) onChangeExtra();
        });

        // initial label
        button.text(defaultLabel + ' ');
      }

      // Update method (age group) options or other derived lists before drawing
      function updateMethodAndDraw() {
        // nothing dynamic to rebuild for age groups in this chart beyond filtering
        draw();
      }

      // Draw function
      function draw() {
        chartG.selectAll('*').remove();
        xAxisG.selectAll('*').remove(); yAxisG.selectAll('*').remove();

        if (state.mode === 'annual') {
          // Annual mode: grouped bars (age groups on x-axis, bars grouped by year)
          const selYears = Array.from(state.selectedYears).sort((a,b) => a - b);
          
          // Build dataset: for each ageGroup, collect values per selected year
          const data = ageGroups.map(ag => {
            const row = { ageGroup: ag };
            selYears.forEach(y => {
              const val = d3.sum(annualRows.filter(r => r.ageGroup === ag && r.year === y && r.jurisdiction === state.selectedJurisdiction), r => r.fines);
              row[y] = val;
            });
            return row;
          });

          // x domain: age groups
          const x = d3.scaleBand().domain(ageGroups).range([0, innerW]).padding(0.25);

          // y domain
          const maxVal = d3.max(data, d => d3.max(selYears, y => d[y] || 0)) || 1;
          const y = d3.scaleLinear().domain([0, maxVal * 1.1]).nice().range([innerH, 0]);

          // small inner band for years
          const x1 = d3.scaleBand().domain(selYears).range([0, x.bandwidth()]).padding(0.05);

          color.domain(selYears.map(String));

          // axes
          xAxisG.attr('transform', `translate(${margin.left},${height - margin.bottom})`).call(d3.axisBottom(x)).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end');
          yAxisG.attr('transform', `translate(${margin.left},${margin.top})`).call(d3.axisLeft(y).ticks(6).tickFormat(d => d.toLocaleString()));

          // groups
          const groups = chartG.selectAll('g.age-group').data(data).join('g').attr('class','age-group').attr('transform', d => `translate(${x(d.ageGroup)},0)`);

          groups.selectAll('rect').data(d => selYears.map(yr => ({ year: yr, value: d[yr] || 0, ageGroup: d.ageGroup }))).join(
            enter => enter.append('rect')
              .attr('x', d => x1(d.year))
              .attr('y', y(0))
              .attr('width', x1.bandwidth())
              .attr('height', 0)
              .attr('fill', d => color(d.year))
              .on('mousemove', function(event,d){
                const html = `<strong>Fines by Age group</strong><br/>${d.ageGroup}<br/>Fines in ${d.year}: ${formatNumber(d.value)}`;
                tooltip.style('opacity',1).html(html).style('left', (event.pageX+12)+'px').style('top', (event.pageY-40)+'px');
              })
              .on('mouseleave', ()=> tooltip.style('opacity',0))
              .transition().duration(400).attr('y', d => y(d.value)).attr('height', d => innerH - y(d.value)),
            update => update.transition().duration(300).attr('x', d => x1(d.year)).attr('y', d => y(d.value)).attr('width', x1.bandwidth()).attr('height', d => innerH - y(d.value)).attr('fill', d => color(d.year)),
            exit => exit.transition().duration(200).attr('y', y(0)).attr('height', 0).remove()
          );

          // legend
          const legend = svg.selectAll('g.legend').data(selYears).join('g').attr('class','legend').attr('transform', (d,i) => `translate(${margin.left + i*80},${10})`);
          legend.selectAll('*').remove();
          legend.append('rect').attr('x',0).attr('y',-10).attr('width',12).attr('height',12).attr('fill', d => color(d));
          legend.append('text').attr('x',16).attr('y',0).text(d => d).style('font-size','12px');

        } else {
          // Monthly mode: bars for age groups at selected year/month
          if (!state.selMonth || state.selMonth === 0) {
            return;
          }

          const filtered = monthly.filter(d => +d.year === Math.max(...years) && d.month === state.selMonth && d.jurisdiction === state.selectedJurisdiction);

          const byAge = d3.rollup(filtered, v => d3.sum(v, d => d.fines), d => (d.ageGroup && d.ageGroup.trim()) ? d.ageGroup : 'Unknown');
          const allData = ageGroups.map(ag => ({ ageGroup: ag, fines: byAge.get(ag) || 0 }));

          const x = d3.scaleBand().domain(ageGroups).range([0, innerW]).padding(0.25);
          const maxVal = d3.max(allData, d => d.fines) || 1;
          const y = d3.scaleLinear().domain([0, maxVal * 1.1]).nice().range([innerH, 0]);

          xAxisG.attr('transform', `translate(${margin.left},${height - margin.bottom})`).call(d3.axisBottom(x)).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end');
          yAxisG.attr('transform', `translate(${margin.left},${margin.top})`).call(d3.axisLeft(y).ticks(6).tickFormat(d => d.toLocaleString()));

          const bars = chartG.selectAll('rect.bar').data(allData, d => d.ageGroup);
          bars.exit().transition().duration(200).attr('y', y(0)).attr('height', 0).remove();

          bars.enter().append('rect').attr('class','bar')
            .attr('x', d => x(d.ageGroup))
            .attr('y', y(0))
            .attr('width', x.bandwidth())
            .attr('height', 0)
            .attr('fill', '#111')
            .on('mousemove', function(event,d){
              tooltip.style('opacity',1).html(`<strong>Fines by Age group</strong><br/>${d.ageGroup}<br/>Fines: ${formatNumber(d.fines)}`).style('left', (event.pageX+12)+'px').style('top', (event.pageY-40)+'px');
            })
            .on('mouseleave', ()=> tooltip.style('opacity',0))
            .transition().duration(400).attr('y', d => y(d.fines)).attr('height', d => innerH - y(d.fines));

          bars.transition().duration(300).attr('x', d => x(d.ageGroup)).attr('y', d => y(d.fines)).attr('width', x.bandwidth()).attr('height', d => innerH - y(d.fines));
        }
      }

      // Initial settings
      monthSelect.node().value = state.selMonth;

      // redraw on outside clicks to close dropdowns
      d3.select('body').on('click', () => { d3.selectAll('.filter-group').classed('is-open', false); });

      // Initial draw
      draw();

    }).catch(err => console.error('Error rendering finesByAgeGroupBar:', err));
  };
})();
