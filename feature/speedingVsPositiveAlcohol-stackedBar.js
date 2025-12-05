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
    
    // Create a flex container for chart + pie side-by-side
    const chartContainer = container.append("div").style("display", "flex").style("gap", "20px").style("align-items", "flex-start").style("justify-content", "center");
    
    const chartArea = chartContainer.append("div").attr("class", "chart-area").style("flex", "1").style("min-width", "500px");
    const pieArea = chartContainer.append("div").attr("class", "pie-area").style("flex", "1").style("min-width", "400px");

    const width = 960;
    const height = 500;
    const margin = { top: 80, right: 120, bottom: 100, left: 120 };

    const svg = chartArea
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("max-width", `${width}px`)
      .style("display", "block")
      .style("margin", "0 auto")
      .style("height", "auto");

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // tooltip (shared)
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

    // ---- PIE SVG (responsive) ----
    const pieWidth = 600;
    const pieHeight = 360;
    const pieMargin = { top: 24, right: 24, bottom: 24, left: 24 };
    const pieSvg = pieArea
      .append("svg")
      .attr("viewBox", `0 0 ${pieWidth} ${pieHeight}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("max-width", `${pieWidth}px`)
      .style("display", "block")
      .style("margin", "0 auto")
      .style("height", "auto");

    const pieInnerW = pieWidth - pieMargin.left - pieMargin.right;
    const pieInnerH = pieHeight - pieMargin.top - pieMargin.bottom;
    const pieG = pieSvg.append("g").attr("transform", `translate(${pieMargin.left + pieInnerW / 2}, ${pieMargin.top + pieInnerH / 2})`);

    // For arc sizing
    const pieRadius = Math.min(pieInnerW, pieInnerH) / 2 - 10;
    const arc = d3.arc().innerRadius(0).outerRadius(pieRadius);
    const arcHover = d3.arc().innerRadius(0).outerRadius(pieRadius + 8);

    // Load data
    Promise.all([
      d3.csv("datasets/annual_fines_clean.csv", d => ({
        year: +d.YEAR,
        jurisdiction: d.JURISDICTION,
        detectionMethod: d.DETECTION_METHOD_CLEAN,
        fines: +d["Sum(FINES)"]
      })),
      d3.csv("datasets/Positive_Breath.csv", d => ({
        year: +d.YEAR,
        jurisdiction: d.JURISDICTION,
        metric: d.METRIC,
        fines: +d["Sum(FINES)"],
        count: +d["Sum(COUNT)"]
      }))
    ]).then(([annual, positiveBreathe]) => {
      // Aggregate speeding fines by year and jurisdiction
      const speedingByYearJur = {};
      (annual || []).forEach((d) => {
        const key = `${d.year}|${d.jurisdiction}`;
        if (!speedingByYearJur[key]) {
          speedingByYearJur[key] = { year: d.year, jurisdiction: d.jurisdiction, speeding: 0 };
        }
        speedingByYearJur[key].speeding += d.fines;
      });

      // Aggregate positive breath counts by year and jurisdiction from Positive_Breath.csv
      const breathByYearJur = {};
      (positiveBreathe || []).forEach((d) => {
        const key = `${d.year}|${d.jurisdiction}`;
        if (!breathByYearJur[key]) {
          breathByYearJur[key] = { year: d.year, jurisdiction: d.jurisdiction, alcohol: 0 };
        }
        // use count (positive breath test counts) instead of fines
        breathByYearJur[key].alcohol += d.count;
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
      const yearGroup = controls.append("div").attr("class", "filter-group");
      yearGroup.append("div").attr("class", "filter-label").text("Year");
      const yearSelect = yearGroup.append("select").attr("class", "filter-year-select");
      yearSelect.append("option").attr("value", "All").text("All years");
      years.forEach((y) => yearSelect.append("option").attr("value", y).text(y));

      // Add metric filter
      const viewGroup = controls.append("div").attr("class", "filter-group");
      viewGroup.append("div").attr("class", "filter-label").text("View");
      const metricSelect = viewGroup.append("select").attr("class", "filter-year-select");
      metricSelect.append("option").attr("value", "all").text("All Metrics");
      metricSelect.append("option").attr("value", "speeding").text("Speeding Fines Only");
      metricSelect.append("option").attr("value", "alcohol").text("Positive Breath Tests Only");

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
        .attr("transform", `translate(${margin.left - 80}, ${height / 2}) rotate(-90)`)
        .attr("text-anchor", "middle")
        .style("font-size", "0.9rem")
        .text("Fines");

      // Helper: compute jurisdiction totals for pie based on selected filters
      function computePieTotals(filtered, selMetric) {
        // returns array of { jurisdiction, value }
        const map = d3.rollup(
          filtered,
          v => {
            if (selMetric === "speeding") return d3.sum(v, r => r.speeding || 0);
            if (selMetric === "alcohol") return d3.sum(v, r => r.alcohol || 0);
            // "all": combine both (note: units differ — we're summing per requirement)
            return d3.sum(v, r => (r.speeding || 0) + (r.alcohol || 0));
          },
          d => d.jurisdiction
        );
        return Array.from(map, ([jur, val]) => ({ jurisdiction: jur, value: val }))
          .sort((a, b) => jurisdictions.indexOf(a.jurisdiction) - jurisdictions.indexOf(b.jurisdiction));
      }

      // PIE update function
      function updatePie(filtered, selMetric) {
        d3.select(pieArea.node().querySelector('.pie-title'))?.remove();
        pieSvg.selectAll(".no-data-text").remove();

        const pieTitle = pieSvg.append("text")
          .attr("class", "pie-title")
          .attr("x", pieWidth / 2)
          .attr("y", 18)
          .attr("text-anchor", "middle")
          .style("font-size", "1rem")
          .style("font-weight", "600")
          .text("Distribution by Jurisdiction");

        const pieData = computePieTotals(filtered, selMetric);
        const total = d3.sum(pieData, d => d.value);

        // if no data, show message and clear arcs
        if (!pieData.length || total === 0) {
          pieG.selectAll(".slice").remove();
          pieG.selectAll(".slice-label").remove();
          pieSvg.append("text")
            .attr("class", "no-data-text")
            .attr("x", pieWidth / 2)
            .attr("y", pieHeight / 2 + 10)
            .attr("text-anchor", "middle")
            .style("font-size", "0.95rem")
            .style("fill", "#666")
            .text("No data for selected filters");
          return;
        }

        const pieGenerator = d3.pie()
          .sort((a, b) => b.value - a.value)
          .value(d => d.value);

        const arcs = pieGenerator(pieData);

        // DATA JOIN for slices
        const slices = pieG.selectAll("path.slice")
          .data(arcs, d => d.data.jurisdiction);

        // EXIT
        slices.exit()
          .transition().duration(350)
          .attrTween("d", function (d) {
            const interp = d3.interpolate(this._current || d, { startAngle: d.startAngle, endAngle: d.startAngle });
            return t => arc(interp(t));
          })
          .remove();

        // ENTER
        const enter = slices.enter()
          .append("path")
          .attr("class", "slice")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1)
          .attr("fill", d => colorScale(d.data.jurisdiction))
          .each(function (d) { this._current = { startAngle: d.startAngle, endAngle: d.startAngle }; })
          .style("cursor", "pointer")
          .on("mouseover", function (event, d) {
            // Expand
            d3.select(this).transition().duration(150).attr("d", arcHover);
            const pct = total > 0 ? ((d.data.value / total) * 100).toFixed(1) : "0.0";
            const html = `<strong>${d.data.jurisdiction}</strong><br/>Value: ${formatNumber(d.data.value)}<br/>Percentage: ${pct}%`;
            tooltip.style("display", "block").html(html);
          })
          .on("mousemove", (event) => {
            tooltip.style("left", event.pageX + 12 + "px").style("top", event.pageY - 18 + "px");
          })
          .on("mouseout", function () {
            d3.select(this).transition().duration(150).attr("d", arc);
            tooltip.style("display", "none");
          });

        // UPDATE + MERGE
        enter.merge(slices)
          .transition().duration(500)
          .attrTween("d", function (d) {
            const interpolate = d3.interpolate(this._current || d, d);
            this._current = interpolate(1);
            return t => arc(interpolate(t));
          });

        // Labels for slices > 5%
        // Remove existing labels then create new
        pieG.selectAll(".slice-label").remove();
        const labelData = arcs.filter(d => (d.data.value / total) * 100 >= 5);

        pieG.selectAll(".slice-label")
          .data(labelData, d => d.data.jurisdiction)
          .enter()
          .append("text")
          .attr("class", "slice-label")
          .attr("transform", d => `translate(${arc.centroid(d)})`)
          .attr("text-anchor", "middle")
          .style("font-size", "0.8rem")
          .style("font-weight", "600")
          .text(d => `${((d.data.value / total) * 100).toFixed(0)}%`);
      }

      // Update function (bars + pie)
      function update() {
        const selYear = yearSelect.node().value;
        const selMetric = metricSelect.node().value;

        // Filter data
        let filtered = merged.slice();
        if (selYear !== "All") filtered = filtered.filter((d) => d.year === +selYear);

        // Prepare data for two bars: speeding and alcohol
        let metrics = ["speeding", "alcohol"];
        // Filter metrics based on selection
        if (selMetric === "speeding") metrics = ["speeding"];
        else if (selMetric === "alcohol") metrics = ["alcohol"];

        const stackData = metrics.map(metric => {
          const byJur = d3.rollup(filtered, v => d3.sum(v, r => r[metric] || 0), r => r.jurisdiction);
          const jurData = Array.from(byJur, ([jur, val]) => ({ jurisdiction: jur, value: val }))
            .sort((a, b) => jurisdictions.indexOf(a.jurisdiction) - jurisdictions.indexOf(b.jurisdiction));

          // Calculate cumulative positions for stacking within this metric
          let cumulative = 0;
          const stacked = jurData.map(d => {
            const y0 = cumulative;
            cumulative += d.value;
            return { metric, jurisdiction: d.jurisdiction, value: d.value, y0, y1: cumulative };
          });

          return { metric, total: cumulative, stacked };
        });

        // Update scales
        x.domain(metrics);
        // Adjust x padding based on number of metrics to prevent overlap
        x.padding(metrics.length === 1 ? 0.5 : 0.3);
        const maxTotal = d3.max(stackData, d => d.total);
        y.domain([0, maxTotal * 1.1]).nice();

        // Remove any leftover bars for metrics not in the current view (prevents overlap)
        ['speeding','alcohol'].forEach(m => {
          if (!metrics.includes(m)) {
            g.selectAll(`rect.stack-${m}`).transition().duration(200).attr('y', innerH).attr('height', 0).remove();
          }
        });

        // Update axes
        g.select(".x-axis")
          .transition().duration(400)
          .call(d3.axisBottom(x).tickFormat(d => d === "speeding" ? "Speeding Fines" : "Positive Breath Tests (Count)"))
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
        const speedingTotal = stackData.find(d => d.metric === "speeding")?.total || 0;
        const alcoholTotal = stackData.find(d => d.metric === "alcohol")?.total || 0;
        const yearText = selYear === "All" ? "across all years" : `in ${selYear}`;

        let conclusionText = "";
        if (selMetric === "all") {
          conclusionText = `Conclusion: ${yearText}, there were ${formatNumber(speedingTotal)} speeding fines and ${formatNumber(alcoholTotal)} positive breath tests detected. ${alcoholTotal > 0 ? `This implies a ratio of ${(speedingTotal / alcoholTotal).toFixed(2)} speeding fines per positive breath test.` : 'No positive breath test data available.'}`;
        } else if (selMetric === "speeding") {
          conclusionText = `Conclusion: ${yearText}, there were ${formatNumber(speedingTotal)} speeding fines detected.`;
        } else if (selMetric === "alcohol") {
          conclusionText = `Conclusion: ${yearText}, there were ${formatNumber(alcoholTotal)} positive breath tests detected.`;
        }

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

        // Update pie below the chart
        updatePie(filtered, selMetric);
      }

      // Attach events
      yearSelect.on("change", update);
      metricSelect.on("change", update);

      // Initial draw - most recent year
      if (years.length) yearSelect.node().value = years[years.length - 1];
      update();
    })
      .catch((err) => console.error("Error rendering stacked bar chart:", err));
  };
})();