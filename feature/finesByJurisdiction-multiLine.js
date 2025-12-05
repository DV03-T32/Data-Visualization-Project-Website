window.renderFinesByJurisdictionMultiLine = function (containerSelector) {
  SpeedingData.loadAll().then(({ annual, monthly }) => {
    // ---------------------------------------------------------
    // 1. PREP DATA
    // ---------------------------------------------------------

    const annualData = annual.filter((d) => d.year <= 2023);
    const monthlyData = monthly.filter((d) => d.year >= 2023);

    const allJurisdictions = Array.from(
      new Set([...annualData, ...monthlyData].map((d) => d.jurisdiction))
    ).sort();

    const monthlyYears = Array.from(
      new Set(monthlyData.map((d) => d.year))
    ).sort();

    // Selection state
    const selectedJurisdictions = new Set();

    // ---------------------------------------------------------
    // 2. BUILD UI
    // ---------------------------------------------------------
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();

    const controls = container.append("div").attr("class", "chart-controls");

    // --- Toggle Annual/Monthly
    const toggle = controls.append("div").attr("class", "speed-toggle");
    toggle
      .append("button")
      .attr("id", "juris-mode-annual")
      .attr("type", "button")
      .attr("class", "toggle-btn active")
      .text("Annual");
    toggle
      .append("button")
      .attr("id", "juris-mode-monthly")
      .attr("type", "button")
      .attr("class", "toggle-btn")
      .text("Monthly");

    // --- Filter row
    const filterRow = controls.append("div").attr("class", "filter-row");

    // Helper for dropdowns
    function createDropdown(parent, labelText, items) {
      const group = parent.append("div").attr("class", "filter-group");

      group.append("div").attr("class", "filter-label").text(labelText);

      const button = group
        .append("button")
        .attr("type", "button")
        .attr("class", "filter-button")
        .text("All ");

      const menu = group.append("div").attr("class", "filter-menu");
      menu.on("click", (event) => event.stopPropagation());

      // All option
      const allLabel = menu.append("label").attr("class", "filter-option");
      allLabel
        .append("input")
        .attr("type", "checkbox")
        .attr("value", "__all__")
        .property("checked", true);
      allLabel.append("span").text("All");

      // Items
      const itemLabels = menu
        .selectAll("label.item")
        .data(items)
        .enter()
        .append("label")
        .attr("class", "filter-option item");

      itemLabels
        .append("input")
        .attr("type", "checkbox")
        .attr("value", (d) => d);

      itemLabels.append("span").text((d) => JURIS_NAMES[d] || d);

      // Toggle menu open/close
      button.on("click", (event) => {
        event.stopPropagation();
        const isOpen = group.classed("is-open");
        d3.selectAll(".filter-group").classed("is-open", false);
        group.classed("is-open", !isOpen);
      });

      return { group, button, menu };
    }

    // Jurisdiction filter (static)
    const jurisFilter = createDropdown(
      filterRow,
      "Select jurisdiction",
      allJurisdictions
    );

    // --- Year dropdown (Monthly mode only)
    const yearGroup = filterRow.append("div").attr("class", "filter-group");
    yearGroup.append("div").attr("class", "filter-label").text("Select year");

    const yearSelect = yearGroup
      .append("select")
      .attr("class", "filter-year-select");

    yearSelect
      .selectAll("option")
      .data(monthlyYears)
      .enter()
      .append("option")
      .attr("value", (d) => d)
      .text((d) => (d === 2023 ? "2023 (No QLD monthly data)" : d));

    // Update button label helper
    function updateButtonLabel(button, set, defaultLabel) {
      if (set.size === 0) {
        button.text(defaultLabel + " ");
      } else if (set.size === 1) {
        const code = Array.from(set)[0];
        button.text((JURIS_NAMES[code] || code) + " ");
      } else {
        button.text(`${set.size} selected `);
      }
    }

    function attachCheckboxLogic(menu, button, selectionSet, defaultLabel) {
      const inputs = menu.selectAll("input");

      inputs.on("change", function () {
        const value = this.value;

        if (value === "__all__") {
          const checked = this.checked;
          selectionSet.clear();

          inputs.each(function () {
            if (this.value !== "__all__") this.checked = false;
          });

          if (!checked) this.checked = true;
        } else {
          // Uncheck "All"
          inputs.each(function () {
            if (this.value === "__all__") this.checked = false;
          });

          if (this.checked) selectionSet.add(value);
          else selectionSet.delete(value);

          // If nothing selected -> revert to All
          if (selectionSet.size === 0) {
            inputs.each(function () {
              if (this.value === "__all__") this.checked = true;
            });
          }
        }

        updateButtonLabel(button, selectionSet, defaultLabel);
        drawChart();
      });

      updateButtonLabel(button, selectionSet, defaultLabel);
    }

    // Attach logic for jurisdictions
    attachCheckboxLogic(
      jurisFilter.menu,
      jurisFilter.button,
      selectedJurisdictions,
      "All"
    );

    // Annotation under filters
    container
      .append("p")
      .attr("class", "toggle-note small-text")
      .text(
        "Annual view shows total speeding fines per year up to 2022. Monthly view shows monthly fines from 2023 onwards for a selected year."
      );

    // ---------------------------------------------------------
    // 3. LAYOUT: Summary panel + Chart
    // ---------------------------------------------------------
    const layout = container.append("div").attr("class", "chart-layout");

    const summaryPanel = layout.append("div").attr("class", "summary-panel");

    // Chart area
    const width = 900;
    const height = 420;
    const margin = { top: 40, right: 200, bottom: 50, left: 80 };

    const svg = layout
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    // Y-axis label
    svg
      .append("text")
      .attr(
        "transform",
        `translate(${margin.left - 60}, ${height / 2}) rotate(-90)`
      )
      .attr("text-anchor", "middle")
      .style("font-size", "0.9rem")
      .text("Fines");

    // append legend LAST so it appears on the RIGHT
    const legendBox = layout.append("div").attr("class", "legend-box");

    const summaryTotal = summaryPanel
      .append("div")
      .attr("class", "summary-total")
      .text("0");

    const summarySubtitle = summaryPanel
      .append("div")
      .attr("class", "summary-subtitle")
      .text("Speeding infringements");

    const chartArea = svg.append("g");
    const xAxisGroup = svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`);
    const yAxisGroup = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`);

    const hoverLine = chartArea
      .append("line")
      .attr("stroke", "#888")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4")
      .style("opacity", 0);

    const tooltipBar = container
      .append("div")
      .attr("class", "tooltip-bar")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "white")
      .style("border", "1px solid #000")
      .style("padding", "6px 10px")
      .style("min-width", "180px")
      .style("font-size", "0.8rem")
      .style("opacity", 0)
      .style("z-index", 11);

    const color = d3
      .scaleOrdinal()
      .range([
        "#000000",
        "#d95f02",
        "#1b9e77",
        "#7570b3",
        "#e7298a",
        "#66a61e",
        "#a6761d",
      ]);

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    let currentMode = "annual";

    // ---------------------------------------------------------
    // 4. DRAW FUNCTION
    // ---------------------------------------------------------
    function drawChart() {
      const jurisValues = Array.from(selectedJurisdictions);
      const selectedYear = +yearSelect.node().value;
      const isAnnual = currentMode === "annual";

      let baseData = isAnnual ? annualData : monthlyData;

      if (jurisValues.length > 0)
        baseData = baseData.filter((d) => jurisValues.includes(d.jurisdiction));

      if (!isAnnual) {
        // Remove QLD monthly 2023
        baseData = baseData.filter((d) => {
          if (d.jurisdiction === "QLD" && d.year === 2023) return false;
          return d.year === selectedYear;
        });
      }

      // Summary panel visibility
      if (isAnnual) {
        summaryPanel.style("display", "none");
      } else {
        summaryPanel.style("display", "block");
        const total = d3.sum(baseData, (d) => d.fines);
        summaryTotal.text(total.toLocaleString());
        summarySubtitle.text(`Speeding infringements, ${selectedYear}`);
      }

      chartArea
        .selectAll(".series-line, .point, .y-grid, .hover-capture")
        .remove();

      if (!baseData.length) {
        xAxisGroup.selectAll("*").remove();
        yAxisGroup.selectAll("*").remove();
        return;
      }

      const groupByKey = isAnnual ? (d) => d.year : (d) => d.month;

      // Series → each line is a jurisdiction
      const series = Array.from(
        d3.group(baseData, (d) => d.jurisdiction),
        ([juris, rows]) => {
          const byTime = d3.rollup(
            rows,
            (v) => d3.sum(v, (x) => x.fines),
            groupByKey
          );
          const values = Array.from(byTime, ([t, fines]) => ({
            t: +t,
            fines,
          })).sort((a, b) => a.t - b.t);

          return { juris, values };
        }
      );

      color.domain(series.map((s) => s.juris));

      const MIN_YEAR = d3.min(annualData, (d) => d.year);
      const MAX_YEAR = d3.max(annualData, (d) => d.year);

      const maxFines = d3.max(series, (s) => d3.max(s.values, (v) => v.fines));

      const xScale = d3
        .scaleLinear()
        .domain(isAnnual ? [MIN_YEAR, MAX_YEAR] : [1, 17])
        .range([margin.left, width - margin.right]);

      const yScale = d3
        .scaleLinear()
        .domain([0, maxFines * 1.1])
        .nice()
        .range([height - margin.bottom, margin.top]);

      const xAxis =
        currentMode === "annual"
          ? d3
              .axisBottom(xScale)
              .tickValues(d3.range(MIN_YEAR, MAX_YEAR + 1))
              .tickFormat(d3.format("d"))
          : d3
              .axisBottom(xScale)
              .ticks(12)
              .tickFormat((d) => monthNames[d - 1]);

      xAxisGroup.call(xAxis);
      yAxisGroup.call(d3.axisLeft(yScale).ticks(8).tickFormat(d3.format(",")));

      // Grid lines
      chartArea
        .selectAll(".y-grid")
        .data(yScale.ticks(8))
        .join("line")
        .attr("class", "y-grid")
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", (d) => yScale(d))
        .attr("y2", (d) => yScale(d))
        .attr("stroke", "#ddd");

      // Draw lines
      const line = d3
        .line()
        .x((d) => xScale(d.t))
        .y((d) => yScale(d.fines))
        .curve(d3.curveMonotoneX);

      // -----------------------------
      // Lines
      // -----------------------------
      const paths = chartArea
        .selectAll(".series-line")
        .data(series)
        .join("path")
        .attr("class", "series-line")
        .attr("fill", "none")
        .attr("stroke", (d) => color(d.juris))
        .attr("stroke-width", 2)
        .attr("d", (d) => line(d.values))
        .each(function () {
          const L = this.getTotalLength();
          d3.select(this)
            .attr("stroke-dasharray", `${L} ${L}`)
            .attr("stroke-dashoffset", L); // start fully hidden
        });

      // -----------------------------
      // Legend (jurisdictions)
      // -----------------------------
      legendBox.selectAll("*").remove();

      const legendItems = legendBox
        .selectAll(".legend-item")
        .data(series)
        .join("div")
        .attr("class", "legend-item");

      legendItems
        .append("div")
        .attr("class", "legend-color")
        .style("background", (d) => color(d.juris));

      legendItems
        .append("div")
        .attr("class", "legend-label")
        .text((d) => JURIS_NAMES[d.juris] || d.juris);

      // -----------------------------
      // Points (start hidden)
      // -----------------------------
      const allPoints = series.flatMap((s) =>
        s.values.map((v) => ({
          juris: s.juris,
          t: v.t,
          fines: v.fines,
        }))
      );

      const points = chartArea
        .selectAll(".point")
        .data(allPoints)
        .join("circle")
        .attr("class", "point")
        .attr("cx", (d) => xScale(d.t))
        .attr("cy", (d) => yScale(d.fines))
        .attr("fill", (d) => color(d.juris))
        .attr("r", 0); // force ALL points to start invisible

      // -----------------------------
      // Animation functions
      // -----------------------------
      function animateLines() {
        paths.interrupt(); // stop any previous animation

        paths.each(function () {
          const L = this.getTotalLength();
          d3.select(this)
            .attr("stroke-dasharray", `${L} ${L}`)
            .attr("stroke-dashoffset", L)
            .transition()
            .duration(1500)
            .ease(d3.easeLinear)
            .attr("stroke-dashoffset", 0);
        });
      }

      function animatePoints() {
        points.interrupt(); // stop previous

        points.each(function (d) {
          const path = paths.filter((p) => p.juris === d.juris).node();
          if (!path) return;

          const L = path.getTotalLength();
          const px = xScale(d.t);

          let pos = 0;
          for (let l = 0; l <= L; l += 4) {
            const p = path.getPointAtLength(l);
            if (p.x >= px) {
              pos = l;
              break;
            }
          }

          const delay = (pos / L) * 1500;

          d3.select(this)
            .attr("r", 0) // ensure we always restart from 0
            .transition()
            .delay(delay)
            .duration(300)
            .attr("r", 3);
        });
      }

      // Run AFTER shapes render so no flicker
      setTimeout(() => {
        animateLines();
        animatePoints();
      }, 30);

      // Hover interaction
      const uniqueT = Array.from(new Set(allPoints.map((d) => d.t))).sort(
        (a, b) => a - b
      );

      chartArea
        .append("rect")
        .attr("class", "hover-capture")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", width - margin.left - margin.right)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "transparent")
        .on("mousemove", (event) => {
          const [mx] = d3.pointer(event, chartArea.node());
          const tValue = xScale.invert(mx);

          const closest = uniqueT.reduce((a, b) =>
            Math.abs(b - tValue) < Math.abs(a - tValue) ? b : a
          );

          const cx = xScale(closest);

          hoverLine
            .attr("x1", cx)
            .attr("x2", cx)
            .attr("y1", margin.top)
            .attr("y2", height - margin.bottom)
            .style("opacity", 1)
            .raise();

          const rows = allPoints.filter((d) => d.t === closest);

          const header = isAnnual
            ? `Year: ${closest}`
            : `${monthNames[closest - 1]} ${selectedYear}`;

          let barHTML = `<div><strong>${header}</strong></div>`;

          rows
            .sort((a, b) => d3.descending(a.fines, b.fines))
            .forEach((d) => {
              barHTML += `
        <div class="tooltip-bar-row">
          <div class="tooltip-bar-color" style="background:${color(
            d.juris
          )}"></div>
          <div>${JURIS_NAMES[d.juris]}: ${d.fines.toLocaleString()}</div>
        </div>`;
            });

          // align tooltip with the vertical line (cx)
          const svgRect = svg.node().getBoundingClientRect();
          const leftPos = svgRect.left + cx + 12;

          tooltipBar
            .style("opacity", 1)
            .html(barHTML)
            .style("left", `${leftPos}px`)
            .style("top", `${event.pageY - 30}px`);
        })
        .on("mouseleave", () => {
          hoverLine.style("opacity", 0);
          tooltipBar.style("opacity", 0);
        });

      // Show/hide year dropdown
      yearGroup.style("visibility", isAnnual ? "hidden" : "visible");
    }

    container
      .append("div")
      .attr("class", "chart-notes small-text")
      .html(window.CHART_NOTES_HTML);

    // ---------------------------------------------------------
    // 5. EVENT WIRING
    // ---------------------------------------------------------
    d3.select("#juris-mode-annual").on("click", () => {
      currentMode = "annual";
      d3.select("#juris-mode-annual").classed("active", true);
      d3.select("#juris-mode-monthly").classed("active", false);
      drawChart();
    });

    d3.select("#juris-mode-monthly").on("click", () => {
      currentMode = "monthly";
      d3.select("#juris-mode-annual").classed("active", false);
      d3.select("#juris-mode-monthly").classed("active", true);
      drawChart();
    });

    yearSelect.on("change", () => {
      if (currentMode === "monthly") drawChart();
    });

    // ---------------------------------------------------------
    // Initial draw
    // ---------------------------------------------------------
    drawChart();
  });
};
