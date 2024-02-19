export var config = {
  barChartWidth: 100,
  leftPanelLabelWidth: 250,
  rightPanelLabelWidth: 250,
  source: {
    fileType: "csv",
    dirPath: "./data/",
    name: "Cars",
  },
  description:
    "<a href='http://lib.stat.cmu.edu/datasets/cars.data' target='_blank'>Data</a> from <a href='http://lib.stat.cmu.edu/datasets/' target='_blank'>StatLib @ CMU</a>",
  onLoad: { Year: "DATETIME(%Y)" },
  summaries: [
    {
      name: "Origin",
      catLabel: { 1: "American", 2: "European", 3: "Japanese", 4: "Mexican" },
      minAggrSize: 0,
      panel: "none",
      panel: "left"
    },
    { name: "Cylinders", catSortBy: "id", panel: "left", metricFuncs: ["Avg"] },
    { name: "MPG", unitName: "mpg", panel: "left", metricFuncs: ["Avg"] },
    { name: "Acceleration", description: "0 to 60 mph", unitName: "sec", metricFuncs: ["Avg"] },

    { name: "Engine Displacement", unitName: 'cu."', panel: "right", metricFuncs: ["Avg"] },
    { name: "Horsepower", unitName: "hp", panel: "right", metricFuncs: ["Avg"] },
    { name: "Weight", unitName: "lbs", panel: "right", metricFuncs: ["Avg"] },
    { name: "Year", panel: "bottom", maxHeightRatio: 0.2 },
  ],
  stackedCompare: true,
  selections: {
    summary: "Origin",
    Compare_A: { id: 1 },
    Compare_B: { id: 3 },
    Compare_C: { id: 2 },
  },
  recordDisplay: {
    viewAs: "list",
    textBy: "Name",
    sortBy: "MPG",
    scatterBy: "Acceleration",
    // recordView: function () {
    //   return this.Name + " (" + this.Year.getUTCFullYear() + ")";
    // },
    recordPointSize: 4.5,
    list_sortColWidth: 70,
    list_sortVizWidth: 60,
    list_sparklineVizWidth: 120,
    //colorTheme: "converge",
  },
};
