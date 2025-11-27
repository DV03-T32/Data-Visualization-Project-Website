// Renders a stacked bar chart comparing speeding fines vs positive breath tests
// Each bar shows jurisdictions stacked on top of each other
// With annotation support for each year selection
(function () {
  function formatNumber(n) {
    return n == null ? "0" : n.toLocaleString();
  }

  window.renderSpeedingVsAlcoholStackedBar = function (selector) {
    const container = d3.select(selector);
    container.selectAll("*").remove();

    // Storage for annotations (keyed by year)
    const annotations = {};

    // Create controls area
    const controls = container.append("div").attr("class", "chart-controls-detection");
    const chartArea = container.append("div").attr("class", "chart-area");

    const width = 960;
    const height = 500;
    const margin = { top: 80, right: 120, bottom: 100, left: 120 };

    const svg = chartArea
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("height", "auto");

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // tooltip
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "d3-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "#fff")
      .style("border", "1px solid #ccc")
      .style("padding", "8px 10px")
      .style("font-size", "0.85rem")
      .style("display", "none")
      .style("z-index", "1000");

    // Load data
    window.SpeedingData
      .loadAnnualWithBreath()
      .then(({ annual, breath }) => {
        // Aggregate speeding fines by year and jurisdiction
        const speedingByYearJur = {};
        (annual || []).forEach((d) => {
          const key = `${d.year}|${d.jurisdiction}`;
          if (!speedingByYearJur[key]) {
            speedingByYearJur[key] = { year: d.year, jurisdiction: d.jurisdiction, speeding: 0 };
          }
          speedingByYearJur[key].speeding += d.fines;
        });

        // Aggregate positive breath fines by year and jurisdiction
        const breathByYearJur = {};
        (breath || []).forEach((d) => {
          const key = `${d.year}|${d.jurisdiction}`;
          if (!breathByYearJur[key]) {
            breathByYearJur[key] = { year: d.year, jurisdiction: d.jurisdiction, alcohol: 0 };
          }
          // use fines instead of count for alcohol metric
          breathByYearJur[key].alcohol += d.fines;
        });

        // Merge keys
        const allKeys = new Set([
          ...Object.keys(speedingByYearJur),
          ...Object.keys(breathByYearJur),
        ]);

        const merged = Array.from(allKeys).map((key) => {
          const s = speedingByYearJur[key] || {};
          const b = breathByYearJur[key] || {};
          return {
            year: s.year || b.year,
            jurisdiction: s.jurisdiction || b.jurisdiction,
            speeding: s.speeding || 0,
            alcohol: b.alcohol || 0,
          };
        });

        // Extract unique years and jurisdictions
        const years = Array.from(new Set(merged.map((d) => d.year))).sort((a, b) => a - b);
        const jurisdictions = Array.from(new Set(merged.map((d) => d.jurisdiction))).sort();

        // Build controls
        controls.append("div").attr("class", "filter-group").html(`<label class="filter-label">Year</label>`);
        const yearSelect = controls.append("select").attr("class", "filter-year-select");
        yearSelect.append("option").attr("value", "All").text("All years");
        years.forEach((y) => yearSelect.append("option").attr("value", y).text(y));

        // Annotation input and save UI removed per request; annotations
        // object remains to allow displaying any pre-set annotations.

        // Scales
        const x = d3.scaleBand().range([0, innerW]).padding(0.3);
        const y = d3.scaleLinear().range([innerH, 0]);
        
        // Color scale for jurisdictions
        const colorScale = d3.scaleOrdinal()
          .domain(jurisdictions)
          .range(d3.schemeTableau10);

        // Axes groups
        g.append("g").attr("class", "x-axis").attr("transform", `translate(0,${innerH})`);
        g.append("g").attr("class", "y-axis");

        // Chart title
        svg
          .append("text")
          .attr("class", "chart-title")
          .attr("x", width / 2)
          .attr("y", 25)
          .attr("text-anchor", "middle")
          .style("font-size", "1.1rem")
          .style("font-weight", "600")
          .text("Speeding Fines vs Positive Breath Tests by Jurisdiction");

        // Legend
        const legend = svg.append("g").attr("transform", `translate(${width - margin.right + 10}, ${margin.top})`);
        jurisdictions.forEach((jur, i) => {
          const lg = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
          lg.append("rect").attr("width", 15).attr("height", 15).attr("fill", colorScale(jur));
          lg.append("text").attr("x", 20).attr("y", 12).text(jur).style("font-size", "0.8rem");
        });

        // Y-axis label
        svg.append("text")
          .attr("transform", `translate(${margin.left - 60}, ${height / 2}) rotate(-90)`)
          .attr("text-anchor", "middle")
          .style("font-size", "0.9rem")
          .text("Fines");

        // Update function
        function update() {
          const selYear = yearSelect.node().value;

          // Annotation input removed; any stored annotations will be shown
          // below the chart as a display only element.

          // Filter data
          let filtered = merged.slice();
          if (selYear !== "All") filtered = filtered.filter((d) => d.year === +selYear);

          // Prepare data for two bars: speeding and alcohol
          const metrics = ["speeding", "alcohol"];
          const stackData = metrics.map(metric => {
            const byJur = d3.rollup(filtered, v => d3.sum(v, r => r[metric] || 0), r => r.jurisdiction);
            const jurData = Array.from(byJur, ([jur, val]) => ({ jurisdiction: jur, value: val }))
              .sort((a, b) => jurisdictions.indexOf(a.jurisdiction) - jurisdictions.indexOf(b.jurisdiction));
            
            // Calculate cumulative positions for stacking
            let cumulative = 0;
            const stacked = jurData.map(d => {
              const y0 = cumulative;
              cumulative += d.value;
              return { jurisdiction: d.jurisdiction, value: d.value, y0, y1: cumulative };
            });
            
            return { metric, total: cumulative, stacked };
          });

          // Update scales
          x.domain(metrics);
          const maxTotal = d3.max(stackData, d => d.total);
          y.domain([0, maxTotal * 1.1]).nice();

          // Update axes
          g.select(".x-axis")
            .transition().duration(400)
            .call(d3.axisBottom(x).tickFormat(d => d === "speeding" ? "Speeding Fines" : "Positive Breath Tests"))
            .selectAll("text")
            .style("font-size", "0.9rem");

          g.select(".y-axis")
            .transition().duration(400)
            .call(d3.axisLeft(y).ticks(6).tickFormat(d => formatNumber(d)));

          // Draw stacked bars
          stackData.forEach(metricData => {
            const bars = g.selectAll(`rect.stack-${metricData.metric}`)
              .data(metricData.stacked, d => d.jurisdiction);

            bars.exit().transition().duration(300).attr("height", 0).attr("y", innerH).remove();

            const enter = bars.enter()
              .append("rect")
              .attr("class", `stack-${metricData.metric}`)
              .attr("x", x(metricData.metric))
              .attr("width", x.bandwidth())
              .attr("y", innerH)
              .attr("height", 0)
              .attr("fill", d => colorScale(d.jurisdiction))
              .style("cursor", "pointer")
              .on("mouseover", (event, d) => {
                const metricLabel = metricData.metric === "speeding" ? "Speeding Fines" : "Positive Breath Fines";
                const html = `<strong>${d.jurisdiction}</strong><br/>${metricLabel}: ${formatNumber(d.value)}<br/>Percentage: ${((d.value / metricData.total) * 100).toFixed(1)}%`;
                tooltip.style("display", "block").html(html);
              })
              .on("mousemove", (event) => {
                tooltip.style("left", event.pageX + 12 + "px").style("top", event.pageY - 18 + "px");
              })
              .on("mouseout", () => tooltip.style("display", "none"));

            enter.merge(bars)
              .transition().duration(500)
              .attr("x", x(metricData.metric))
              .attr("width", x.bandwidth())
              .attr("y", d => y(d.y1))
              .attr("height", d => y(d.y0) - y(d.y1))
              .attr("fill", d => colorScale(d.jurisdiction));
          });

          // Conclusion text
          d3.select(container.node().querySelector('.chart-conclusion'))?.remove();
          const speedingTotal = stackData[0].total;
          const alcoholTotal = stackData[1].total;
          const yearText = selYear === "All" ? "across all years" : `in ${selYear}`;
          
          const conclusionText = `Conclusion: ${yearText}, there were ${formatNumber(speedingTotal)} in speeding fines and ${formatNumber(alcoholTotal)} in fines associated with positive breath tests. ${alcoholTotal > 0 ? `This implies a ratio of ${(speedingTotal / alcoholTotal).toFixed(2)} total speeding-fine units per total positive-breath-fine unit.` : 'No positive-breath fine totals available.'}`;

          container.append("div")
            .attr("class", "chart-conclusion")
            .style("margin-top", "12px")
            .style("font-weight", "600")
            .style("padding", "10px")
            .style("background", "#f5f5f5")
            .style("border-radius", "4px")
            .text(conclusionText);

          // Display annotation if exists
          d3.select(container.node().querySelector('.chart-annotation-display'))?.remove();
          if (annotations[selYear] && annotations[selYear].trim() !== "") {
            container.append("div")
              .attr("class", "chart-annotation-display")
              .style("margin-top", "12px")
              .style("padding", "12px")
              .style("background", "#fff3cd")
              .style("border-left", "4px solid #ffc107")
              .style("border-radius", "4px")
              .html(`<strong>📝 Annotation:</strong><br/>${annotations[selYear]}`);
          }
        }

        // Attach events
        yearSelect.on("change", update);

        // Initial draw - most recent year
        if (years.length) yearSelect.node().value = years[years.length - 1];
        update();
      })
      .catch((err) => console.error("Error rendering stacked bar chart:", err));
  };
})();