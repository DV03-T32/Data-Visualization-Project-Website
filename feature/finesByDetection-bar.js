// feature/finesByDetection-bar.js
// Clean, standardised bar chart following the SAME architecture as the multiline charts.

(function () {
  const MONTH_NAMES = [
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

  function fmt(n) {
    return n ? n.toLocaleString() : "0";
  }

  // ---------------------------------------------------------
  // CREATE B/W DROPDOWN
  // ---------------------------------------------------------
  function createBWDropdown(parent, labelText, multi = true) {
    const g = parent.append("div").attr("class", "filter-group bw");
    g.append("div").attr("class", "filter-label").text(labelText);

    const btn = g
      .append("button")
      .attr("type", "button")
      .attr("class", "filter-button bw-btn")
      .text("All");

    const menu = g.append("div").attr("class", "filter-menu bw-menu");
    // Prevent dropdown from closing when clicking inside
    menu.on("click", (event) => event.stopPropagation());

    // "All" option
    const all = menu.append("label").attr("class", "filter-option");
    all
      .append("input")
      .attr("type", "checkbox")
      .attr("value", "__all__")
      .property("checked", true);
    all.append("span").text("All");

    btn.on("click", (e) => {
      e.stopPropagation();
      const opened = g.classed("is-open");
      d3.selectAll(".filter-group").classed("is-open", false);
      g.classed("is-open", !opened);
    });

    return { group: g, button: btn, menu, multi };
  }

  // ---------------------------------------------------------
  // CHECKBOX LOGIC
  // ---------------------------------------------------------
  function attachCheckboxLogic(
    menu,
    button,
    selectionSet,
    label,
    onChangeExtra
  ) {
    const inputs = menu.selectAll("input");

    inputs.on("change", function () {
      const val = this.value;

      // clicked ALL
      if (val === "__all__") {
        const ch = this.checked;
        selectionSet.clear();

        inputs.each(function () {
          if (this.value !== "__all__") this.checked = false;
        });

        if (!ch) this.checked = true;
      } else {
        // not ALL
        inputs.each(function () {
          if (this.value === "__all__") this.checked = false;
        });

        if (this.checked) selectionSet.add(val);
        else selectionSet.delete(val);

        if (selectionSet.size === 0) {
          inputs.each(function () {
            if (this.value === "__all__") this.checked = true;
          });
        }
      }

      if (selectionSet.size === 0) button.text(label);
      else if (selectionSet.size === 1)
        button.text(Array.from(selectionSet)[0]);
      else button.text(selectionSet.size + " selected");

      if (onChangeExtra) onChangeExtra();
    });

    button.text(label);
  }

  // ---------------------------------------------------------
  // MAIN RENDER FUNCTION
  // ---------------------------------------------------------
  window.renderFinesByDetectionBar = function (containerSelector) {
    SpeedingData.loadAll().then(({ annual, monthly }) => {
      // ---------------------------------------------------------
      // 1. PREP DATA
      // ---------------------------------------------------------
      const annualData = annual.filter((d) => d.year <= 2023);
      const monthlyData = monthly.filter((d) => d.year >= 2023);

      const allJurisdictions = Array.from(
        new Set([...annualData, ...monthlyData].map((d) => d.jurisdiction))
      ).sort();
      const allMethods = Array.from(
        new Set([...annualData, ...monthlyData].map((d) => d.detectionMethod))
      ).sort();
      const monthlyYears = Array.from(
        new Set(monthlyData.map((d) => d.year))
      ).sort();

      const selectedJurisdictions = new Set(); // empty = All
      const selectedMethods = new Set(); // empty = All

      let mode = "annual";

      // ---------------------------------------------------------
      // 2. BUILD UI
      // ---------------------------------------------------------
      const container = d3.select(containerSelector);
      container.selectAll("*").remove();

      const controls = container.append("div").attr("class", "chart-controls");

      const toggle = controls.append("div").attr("class", "speed-toggle");
      const btnAnnual = toggle
        .append("button")
        .attr("class", "toggle-btn active")
        .text("Annual");
      const btnMonthly = toggle
        .append("button")
        .attr("class", "toggle-btn")
        .text("Monthly");

      const filterRow = controls.append("div").attr("class", "filter-row");

      // Jurisdiction dropdown
      const jurisDD = createBWDropdown(filterRow, "Jurisdiction", true);

      // Method dropdown
      const methodDD = createBWDropdown(filterRow, "Detection method", true);

      // Monthly-only: year dropdown
      const yearGroup = filterRow.append("div").attr("class", "filter-group");
      yearGroup
        .append("div")
        .attr("class", "filter-label")
        .text("Year (monthly)");
      const yearSelect = yearGroup
        .append("select")
        .attr("class", "filter-year-select");
      yearGroup.style("display", "none");

      yearSelect
        .selectAll("option")
        .data(monthlyYears)
        .enter()
        .append("option")
        .attr("value", (d) => d)
        .text((d) => d);

      // Monthly-only: month dropdown
      const monthGroup = filterRow.append("div").attr("class", "filter-group");
      monthGroup.append("div").attr("class", "filter-label").text("Month");
      const monthSelect = monthGroup
        .append("select")
        .attr("class", "filter-year-select");
      monthGroup.style("display", "none");

      monthSelect
        .selectAll("option")
        .data(["All"].concat(MONTH_NAMES))
        .enter()
        .append("option")
        .attr("value", (d, i) => i) // 0 = All, 1..12 = months
        .text((d) => d);

      container
        .append("p")
        .attr("class", "toggle-note small-text")
        .text("Annual: grouped by year. Monthly: choose year + month.");

      // ---------------------------------------------------------
      // 3. CHART LAYOUT
      // ---------------------------------------------------------
      const layout = container.append("div").attr("class", "chart-layout");
      const legendBox = layout.append("div").attr("class", "legend-box");

      const svgW = 960,
        svgH = 500;
      const margin = { top: 40, right: 160, bottom: 120, left: 120 };

      const svg = layout
        .append("svg")
        .attr("viewBox", `0 0 ${svgW} ${svgH}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%")
        .style("height", "auto");

      const g = svg
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const innerW = svgW - margin.left - margin.right;
      const innerH = svgH - margin.top - margin.bottom;

      const xAxisG = svg.append("g").attr("class", "x-axis");
      const yAxisG = svg.append("g").attr("class", "y-axis");

      const tooltip = container
        .append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("opacity", 0)
        .style("pointer-events", "none")
        .style("background", "#fff")
        .style("border", "1px solid #111")
        .style("padding", "8px")
        .style("border-radius", "6px");

      const color = d3.scaleOrdinal(d3.schemeSet2);

      // ---------------------------------------------------------
      // 4. POPULATE DROPDOWNS
      // ---------------------------------------------------------
      // Jurisdictions
      jurisDD.menu.selectAll("*").remove();
      const jAll = jurisDD.menu.append("label").attr("class", "filter-option");
      jAll
        .append("input")
        .attr("type", "checkbox")
        .attr("value", "__all__")
        .property("checked", true);
      jAll.append("span").text("All");

      jurisDD.menu
        .selectAll("label.item")
        .data(allJurisdictions)
        .enter()
        .append("label")
        .attr("class", "filter-option item")
        .html((d) => `<input type="checkbox" value="${d}"><span>${d}</span>`);

      // Methods
      methodDD.menu.selectAll("*").remove();
      const mAll = methodDD.menu.append("label").attr("class", "filter-option");
      mAll
        .append("input")
        .attr("type", "checkbox")
        .attr("value", "__all__")
        .property("checked", true);
      mAll.append("span").text("All");

      methodDD.menu
        .selectAll("label.item")
        .data(allMethods)
        .enter()
        .append("label")
        .attr("class", "filter-option item")
        .html((d) => `<input type="checkbox" value="${d}"><span>${d}</span>`);

      // ---------------------------------------------------------
      // 5. UPDATE METHOD MENU (depends on juris + mode)
      // ---------------------------------------------------------
      function updateMethodMenu() {
        let base = mode === "annual" ? annualData : monthlyData;

        if (selectedJurisdictions.size > 0) {
          base = base.filter((d) => selectedJurisdictions.has(d.jurisdiction));
        }

        if (mode === "monthly") {
          const y = +yearSelect.node().value;
          base = base.filter((d) => d.year === y);
        }

        const methods = Array.from(
          new Set(base.map((d) => d.detectionMethod))
        ).sort();

        methodDD.menu.selectAll("*").remove();

        const allOpt = methodDD.menu
          .append("label")
          .attr("class", "filter-option");
        allOpt
          .append("input")
          .attr("type", "checkbox")
          .attr("value", "__all__")
          .property("checked", true);
        allOpt.append("span").text("All");

        methodDD.menu
          .selectAll("label.item")
          .data(methods)
          .enter()
          .append("label")
          .attr("class", "filter-option item")
          .html((d) => `<input type="checkbox" value="${d}"><span>${d}</span>`);

        selectedMethods.clear();
        attachCheckboxLogic(
          methodDD.menu,
          methodDD.button,
          selectedMethods,
          "All",
          draw // re-draw whenever methods change
        );

        color.domain(methods.length ? methods : allMethods);
      }

      // ---------------------------------------------------------
      // 6. DRAW FUNCTION
      // ---------------------------------------------------------
      function draw() {
        g.selectAll("*").remove();
        xAxisG.selectAll("*").remove();
        yAxisG.selectAll("*").remove();
        legendBox.selectAll("*").remove();

        const selJurs = Array.from(selectedJurisdictions);
        const jurLabel = selJurs.includes("__all__")
          ? "All"
          : selJurs.join(", ");


        yearGroup.style(
          "display",
          mode === "monthly" ? "inline-block" : "none"
        );
        monthGroup.style(
          "display",
          mode === "monthly" ? "inline-block" : "none"
        );

        // -----------------------------
        // ANNUAL MODE
        // -----------------------------
        if (mode === "annual") {
          let rows = annualData.filter(
            (d) =>
              d.year >= 2008 &&
              d.year <= 2024 &&
              (selectedJurisdictions.size === 0 ||
                selectedJurisdictions.has(d.jurisdiction)) &&
              (selectedMethods.size === 0 ||
                selectedMethods.has(d.detectionMethod))
          );

          const years = d3.range(2008, 2025);
          const methods = Array.from(
            new Set(rows.map((d) => d.detectionMethod))
          ).sort();
          color.domain(methods);

          const dataByYear = years.map((year) => {
            const map = new Map(methods.map((m) => [m, 0]));
            rows
              .filter((r) => r.year === year)
              .forEach((r) => {
                map.set(
                  r.detectionMethod,
                  map.get(r.detectionMethod) + r.fines
                );
              });
            return {
              year,
              methodsArray: methods.map((m) => ({
                year,
                method: m,
                fines: map.get(m),
              })),
            };
          });

          const x0 = d3
            .scaleBand()
            .domain(years)
            .range([0, innerW])
            .padding(0.18);

          const x1 = d3
            .scaleBand()
            .domain(methods)
            .range([0, x0.bandwidth()])
            .padding(0.06);

          const maxY =
            d3.max(dataByYear, (d) => d3.max(d.methodsArray, (m) => m.fines)) ||
            1;

          const y = d3
            .scaleLinear()
            .domain([0, maxY * 1.1])
            .nice()
            .range([innerH, 0]);

          // Axes
          xAxisG
            .attr(
              "transform",
              `translate(${margin.left},${svgH - margin.bottom})`
            )
            .call(d3.axisBottom(x0).tickFormat(d3.format("d")))
            .selectAll("text")
            .attr("transform", "rotate(-25)")
            .style("text-anchor", "end");

          yAxisG
            .attr("transform", `translate(${margin.left},${margin.top})`)
            .call(
              d3
                .axisLeft(y)
                .ticks(6)
                .tickFormat((d) => d.toLocaleString())
            );

          const yearGroups = g
            .selectAll("g.year-group")
            .data(dataByYear)
            .enter()
            .append("g")
            .attr("class", "year-group")
            .attr("transform", (d) => `translate(${x0(d.year)},0)`);

          yearGroups
            .selectAll("rect")
            .data((d) => d.methodsArray)
            .enter()
            .append("rect")
            .attr("class", "bar")
            .attr("x", (d) => x1(d.method))
            .attr("width", x1.bandwidth())
            .attr("y", y(0))
            .attr("height", 0)
            .attr("rx", 4)
            .attr("fill", (d) => color(d.method))
            .on("mousemove", (event, d) => {
              tooltip
                .style("opacity", 1)
                .html(
                  `
        <strong>${d.year}</strong><br/>
        Jurisdictions: ${jurLabel}<br/>
        <span style="display:inline-block;width:10px;height:10px;background:${color(
          d.method
        )};margin-right:6px"></span>
        ${d.method}: ${fmt(d.fines)}
      `
                )
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY - 40 + "px");
            })
            .on("mouseleave", () => tooltip.style("opacity", 0))
            .transition()
            .duration(450)
            .attr("y", (d) => y(d.fines))
            .attr("height", (d) => innerH - y(d.fines));

          // Legend
          legendBox
            .selectAll(".legend-item")
            .data(methods)
            .enter()
            .append("div")
            .attr("class", "legend-item")
            .html(
              (d) => `
              <div class="legend-color" style="background:${color(d)}"></div>
              <div class="legend-label">${d}</div>
            `
          );

          return;
        }

        // -----------------------------
        // MONTHLY MODE
        // -----------------------------
        const yearSel = +yearSelect.node().value;
        const monthSel = +monthSelect.node().value;

        let rows = monthlyData.filter(
          (d) =>
            d.year === yearSel &&
            (selectedJurisdictions.size === 0 ||
              selectedJurisdictions.has(d.jurisdiction)) &&
            (selectedMethods.size === 0 ||
              selectedMethods.has(d.detectionMethod))
        );

        if (monthSel !== 0) rows = rows.filter((d) => d.month === monthSel);

        const methods = Array.from(
          new Set(rows.map((r) => r.detectionMethod))
        ).sort();
        color.domain(methods);

        const totals = methods.map((method) => ({
          method,
          fines: d3.sum(
            rows.filter((r) => r.detectionMethod === method),
            (r) => r.fines
          ),
        }));

        const x = d3
          .scaleBand()
          .domain(methods)
          .range([0, innerW])
          .padding(0.2);

        const y = d3
          .scaleLinear()
          .domain([0, d3.max(totals, (d) => d.fines) || 1])
          .nice()
          .range([innerH, 0]);

        // Axes
        xAxisG
          .attr(
            "transform",
            `translate(${margin.left},${svgH - margin.bottom})`
          )
          .call(d3.axisBottom(x))
          .selectAll("text")
          .attr("transform", "rotate(-25)")
          .style("text-anchor", "end");

        yAxisG
          .attr("transform", `translate(${margin.left},${margin.top})`)
          .call(
            d3
              .axisLeft(y)
              .ticks(6)
              .tickFormat((d) => d.toLocaleString())
          );

        g.selectAll("rect")
          .data(totals)
          .enter()
          .append("rect")
          .attr("class", "bar")
          .attr("x", (d) => x(d.method))
          .attr("width", x.bandwidth())
          .attr("y", y(0))
          .attr("height", 0)
          .attr("rx", 4)
          .attr("fill", (d) => color(d.method))
          .on("mousemove", (event, d) => {
            const label =
              monthSel === 0
                ? `${yearSel} (All months)`
                : `${MONTH_NAMES[monthSel - 1]} ${yearSel}`;
            tooltip
              .style("opacity", 1)
              .html(
                `<strong>${label}</strong><br/>${d.method}: ${fmt(d.fines)}`
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY - 40 + "px");
          })
          .on("mouseleave", () => tooltip.style("opacity", 0))
          .transition()
          .duration(450)
          .attr("y", (d) => y(d.fines))
          .attr("height", (d) => innerH - y(d.fines));

        // Legend
        legendBox
          .selectAll(".legend-item")
          .data(methods)
          .enter()
          .append("div")
          .attr("class", "legend-item")
          .html(
            (d) => `
            <div class="legend-color" style="background:${color(d)}"></div>
            <div class="legend-label">${d}</div>
          `
          );
      }

       container
      .append("div")
      .attr("class", "chart-notes small-text")
      .html(window.CHART_NOTES_HTML);


      // ---------------------------------------------------------
      // 7. EVENT WIRING
      // ---------------------------------------------------------

      // Important: use attachCheckboxLogic callbacks instead of overwriting "change" handlers

      attachCheckboxLogic(
        jurisDD.menu,
        jurisDD.button,
        selectedJurisdictions,
        "All",
        () => {
          updateMethodMenu(); // methods depend on juris
          draw();
        }
      );

      attachCheckboxLogic(
        methodDD.menu,
        methodDD.button,
        selectedMethods,
        "All",
        draw
      );

      btnAnnual.on("click", () => {
        mode = "annual";
        btnAnnual.classed("active", true);
        btnMonthly.classed("active", false);
        updateMethodMenu();
        draw();
      });

      btnMonthly.on("click", () => {
        mode = "monthly";
        btnAnnual.classed("active", false);
        btnMonthly.classed("active", true);
        updateMethodMenu();
        draw();
      });

      yearSelect.on("change", () => {
        if (mode === "monthly") {
          updateMethodMenu(); // year affects available methods
          draw();
        }
      });

      

      monthSelect.on("change", () => {
        if (mode === "monthly") draw();
      });

      d3.select("body").on("click", () =>
        d3.selectAll(".filter-group").classed("is-open", false)
      );

      // INITIAL DRAW
      updateMethodMenu();
      draw();
    });
  };
})();
