// Central configuration for dashboard navigation / views
window.NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "speeding", label: "Fines from speeding" },
  { id: "jurisdiction", label: "Fines by jurisdiction" },
  { id: "detection", label: "Fines by detection type" },
  { id: "age", label: "Fines by age group" },
  { id: "alcohol", label: "Fines vs positive alcohol detections" },
];

// Global jurisdiction names
window.JURIS_NAMES = {
  ACT: "Australian Capital Territory",
  NSW: "New South Wales",
  NT: "Northern Territory",
  QLD: "Queensland",
  SA: "South Australia",
  TAS: "Tasmania",
  VIC: "Victoria",
  WA: "Western Australia",
};

window.CHART_NOTES_HTML = `
  <h3>Notes</h3>
  <ul>
    <li><strong>New South Wales:</strong> Up to 2019, speed camera fines include only fixed and mobile camera detections and exclude offences recorded as red-light camera infringements. Speed bands changed on 1 July 2009. As of 1 June 2023, camera-issued fines are detected by RMS Static Speed Cameras, RMS Red Light Cameras, RMS Mobile Speed Cameras and RMS Combined Cameras.</li>

    <li><strong>Queensland:</strong> Camera detections are assessed by accredited Traffic Camera Office staff to determine if sufficient evidence exists to issue an infringement. Not all detections result in a fine. Figures include overt, covert and portable mobile speed cameras, analogue fixed cameras, digital fixed cameras and digital combined red-light/speed cameras.</li>

    <li><strong>Tasmania:</strong> In 2012, civilian speed camera operators were not used. Aged equipment and software limitations have impacted the number of recorded camera detections.</li>

    <li><strong>Western Australia:</strong> Detection modes include on-the-spot (OTS), mobile speed cameras, fixed cameras, average speed cameras and red-light cameras.</li>

    <li><strong>Missing data:</strong> ACT data is unavailable for 2022. Victorian 2024 volumes were lower due to Protected Industrial Action (PIA).</li>

    <li><strong>Detection method changes:</strong> From 2023 onward, jurisdictions report more detailed camera types (average speed, red-light, fixed, mobile). Earlier years contain fewer categories, limiting direct comparison.</li>

    <li><strong>Varying reporting practices:</strong> Some states submitted partial or delayed monthly data during the transition to the new schema (2023+), causing gaps or irregularities in monthly patterns.</li>

    <li><strong>Technology differences:</strong> Higher infringement counts may reflect improved camera networks rather than changes in driver behaviour. States that upgraded equipment earlier (e.g., VIC, NSW) detect more offences.</li>

    <li><strong>Enforcement intensity differences:</strong> Remote or sparsely populated regions (e.g., WA, NT) have fewer cameras, which may under-represent actual speeding behaviour compared to urban states.</li>

    <li><strong>COVID-19 impacts:</strong> Enforcement activity dipped in parts of 2020–2021 due to operational restrictions, potentially reducing fines in those years.</li>

    <li><strong>Data submission differences:</strong> Jurisdictions use different internal reporting cycles and systems, which BITRE standardises before publication. Minor timing inconsistencies may remain between states.</li>

    <li><strong>Charges and arrests:</strong> Enforcement outcomes (e.g., number of charges) were only added to the dataset from 2023. Earlier “zero” values generally indicate “not recorded,” not true zero offences.</li>

  </ul>
`;
