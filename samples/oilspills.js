function getLocation(d) {
  if (d["Platform / Rig"] !== null) {
    return "Platform / Rig";
  }
  if (d["Pipeline"] !== null) {
    return "Pipeline";
  }
  if (d["Vessel"] !== null) {
    return "Vessel";
  }
  return "Unknown";
}

var Districts = {
  1: "New Orleans",
  2: "Houma",
  3: "Lafayette",
  4: "Lake Charles",
  5: "Lake Jackson",
  6: "Corpus Christi",
  7: "Santa Mariia",
  8: "Camarillo",
};

export var config = {
  recordName: "Oil Spills",
  source: [
    {
      name: "SPills",
      gdocId: "1X6X8zHmd-qbQOA0Se17_OAaVYSQXt7KyxMcGlr77kkI",
    },
  ],
  description:
    "Data from <a href='http://www.bsee.gov/Inspection-and-Enforcement/Accidents-and-Incidents/Spills/' target='_blank'>BSEE.gov oil spill summaries</a>",
  onLoad: {
    Date: "DATETIME(%Y-%m-%d)",
    Cause: "SPLIT(,)",
    Notes: "SPLIT(-)",
    "During Activity": "SPLIT(/)",
  },
  panels: {
    left: { catLabelWidth: 180 },
    right: { catLabelWidth: 160 },
  },
  summaries: [
    { name: "Size", panel: "left" },
    { name: "District", catLabel: Districts, panel: "left" },
    {
      name: "Source",
      panel: "left",
      value: function () {
        return getLocation(this);
      },
    },
    {
      name: "Material",
      value: function () {
        var toRet = [];
        if (this["Crude & Condensate"] !== 0) toRet.push("Crude & Condensate");
        if (this["Refined Petroleum"] !== 0) toRet.push("Refined Petroleum");
        if (this["Synthetic Base Fluid"] !== 0)
          toRet.push("Synthetic Base Fluid");
        if (this["Other Chemicals"] !== 0) toRet.push("Other Chemicals");
        return toRet;
      },
      panel: "left",
    },
    {
      name: "Total Spilled",
      collapsed: false,
      panel: "middle",
      unitName: "brl",
      maxHeightRatio: 0.08,
    },
    {
      name: "Crude & Condensate",
      collapsed: true,
      panel: "middle",
      unitName: "brl",
      maxHeightRatio: 0.08,
      skipZero: true,
    },
    {
      name: "Refined Petroleum",
      collapsed: true,
      panel: "middle",
      unitName: "brl",
      maxHeightRatio: 0.08,
      skipZero: true,
    },
    {
      name: "Synthetic Base Fluid",
      collapsed: true,
      panel: "middle",
      unitName: "brl",
      maxHeightRatio: 0.08,
      skipZero: true,
    },
    {
      name: "Other Chemicals",
      collapsed: true,
      panel: "middle",
      unitName: "brl",
      maxHeightRatio: 0.08,
      skipZero: true,
    },
    { name: "Company", panel: "right", barHeight: 18 },
    {
      name: "Water Depth",
      value: "Water Depth (feet)",
      intervalScale: "log",
      unitName: "ft",
      panel: "right",
      collapsed: true,
      metricFuncs: ["Avg"],
    },
    { name: "During Activity", panel: "right", collapsed: false },
    { name: "Cause", panel: "right" },
    {
      name: "Other Properties",
      value: "Notes",
      panel: "right",
      collapsed: true,
      catLabel: {
        1: "Caused by blowout/losso fo well control",
        2: "Contacted land",
        3: "Caused by hurricanes",
        4: "Seepage from hurricane-damaged strutures awaiting/undergoing abandonment",
        5: "Explosion/Fire",
        6: "Collision",
        7: "With Injury",
        8: "With Fatality",
      },
    },
    { name: "Date", panel: "bottom", maxHeightRatio: 0.08 },
    {
      name: "Distance to Shore",
      value: "Distance to Shore (miles)",
      panel: "none",
      unitName: "mi",
      metricFuncs: ["Avg"],
    },
    {
      name: "Record Text",
      value: function (_rec) {
        var str = "";
        // location
        str +=
          '<div class="iteminfo iteminfo_1"><b>Company:</b> ' +
          this.Company +
          "</div>";
        str +=
          '<div class="iteminfo iteminfo_1"><b>Location:</b>' +
          " <u>District</u>:" +
          Districts[this.District] +
          " - <u>Area Block</u>:" +
          this["Area Block"] +
          " - <u>Water Depth</u>:" +
          this["Water Depth (feet)"] +
          "feet" +
          " - <u>Distance to Shore</u>:" +
          this["Distance to Shore (miles)"] +
          "miles" +
          "</div>";

        str += '<span class="item_details">';

        // Spillage
        str += '<div class="iteminfo iteminfo_1"><b>Spilled (in barrels): </b>';
        str += " <u>Total</u>:" + this["Total Spilled"];
        str += " <u>Crude & Condensate</u>:" + this["Crude & Condensate"];
        str += " <u>Refined Petroleum</u>:" + this["Refined Petroleum"];
        str += " <u>Synthetic Base Fluid</u>:" + this["Synthetic Base Fluid"];
        str += " <u>Other Chemicals</u>:" + this["Other Chemicals"];
        str += "</div>";
        str +=
          '<div class="iteminfo iteminfo_2"><b>Casuses:</b>' +
          this.Cause +
          "</div>";
        str +=
          '<div class="iteminfo iteminfo_2"><b>Spill Source:</b> ' +
          getLocation(this) +
          " <b>Facility:</b> " +
          this.Facility +
          "</div>";

        str += "</span>";

        return str;
      },
    },
  ],
  selections: {
    summary: "Size",
    Compare_A: { id: "Minor" },
    Compare_B: { id: "Medium" },
    Compare_C: { id: "Major" },
  },
  recordDisplay: {
    viewAs: "list",

    list_sortColWidth: 65,
    sortBy: "Date",
    textBy: "Record Text",
    textBriefBy: "Company"
  },
};
