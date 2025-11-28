// Load the CSV file with a row conversion function
// Centralised loader for annual and monthly speeding fines datasets.

// Wrap everything in an IIFE to avoid polluting the global scope
(function () {
    // --------- 1. Path to clean files -----------
    const ANNUAL_CSV_PATH = "datasets/annual_fines_clean.csv";
    const MONTHLY_CSV_PATH = "datasets/monthly_fines_clean.csv";
    const POSITIVE_BREATH_CSV_PATH = "datasets/Positive_Breath.csv";
    const CONDUCTED_BREATH_CSV_PATH = "datasets/conducted_breath_tests.csv";

    // ------ 2. Row converters ---------
    
    // Annual: one row per year / jurisdiction / detection method
    function parseAnnualRow(d) {
        return {
            year: +d.YEAR,
            jurisdiction: d.JURISDICTION,
            detectionMethod: d.DETECTION_METHOD_CLEAN,
            fines: +d["Sum(FINES)"]
        };
    }

    // Monthly: one row per year / month / jurisdiction / detection method
    function parseMonthlyRow(d) {
        return {
            year: +d.YEAR,
            month: +d.MONTH,
            jurisdiction: d.JURISDICTION,
            detectionMethod: d.DETECTION_METHOD_CLEAN,
            fines: +d.FINES,
            // AGE_GROUP exists in monthly_fines_clean.csv (e.g. "17-25", "26-39", "Unknown")
            ageGroup: d.AGE_GROUP || d.AGE || "Unknown",
        };
    }

    // Positive breath tests loader
    function parsePositiveBreath(d) {
        return {
            year: +d.YEAR,
            jurisdiction: d.JURISDICTION,
            metric: d.METRIC,
            fines: +d["Sum(FINES)"],
            count: +d["Sum(COUNT)"]
        };
    }

    // Conducted breath tests loader
    function parseConductedBreath(d) {
        return {
            year: +d.YEAR,
            month: d.MONTH ? +d.MONTH : null,
            jurisdiction: d.JURISDICTION,
            metric: d.METRIC,
            count: +d.COUNT
        };
    }
    
    // Share Promise that loads all datasets once and caches them
    const dataPromise = Promise.all([
        d3.csv(ANNUAL_CSV_PATH, parseAnnualRow),
        d3.csv(MONTHLY_CSV_PATH, parseMonthlyRow),
        d3.csv(POSITIVE_BREATH_CSV_PATH, parsePositiveBreath),
        d3.csv(CONDUCTED_BREATH_CSV_PATH, parseConductedBreath),
    ])
        .then(([annual, monthly, breath, conducted]) => {
            console.log("Loaded annual fines data:", annual);
            console.log("Loaded monthly fines data:", monthly);
            console.log("Loaded positive breath data:", breath);
            console.log("Loaded conducted breath data:", conducted);

            return { annual, monthly, breath, conducted };
        })
        .catch((error) => {
            console.error("Error loading fines CSV files:", error);
            // Fail safely with empty arrays so charts don't completely break
            return { annual: [], monthly: [], breath: [], conducted: [] };
        });

    // Extended annual data (2008-2024) for age group and detection type charts
    const dataPromiseExtended = Promise.all([
        d3.csv(ANNUAL_CSV_PATH, parseAnnualRow),
        d3.csv(MONTHLY_CSV_PATH, parseMonthlyRow),
    ])
        .then(([annual, monthly]) => {
            console.log("Loaded extended annual fines data (2008-2024):", annual);
            console.log("Loaded monthly fines data:", monthly);
            return { annual, monthly };
        })
        .catch((error) => {
            console.error("Error loading extended fines data:", error);
            return { annual: [], monthly: [] };
        });
    
    // 4. Public API - attach to window so charts can reuse the loaded data
    window.SpeedingData = {
    
        // Load both annual and monthly datasets.
        // Returns a Promise resolving to: { annual, monthly, breath }
        loadAll() {
            return dataPromise;
        },

        // Convenience helpers if a chart only needs one dataset.
        loadAnnual() {
            return dataPromise.then((d) => d.annual);
        },

        loadMonthly() {
            return dataPromise.then((d) => d.monthly);
        },

        // Load positive breath test data
        loadBreath() {
            return dataPromise.then((d) => d.breath);
        },

        // Load conducted breath tests
        loadConducted() {
            return dataPromise.then((d) => d.conducted);
        },

        // Helper: load annual fines, positive breath and conducted breath data together
        loadAnnualWithBreath() {
            return dataPromise.then((d) => ({ annual: d.annual, breath: d.breath, conducted: d.conducted }));
        },

        // Extended data loader: annual (2008-2024) + monthly for age group and detection type charts
        loadExtendedAnnualWithMonthly() {
            return dataPromiseExtended.then((d) => ({ annual: d.annual, monthly: d.monthly }));          
        },
    };
})();