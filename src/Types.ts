// these imports are used for function signatures for typescript checks
import { Attrib_Content } from "./Attrib_Content";
import { Browser } from "./Browser";
import { Record } from "./Record";
import { DataTable } from "./DataTable";

export type IntervalT = number | Date;

export type d3Selection = any;

export type TableSpec = {
  name: string;
  id?: string;
  gdocId?: string;
  fileType?: string;
  dirPath?: string;
  fullURL?: string;
  onLoad?: ((this: DataTable) => boolean);
  postLoad?: ((this: DataTable) => boolean);
};

export type PanelSpec = {
  // Width in pixels
  catBarWidth?: number;
  // Width in pixels
  catLabelWidth?: number;
};

export type Filter_Interval_Spec<T extends IntervalT> = {
  min?: T;
  max?: T;
  // Default > not set
  // If set, it means the summary is filtered to only missing, or not missing
  missing?: "in" | "out";
};

export type RecordDisplayType =
  | "none"
  | "list"
  | "map"
  | "timeseries"
  | "scatter";

export type RecordVisCoding =
  | "text"
  | "textBrief"
  | "sort"
  | "scatterX"
  | "scatterY"
  | "size"
  | "color"
  | "timeSeries"
  | "geo"
  //| "link"
  ;

export type Filter_Categorical_Spec = {
  // id's of each categorical option filtered within the selected logic (AND, OR, NOT)
  AND?: string[];
  OR?: string[];
  NOT?: string[];

  // Default > not set
  // If set, it means the summary is filtered to only missing, or not missing
  missing?: "in" | "out";
};

type RecordIDSpec = string;

export type DropdownType = "SingleSelect" | "MultiSelect";

export type MetricFunc = "Sum" | "Avg";

export type MeasureFunc = "Sum" | "Avg" | "Count";

export type CompareType =
  | "Compare_A"
  | "Compare_B"
  | "Compare_C"
  | "Compare_D"
  | "Compare_E";

export type SelectType = CompareType | "Filter";

export type MeasureType = CompareType | "Active" | "Total" | "Other";

export type BlockType =
  | "categorical"
  | "timestamp"
  | "timeseries"
  | "numeric"
  | "content"
  | "setpair"
  | "recordGeo";

export type CatSortSpec =
  | "Active"
  | CompareType
  | "alphanumeric"
  | "id"
  | string[]
  | {
      preSort?: Function;
      valueFunc: Function;
    };

export type PanelName = "left" | "right" | "middle" | "bottom";

export type CatLabelSpec = { [key: string]: string };

export type SummaryCatView = "list" | "map" | "dropdown";

export type NumberRange = [number, number];

export type BlockSpec = {
  name: string;

  // Default: Not set
  // Docs: https://help.keshif.me/article/267-changing-attribute-descriptions
  description?: string;

  // Default: Auto-detected based on data type referred by name or value.
  // Info: Not needed for categorical or timestamp data fields
  type?: BlockType;

  // Notes: Timeseries summaries cannot be directly inserted as a summary into a panel.
  panel?: PanelName | "none";

  // Default: false (not collapsed)
  // Docs: https://help.keshif.me/article/184-opening-closing-charts
  // It does not apply to timeseries charts (since they cannot be inserted to dashboard)
  collapsed?: boolean;

  // Default: false
  // If set to true, hides this from attribute panel
  noNugget?: boolean;
};

export type BlockContentSpec = string | { youtube: string };

export type BlockSpec_Content = {
  content: BlockContentSpec[];

  maxHeight?: number;

  minHeight?: number;

  // The function to call on every time stepping action is called.
  onStep?: (this: Attrib_Content) => void;
};

export type SummarySpec = BlockSpec &
  BlockSpec_Content &
  MeasurableConfig &
  SummaryConfig &
  SummaryConfig_Categorical &
  SummaryConfig_CategoricalMulti &
  SummaryConfig_Interval &
  SummaryConfig_Numeric & 
  SummaryConfig_Geo;

export type LinearOrLog = "linear" | "log";

export type SummaryConfig = {
  // If not set, equas to "value";
  value?: string | ((this: Record, Array, any) => void);

  // Default: "fit"
  // Docs: https://help.keshif.me/article/228-adjusting-measure-axis-extent
  axisScaleType?: "fit" | "sync" | "full";

  // Default: "linear"
  // Docs: https://help.keshif.me/article/159-adjusting-measure-axis-scale-type-linear-log-for-aggregated-charts
  measureScaleType?: LinearOrLog;

  // Default: true
  isComparable?: boolean;

  // default: false
  skipConfig?: boolean
};

