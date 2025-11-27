// feature/finesByAgeGroup-bar.js
// Grouped bars, unified toolbox, black-and-white dropdown theme, detection-method filter included.

(function () {
  // --- tiny helpers
  const fmt = n => (n == null ? "0" : n.toLocaleString());
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const AGE_ORDER = ["0-16","17-25","26-39","40-64","65 and over","Unknown"];

  window.renderFinesByAgeGroupBar = function (selector) {
    window.SpeedingData.loadMonthly().then(monthly => {
      // Normalize & clean
      monthly.forEach(d => {
        d.ageGroup = (d.ageGroup && d.ageGroup.trim()) ? d.ageGroup : "Unknown";
        d.month = +d.month;
        d.year = +d.year;
        d.fines = +d.fines;
        d.jurisdiction = d.jurisdiction;
        d.detectionMethod = d.detectionMethod || d.DETECTION_METHOD || "Unknown";
      });

      const container = d3.select(selector);
      container.selectAll("*").remove();

      // Lists
      const jurisdictions = Array.from(new Set(monthly.map(d => d.jurisdiction))).sort();
      const years = Array.from(new Set(monthly.map(d => d.year))).sort((a,b)=>a-b);
      const detectionMethods = Array.from(new Set(monthly.map(d => d.detectionMethod))).sort();
      const rawAgeGroups = Array.from(new Set(monthly.map(d => d.ageGroup)));
      // Enforce desired order, keep only present groups
      const ageGroups = AGE_ORDER.filter(x => rawAgeGroups.includes(x));

      // Pre-aggregations for speed + tooltip breakdowns
      // annualRoll[jur][age][year] = sum fines
      const annualRoll = new Map();
      const annualDetectRoll = new Map();
      const monthlyRoll = new Map();
      const monthlyDetectRoll = new Map();

      for (const row of monthly) {
        const jur = row.jurisdiction;
        const ag = row.ageGroup;
        const yr = +row.year;
        const mo = +row.month;
        const method = row.detectionMethod;
        const fines = +row.fines;

        // annualRoll
        if (!annualRoll.has(jur)) annualRoll.set(jur, new Map());
        const jurAge = annualRoll.get(jur);
        if (!jurAge.has(ag)) jurAge.set(ag, new Map());
        jurAge.get(ag).set(yr, (jurAge.get(ag).get(yr) || 0) + fines);

        // annualDetectRoll
        if (!annualDetectRoll.has(jur)) annualDetectRoll.set(jur, new Map());
        const jurAgeDet = annualDetectRoll.get(jur);
        if (!jurAgeDet.has(ag)) jurAgeDet.set(ag, new Map());
        if (!jurAgeDet.get(ag).has(yr)) jurAgeDet.get(ag).set(yr, new Map());
        jurAgeDet.get(ag).get(yr).set(method, (jurAgeDet.get(ag).get(yr).get(method) || 0) + fines);

        // monthlyRoll
        if (!monthlyRoll.has(jur)) monthlyRoll.set(jur, new Map());
        const jurYear = monthlyRoll.get(jur);
        if (!jurYear.has(yr)) jurYear.set(yr, new Map());
        if (!jurYear.get(yr).has(mo)) jurYear.get(yr).set(mo, new Map());
        jurYear.get(yr).get(mo).set(ag, (jurYear.get(yr).get(mo).get(ag) || 0) + fines);

        // monthlyDetectRoll
        if (!monthlyDetectRoll.has(jur)) monthlyDetectRoll.set(jur, new Map());
        const jurYrMo = monthlyDetectRoll.get(jur);
        if (!jurYrMo.has(yr)) jurYrMo.set(yr, new Map());
        if (!jurYrMo.get(yr).has(mo)) jurYrMo.get(yr).set(mo, new Map());
        if (!jurYrMo.get(yr).get(mo).has(ag)) jurYrMo.get(yr).get(mo).set(ag, new Map());
        const mapMethod = jurYrMo.get(yr).get(mo).get(ag);
        mapMethod.set(method, (mapMethod.get(method) || 0) + fines);
      }

      // Utility to safely get nested maps with defaults
      const safeGet = (m, k, def = new Map()) => (m.has(k) ? m.get(k) : def);

      // --- State
      const state = {
        mode: 'annual', // 'annual' | 'monthly'
        jurisdiction: jurisdictions[0] || null,
        selectedYears: new Set(years.slice(-3)), // default last 3 years if available
        month: 1,
        selectedAges: new Set(ageGroups),
        selectedMethods: new Set(detectionMethods) // default all
      };

      // --- Controls UI (single toolbox) ---
      const controls = container.append('div').attr('class','chart-controls');

      // mode toggle + single toolbox area (keeps interface compact)
      const topRow = controls.append('div').attr('class','top-row').style('display','flex').style('gap','8px').style('align-items','center').style('justify-content','center');

      const modeToggle = topRow.append('div').attr('class','speed-toggle');
      const btnAnnual = modeToggle.append('button').attr('class','toggle-btn active').text('Annual');
      const btnMonthly = modeToggle.append('button').attr('class','toggle-btn').text('Monthly');

      // Filters row (clean B/W dropdowns)
      const filterRow = controls.append('div').attr('class','filter-row').style('justify-content','center');

      // Reusable black & white dropdown creator (supports single or multi)
      function createBWDropdown(parent, labelText, multi = false) {
        const g = parent.append('div').attr('class','filter-group bw');
        g.append('div').attr('class','filter-label').text(labelText);
        const btn = g.append('button').attr('type','button').attr('class','filter-button bw-btn').text('All');
        const menu = g.append('div').attr('class','filter-menu bw-menu');
        btn.on('click', (e) => { e.stopPropagation(); const open = g.classed('is-open'); d3.selectAll('.filter-group').classed('is-open', false); g.classed('is-open', !open); });
        return {group:g, button:btn, menu, multi};
      }

      // Jurisdiction dropdown (single)
      const jurisDD = createBWDropdown(filterRow, 'Jurisdiction', false);
      jurisdictions.forEach(j => {
        const row = jurisDD.menu.append('label').attr('class','filter-option');
        row.append('input').attr('type','radio').attr('name','jur').attr('value',j).property('checked', j === state.jurisdiction)
          .on('change', function() { if (this.checked) { state.jurisdiction = this.value; jurisDD.button.text(this.value); draw(); }});
        row.append('span').text(j);
      });
      jurisDD.button.text(state.jurisdiction);

      // Year control: when annual -> multi-select; when monthly -> single-select
      const yearDD = createBWDropdown(filterRow, 'Year(s)', true);
      // populate with all years
      const yearItems = years.slice().reverse(); // show recent first
      const yearInputs = yearItems.map(y => {
        const row = yearDD.menu.append('label').attr('class','filter-option');
        row.append('input').attr('type','checkbox').attr('value', y).property('checked', state.selectedYears.has(y))
          .on('change', function(){ const v = +this.value; if (this.checked) state.selectedYears.add(v); else state.selectedYears.delete(v); yearDD.button.text(`${state.selectedYears.size} selected`); draw(); });
        row.append('span').text(y);
        return row;
      });
      yearDD.button.text(`${state.selectedYears.size} selected`);

      // Month select (visible only in monthly mode)
      const monthGroup = filterRow.append('div').attr('class','filter-group');
      monthGroup.append('div').attr('class','filter-label').text('Month');
      const monthSelect = monthGroup.append('select').attr('class','filter-year-select');
      monthSelect.append('option').attr('value', 0).text('All');
      MONTH_LABELS.forEach((m,i)=> monthSelect.append('option').attr('value', i+1).text(m));
      monthSelect.property('value', state.month);
      monthGroup.style('display','none');
      monthSelect.on('change', function(){ state.month = +this.value; draw(); });

      // Age-group multi dropdown with select-all / clear
      const ageDD = createBWDropdown(filterRow, 'Age groups', true);
      const ageTools = ageDD.menu.append('div').attr('class','age-tools').style('display','flex').style('gap','6px').style('margin-bottom','6px');
      ageTools.append('button').attr('class','tiny').text('Select all').on('click', ()=>{
        ageGroups.forEach(a => state.selectedAges.add(a)); ageDD.menu.selectAll('input').property('checked', d=> true); ageDD.button.text(`${state.selectedAges.size} selected`); draw();
      });
      ageTools.append('button').attr('class','tiny').text('Clear').on('click', ()=>{
        state.selectedAges.clear(); ageDD.menu.selectAll('input').property('checked', false); ageDD.button.text('0 selected'); draw();
      });
      ageGroups.forEach(ag => {
        const row = ageDD.menu.append('label').attr('class','filter-option');
        row.append('input').attr('type','checkbox').attr('value', ag).property('checked', true)
          .on('change', function(){ if (this.checked) state.selectedAges.add(ag); else state.selectedAges.delete(ag); ageDD.button.text(`${state.selectedAges.size} selected`); draw(); });
        row.append('span').text(ag);
      });
      ageDD.button.text(`${state.selectedAges.size} selected`);

      // Detection-method multi dropdown with select-all/clear
      const detectDD = createBWDropdown(filterRow, 'Detection methods', true);
      const dtools = detectDD.menu.append('div').attr('class','det-tools').style('display','flex').style('gap','6px').style('margin-bottom','6px');
      dtools.append('button').attr('class','tiny').text('Select all').on('click', ()=>{
        detectionMethods.forEach(m => state.selectedMethods.add(m)); detectDD.menu.selectAll('input').property('checked', true); detectDD.button.text(`${state.selectedMethods.size} selected`); draw();
      });
      dtools.append('button').attr('class','tiny').text('Clear').on('click', ()=>{
        state.selectedMethods.clear(); detectDD.menu.selectAll('input').property('checked', false); detectDD.button.text('0 selected'); draw();
      });
      detectionMethods.forEach(m => {
        const row = detectDD.menu.append('label').attr('class','filter-option');
        row.append('input').attr('type','checkbox').attr('value', m).property('checked', true)
          .on('change', function(){ if (this.checked) state.selectedMethods.add(m); else state.selectedMethods.delete(m); detectDD.button.text(`${state.selectedMethods.size} selected`); draw(); });
        row.append('span').text(m);
      });
      detectDD.button.text(`${state.selectedMethods.size} selected`);

      // Click outside to close drop-downs
      d3.select('body').on('click', ()=> { d3.selectAll('.filter-group').classed('is-open', false); });

      // Mode toggle events
      btnAnnual.on('click', ()=> {
        state.mode = 'annual';
        btnAnnual.classed('active', true);
        btnMonthly.classed('active', false);
        monthGroup.style('display', 'none');
        yearDD.button.text(`${state.selectedYears.size} selected`);
        draw();
      });
      btnMonthly.on('click', ()=> {
        state.mode = 'monthly';
        btnAnnual.classed('active', false);
        btnMonthly.classed('active', true);
        monthGroup.style('display', 'inline-block');
        // For monthly, ensure single-year selection: if more than 1, pick latest
        if (state.selectedYears.size > 1) {
          const latest = Array.from(state.selectedYears).sort((a,b)=>b-a)[0];
          state.selectedYears.clear();
          state.selectedYears.add(latest);
          // update checkboxes
          yearDD.menu.selectAll('input').property('checked', d => state.selectedYears.has(+d3.select(d3.event?.target).datum())); // safe fallback - we'll set programmatically below
          yearDD.button.text(Array.from(state.selectedYears)[0]);
        } else {
          yearDD.button.text(Array.from(state.selectedYears)[0]);
        }
        draw();
      });

      // --- SVG & layout ---
      const width = 960, height = 480;
      const margin = { top: 40, right: 20, bottom: 120, left: 120 };
      const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio','xMidYMid meet').style('width','100%').style('height','auto');
      const chartG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const innerW = width - margin.left - margin.right;
      const innerH = height - margin.top - margin.bottom;
      const xAxisG = svg.append('g').attr('class','x-axis').attr('transform', `translate(${margin.left},${height - margin.bottom})`);
      const yAxisG = svg.append('g').attr('class','y-axis').attr('transform', `translate(${margin.left},${margin.top})`);

      // tooltip
      const tooltip = d3.select('body').append('div').attr('class','tooltip').style('position','absolute').style('pointer-events','none').style('background','#fff').style('border','1px solid #111').style('padding','8px').style('font-size','0.9rem').style('opacity',0).style('border-radius','6px').style('box-shadow','0 2px 8px rgba(0,0,0,0.12)');

      // color scale for years
      const color = d3.scaleOrdinal(d3.schemeSet2);

      // draw function
      function draw() {
        chartG.selectAll('*').remove();
        xAxisG.selectAll('*').remove();
        yAxisG.selectAll('*').remove();

        if (!state.jurisdiction) return;

        const selAges = ageGroups.filter(ag => state.selectedAges.has(ag));
        if (!selAges.length) {
          // no ages selected: empty
          return;
        }

        if (state.mode === 'annual') {
          const selYears = Array.from(state.selectedYears).sort((a,b)=>a-b);
          if (!selYears.length) return;
          // prepare dataset: one row per ageGroup, values per year
          const data = selAges.map(ag => {
            const row = { ageGroup: ag };
            selYears.forEach(y => {
              const val = annualRoll.get(state.jurisdiction)?.get(ag)?.get(y) || 0;
              row[y] = val;
            });
            return row;
          });

          const x = d3.scaleBand().domain(selAges).range([0, innerW]).padding(0.25);
          const x1 = d3.scaleBand().domain(selYears.map(String)).range([0, x.bandwidth()]).padding(0.06);

          const maxVal = d3.max(data, d => d3.max(selYears, y => d[y] || 0)) || 1;
          const y = d3.scaleLinear().domain([0, maxVal * 1.1]).nice().range([innerH, 0]);

          // axes
          xAxisG.call(d3.axisBottom(x)).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end');
          yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat(d => d.toLocaleString()));

          color.domain(selYears.map(String));

          // groups
          const groups = chartG.selectAll('g.age-group').data(data).join('g').attr('class','age-group').attr('transform', d => `translate(${x(d.ageGroup)},0)`);

          // join rects
          groups.selectAll('rect').data(d => selYears.map(yr => ({ year: yr, value: d[yr] || 0, ageGroup: d.ageGroup }))).join(
            enter => enter.append('rect')
              .attr('x', d => x1(String(d.year)))
              .attr('y', y(0))
              .attr('width', x1.bandwidth())
              .attr('height', 0)
              .attr('rx', 4)
              .attr('fill', d => color(String(d.year)))
              .on('mousemove', function(event, d) {
                // detection breakdown from annualDetectRoll
                const detMap = (annualDetectRoll.get(state.jurisdiction)?.get(d.ageGroup)?.get(d.year)) || new Map();
                const entries = Array.from(detMap.entries()).filter(([m,v]) => state.selectedMethods.has(m)); // only show selected methods
                const total = entries.reduce((s,[_m,v])=>s+v,0) || d.value;
                const breakdownHtml = entries.length ? entries.map(([m,v])=> `${m}: ${fmt(v)} (${((v/total)*100 || 0).toFixed(1)}%)`).join('<br/>') : '';
                const html = `<strong>${d.ageGroup}</strong><br/>Year: ${d.year}<br/>Jurisdiction: ${state.jurisdiction}<br/>Fines: ${fmt(d.value)}${breakdownHtml ? '<hr style="border:none;border-top:1px solid #eee;margin:6px 0"/>' + breakdownHtml : ''}`;
                tooltip.style('opacity',1).html(html).style('left',(event.pageX+12)+'px').style('top',(event.pageY-40)+'px');
              })
              .on('mouseleave', ()=> tooltip.style('opacity',0))
              .transition().duration(420).attr('y', d => y(d.value)).attr('height', d => innerH - y(d.value)),
            update => update.transition().duration(300).attr('x', d => x1(String(d.year))).attr('y', d => y(d.value)).attr('width', x1.bandwidth()).attr('height', d => innerH - y(d.value)).attr('fill', d => color(String(d.year))),
            exit => exit.transition().duration(200).attr('y', y(0)).attr('height', 0).remove()
          );

          // legend
          const legend = svg.selectAll('g.legend').data(selYears).join('g').attr('class','legend').attr('transform', (d,i)=>`translate(${margin.left + i*90},${10})`);
          legend.selectAll('*').remove();
          legend.append('rect').attr('x',0).attr('y',-10).attr('width',12).attr('height',12).attr('rx',3).attr('fill', d => color(String(d)));
          legend.append('text').attr('x',16).attr('y',0).text(d => d).style('font-size','12px');

        } else {
          // monthly mode: single year required (use latest if multiple)
          const selYear = Array.from(state.selectedYears).sort((a,b)=>b-a)[0] || years[years.length-1];
          // if state.month is 0 => all months: aggregate across months in that year
          const m = state.month;
          // build data by ageGroup
          const data = selAges.map(ag => {
            let val = 0;
            if (m === 0) {
              // sum across months
              const jurYear = safeGet(monthlyRoll, state.jurisdiction).get(selYear) || new Map();
              for (const [mo, agMap] of jurYear.entries ? jurYear.entries() : []) {
                val += (agMap.get(ag) || 0);
              }
            } else {
              val = safeGet(monthlyRoll, state.jurisdiction).get(selYear)?.get(m)?.get(ag) || 0;
            }
            return { ageGroup: ag, fines: val };
          });

          const x = d3.scaleBand().domain(selAges).range([0, innerW]).padding(0.25);
          const maxVal = d3.max(data, d => d.fines) || 1;
          const y = d3.scaleLinear().domain([0, maxVal * 1.1]).nice().range([innerH, 0]);

          xAxisG.call(d3.axisBottom(x)).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end');
          yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat(d => d.toLocaleString()));

          // bars
          const bars = chartG.selectAll('rect.bar').data(data, d => d.ageGroup);
          bars.exit().transition().duration(200).attr('y', y(0)).attr('height', 0).remove();

          bars.enter().append('rect').attr('class','bar')
            .attr('x', d => x(d.ageGroup))
            .attr('y', y(0))
            .attr('width', x.bandwidth())
            .attr('height', 0)
            .attr('rx', 5)
            .attr('fill', '#111')
            .on('mousemove', function(event, d) {
              // get detection breakdown from monthlyDetectRoll
              let detMap;
              if (m === 0) {
                // aggregate across months
                detMap = new Map();
                const jurYear = monthlyDetectRoll.get(state.jurisdiction)?.get(selYear) || new Map();
                for (const [mo, ageMap] of jurYear.entries ? jurYear.entries() : []) {
                  const agMap = ageMap.get(d.ageGroup) || new Map();
                  for (const [method, v] of agMap.entries ? agMap.entries() : []) {
                    if (!state.selectedMethods.has(method)) continue;
                    detMap.set(method, (detMap.get(method) || 0) + v);
                  }
                }
              } else {
                detMap = monthlyDetectRoll.get(state.jurisdiction)?.get(selYear)?.get(m)?.get(d.ageGroup) || new Map();
              }
              // filter by selectedMethods
              const entries = Array.from(detMap.entries ? detMap.entries() : []).filter(([mth, v]) => state.selectedMethods.has(mth));
              const total = entries.reduce((s,[_k,v])=>s+v,0) || d.fines;
              const breakdownHtml = entries.length ? entries.map(([mth,v])=> `${mth}: ${fmt(v)} (${((v/total)*100 || 0).toFixed(1)}%)`).join('<br/>') : '';
              const labelPeriod = m === 0 ? `${selYear} (All months)` : `${MONTH_LABELS[m-1]} ${selYear}`;
              const html = `<strong>${d.ageGroup}</strong><br/>${labelPeriod}<br/>Jurisdiction: ${state.jurisdiction}<br/>Fines: ${fmt(d.fines)}${breakdownHtml ? '<hr style="border:none;border-top:1px solid #eee;margin:6px 0"/>' + breakdownHtml : ''}`;
              tooltip.style('opacity',1).html(html).style('left',(event.pageX+12)+'px').style('top',(event.pageY-40)+'px');
            })
            .on('mouseleave', ()=> tooltip.style('opacity',0))
            .transition().duration(420).attr('y', d => y(d.fines)).attr('height', d => innerH - y(d.fines));

          bars.transition().duration(300).attr('x', d => x(d.ageGroup)).attr('y', d => y(d.fines)).attr('width', x.bandwidth()).attr('height', d => innerH - y(d.fines));
        }
      }

      // initial draw
      draw();

    }).catch(err => console.error('Error in renderFinesByAgeGroupBar:', err));
  };
})();
