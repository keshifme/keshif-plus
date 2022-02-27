export var config = {
  recordName: "Countries",
  source: {
    fileType: "csv",
    dirPath: "./data/",
    name: "WDI",
    id: "Code",
  },
  onLoad: {
    Urbanization: "Urbanization->${DATETIME(%Y)}",
    "Life Expectancy": "Life Expectancy->${DATETIME(%Y)}",
    "GDP PerCapita": "GDP PerCapita->${DATETIME(%Y)}",
    "Population Density": "Population Density->${DATETIME(%Y)}",
    Population: "Population->${DATETIME(%Y)}",
  },
  summaries: [
    {
      name: "GDP PerCapita",
      type: "timeseries",
      unitName: "$",
      valueScaleType: "linear",
      metricFuncs: ["Avg"]
    },
    {
      name: "Urbanization",
      type: "timeseries",
      unitName: "%",
      valueScaleType: "linear",
      metricFuncs: ["Avg"]
    },
    {
      name: "Life Expectancy",
      type: "timeseries",
      valueScaleType: "linear",
      unitName: "yr",
      metricFuncs: ["Avg"]
    },
    {
      name: "Population",
      valueScaleType: "log",
      type: "timeseries",
      metricFuncs: ["Sum", "Avg"]
    },
    {
      name: "Population Density",
      valueScaleType: "log",
      unitName: "%",
      type: "timeseries",
      metricFuncs: ["Avg"]
    },
    {
      name: "Region",
      panel: "left",
      viewAs: "list",
      filter: { AND: ["Latin America & Caribbean"] },
    },
    {
      name: "Name",
      viewAs: "list",
    },
    {
      name: "Code",
      viewAs: "list",
    },
    {
      name: "Income Group",
      viewAs: "list",
      panel: "left",
    },
    {
      name: "_REGION",
      value: "Name",
      type: "recordGeo",
      recordGeo: "Map_World_Adm2"
    },
  ],
  panels: {
    left: {
      catBarWidth: 90,
      catLabelWidth: 175,
    },
  },
  recordDisplay: {
    viewAs: "timeSeries",
    textBy: "Name",
    sortBy: "GDP PerCapita->1984",
    scatterXBy: "Life Expectancy->1984",
    scatterYBy: "Urbanization->1984",
    colorBy: "Population->1984",
    // sizeBy: "Population->1984",
    timeSeriesBy: "Urbanization",
    colorTheme: "sequential",
    ts_ChangeVsTimeKey: "1965",
    currentTimeKey: "1984",
  },
};