export type SummaryConfig_Categorical = {
  // { _key: _label } > Assigns category _key's (options/IDs) to new _label's.
  // Docs: https://help.keshif.me/article/120-changing-category-labels
  catLabel?: CatLabelSpec;

  // value in pixels (per category)
  // Docs: https://help.keshif.me/article/115-adjusting-bar-height-of-categorical-bar-charts
  barHeight?: number;

  // "Active"        > Sort by active data trend
  // "alphanumeric"  > Sort by category text
  // "Compare_X",    > Sort by specific compared data trend
  // []              >  Fixed order: Category id's or names, in the specific order of appearance,
  // Function & template strings > Advanced, not documented / stable
  // Docs: https://help.keshif.me/article/221-adjusting-category-sorting
  catSortBy?: CatSortSpec;

  // Default: false
  catSortInverse?: boolean;

  // Sample: "Map_Yemen_Adm4[UPPERCASE(*)]",
  catGeo?: string;

  // initial map view. [lat, long, zoom]
  mapInitView?: [number, number, number],
  mapConfig?: any, // TODO: specify

  // Default: "list"
  // Docs: https://help.keshif.me/article/118-visualizing-categorical-data-bar-charts-maps
  // Dropdown is not stable/ finalized. Not an option via UI.
  viewAs?: SummaryCatView;

  // Default: "SingleSelect"
  // Only applicable if viewAs is "dropdown"
  dropdown_type?: DropdownType;

  //  Default > false
  // Not stable / final
  // Only applicable when viewAs is "map"
  invertedColorTheme?: boolean;

  filter?: Filter_Categorical_Spec;

  // Not stable / final API
  minAggrSize?: number;
} & SummaryConfig_CategoricalMulti;

export type SummaryConfig_CategoricalMulti = {
  // Default: false
  showSetMatrix?: boolean;

  // Default: true
  splitOnSelfCompare?: boolean;
};

export type SummaryConfig_Interval = {
  // Default: true
  // Line-charts (for timestamp data) are also considered "histograms"
  // Docs: https://help.keshif.me/article/253-selecting-visible-interval-charts-histograms-line-charts-percentiles
  showHistogram?: boolean;

  // Value: Clamped between 0.08 and 1.50
  // Default: height_MaxRatioDefault (0.3)
  // Docs: https://help.keshif.me/article/131-adjusting-bin-height-of-interval-charts
  maxHeightRatio?: number;

  // Value: Clamped between 45 and 180
  // Default: width_HistBinDefault (45)
  // Docs: https://help.keshif.me/article/132-adjusting-bin-ranges-in-interval-charts
  optimumBinWidth?: number;

  // Docs: https://help.keshif.me/article/168-filtering-data-using-a-numeric-range
  // Docs: https://help.keshif.me/article/264-filtering-data-using-a-time-range
  filter?: Filter_Interval_Spec<number | Date>;

  // Default: false
  // Only applicable if "filter" is set for the interval summary
  // Docs: https://help.keshif.me/article/133-zooming-in-out-of-interval-charts
  zoomed?: boolean;
};

export type SummaryConfig_Numeric = {
  // Default: false
  // Docs: https://help.keshif.me/article/135-using-percentile-charts-for-analyzing-numeric-data-distributions
  showPercentiles?: boolean;

  // Default: "auto"
  // Docs: https://help.keshif.me/article/134-using-a-linear-or-log-scale-for-binning-numeric-data
  valueScaleType?: "auto" | LinearOrLog;

  // Default::  false
  // Sets zero values to null/missing/no-value/
  // Useful to enable "log" scale if the data has some zero values.
  // (Log scale is disabled if data includes zero or negative values.)
  skipZero?: boolean;
};

export type SummaryConfig_Geo = {
  recordGeo?: string;
}

export type MeasurableConfig = {
  // Default: defaultMetricFuncs - ['Sum','Avg']
  metricFuncs?: MetricFunc[];

  // Default: not set
  // Docs: https://help.keshif.me/article/177-setting-unit-name-of-numeric-data
  unitName?: string;

  // The value domain is auto-set by data range.
  // Set this to specify a potentially larger and FIXED scale
  valueDomain?: NumberRange;
};

export type RecordDisplaySpec_General = {};

export type RecordDisplaySpec_Scatter = {
  scatterXBy?: string;
  scatterYBy?: string;

  // Default: "linear"
  scatter_xAxisScale: LinearOrLog;

  // Default: "linear"
  scatter_yAxisScale: LinearOrLog;

  // Default: true
  scatter_ShowTrails: boolean;
};

export type RecordDisplaySpec_Timeseries = {
  // general string must be a summary name. Summary name ust point to a timeseries-attribute
  timeSeriesBy?: string;

  // Default: "Value"
  // Docs: https://help.keshif.me/article/261-selecting-time-series-plot-type
  timeSeriesSelectMode?: "record" | "time";

  // Default: false
  fitValueAxis?: boolean;

  // If "limited", creates slope chart
  ts_timeKeysStep?: "all" | "limited";

  // TODO: Document these features
  // currentTimeKey?: any;
  timeSeriesChangeVsTimeKey?: string;
  // timeSeriesAnnotations?: any;
};

export type RecordDisplaySpec_List = {
  // general string must be a summary name, and that summary must be numeric or timeseries
  sortBy?: string;

  list_gridRecordWidth?: number;
  list_sparklineVizWidth?: number;
  list_sortVizWidth?: number;
  list_sortColWidth?: number;

  // Default: false
  list_sortInverse?: boolean;

  // Default: "List"
  // Docs: https://help.keshif.me/article/269-selecting-record-listing-type-list-grid
  list_ViewType?: "List" | "Grid";

  // Default: "dynamic"
  list_sortVizRange?: "static" | "dynamic";

  // Default: true
  list_showRank?: boolean;

  // Default: maxVisibleItems_Default
  maxVisibleItems_Default?: boolean;
};

