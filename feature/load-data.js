// Load the CSV file with a row conversion function
// Centralised loader for annual and monthly speeding fines datasets.

// Wrap everything in an IIFE to avoid polluting the global scope
(function () {
    // --------- 1. Path to clean files -----------
    const ANNUAL_CSV_PATH = "datasets/annual_fines_clean.csv";
    const MONTHLY_CSV_PATH = "datasets/monthly_fines_clean.csv";

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
        };
    }
    
    // Share Promis that loads BOTH datasets once and caches them
    const dataPromise = Promise.all([
        d3.csv(ANNUAL_CSV_PATH, parseAnnualRow),
        d3.csv(MONTHLY_CSV_PATH, parseMonthlyRow),
    ])
        .then(([annual, monthly]) => {
            console.log("Loaded annual fines data:", annual);
            console.log("Loaded monthly fines data:", monthly);

            return { annual, monthly };
        })
        .catch((error) => {
            console.error("Error loading fines CSV files:", error);
            // Fail safely with empty arrays so charts don't completely break
            return { annual: [], monthly: [] };
        });
    
    // 4. Public API - attach to window so charts can reuse the loaded data
    window.SpeedingData = {
    
    // Load both annual and monthly datasets.
    // Returns a Promise resolving to: { annual, monthly }
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
    };    
})();