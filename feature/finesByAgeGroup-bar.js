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
      monthly.forEach((d) => {
        d.ageGroup = d.ageGroup && d.ageGroup.trim() ? d.ageGroup : "Unknown";
        d.month = +d.month;
        d.year = +d.year;
        d.fines = +d.fines;
        d.jurisdiction = d.jurisdiction;
        d.detectionMethod =
          d.detectionMethod || d.DETECTION_METHOD || "Unknown";
      });

      const container = d3.select(selector);
      container.selectAll("*").remove();

      // Lists
      const jurisdictions = Array.from(
        new Set(monthly.map((d) => d.jurisdiction))
      ).sort();
      const years = Array.from(new Set(monthly.map((d) => d.year))).sort(
        (a, b) => a - b
      );
      const detectionMethods = Array.from(
        new Set(monthly.map((d) => d.detectionMethod))
      ).sort();
      // build a stable color map for years so every year (e.g., 2024) has an assigned color
      const yearPalette = (d3.schemeSet2 || []).concat(
        d3.schemeTableau10 || [],
        d3.schemeCategory10 || []
      );
      const yearColorMap = new Map(
        years.map((y, i) => [String(y), yearPalette[i % yearPalette.length]])
      );
      const rawAgeGroups = Array.from(new Set(monthly.map((d) => d.ageGroup)));
      // Enforce desired order, keep only present groups
      const ageGroups = AGE_ORDER.filter((x) => rawAgeGroups.includes(x));

      // Pre-aggregations for speed + tooltip breakdowns
      // annualRoll[jur][age][year] = sum fines
      const annualRoll = new Map(); // Map<jur, Map<age, Map<year, fines>>>
      const annualDetectRoll = new Map(); // Map<jur, Map<age, Map<year, Map<method, fines>>>>
      const monthlyRoll = new Map(); // Map<jur, Map<year, Map<month, Map<age, fines>>>>
      const monthlyDetectRoll = new Map(); // Map<jur, Map<year, Map<month, Map<age, Map<method, fines>>>>>

      // helper to get-or-create nested Map
      function ensureMap(parent, key) {
        if (!parent.has(key)) parent.set(key, new Map());
        return parent.get(key);
      }

      for (const row of monthly) {
        const jur = row.jurisdiction;
        const ag = row.ageGroup;
        const yr = +row.year;
        const mo = +row.month;
        const method = row.detectionMethod;
        const fines = +row.fines;

        // -------------------------
        // annualRoll[jur][age][year]
        // -------------------------
        const jurAge = ensureMap(annualRoll, jur); // Map<age, Map<year, fines>>
        const ageYearMap = ensureMap(jurAge, ag); // Map<year, fines>
        ageYearMap.set(yr, (ageYearMap.get(yr) || 0) + fines);

        // ------------------------------------------------------
        // annualDetectRoll[jur][age][year][method] = sum fines
        // ------------------------------------------------------
        const jurAgeDet = ensureMap(annualDetectRoll, jur); // Map<age, Map<year, Map<method, fines>>>
        const ageYearDet = ensureMap(jurAgeDet, ag); // Map<year, Map<method, fines>>
        const methodMapAnnual = ensureMap(ageYearDet, yr); // Map<method, fines>
        methodMapAnnual.set(method, (methodMapAnnual.get(method) || 0) + fines);

        // -----------------------------------------------------
        // monthlyRoll[jur][year][month][age] = sum fines
        // -----------------------------------------------------
        const jurYear = ensureMap(monthlyRoll, jur); // Map<year, Map<month, Map<age, fines>>>
        const yearMonthAge = ensureMap(jurYear, yr); // Map<month, Map<age, fines>>
        const monthAgeMap = ensureMap(yearMonthAge, mo); // Map<age, fines>
        monthAgeMap.set(ag, (monthAgeMap.get(ag) || 0) + fines);

        // --------------------------------------------------------------------
        // monthlyDetectRoll[jur][year][month][age][method] = sum fines
        // --------------------------------------------------------------------
        const jurYrMap = ensureMap(monthlyDetectRoll, jur); // Map<year, Map<month, Map<age, Map<method, fines>>>>
        const yrMonthMap = ensureMap(jurYrMap, yr); // Map<month, Map<age, Map<method, fines>>>
        const ageMethodMap = ensureMap(ensureMap(yrMonthMap, mo), ag); // Map<method, fines>
        ageMethodMap.set(method, (ageMethodMap.get(method) || 0) + fines);
      }

      // Utility to safely get nested maps with defaults
      const safeGet = (m, k, def = new Map()) => (m.has(k) ? m.get(k) : def);

      // --- State
      const state = {
        mode: "annual",
        // Default = ALL jurisdictions selected
        selectedJurisdictions: new Set(["__all__"]),
        jurisdiction: jurisdictions[0] || null,
        selectedYears: new Set(years.slice(-3)),
        month: 0,
        selectedAges: new Set(ageGroups),
        selectedMethods: new Set(detectionMethods),
      };

      // store previous multi-year selection when switching to monthly so we can restore it
      let _prevSelectedYears = null;

      // helper to sync year inputs with state.selectedYears and update button text
      function syncYearInputs() {
        yearDD.menu.selectAll("input").property("checked", function () {
          return state.selectedYears.has(+this.value);
        });
        if (state.mode === "annual") {
          yearDD.button.text(`${state.selectedYears.size} selected`);
        } else {
          yearDD.button.text(Array.from(state.selectedYears)[0] || "");
        }
      }

      // --- Controls UI (single toolbox) ---
      const controls = container.append("div").attr("class", "chart-controls");

      // mode toggle + single toolbox area (keeps interface compact)
      const topRow = controls
        .append("div")
        .attr("class", "top-row")
        .style("display", "flex")
        .style("gap", "8px")
        .style("align-items", "center")
        .style("justify-content", "center");

      const modeToggle = topRow.append("div").attr("class", "speed-toggle");
      const btnAnnual = modeToggle
        .append("button")
        .attr("class", "toggle-btn active")
        .text("Annual");
      const btnMonthly = modeToggle
        .append("button")
        .attr("class", "toggle-btn")
        .text("Monthly");

      // Filters row (clean B/W dropdowns)
      const filterRow = controls
        .append("div")
        .attr("class", "filter-row")
        .style("justify-content", "center");

      // Reusable black & white dropdown creator (supports single or multi)
      function createBWDropdown(parent, labelText, multi = false) {
        const g = parent.append("div").attr("class", "filter-group bw");
        g.append("div").attr("class", "filter-label").text(labelText);
        const btn = g
          .append("button")
          .attr("type", "button")
          .attr("class", "filter-button bw-btn")
          .text("All");
        const menu = g.append("div").attr("class", "filter-menu bw-menu");
        menu.on("click", (event) => event.stopPropagation());
        btn.on("click", (e) => {
          e.stopPropagation();
          const open = g.classed("is-open");
          d3.selectAll(".filter-group").classed("is-open", false);
          g.classed("is-open", !open);
        });
        return { group: g, button: btn, menu, multi };
      }

      // =====================
      // JURISDICTION DROPDOWN
      // =====================
      const jurisDD = createBWDropdown(filterRow, "Jurisdiction", true);

      // ALL option
      const jurisAll = jurisDD.menu
        .append("label")
        .attr("class", "filter-option");
      jurisAll
        .append("input")
        .attr("type", "checkbox")
        .attr("value", "__all__")
        .property("checked", true)
        .on("change", function (event) {
          event.stopPropagation();

          if (this.checked) {
            // ONLY select ALL
            jurisDD.menu.selectAll("input").property("checked", false);
            this.checked = true;

            state.selectedJurisdictions = new Set(["__all__"]);
            jurisDD.button.text("All");
          }

          draw();
        });
      jurisAll.append("span").text("All");

      // Real jurisdictions
      jurisdictions.forEach((j) => {
        const row = jurisDD.menu.append("label").attr("class", "filter-option");

        row
          .append("input")
          .attr("type", "checkbox")
          .attr("value", j)
          .property("checked", false)
          .on("change", function (event) {
            event.stopPropagation();

            if (this.checked) {
              // turn OFF ALL and remove it from the Set
              jurisDD.menu
                .select('input[value="__all__"]')
                .property("checked", false);
              state.selectedJurisdictions.delete("__all__");
              state.selectedJurisdictions.add(j);
            } else {
              state.selectedJurisdictions.delete(j);

              // If none left → revert to ALL
              if (state.selectedJurisdictions.size === 0) {
                state.selectedJurisdictions = new Set(["__all__"]);
                jurisDD.menu.selectAll("input").property("checked", false);
                jurisDD.menu
                  .select('input[value="__all__"]')
                  .property("checked", true);
              }
            }

            const selJurs = Array.from(state.selectedJurisdictions);
            jurisDD.button.text(
              selJurs.includes("__all__") ? "All" : `${selJurs.length} selected`
            );

            draw();
          });
        row.append("span").text(j);
      });

      // =====================
      // YEAR DROPDOWN
      // =====================
      const yearDD = createBWDropdown(filterRow, "Year(s)", true);
      const yearList = years.slice().reverse();

      yearList.forEach((y) => {
        const row = yearDD.menu.append("label").attr("class", "filter-option");
        const cb = row
          .append("input")
          .attr("type", "checkbox")
          .attr("value", y)
          .property("checked", state.selectedYears.has(y))
          .on("change", function (event) {
            event.stopPropagation();
            const val = +this.value;

            if (state.mode === "monthly") {
              // RADIO behavior
              if (this.checked) {
                state.selectedYears = new Set([val]);
                yearDD.menu.selectAll("input").property("checked", function () {
                  return +this.value === val;
                });
              } else {
                // Can't uncheck the only selected item
                this.checked = true;
              }
              yearDD.button.text(val);
            } else {
              // MULTI behavior
              if (this.checked) state.selectedYears.add(val);
              else state.selectedYears.delete(val);

              yearDD.button.text(`${state.selectedYears.size} selected`);
            }

            draw();
          });

        row.append("span").text(y);
      });

      // Initial button label
      if (state.mode === "annual") {
        yearDD.button.text(`${state.selectedYears.size} selected`);
      } else {
        yearDD.button.text(Array.from(state.selectedYears)[0]);
      }

      // =====================
      // MONTH DROPDOWN (monthly mode only)
      // =====================
      // Month select (visible only in monthly mode)
      // Month select (visible only in monthly mode)
      const monthGroup = filterRow.append("div").attr("class", "filter-group");
      monthGroup.append("div").attr("class", "filter-label").text("Month");

      const monthSelect = monthGroup
        .append("select")
        .attr("class", "filter-year-select");

      // Restore the ALL MONTHS option
      monthSelect.append("option").attr("value", 0).text("All");

      // Regular months
      MONTH_LABELS.forEach((m, i) =>
        monthSelect
          .append("option")
          .attr("value", i + 1)
          .text(m)
      );

      // Restore previously-selected month
      monthSelect.property("value", state.month);

      // Hidden in annual mode
      monthGroup.style("display", "none");

      // Update state + redraw
      monthSelect.on("change", function () {
        state.month = +this.value;
        draw();
      });

      // =====================
      // AGE GROUP DROPDOWN
      // =====================
      const ageDD = createBWDropdown(filterRow, "Age groups", true);

      // ALL option
      const ageAll = ageDD.menu.append("label").attr("class", "filter-option");
      ageAll
        .append("input")
        .attr("type", "checkbox")
        .attr("value", "__all__")
        .property("checked", true)
        .on("change", function (event) {
          event.stopPropagation();

          if (this.checked) {
            ageDD.menu.selectAll("input").property("checked", false);
            this.checked = true;
            state.selectedAges = new Set(ageGroups);
            ageDD.button.text("All");
          } else {
            ageDD.menu.selectAll("input").property("checked", false);
            state.selectedAges.clear();
            ageDD.button.text("0 selected");
          }

          draw();
        });

      ageAll.append("span").text("All");

      // Real options
      ageGroups.forEach((ag) => {
        const row = ageDD.menu.append("label").attr("class", "filter-option");
        row
          .append("input")
          .attr("type", "checkbox")
          .attr("value", ag)
          .property("checked", true)
          .on("change", function (event) {
            event.stopPropagation();

            const allBox = ageDD.menu.select('input[value="__all__"]');
            const allChecked = allBox.property("checked");

            if (this.checked) {
              // If ALL was previously active → turn it off and reset the set
              if (allChecked) {
                allBox.property("checked", false);
                state.selectedAges = new Set(); // clear completely first
              }

              // Add selected age group
              state.selectedAges.add(ag);
            } else {
              // Remove deselected age group
              state.selectedAges.delete(ag);

              // If the user deselects everything → revert to ALL
              if (state.selectedAges.size === 0) {
                ageDD.menu.selectAll("input").property("checked", false);
                allBox.property("checked", true);

                // Restore all age groups as selected
                state.selectedAges = new Set(ageGroups);
              }
            }

            // Update button label
            ageDD.button.text(
              state.selectedAges.size === ageGroups.length
                ? "All"
                : `${state.selectedAges.size} selected`
            );

            draw();
          });

        row.append("span").text(ag);
      });

      // =====================
      // DETECTION METHOD DROPDOWN
      // =====================
      const detectDD = createBWDropdown(filterRow, "Detection methods", true);

      // ALL option
      const detAll = detectDD.menu
        .append("label")
        .attr("class", "filter-option");
      detAll
        .append("input")
        .attr("type", "checkbox")
        .attr("value", "__all__")
        .property("checked", true)
        .on("change", function (event) {
          event.stopPropagation();

          if (this.checked) {
            // Select ALL
            detectDD.menu.selectAll("input").property("checked", false);
            this.checked = true;

            state.selectedMethods = new Set(detectionMethods);

            detectDD.button.text("All");
          } else {
            // UNCHECKING ALL must CLEAR *everything*
            detectDD.menu.selectAll("input").property("checked", false);

            // IMPORTANT FIX → clear the Set fully
            state.selectedMethods = new Set();

            detectDD.button.text("0 selected");
          }

          draw();
        });

      detAll.append("span").text("All");

      // Real methods
      detectionMethods.forEach((m) => {
        const row = detectDD.menu
          .append("label")
          .attr("class", "filter-option");
        row
          .append("input")
          .attr("type", "checkbox")
          .attr("value", m)
          .property("checked", true)
          .on("change", function (event) {
            event.stopPropagation();

            const allBox = detectDD.menu.select('input[value="__all__"]');
            const allChecked = allBox.property("checked");

            if (this.checked) {
              // --- IMPORTANT FIX ---
              // If ALL was previously selected, reset everything
              if (allChecked) {
                allBox.property("checked", false);

                // Clear existing methods so only selected ones count
                state.selectedMethods = new Set();
              }

              // Add this individual method
              state.selectedMethods.add(m);
            } else {
              // Remove this method
              state.selectedMethods.delete(m);

              // If nothing selected → revert to ALL
              if (state.selectedMethods.size === 0) {
                detectDD.menu.selectAll("input").property("checked", false);
                allBox.property("checked", true);
                state.selectedMethods = new Set(detectionMethods);
              }
            }

            // Update button label
            detectDD.button.text(
              state.selectedMethods.size === detectionMethods.length
                ? "All"
                : `${state.selectedMethods.size} selected`
            );

            draw();
          });

        row.append("span").text(m);
      });

      // ======================
      // DROPDOWN CLOSE ON OUTSIDE CLICK
      // ======================
      d3.select("body").on("click", () => {
        d3.selectAll(".filter-group").classed("is-open", false);
      });

      // Mode toggle events
      btnAnnual.on("click", () => {
        state.mode = "annual";
        btnAnnual.classed("active", true);
        btnMonthly.classed("active", false);
        monthGroup.style("display", "none");
        // restore previous multi-year selection if we saved one when entering monthly
        if (_prevSelectedYears) {
          state.selectedYears = new Set(_prevSelectedYears);
          _prevSelectedYears = null;
        }
        syncYearInputs();
        draw();
      });
      btnMonthly.on("click", () => {
        state.mode = "monthly";
        btnAnnual.classed("active", false);
        btnMonthly.classed("active", true);
        monthGroup.style("display", "inline-block");
        // For monthly, ensure single-year selection: if more than 1, pick latest
        if (state.selectedYears.size > 1) {
          // save current multi-year selection so we can restore when returning to annual
          _prevSelectedYears = new Set(state.selectedYears);
          const latest = Array.from(state.selectedYears).sort(
            (a, b) => b - a
          )[0];
          state.selectedYears = new Set([latest]);
          // sync inputs and button text to reflect single selection
          syncYearInputs();
        } else {
          syncYearInputs();
        }
        draw();
      });

      // --- SVG & layout ---
      const width = 960,
        height = 480;
      const margin = { top: 40, right: 20, bottom: 120, left: 120 };
      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%")
        .style("max-width", `${width}px`)
        .style("display", "block")
        .style("margin", "0 auto")
        .style("height", "auto");

      const chartG = svg
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
      const innerW = width - margin.left - margin.right;
      const innerH = height - margin.top - margin.bottom;
      const xAxisG = svg
        .append("g")
        .attr("class", "x-axis")
        .attr(
          "transform",
          `translate(${margin.left},${height - margin.bottom})`
        );
      const yAxisG = svg
        .append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      // tooltip
      const tooltip = d3
        .select("body")
        .append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("background", "#fff")
        .style("border", "1px solid #111")
        .style("padding", "8px")
        .style("font-size", "0.9rem")
        .style("opacity", 0)
        .style("border-radius", "6px")
        .style("box-shadow", "0 2px 8px rgba(0,0,0,0.12)");

      // color scale for years
      const color = d3.scaleOrdinal(d3.schemeSet2);

      // draw function
      function draw() {
        chartG.selectAll("*").remove();
        xAxisG.selectAll("*").remove();
        yAxisG.selectAll("*").remove();

        const selJurs = Array.from(state.selectedJurisdictions);
        if (!selJurs.length) return;

        // ================================
        // Helper: aggregate jurisdictions
        // ================================
        function aggregateJurisdictions(mapObj, selectedList) {
          const result = new Map(); // result[age][year] = sum

          for (const [jur, agMap] of mapObj.entries()) {
            if (
              !selectedList.includes("__all__") &&
              !selectedList.includes(jur)
            )
              continue;

            for (const [age, yrMap] of agMap.entries()) {
              if (!result.has(age)) result.set(age, new Map());

              for (const [year, val] of yrMap.entries()) {
                const yearMap = result.get(age);

                if (val instanceof Map) {
                  // detection-roll format: val = Map<method, fines>
                  if (!yearMap.has(year)) yearMap.set(year, new Map());
                  for (const [method, v] of val.entries()) {
                    yearMap
                      .get(year)
                      .set(method, (yearMap.get(year).get(method) || 0) + v);
                  }
                } else {
                  // simple value
                  yearMap.set(year, (yearMap.get(year) || 0) + val);
                }
              }
            }
          }

          return result; // NOT wrapped in "__all__"
        }

        // ================================================
        // Determine which rolls to use (single vs multi)
        // ================================================
        let roll, detectRoll, mRoll, mDetect;

        if (selJurs.includes("__all__")) {
          // FULL aggregation across all jurisdictions
          roll = aggregateJurisdictions(annualRoll, ["__all__"]);
          detectRoll = aggregateJurisdictions(annualDetectRoll, ["__all__"]);
          mRoll = aggregateJurisdictions(monthlyRoll, ["__all__"]);
          mDetect = aggregateJurisdictions(monthlyDetectRoll, ["__all__"]);
        } else if (selJurs.length === 1) {
          // Single jurisdiction → use original maps
          const jur = selJurs[0];
          roll = annualRoll.get(jur) || new Map();
          detectRoll = annualDetectRoll.get(jur) || new Map();
          mRoll = monthlyRoll.get(jur) || new Map();
          mDetect = monthlyDetectRoll.get(jur) || new Map();
        } else {
          // MULTI-JURIS selection → aggregate selected jurisdictions
          roll = aggregateJurisdictions(annualRoll, selJurs);
          detectRoll = aggregateJurisdictions(annualDetectRoll, selJurs);
          mRoll = aggregateJurisdictions(monthlyRoll, selJurs);
          mDetect = aggregateJurisdictions(monthlyDetectRoll, selJurs);
        }

        // ================================================
        // AGE FILTER
        // ================================================
        const selAges = ageGroups.filter((ag) => state.selectedAges.has(ag));
        if (!selAges.length) return;

        // ================================================
        // ANNUAL MODE
        // ================================================
        if (state.mode === "annual") {
          const selYears = Array.from(state.selectedYears).sort(
            (a, b) => a - b
          );
          if (!selYears.length) return;

          // Prepare dataset: one row per ageGroup, with values by year
          const data = selAges.map((ag) => {
            const row = { ageGroup: ag };
            selYears.forEach((y) => {
              // roll → Map<ageGroup, Map<year, fines>>
              const val = roll.get(ag)?.get(y) || 0;
              row[y] = val;
            });
            return row;
          });

          const x = d3
            .scaleBand()
            .domain(selAges)
            .range([0, innerW])
            .padding(0.25);
          const x1 = d3
            .scaleBand()
            .domain(selYears.map(String))
            .range([0, x.bandwidth()])
            .padding(0.06);

          const maxVal =
            d3.max(data, (d) => d3.max(selYears, (y) => d[y] || 0)) || 1;
          const y = d3
            .scaleLinear()
            .domain([0, maxVal * 1.1])
            .nice()
            .range([innerH, 0]);

          // axes
          xAxisG
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "rotate(-25)")
            .style("text-anchor", "end");
          yAxisG.call(
            d3
              .axisLeft(y)
              .ticks(6)
              .tickFormat((d) => d.toLocaleString())
          );

          color.domain(selYears.map(String));

          // groups
          const groups = chartG
            .selectAll("g.age-group")
            .data(data)
            .join("g")
            .attr("class", "age-group")
            .attr("transform", (d) => `translate(${x(d.ageGroup)},0)`);

          // join rects
          groups
            .selectAll("rect")
            .data((d) =>
              selYears.map((yr) => ({
                year: yr,
                value: d[yr] || 0,
                ageGroup: d.ageGroup,
              }))
            )
            .join(
              (enter) =>
                enter
                  .append("rect")
                  .attr("x", (d) => x1(String(d.year)))
                  .attr("y", y(0))
                  .attr("width", x1.bandwidth())
                  .attr("height", 0)
                  .attr("rx", 4)
                  .attr(
                    "fill",
                    (d) => yearColorMap.get(String(d.year)) || "#111"
                  )
                  .on("mousemove", function (event, d) {
                    // detection breakdown computed from raw monthly rows
                    const selJursArr = Array.from(state.selectedJurisdictions);
                    const useAllJurs = selJursArr.includes("__all__");

                    let rows = monthly.filter((row) => {
                      const jurOK =
                        useAllJurs || selJursArr.includes(row.jurisdiction);
                      return (
                        jurOK &&
                        row.year === d.year &&
                        row.ageGroup === d.ageGroup
                      );
                    });

                    // filter by selected detection methods
                    rows = rows.filter((r) =>
                      state.selectedMethods.has(r.detectionMethod)
                    );

                    const byMethod = d3.rollup(
                      rows,
                      (v) => d3.sum(v, (r) => r.fines),
                      (r) => r.detectionMethod
                    );

                    const entries = Array.from(byMethod.entries()).sort(
                      (a, b) => d3.descending(a[1], b[1])
                    );

                    const total =
                      entries.reduce((s, [, v]) => s + v, 0) || d.value;

                    const breakdownHtml = entries.length
                      ? entries
                          .map(
                            ([mName, v]) =>
                              `${mName}: ${fmt(v)} (${(
                                (v / total) * 100 || 0
                              ).toFixed(1)}%)`
                          )
                          .join("<br/>")
                      : "";

                    const html = `
                      <strong>${d.ageGroup}</strong><br/>
                      Year: ${d.year}<br/>
                      Jurisdictions: ${
                        useAllJurs ? "All" : selJursArr.join(", ")
                      }<br/>
                      Fines: ${fmt(d.value)}
                      ${
                        breakdownHtml
                          ? '<hr style="border:none;border-top:1px solid #eee;margin:6px 0"/>' +
                            breakdownHtml
                          : ""
                      }
                    `;

                    tooltip
                      .style("opacity", 1)
                      .html(html)
                      .style("left", event.pageX + 12 + "px")
                      .style("top", event.pageY - 40 + "px");
                  })
                  .on("mouseleave", () => tooltip.style("opacity", 0))

                  .transition()
                  .duration(420)
                  .attr("y", (d) => y(d.value))
                  .attr("height", (d) => innerH - y(d.value)),
              (update) =>
                update
                  .transition()
                  .duration(300)
                  .attr("x", (d) => x1(String(d.year)))
                  .attr("y", (d) => y(d.value))
                  .attr("width", x1.bandwidth())
                  .attr("height", (d) => innerH - y(d.value))
                  .attr(
                    "fill",
                    (d) => yearColorMap.get(String(d.year)) || "#111"
                  ),
              (exit) =>
                exit
                  .transition()
                  .duration(200)
                  .attr("y", y(0))
                  .attr("height", 0)
                  .remove()
            );

          // legend
          const legend = svg
            .selectAll("g.legend")
            .data(selYears)
            .join("g")
            .attr("class", "legend")
            .attr(
              "transform",
              (d, i) => `translate(${margin.left + i * 90},${10})`
            );
          legend.selectAll("*").remove();
          legend
            .append("rect")
            .attr("x", 0)
            .attr("y", -10)
            .attr("width", 12)
            .attr("height", 12)
            .attr("rx", 3)
            .attr("fill", (d) => yearColorMap.get(String(d)) || "#111");
          legend
            .append("text")
            .attr("x", 16)
            .attr("y", 0)
            .text((d) => d)
            .style("font-size", "12px");
        } else {
          // ===============================
          // MONTHLY MODE
          // ===============================
          const selJursArr = Array.from(state.selectedJurisdictions);
          const useAllJurs = selJursArr.includes("__all__");

          const selYear =
            Array.from(state.selectedYears).sort((a, b) => b - a)[0] ||
            years[years.length - 1];

          const month = state.month;

          // mRoll shape: Map<year, Map<month, Map<age, fines>>>
          const yearMap = mRoll.get(selYear) || new Map();

          // --- 1. Build bar data for CURRENT selection (month or all months)
          const data = selAges.map((ag) => {
            let val = 0;

            if (month === 0) {
              // sum across all months in the year
              for (const [, agMap] of yearMap.entries()) {
                val += agMap.get(ag) || 0;
              }
            } else {
              val = yearMap.get(month)?.get(ag) || 0;
            }

            return { ageGroup: ag, fines: val };
          });

          // --- 2. Compute correct max value for y-axis
          let maxVal = 0;

          if (month === 0) {
            // If ALL months → compute SUM across months per age group
            for (const ag of selAges) {
              let sum = 0;
              for (const [, agMap] of yearMap.entries()) {
                sum += agMap.get(ag) || 0;
              }
              maxVal = Math.max(maxVal, sum);
            }
          } else {
            // Single month → use normal per-month values
            for (const [, agMap] of yearMap.entries()) {
              for (const ag of selAges) {
                maxVal = Math.max(maxVal, agMap.get(ag) || 0);
              }
            }
          }

          // Safety fallback
          if (maxVal === 0) {
            maxVal = d3.max(data, (d) => d.fines) || 1;
          }

          const x = d3
            .scaleBand()
            .domain(selAges)
            .range([0, innerW])
            .padding(0.25);

          const y = d3
            .scaleLinear()
            .domain([0, maxVal * 1.1])
            .nice()
            .range([innerH, 0]);

          xAxisG
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "rotate(-25)")
            .style("text-anchor", "end");

          yAxisG.call(
            d3
              .axisLeft(y)
              .ticks(6)
              .tickFormat((d) => d.toLocaleString())
          );

          // bars
          const bars = chartG
            .selectAll("rect.bar")
            .data(data, (d) => d.ageGroup);

          bars
            .exit()
            .transition()
            .duration(200)
            .attr("y", y(0))
            .attr("height", 0)
            .remove();

          bars
            .enter()
            .append("rect")
            .attr("class", "bar")
            .attr("x", (d) => x(d.ageGroup))
            .attr("y", y(0))
            .attr("width", x.bandwidth())
            .attr("height", 0)
            .attr("rx", 5)
            .attr("fill", yearColorMap.get(String(selYear)) || "#111")
            .on("mousemove", function (event, d) {
              // tooltip breakdown by detection method for THIS ageGroup/year/month
              let rows = monthly.filter((row) => {
                const jurOK =
                  useAllJurs || selJursArr.includes(row.jurisdiction);
                const yearOK = row.year === selYear;
                const ageOK = row.ageGroup === d.ageGroup;
                const monthOK = month === 0 || row.month === month;
                return jurOK && yearOK && ageOK && monthOK;
              });

              // apply detection filter
              rows = rows.filter((r) =>
                state.selectedMethods.has(r.detectionMethod)
              );

              const byMethod = d3.rollup(
                rows,
                (v) => d3.sum(v, (r) => r.fines),
                (r) => r.detectionMethod
              );

              const entries = Array.from(byMethod.entries()).sort((a, b) =>
                d3.descending(a[1], b[1])
              );

              const total = entries.reduce((s, [, v]) => s + v, 0) || d.fines;

              const breakdownHtml = entries.length
                ? entries
                    .map(
                      ([mName, v]) =>
                        `${mName}: ${fmt(v)} (${(
                          (v / total) * 100 || 0
                        ).toFixed(1)}%)`
                    )
                    .join("<br/>")
                : "";

              const labelPeriod =
                month === 0
                  ? `${selYear} (All)`
                  : `${MONTH_LABELS[month - 1]} ${selYear}`;

              const html = `
                <strong>${d.ageGroup}</strong><br/>
                ${labelPeriod}<br/>
                Jurisdictions: ${
                  useAllJurs ? "All" : selJursArr.join(", ")
                }<br/>
                Fines: ${fmt(d.fines)}
                ${
                  breakdownHtml
                    ? '<hr style="border:none;border-top:1px solid #eee;margin:6px 0"/>' +
                      breakdownHtml
                    : ""
                }
              `;

              tooltip
                .style("opacity", 1)
                .html(html)
                .style("left", event.pageX + 12 + "px")
                .style("top", event.pageY - 40 + "px");
            })
            .on("mouseleave", () => tooltip.style("opacity", 0))
            .transition()
            .duration(420)
            .attr("y", (d) => y(d.fines))
            .attr("height", (d) => innerH - y(d.fines));

          bars
            .transition()
            .duration(300)
            .attr("x", (d) => x(d.ageGroup))
            .attr("y", (d) => y(d.fines))
            .attr("width", x.bandwidth())
            .attr("height", (d) => innerH - y(d.fines))
            .attr("fill", yearColorMap.get(String(selYear)) || "#111")
            .on("mousemove", function (event, d) {
              // get detection breakdown from monthlyDetectRoll
              let detMap;
              if (m === 0) {
                // aggregate across months
                detMap = new Map();
                const jurYear =
                  monthlyDetectRoll.get(state.jurisdiction)?.get(selYear) ||
                  new Map();
                for (const [mo, ageMap] of jurYear.entries
                  ? jurYear.entries()
                  : []) {
                  const agMap = ageMap.get(d.ageGroup) || new Map();
                  for (const [method, v] of agMap.entries
                    ? agMap.entries()
                    : []) {
                    if (!state.selectedMethods.has(method)) continue;
                    detMap.set(method, (detMap.get(method) || 0) + v);
                  }
                }
              } else {
                detMap =
                  monthlyDetectRoll
                    .get(state.jurisdiction)
                    ?.get(selYear)
                    ?.get(m)
                    ?.get(d.ageGroup) || new Map();
              }
              // filter by selectedMethods
              const entries = Array.from(
                detMap.entries ? detMap.entries() : []
              ).filter(([mth, v]) => state.selectedMethods.has(mth));
              const total = entries.reduce((s, [_k, v]) => s + v, 0) || d.fines;
              const breakdownHtml = entries.length
                ? entries
                    .map(
                      ([mth, v]) =>
                        `${mth}: ${fmt(v)} (${((v / total) * 100 || 0).toFixed(
                          1
                        )}%)`
                    )
                    .join("<br/>")
                : "";
              const labelPeriod =
                m === 0
                  ? `${selYear} (All)`
                  : `${MONTH_LABELS[m - 1]} ${selYear}`;
              const html = `<strong>${
                d.ageGroup
              }</strong><br/>${labelPeriod}<br/>Jurisdiction: ${
                state.jurisdiction
              }<br/>Fines: ${fmt(d.fines)}${
                breakdownHtml
                  ? '<hr style="border:none;border-top:1px solid #eee;margin:6px 0"/>' +
                    breakdownHtml
                  : ""
              }`;
              tooltip
                .style("opacity", 1)
                .html(html)
                .style("left", event.pageX + 12 + "px")
                .style("top", event.pageY - 40 + "px");
            })
            .on("mouseleave", () => tooltip.style("opacity", 0))
            .transition()
            .duration(420)
            .attr("y", (d) => y(d.fines))
            .attr("height", (d) => innerH - y(d.fines));

          bars
            .transition()
            .duration(300)
            .attr("x", (d) => x(d.ageGroup))
            .attr("y", (d) => y(d.fines))
            .attr("width", x.bandwidth())
            .attr("height", (d) => innerH - y(d.fines))
            .attr("fill", (d) => yearColorMap.get(String(selYear)) || "#111");
        }
      }

      // --- Instructional note below the chart ---
      container
        .append("div")
        .attr("class", "chart-tutorial-note")
        .style("margin-top", "6px")
        .style("font-size", "16px")
        .style("color", "black").html(`
          <strong>How to use this chart:</strong><br/>
          • Use the dropdown filters (Jurisdiction, Year, Age Groups, Detection Methods) to refine the data.<br/>
          • Selecting any individual option automatically deselects “All”.<br/>
          • In <em>Annual mode</em>, bars show fines per age group across selected years.<br/>
          • In <em>Monthly mode</em>, bars show fines for the selected month (y-axis stays fixed if ALL age groups are selected).<br/>
          • Hover over any bar to see detection-method breakdowns.
        `);

      // initial draw
      draw();
    }).catch(err => console.error('Error in renderFinesByAgeGroupBar:', err));
  };

  
})();