export type RecordDisplaySpec_Map = {
  // Default: false;
  map_NoFitBounds: boolean;

  // Default: Adjusts initial view to show all map - fit-to-view
  // First two numbers are map center, third is the zoom factor. See leaflet docs.
  mapInitView: [number, number, number];

  pointClusterRadius?: number;
};

export type DashboardMode =
  | "Explore"
  | "Author"
  | "Adjust"
  | "Capture"
  | "Save";

export type AggrSpec_Categorical = {
  // If categorical summary: The selected category id (not label)
  id: string;
};
export type AggrSpec_Interval = {
  min: IntervalT;
  max: IntervalT;
  id?: never;
};

export type AggrSpec = AggrSpec_Categorical & AggrSpec_Interval;

export type RecordDetailSpec = {
  recordInDetail?: RecordIDSpec;

  // List of attribute names to show in record detail - in given order
  recordDetailAttribs?: string[];

  onRecordClose?: (this: Browser) => void;

  // returns HTML string to render
  onRecordView?: (this: any, Record) => string;
}

export type ConfigSpec = {
  domID?: string; // Default: "#kshfDashboard"

  recordName?: string; // Default: Name of first data source

  // Description of the dashboard
  description?: string;

  source: TableSpec[];

  onLoad?:
    | {
        [index: string]: string;
      }
    | {
        callback: (this: Browser) => void;
      }

  onReady?: (this: Browser) => void;

  // Default: "Explore"
  // Docs: https://help.keshif.me/article/230-overview-of-dashboard-modes
  dashboardMode?: DashboardMode;

  // Default: "absolute"
  // Docs: https://help.keshif.me/article/236-using-breakdown-modes-on-group-comparisons
  breakdownMode?: "absolute" | "dependent" | "relative" | "total";

  // Default: undefined (Count)
  metric?: {
    // name of a nummeric sumary
    summary: string;
    type: "Sum" | "Avg" | "Count";
  };

  // Default: undefined - no selection
  // Docs: https://help.keshif.me/article/195-adding-record-group-comparisons (Quick compare)
  selections?: {
    // Name of the selected summary
    summary: string;

    // Default: false
    // If set to true, overwrites any Compare_X setting, and sets auto/quick - compare
    auto?: boolean;

    // TODO: Extend this to cover Compare_B ... Commpare_E (5 comparisons)
    Compare_A?: AggrSpec;
    Compare_B?: AggrSpec;
    Compare_C?: AggrSpec;
    Compare_D?: AggrSpec;
    Compare_E?: AggrSpec;
  };

  // Default: "chained"
  // Docs: https://help.keshif.me/article/175-using-chained-vs-single-filtering-modes
  filteringMode?: "single" | "chained";

  // Default: true
  // Docs: https://help.keshif.me/article/229-viewing-hiding-whole-distributions
  showWholeAggr?: boolean;

  // Default: true
  // Docs: https://help.keshif.me/article/229-viewing-hiding-whole-distributions
  stackedCompare?: boolean;

  // Default: true
  mouseOverCompare?: boolean;

  // Value: Width in pixels
  // Default: width_AttribPanelDefault (250px)
  // Docs: https://help.keshif.me/article/185-adjusting-chart-panel-width
  attribPanelWidth?: number;

  colorTheme?: {
    // Default: "YlGnBu"
    sequential?: string;
    // Default: "Spectral"
    diverging?: string;
  };

  // TODO:
  panels?: {
    left?: PanelSpec;
    right?: PanelSpec;
    middle?: PanelSpec;
    bottom?: PanelSpec;
    default?: PanelSpec;
  };

  summaries?: SummarySpec[];

  recordDisplay?: RecordDisplaySpec_Scatter &
    RecordDisplaySpec_Timeseries &
    RecordDisplaySpec_List &
    RecordDisplaySpec_Map &
    {
      // Default: "none"
      viewAs?: RecordDisplayType;

      // "_measure_" notes active aggregate measure summary
      // general string must be a summary name, and that summary must be numeric or timeseries
      colorBy?: string | "_measure_";
      sizeBy?: string | "_measure_";

      // general string must be a summary name. Summary name ust point to a geo-attribute
      geoBy?: string;
      // general string must be a summary name. Summary name ust point to a categorical-attribute
      textBy?: string;
      textBriefBy?: string;
      // general string must be a summary name. Summary name ust point to a ?-attribute
      linkBy?: string;

      scatterXBy?: string;
      scatterYBy?: string;

      // Default: defaultRecordPointSize
      // Value: between 0.5 and maxRecordPointSize
      recordPointSize?: number;

      // default: false
      colorInvert?: boolean;

      // Value: Each string is an ID of an individually filtered-out record
      filter?: RecordIDSpec[];
    };
} & RecordDetailSpec;
