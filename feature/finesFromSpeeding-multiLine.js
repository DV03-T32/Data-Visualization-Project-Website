// feature/finesFromSpeeding-multiLine.js
// Annual + Monthly fines from speeding, by detection method
// Uses SpeedingData.loadAll() from load-data.js

window.renderFinesFromSpeedingMultiLine = function (containerSelector) {
  SpeedingData.loadAll().then(({ annual, monthly }) => {
    // -------------------------------
    // 1. Prepare data
    // -------------------------------

    // Annual: only up to 2022 (dataset is annual by year)
    const annualData = annual.filter((d) => d.year <= 2023);

    // Monthly: 2023 onwards, already monthly
    const monthlyData = monthly.filter((d) => d.year >= 2023);

    const allJurisdictions = Array.from(
      new Set([...annualData, ...monthlyData].map((d) => d.jurisdiction))
    ).sort();

    const monthlyYears = Array.from(
      new Set(monthlyData.map((d) => d.year))
    ).sort((a, b) => a - b);

    // Selection state (empty set = "All")
    const selectedJurisdictions = new Set();
    const selectedMethods = new Set();

    // -------------------------------
    // 2. Build UI inside container
    // -------------------------------
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();

    const controls = container.append("div").attr("class", "chart-controls");

    // ----- Toggle buttons -----
    const toggle = controls.append("div").attr("class", "speed-toggle");

    toggle
      .append("button")
      .attr("id", "speed-mode-annual")
      .attr("type", "button")
      .attr("class", "toggle-btn active")
      .text("Annual");

    toggle
      .append("button")
      .attr("id", "speed-mode-monthly")
      .attr("type", "button")
      .attr("class", "toggle-btn")
      .text("Monthly");

    // ----- Filter row -----
    const filterRow = controls.append("div").attr("class", "filter-row");

    // Helper: create a dropdown-with-checkboxes filter group (static items)
    function createDropdownFilter(parent, labelText, items) {
      const group = parent.append("div").attr("class", "filter-group");

      group.append("div").attr("class", "filter-label").text(labelText);

      const button = group
        .append("button")
        .attr("type", "button")
        .attr("class", "filter-button")
        .text("All ");

      const menu = group.append("div").attr("class", "filter-menu");
      menu.on("click", (event) => event.stopPropagation());

      // "All" option
      const allLabel = menu.append("label").attr("class", "filter-option");
      allLabel
        .append("input")
        .attr("type", "checkbox")
        .attr("value", "__all__")
        .property("checked", true);
      allLabel.append("span").text("All");

      // Individual items
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

      // Button toggles menu ONLY (dropdown stays open when checking boxes)
      button.on("click", (event) => {
        event.stopPropagation();
        const isOpen = group.classed("is-open");
        d3.selectAll(".filter-group").classed("is-open", false);
        group.classed("is-open", !isOpen);
      });

      return { group, button, menu };
    }

    // Jurisdiction filter: static list
    const jurisFilter = createDropdownFilter(
      filterRow,
      "Select jurisdiction",
      allJurisdictions
    );

    // Detection method filter: menu rebuilt dynamically based on jurisdiction/year
    const methodGroup = filterRow.append("div").attr("class", "filter-group");
    methodGroup
      .append("div")
      .attr("class", "filter-label")
      .text("Select detection method");
    const methodButton = methodGroup
      .append("button")
      .attr("type", "button")
      .attr("class", "filter-button")
      .text("All ");
    const methodMenu = methodGroup.append("div").attr("class", "filter-menu");

    methodButton.on("click", (event) => {
      event.stopPropagation();
      const isOpen = methodGroup.classed("is-open");
      d3.selectAll(".filter-group").classed("is-open", false);
      methodGroup.classed("is-open", !isOpen);
    });

    const methodFilter = {
      group: methodGroup,
      button: methodButton,
      menu: methodMenu,
    };

    // Year dropdown (simple select) for monthly mode
    const yearGroup = filterRow.append("div").attr("class", "filter-group");
    yearGroup
      .append("div")
      .attr("class", "filter-label")
      .attr("id", "speed-year-label")
      .text("Select year");

    const yearSelect = yearGroup
      .append("select")
      .attr("id", "speed-year")
      .attr("class", "filter-year-select");

    yearSelect
      .selectAll("option")
      .data(monthlyYears)
      .enter()
      .append("option")
      .attr("value", (d) => d)
      .text((d) => {
        if (d === 2023) return "2023 (No QLD monthly data)"; // QLD in 2023 is annual
        return d;
      });

    // Update button labels based on selected items
    function updateFilterButtonLabel(button, selectionSet, defaultLabel) {
      if (selectionSet.size === 0) {
        button.text(defaultLabel + " ");
      } else if (selectionSet.size === 1) {
        button.text(Array.from(selectionSet)[0] + " ");
      } else {
        button.text(`${selectionSet.size} selected `);
      }
    }

    // Wiring for checkbox logic (All vs specific)
    function attachCheckboxLogic(
      menu,
      button,
      selectionSet,
      defaultLabel,
      onChangeExtra
    ) {
      const inputs = menu.selectAll("input");

      inputs.on("change", function () {
        const value = this.value;

        if (value === "__all__") {
          const checked = this.checked;
          selectionSet.clear();

          inputs.each(function () {
            if (this.value !== "__all__") this.checked = false;
          });

          if (!checked) {
            this.checked = true;
          }
        } else {
          // Uncheck "All"
          inputs.each(function () {
            if (this.value === "__all__") this.checked = false;
          });

          if (this.checked) {
            selectionSet.add(value);
          } else {
            selectionSet.delete(value);
          }

          // If nothing selected, revert to "All"
          if (selectionSet.size === 0) {
            inputs.each(function () {
              if (this.value === "__all__") this.checked = true;
            });
          }
        }

        updateFilterButtonLabel(button, selectionSet, defaultLabel);
        if (onChangeExtra) onChangeExtra();
        drawChart();
      });

      // Initial label
      updateFilterButtonLabel(button, selectionSet, defaultLabel);
    }

    let currentMode = "annual"; // used by method update + chart

    // Helper to rebuild detection-method options based on
    // current mode + jurisdiction + year selection
    function updateMethodOptions() {
      const isAnnual = currentMode === "annual";
      const jurisValues = Array.from(selectedJurisdictions);
      const selectedYear = +yearSelect.node().value;

      let baseData = isAnnual ? annualData : monthlyData;

      if (jurisValues.length > 0) {
        baseData = baseData.filter((d) => jurisValues.includes(d.jurisdiction));
      }
      if (!isAnnual) {
        baseData = baseData.filter((d) => d.year === selectedYear);
      }

      const methods = Array.from(
        new Set(baseData.map((d) => d.detectionMethod))
      ).sort();

      // Reset detection-method selection whenever the available list changes
      selectedMethods.clear();
      methodMenu.selectAll("*").remove();

      // "All" option
      const allLabel = methodMenu
        .append("label")
        .attr("class", "filter-option");
      allLabel
        .append("input")
        .attr("type", "checkbox")
        .attr("value", "__all__")
        .property("checked", true);
      allLabel.append("span").text("All");

      // Method items (only those present for the selected jurisdictions/year)
      const itemLabels = methodMenu
        .selectAll("label.item")
        .data(methods)
        .enter()
        .append("label")
        .attr("class", "filter-option item");

      itemLabels
        .append("input")
        .attr("type", "checkbox")
        .attr("value", (d) => d);

      itemLabels.append("span").text((d) => d);

      attachCheckboxLogic(
        methodMenu,
        methodButton,
        selectedMethods,
        "All",
        null
      );
    }

    // Attach logic for jurisdiction filter (and hook method updating)
    attachCheckboxLogic(
      jurisFilter.menu,
      jurisFilter.button,
      selectedJurisdictions,
      "All",
      updateMethodOptions
    );

    // Initial detection-method options = all jurisdictions
    updateMethodOptions();

    // Annotation under controls
    container
      .append("p")
      .attr("class", "toggle-note small-text")
      .text(
        "Annual view shows total speeding fines per year up to 2022 by detection method. " +
          "Monthly view shows monthly fines from 2023 onwards for a selected year."
      );

    // -------------------------------
    // 3. Layout: summary panel + chart
    // -------------------------------
    const layout = container.append("div").attr("class", "chart-layout");

    const summaryPanel = layout.append("div").attr("class", "summary-panel");

    // Chart SVG
    const width = 900;
    const height = 420;
    const margin = { top: 30, right: 200, bottom: 50, left: 80 };

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

    const summaryBreakdown = summaryPanel
      .append("div")
      .attr("class", "summary-breakdown");

    const policeBox = summaryBreakdown
      .append("div")
      .attr("class", "summary-box");
    const policeValue = policeBox
      .append("div")
      .attr("class", "summary-box-value")
      .text("0");
    policeBox
      .append("div")
      .attr("class", "summary-box-label")
      .text("Police fines");

    const cameraBox = summaryBreakdown
      .append("div")
      .attr("class", "summary-box");
    const cameraValue = cameraBox
      .append("div")
      .attr("class", "summary-box-value")
      .text("0");
    cameraBox
      .append("div")
      .attr("class", "summary-box-label")
      .text("Camera fines");

    const chartArea = svg.append("g");

    const xAxisGroup = svg
      .append("g")
      .attr("transform", `translate(0, ${height - margin.bottom})`);

    const yAxisGroup = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`);

    // Hover line
    const hoverLine = chartArea
      .append("line")
      .attr("class", "hover-line")
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

    // Colour scale for detection methods
    const color = d3.scaleOrdinal().range([
      "#000000", // black - first series (e.g. main camera series)
      "#1b9e77", // dark teal-green
      "#d95f02", // strong orange
      "#7570b3", // deep violet
      "#e7298a", // magenta
      "#66a61e", // dark green
      "#a6761d", // brown
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

    // Helper: update summary panel (monthly mode only)
    function updateSummary(baseData, isAnnual, selectedYear) {
      if (isAnnual) {
        summaryPanel.style("display", "none");
        return;
      }
      summaryPanel.style("display", "block");

      const total = d3.sum(baseData, (d) => d.fines) || 0;

      // Camera methods group
      const cameraSet = new Set([
        "Camera (fixed/mobile)",
        "Fixed camera",
        "Mobile camera",
        "Average speed camera",
        "Red light camera",
      ]);

      const cameraFines =
        d3.sum(
          baseData.filter((d) => cameraSet.has(d.detectionMethod)),
          (d) => d.fines
        ) || 0;

      const policeFines =
        d3.sum(
          baseData.filter((d) => d.detectionMethod === "Police issued"),
          (d) => d.fines
        ) || 0;

      summaryTotal.text(total.toLocaleString());
      summarySubtitle.text(`Speeding infringements, ${selectedYear}`);
      policeValue.text(policeFines.toLocaleString());
      cameraValue.text(cameraFines.toLocaleString());
    }

    // -------------------------------
    // 4. Draw function
    // -------------------------------
    function drawChart() {
      const jurisValues = Array.from(selectedJurisdictions);
      const methodValues = Array.from(selectedMethods);
      const selectedYear = +yearSelect.node().value;
      const isAnnual = currentMode === "annual";

      let baseData = isAnnual ? annualData : monthlyData;

      if (jurisValues.length > 0) {
        baseData = baseData.filter((d) => jurisValues.includes(d.jurisdiction));
      }

      if (methodValues.length > 0) {
        baseData = baseData.filter((d) =>
          methodValues.includes(d.detectionMethod)
        );
      }

      if (!isAnnual) {
        baseData = baseData.filter((d) => {
          // Remove QLD monthly in 2023 (annual disguised as monthly)
          if (d.jurisdiction === "QLD" && d.year === 2023) return false;
          return d.year === selectedYear;
        });
      }

      // Update summary panel (handles annual vs monthly)
      updateSummary(baseData, isAnnual, selectedYear);

      chartArea
        .selectAll(".series-line, .point, .y-grid, .hover-capture")
        .remove();

      if (!baseData.length) {
        xAxisGroup.selectAll("*").remove();
        yAxisGroup.selectAll("*").remove();
        hoverLine.style("opacity", 0);
        return;
      }

      // Group by detection method, then by time bucket (year/month)
      const groupByKey = isAnnual ? (d) => d.year : (d) => d.month;

      const series = Array.from(
        d3.group(baseData, (d) => d.detectionMethod),
        ([method, rows]) => {
          const byTime = d3.rollup(
            rows,
            (v) => d3.sum(v, (x) => x.fines),
            groupByKey
          );
          const values = Array.from(byTime, ([t, fines]) => ({
            t: +t,
            fines,
          })).sort((a, b) => a.t - b.t);
          return { method, values };
        }
      );

      color.domain(series.map((s) => s.method));

      // Compute global min/max year from the annual dataset
      const MIN_YEAR = d3.min(annualData, (d) => d.year);
      const MAX_YEAR = d3.max(annualData, (d) => d.year);

      const allT = series.flatMap((s) => s.values.map((v) => v.t));
      const maxFines = d3.max(series, (s) => d3.max(s.values, (v) => v.fines));

      const xScale = d3
        .scaleLinear()
        .domain(isAnnual ? [MIN_YEAR, MAX_YEAR] : [1, 16.5]) // 17 because chart was cut off at october
        .range([margin.left, width - margin.right]);

      const yScale = d3
        .scaleLinear()
        .domain([0, maxFines * 1.1])
        .nice()
        .range([height - margin.bottom, margin.top]);

      const xAxis = isAnnual
        ? d3
            .axisBottom(xScale)
            .tickValues(d3.range(MIN_YEAR, MAX_YEAR + 1)) // show every year
            .tickFormat(d3.format("d"))
        : d3
            .axisBottom(xScale)
            .ticks(12)
            .tickFormat((d) => monthNames[d - 1]);

      const yAxis = d3.axisLeft(yScale).ticks(8).tickFormat(d3.format(","));

      xAxisGroup.call(xAxis);
      yAxisGroup.call(yAxis);

      // Subtle horizontal grid lines
      chartArea
        .selectAll(".y-grid")
        .data(yScale.ticks(8))
        .join("line")
        .attr("class", "y-grid")
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", (d) => yScale(d))
        .attr("y2", (d) => yScale(d))
        .attr("stroke", "#ddd")
        .attr("stroke-width", 1)
        .attr("shape-rendering", "crispEdges");

      const line = d3
        .line()
        .x((d) => xScale(d.t))
        .y((d) => yScale(d.fines))
        .curve(d3.curveMonotoneX);

      chartArea
        .selectAll(".series-line")
        .data(series)
        .join("path")
        .attr("class", "series-line")
        .attr("fill", "none")
        .attr("stroke", (d) => color(d.method))
        .attr("stroke-width", 2)
        .attr("d", (d) => line(d.values));

      const allPoints = series.flatMap((s) =>
        s.values.map((v) => ({
          method: s.method,
          t: v.t,
          fines: v.fines,
        }))
      );

      // -----------------------------
      // Legend (detection methods)
      // -----------------------------
      legendBox.selectAll("*").remove(); // clear old legend

      const legendItems = legendBox
        .selectAll(".legend-item")
        .data(series)
        .join("div")
        .attr("class", "legend-item");

      legendItems
        .append("div")
        .attr("class", "legend-color")
        .style("background", (d) => color(d.method));

      legendItems
        .append("div")
        .attr("class", "legend-label")
        .text((d) => d.method);

      chartArea
        .selectAll(".point")
        .data(allPoints)
        .join("circle")
        .attr("class", "point")
        .attr("cx", (d) => xScale(d.t))
        .attr("cy", (d) => yScale(d.fines))
        .attr("r", 3)
        .attr("fill", (d) => color(d.method));

      // Hover interaction: vertical line + dynamic legend
      const uniqueT = Array.from(new Set(allPoints.map((d) => d.t))).sort(
        (a, b) => a - b
      );

      chartArea
        .selectAll(".hover-capture")
        .data([null])
        .join("rect")
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

          let header;
          if (isAnnual) {
            header = `Year: ${closest}`;
          } else {
            header = `${monthNames[closest - 1]} ${selectedYear}`;
          }

          // Tooltip bar (floating legend)
          let barHTML = `<div><strong>${header}</strong></div>`;

          rows
            .sort((a, b) => d3.descending(a.fines, b.fines))
            .forEach((d) => {
              barHTML += `
                <div class="tooltip-bar-row">
                  <div class="tooltip-bar-color" style="background:${color(
                    d.method || d.juris
                  )}"></div>
                  <div>${
                    d.method || JURIS_NAMES[d.juris]
                  }: ${d.fines.toLocaleString()}</div>
                </div>
              `;
            });

          // Align tooltip with the vertical hover line
          const svgRect = svg.node().getBoundingClientRect();
          const leftPos = svgRect.left + cx + 12; // tooltip just right of the hover line

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

      // Show/hide year filter
      if (isAnnual) {
        yearGroup.style("visibility", "hidden");
      } else {
        yearGroup.style("visibility", "visible");
      }
    }

    container
      .append("div")
      .attr("class", "chart-notes small-text")
      .html(window.CHART_NOTES_HTML);

    // -------------------------------
    // 5. Event wiring
    // -------------------------------
    d3.select("#speed-mode-annual").on("click", () => {
      currentMode = "annual";
      d3.select("#speed-mode-annual").classed("active", true);
      d3.select("#speed-mode-monthly").classed("active", false);
      updateMethodOptions();
      drawChart();
    });

    d3.select("#speed-mode-monthly").on("click", () => {
      currentMode = "monthly";
      d3.select("#speed-mode-annual").classed("active", false);
      d3.select("#speed-mode-monthly").classed("active", true);
      updateMethodOptions();
      drawChart();
    });

    yearSelect.on("change", () => {
      if (currentMode === "monthly") {
        updateMethodOptions();
        drawChart();
      }
    });

    // Initial draw (annual)
    drawChart();
  });
};
