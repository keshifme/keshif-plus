export var config = {
  source: {
    gdocId: "14cM0aC77J3U4WVYFaRwNWn_yk9y48ffappasqfjBFCY",
    name: "Accidents",
  },
  description:
    "Data from <a href='https://data.gov.uk/dataset/road-accidents-safety-data' target='_blank'>data.gov.uk</a> . <a href='http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/' target='_blank'>Open Government License</a>",
  onLoad: { Time: "DATETIME(%sn)" },
  panels: { default: { catLabelWidth: 170, catBarWidth: 120 } },
  selections: {
    summary: "Area",
    Compare_A: {
      id: 1,
    },
    Compare_B: {
      id: 2,
    },
  },
  summaries: [
    {
      name: "Road Type",
      catLabel: {
        1: "Roundabout",
        2: "One way Street",
        3: "Dual Carriageway",
        6: "Single Carriageway",
        7: "Slip Road",
        9: "Unknown",
      },
      panel: "left",
    },
    {
      name: "Severity",
      catLabel: { 1: "Fatal", 2: "Serious", 3: "Slight" },
      panel: "left",
    },
    { name: "Area", catLabel: { 1: "Urban", 2: "Rural" }, panel: "left" },
    { name: "# of Vehicles", panel: "middle", unitName: "veh", panel: "left" },
    {
      name: "Speed Limit",
      catLabel: function () {
        return this.id + " mph";
      },
      catSortBy: "id",
      panel: "middle",
    },
    {
      name: "Road Surface Condition",
      panel: "right",
      catLabel: {
        1: "Dry",
        2: "Wet / Damp",
        3: "Snow",
        4: "Frost / Ice",
        5: "Flood",
        "-1": "Unknown",
      },
    },
    {
      name: "Light Condition",
      catLabel: {
        1: "Daylight",
        4: "Dark, street lights lit",
        5: "Dark, street lights unlit",
        6: "Dark, no street lights",
        7: "Dark, ? street lights",
      },
    },
    {
      name: "Weather Condition",
      catLabel: {
        1: "Fine",
        2: "Raining",
        3: "Snowing",
        4: "Fine, high winds",
        5: "Raining, high winds",
        6: "Snowing, high winds",
        7: "Fog or mist",
        8: "Other",
        9: "Unknown",
      },
    },
    {
      name: "Special Condition",
      panel: "right",
      catLabel: {
        0: "None",
        1: "Traffic signal out",
        2: "Traffic signal defective",
        3: "Signing/marking defective",
        4: "Roadworks",
        5: "Road surface defective",
        6: "Oil or diesel",
        7: "Mud Mud",
      },
    },
    {
      name: "Junction Detail",
      panel: "right",
      catLabel: {
        1: "Roundabout",
        2: "Mini roundabout",
        3: "T/staggered junction",
        5: "Slip road",
        6: "Crossroads",
        7: "More than four arms (not RAB)",
        8: "Private drive or entrance",
        9: "Other",
      },
    },
    {
      name: "Junction Control",
      panel: "right",
      catLabel: {
        1: "Authorized Person",
        2: "Traffic signal",
        3: "Stop sign",
        4: "Give way or uncontrolled",
      },
    },
    { name: "Casualties", panel: "middle" },
    { name: "Time->Hour()", panel: "middle" },

    { name: "Time", panel: "bottom", maxHeightRatio: 0.08 },
  ],
};
