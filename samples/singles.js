export var config = {
  //domID: "#demo_Browser",
  source: {
    gdocId: "1j8fVFP-jZdWB4MMcBIAO4Bi5OK2kWtrVdbnP7RHLfMI",
    name: "Singles",
  },
  summaries: [
    { name: "Genre", panel: "left" },
    { name: "Label", panel: "left", isComparable: false },
    { name: "Country", panel: "right", description: "Country of origin" },
    { name: "Sex", panel: "right" },
    { name: "Age", panel: "right" },
    { name: "Type", panel: "right" },
    { name: "Race", panel: "right" },
    {
      name: "Artist & Track",
      value: function () {
        return this["Artist(s)"] + " - " + this.Track;
      },
      panel: "none",
    },
  ],
  selections: {
    summary: "Genre",
    Compare_A: {
      id: "RnB",
    },
    Compare_B: {
      id: "Pop",
    },
    Compare_C: {
      id: "Rock",
    },
    Compare_D: {
      id: "Dance",
    },
  },
  recordDisplay: {
    viewAs: "list",
    textBy: "Artist & Track",
    sortBy: "Position",
    list_sortColWidth: 45,
    list_sortVizWidth: 0,
    list_sortInverse: true,
  },
};
