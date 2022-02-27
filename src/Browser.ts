import DOMPurify from "dompurify/dist/purify.es";

import { select, pointer } from "./d3_select";
import { rgb } from "d3-color";
import { max } from "d3-array";
import { scaleLinear } from "d3-scale";
import * as d3Chromatic from "d3-scale-chromatic";

import { RecordDisplay } from "./RecordDisplay";

import {
  Aggregate_Interval,
  Aggregate_Interval_Numeric,
} from "./Aggregate_Interval";
import { Aggregate } from "./Aggregate";

import { loadMapStandards } from "./MapStandards";

import { ConfigPanel } from "./UI/ConfigPanel";
import { BreadCrumb } from "./UI/Breadcrumb";
import { MenuOpts } from "./UI/MenuOpts";
import { Modal } from "./UI/Modal";
import { Panel } from "./UI/Panel";

import { Config } from "./Config";
import { i18n } from "./i18n";
import { Util } from "./Util";
import { Base } from "./Base";

// Standarad fetch and googlesheet loaders are included by default.
import { DataLoader_FetchURL } from "./DataLoader/FetchURL";
import { DataLoader_GoogleSheets } from "./DataLoader/GoogleSheets";
import { DataTable } from "./DataTable";

import { Filter_Base } from "./Filter";

import { Attrib } from "./Attrib";
import { Record } from "./Record";
import { Block } from "./Block";

import { Attrib_Categorical } from "./Attrib_Categorical";
import { Attrib_Timestamp } from "./Attrib_Timestamp";
import { Attrib_RecordGeo } from "./Attrib_RecordGeo";
import { Attrib_Interval } from "./Attrib_Interval";
import { Attrib_Numeric } from "./Attrib_Numeric";
import { Attrib_Content } from "./Attrib_Content";
import { AttribTemplate } from "./AttribTemplate";

import {
  BlockType,
  CompareType,
  ConfigSpec,
  DashboardMode,
  IntervalT,
  MeasureFunc,
  MeasureType,
  PanelName,
  RecordDisplayType,
  SummarySpec,
} from "./Types";

import { Attrib_Timeseries } from "./Attrib_Timeseries";

import { TimeSeriesData } from "./TimeSeriesData";

import { Block_Categorical } from "./Block_Categorical";
import { RecordDetailPopup } from "./UI/RecordDetailsPopup";

const d3 = {
  select,
  pointer,
  rgb,
  max,
  scaleLinear,
  ...d3Chromatic, // all values in chromatic module
};

export type ColorThemeType = "sequential" | "diverging";

export type BreakdownType = "absolute" | "dependent" | "relative" | "total";

type DataTypeDescr = {
  name: string;
  icon: string;
  member: (a: Attrib) => boolean;
  active: boolean;
};

/** 
    Detected transformations:
    > STR
    > JSON
    > POSITIVE
    > DATETIME
    > DELETE
    > LAT_LONG(lat,long)
    > MULTIVAL(a;b;c;d;...)
    > ${DATETIME}
    > SPLIT
   */
function applyPreProc(_key: string, _transform: string, recordList: Record[]) {
  var keySequence = _key.split("->");

  var keyIndex = keySequence[keySequence.length - 1];
  var keyHostFunc = (v) => {
    for (var i = 0; i < keySequence.length - 1; i++) {
      v = v[keySequence[i]];
      if (v == null) return;
    }
    return v;
  };

  if (_transform === "DELETE()") {
    recordList.forEach((r) => {
      var host = keyHostFunc(r.data);
      if (host) delete host[keyIndex];
    });
    return;
  }

  let transformFunc: Function = null;

  /* jshint ignore:start */
  var isTimeseries = RegExp(/(.+)->\$\{(.+)\}/).exec(_transform);
  var isDateTime = RegExp("DATETIME\\((.+)\\)").exec(_transform);
  var isMultiVal = RegExp("MULTIVAL\\((.+)\\)").exec(_transform);
  var isSplit = RegExp("SPLIT\\((.+)\\)").exec(_transform);
  var isLatLong = RegExp("LAT_LONG\\((.+),(.+)\\)").exec(_transform);
  /* jshint ignore:end */

  if (_transform === "STR()") {
    // convert value to string
    transformFunc = (v) => (v == null ? null : "" + v);
    //
  } else if (_transform === "JSON()") {
    // parse value as JSON string
    transformFunc = (v) => (v == null ? null : JSON.parse(v));
    //
  } else if (_transform === "POSITIVE()") {
    // keep only positive values
    transformFunc = (v) => (v && typeof v === "number" && v > 0 ? v : null);
    //
  } else if (!isTimeseries && isDateTime && isDateTime.length > 1) {
    // parse the date given a string
    var _timeParse = Util.getTimeParseFunc(isDateTime[1]);
    transformFunc = (v) => (v == null ? null : _timeParse(v));
    //
  } else if (isSplit && isSplit.length > 1) {
    // split values in a string into multiple string
    var splitExpr = RegExp(isSplit[1]);

    transformFunc = (v): string[] => {
      if (v == null) return null;
      if (typeof v === "number") {
        return ["" + v];
      }
      if (Array.isArray(v)) {
        if (v.length === 1) {
          v = v[0]; // try to split the first/only element
        } else {
          return v;
        }
      }

      // split, trim and cleanup
      return v
        .split(splitExpr)
        .map((x) => x.trim())
        .filter((x) => x !== "");
    };
  } else if (isMultiVal && isMultiVal.length > 1) {
    // merge data from multiple columns
    var splitExpr = RegExp("\\s*;\\s*");

    var colNames = isMultiVal[1]
      .split(splitExpr)
      .map((x) => x.trim())
      .filter((x) => x !== "");

    if (colNames.length >= 2) {
      transformFunc = (v, r) => {
        var _return = [];
        colNames.forEach((c) => {
          if (r[c]) {
            _return.push(r[c]);
            delete r[c];
          }
        });
        return _return;
      };
    }
  } else if (isTimeseries && isTimeseries.length > 1) {
    // prepare timeseries structure
    var _isDateTime = RegExp("DATETIME\\((.+)\\)").exec(isTimeseries[2]);

    if (_isDateTime && _isDateTime.length > 1) {
      var __timeParse = Util.getTimeParseFunc(_isDateTime[1]);

      var valueKey = null;
      var hasValueKey = RegExp("::(.+)").exec(isTimeseries[2]);
      if (hasValueKey && hasValueKey.length > 1) {
        valueKey = hasValueKey[1];
      }

      transformFunc = (v) => {
        if (v == null) return null;

        let _ts = new TimeSeriesData();

        for (var timeKey in v) {
          var _value = v[timeKey];
          if (typeof _value !== "number") {
            continue; // Must be numeric value
          }
          var _time = __timeParse(timeKey.trim());
          if (_time == null) {
            continue; // cannot parse the string key to date object
          }
          _ts.addTimeData({
            _time: _time,
            _time_src: timeKey,
            _value: valueKey ? _value[valueKey] : _value,
          });
        }

        // merge timeseries data with object
        return _ts;
      };
    }
  }

  if (transformFunc) {
    recordList.forEach((r) => {
      var host = keyHostFunc(r.data);
      if (host == null) return;
      try {
        host[keyIndex] = transformFunc(host[keyIndex], r.data);
      } catch (e) {
        console.log("onLoad _transform error: " + e);
      }
    });
    return;
  }

  if (isLatLong && isLatLong.length > 1) {
    var latAttrib = isLatLong[1];
    var lonAttrib = isLatLong[2];
    recordList.forEach((r) => {
      var host = keyHostFunc(r.data);
      if (!host) return;
      var _lat = r.data[latAttrib];
      var _lng = r.data[lonAttrib];
      if (
        _lat &&
        _lng &&
        typeof _lat === "number" &&
        typeof _lng === "number"
      ) {
        host[keyIndex] = {
          type: "Point",
          coordinates: [_lng, _lat],
        };
      }
      delete r.data[latAttrib];
      delete r.data[lonAttrib];
    });
    return;
  }
}

export class Browser {
  records: Record[] = [];

  recordName: string = "";

  idSummaryName: string = null;
  primaryTableName: string = null;

  recordDisplay: RecordDisplay = null;
  viewRecAs: RecordDisplayType = "none";

  recordDetailsPopup: RecordDetailPopup;

  allRecordsAggr: Aggregate = null;
  allAggregates: Aggregate[] = [];

  public measureSummary: Config<Attrib_Numeric>;
  public breakdownMode: Config<BreakdownType>;
  public dashboardMode: Config<DashboardMode>;
  public mouseOverCompare: Config<boolean>;
  public measureFunc: Config<MeasureFunc>;
  public stackedCompare: Config<boolean>;
  public recordChartType: Config<RecordDisplayType>;
  public showWholeAggr: Config<boolean>;
  public filteringMode: Config<string>;

  private configs: { [key: string]: Config<any> } = {};

  // TODO: review & improve
  options: ConfigSpec;

  private dashboardConfigPanel: ConfigPanel;

  private domID: string;

  public DOM: { [index: string]: any } = {};

  panels: { [key in PanelName]?: Panel } = {};

  flexAggrs: { [key in CompareType]?: Aggregate_Interval<any> } = {};

  addedCompare: boolean = false;

  // ********************************************************************
  // Attributes
  // ********************************************************************

  attribs: Attrib[] = [];

  attribCounter = 0;

  get attribsInDashboard(): Attrib[] {
    return this.attribs.filter((attrib) => attrib.block?.inDashboard);
  }
  // always in dashboard
  get blocks(): Block[] {
    return this.attribsInDashboard.map((attrib) => attrib.block);
  }
  // query by attribute name
  attribWithName(name: string): Attrib {
    return (
      this.attribs.find((attrib) => {
        return attrib.attribName === name || attrib.template.str === name;
      }) || null
    );
  }
  get _attribs() {
    var r = {};
    this.attribs.forEach((attrib) => {
      r[attrib.attribName] = attrib;
      if (attrib.template.str) {
        r[attrib.template.str] = attrib;
      }
    });
    return r;
  }

  // used to render attribute list hierarchy
  private attribs_by_group = {};

  // ********************************************************************
  //
  // ********************************************************************

  finalized: boolean = false;

  // the shared color scape options in the browser (themes)
  colorTheme: any; // TODO
  // active color theme
  activeColorTheme: ColorThemeType = "sequential";

  preventAxisScaleTransition: boolean = true;

  onLoad: {
    callback?: (this: Browser) => void;
    main: { [index: string]: string };
  } = { callback: null, main: {} };

  onModeChange: () => void = null;

  readonly dataTypeDescrs: DataTypeDescr[] = [
    {
      name: "Categorical",
      icon: "far fa-font",
      member: (attrib: Attrib) => attrib instanceof Attrib_Categorical,
      active: false,
    },
    {
      name: "MultiValued",
      icon: "far fa-tags",
      member: (attrib: Attrib) =>
        attrib instanceof Attrib_Categorical && attrib.isMultiValued,
      active: false,
    },
    {
      name: "Numeric",
      icon: "far fa-hashtag",
      member: (attrib: Attrib) => attrib instanceof Attrib_Numeric,
      active: false,
    },
    {
      name: "Timestamp",
      icon: "far fa-calendar-day",
      member: (attrib: Attrib) => attrib instanceof Attrib_Timestamp,
      active: false,
    },
    {
      name: "Timeseries",
      icon: "far fa-chart-line",
      member: (attrib: Attrib) => attrib instanceof Attrib_Timeseries,
      active: false,
    },
    {
      name: "Location",
      icon: "far fa-map-marker",
      member: (attrib) =>
        attrib instanceof Attrib_RecordGeo ||
        (attrib instanceof Attrib_Categorical && attrib.hasMap()),
      active: false,
    },
    {
      name: "Unique",
      icon: "far fa-fingerprint",
      member: (attrib: Attrib) => attrib.uniqueCategories(),
      active: false,
    },
    {
      name: "Function",
      icon: "fal fa-function",
      member: (attrib: Attrib) => !attrib.template.str,
      active: false,
    },
    {
      name: "Content",
      icon: "fa fa-file-alt",
      member: (attrib: Attrib) => attrib instanceof Attrib_Content,
      active: false,
    },
  ];

  constructor(options: ConfigSpec) {
    "use strict";
    this.options = options;

    // TODO: Cannot do await here since this is constructor
    // but it'd be nice to wait until everything is loaded
    Base.loadResources();

    this.domID = this.options.domID || Base.defaultDOM;

    // BASIC OPTIONS

    Base.Compare_List.forEach((cT) => {
      this.lockedCompare[cT] = false;
      this.selectedAggrs[cT] = null;
      this.crumbs[cT] = new BreadCrumb(this, cT);
    });

    this.measureFunc = new Config<MeasureFunc>({
      parent: this,
      cfgTitle: "Measure Function",
      cfgClass: "measureFunc",
      iconClass: "fa fa-cubes",
      UISeperator: {
        title: "Analytics",
      },
      default: "Count",
      tooltip: "The metric that aggregates values in each category / range.",
      helparticle: "5e9516452c7d3a7e9aeae06e",
      itemOptions: [
        // TODO: implement deactive / empty options
        // see: addMeasureOptions_Func
        { name: "measure_Count", value: "Count" },
        {
          name: "measure_Sum",
          value: "Sum",
          activeWhen: () => this.getMeasurableSummaries("Sum").length > 0,
        },
        {
          name: "measure_Avg",
          value: "Avg",
          activeWhen: () => this.getMeasurableSummaries("Avg").length > 0,
        },
      ],
      onRefresh: (cfg) => {
        // Update text
        this.DOM.metricFuncText
          .select(".measureFuncText")
          .html(i18n["measure_" + cfg.val]);
        // Update select box
        this.addMeasureOptions_Func(
          this.DOM.metricFuncText.select(".measureFuncOptions")
        );
      },
      preSet: (v) => {
        if (v === "Count") return v;
        var attrib = this.getMeasurableSummaries(v)[0];
        if (!attrib) {
          throw `No numeric data attribute supports ${v} measure function.`;
        }
        if (this.measureSummary && !this.measureSummary?.val) {
          // This will
          this.measureSummary.val = attrib as Attrib_Numeric;
          // calls refreshMeasureMetric
        }
        return v;
      },
      onSet: () => {
        this.refreshMeasureMetric();
      },
    });

    this.measureSummary = new Config<Attrib_Numeric>({
      parent: this,
      cfgTitle: "Measure Attribute",
      cfgClass: "measureSummary",
      iconClass: "far fa-cube",
      default: null, // not set
      helparticle: "5e9516452c7d3a7e9aeae06e",
      onDOM: (DOM) => {
        var _ = DOM.root.select(".configItem_Options");
        DOM.mainSelect = _.append("select").attr("class", "mainSelect");
        DOM.timeKeys = _.append("select")
          .attr("class", "timeKeys")
          .on("input", (event) => {
            var selectedKey = event.currentTarget.selectedOptions[0].__data__;
            this.measureSummary.val =
              this.measureSummary.val.timeseriesParent.getTimepointSummary(
                selectedKey
              );
          });
      },
      onRefresh: (cfg) => {
        if (!cfg._value) return; // nothing to do!
        var attrib = this.measureSummary.val;
        this.addMeasureOptions_Summaries(cfg.DOM.mainSelect);

        this.addMeasureOptions_Summaries(
          this.DOM.metricFuncText.select("select.measureSummary")
        );

        // If measureSummary is timeseries, we need to show the keys
        var withKeys = attrib.timeseriesParent;
        cfg.DOM.timeKeys.classed("hide", !withKeys);

        this.DOM.metricFuncText
          .select(".timeKeys.metricOptionWrapper")
          .classed("hide", !withKeys);
        this.DOM.metricFuncText
          .select(".measureSummaryName")
          .html((withKeys ? attrib.timeseriesParent : attrib).attribNameHTML);

        if (withKeys) {
          this.addMeasureOptions_Keys(cfg.DOM.timeKeys);
          this.addMeasureOptions_Keys(
            this.DOM.metricFuncText.select("select.timeKeys")
          );
          this.DOM.metricFuncText
            .select(".timeKeyText")
            .html(attrib.timeKey._time_src);
        }
      },
      preSet: (v) => {
        var attrib: Attrib = v;
        if (typeof attrib === "string") {
          attrib = this.attribWithName(v);
          if (!attrib) attrib = this.createAttrib(v);
        }

        if (attrib instanceof Attrib_Timeseries) {
          // First, try to use the timeKey of current measure attrib
          attrib.initializeAggregates(); // before this, timeKeys is not computed.
          var key =
            this.measureSummary.val?.timeKey ||
            this.recordDisplay.currentTimeKey.val ||
            attrib.timeKeys[attrib.timeKeys.length - 1];
          attrib = attrib.getTimepointSummary(key);
        }

        if (!attrib || !(attrib instanceof Attrib_Numeric)) return; // not a valid value

        // make sure attrib caches are initialized...
        attrib.initializeAggregates();

        return attrib; // allright
      },
      onSet: (v) => {
        if (!v) return;

        if (this.measureFunc_Count) return; // nothing to do...

        this.refreshMeasureMetric();
      },
    });

    this.breakdownMode = new Config<BreakdownType>({
      parent: this,
      cfgTitle: "Breakdown",
      cfgClass: "breakdownMode",
      iconClass: "far fa-percent",
      default: "absolute",
      helparticle: "5e89445604286364bc97d5eb",
      tooltip: `How to compute and compare data groups`,
      itemOptions: [
        { name: "# Absolute", value: "absolute" },
        { name: "% of Compared", value: "dependent" },
        { name: "% of Groups", value: "relative" },
        { name: "% of All", value: "total" },
      ],
      forcedValue: () => {
        if (!this.measureWithPositiveValues()) return "absolute";
      },
      preSet: (v) => {
        if (v === false) v = "absolute";
        if (v === true) v = "relative";
        v = v.toLowerCase();

        if (v !== "absolute" && this.measureFunc_Avg) {
          throw `You cannot analyze data by ${i18n.DialogComparisonSelection} when<br>
            using <i>average</i> as aggregation function for <i>${this.measureSummary.val.attribName}</i>.`;
        }
        if (v !== "absolute" && this.measureSumWithNegativeValues()) {
          throw i18n.DialogCompareForRelative;
        }

        return v;
      },
      onSet: (v) => {
        this.preventAxisScaleTransition = true;
        this.addedCompare = false;
        this.attribsInDashboard.forEach((attrib) => {
          attrib.axisScaleType.val = v === "relative" ? "full" : "fit";
          attrib.refreshScale_Measure();
        });
        this.refreshAnalytics();
        this.preventAxisScaleTransition = false;
      },
    });

    this.stackedCompare = new Config<boolean>({
      parent: this,
      cfgTitle: "GroupView",
      cfgClass: "stackedCompare",
      iconClass: "CompareModeIcon", // will add sub-elements to this
      UISeperator: {
        title: "Visualization",
      },
      default: true,
      helparticle: "5e88ff692c7d3a7e9aea6475",
      tooltip: `The comparison view mode<br><br>
        <b>Side-by-side</b>: Compare on shared baseline<br><br>
        <b>Stacked</b>: Compare on stacked baseline`,
      itemOptions: [
        { name: "SideBySide", value: false },
        { name: "Stacked", value: true },
      ],
      onDOM: (DOM) => {
        DOM.root
          .select(".CompareModeIcon")
          .selectAll("div")
          .data([0, 1, 2])
          .enter()
          .append("div")
          .attr("class", "CompareModeIcon-block");
      },
      forcedValue: () => {
        if (this.dependentBreakdown) {
          return false;
        }

        if (this.relativeBreakdown) {
          if (!this.comparedAttrib) return false;
          return !this.isComparedSummaryMultiValued(); // stack if it's not multi-valued
        }

        if (this.totalBreakdown) {
          if (!this.comparedAttrib) return false;
          if (this.isComparedSummaryMultiValued()) return false;
        }

        // absoluteBreakdown from now on

        // detect cases when you cannot stack
        if (this.comparedAttrib && this.isComparedSummaryMultiValued())
          return false;
        if (!this.measureWithPositiveValues()) return false;
      },
      preSet: (v) => {
        if (v !== true && v !== false) return; // not valid input

        if (v && this.comparedAttrib && this.isComparedSummaryMultiValued()) {
          throw i18n.DialogStackedMultiValue(this.comparedAttrib.attribName);
        }
        if (
          !v &&
          this.comparedAttrib &&
          !this.isComparedSummaryMultiValued() &&
          this.relativeBreakdown
        ) {
          throw i18n.DialogSideBySideSingleValue(
            this.comparedAttrib.attribName
          );
        }
        if (v && this.measureFunc_Avg) {
          throw (
            i18n.DialogStackedCharts +
            " cannot be used with <i>average</i> measure function."
          );
        }
        if (v && this.dependentBreakdown) {
          throw (
            i18n.DialogStackedCharts +
            " cannot be used with " +
            i18n.DialogDependentBreakdown
          );
        }
        if (v && this.measureSumWithNegativeValues()) {
          throw (
            i18n.DialogStackedCharts +
            " cannot be used with measuring totals with negative values."
          );
        }

        return v;
      },
      onSet: () => {
        this.attribsInDashboard.forEach((attrib) =>
          attrib.refreshScale_Measure()
        );
        this.refreshAnalytics();
      },
    });

    this.showWholeAggr = new Config<boolean>({
      parent: this,
      cfgTitle: "Whole Distribution",
      cfgClass: "showWholeAggr",
      iconClass: "fa fa-square", // will add sub-elements to this
      default: true,
      tooltip: `When you have two or more compare selections, 
                you can choose to show the whole value of the aggreagates.`,
      helparticle: "5e893d7a2c7d3a7e9aea656f",
      itemOptions: [
        { name: "Show", value: true },
        { name: "Hide", value: false },
      ],
      forcedValue: () => {
        if (this.activeComparisonsCount === 0) return true;

        if (this.dependentBreakdown) {
          return false;
        }

        if (this.relativeBreakdown) {
          if (!this.comparedAttrib) return false;
          return !this.isComparedSummaryMultiValued();
        }

        if (this.totalBreakdown) {
          if (!this.comparedAttrib) return false;
          return;
          //if(this.comparedSummary.isMultiValued) return false;
        }

        // of-total or absolute breakdown, with comparisons

        if (this.stackedCompare.val) {
          var totalOfCompared = this.activeComparisons.reduce((accum, val) => {
            if (this.selectedAggrs[val]) {
              return accum + this.selectedAggrs[val][val].measure;
            }
            return accum;
          }, 0);

          if (totalOfCompared === this.allRecordsAggr.measure("Active"))
            return false;
        }

        if (!this.measureWithPositiveValues()) return false;
      },
      onSet: () => {
        this.refreshAnalytics();
      },
    });

    this.filteringMode = new Config<string>({
      parent: this,
      cfgTitle: "Filtering",
      cfgClass: "filteringMode",
      iconClass: "fal fa-filter", // will add sub-elements to this
      UISeperator: {
        title: "Selections",
      },
      default: "chained",
      tooltip: `<b>Combined</b> allows combining multiple filters together<br><br>
        <b>Single</b> forces to have at most one active filter.`,
      helparticle: "5e88eff404286364bc97d459",
      itemOptions: [
        { name: "Chained", value: "chained" },
        { name: "Single", value: "single" },
      ],
      preSet: (v) => {
        v = v.toLowerCase();
        if (v === "combined") v = "chained";
        return v;
      },
      onSet: (v) => {
        if (v === "single" && this.numOfActiveFilters > 1) {
          this.clearFilters_All(this.filters.find((_) => _.isFiltered)); // remove our all but one
        }
      },
    });

    this.mouseOverCompare = new Config<boolean>({
      parent: this,
      cfgTitle: "Hover Highlight",
      cfgClass: "mouseOverCompare",
      iconClass: "fal fa-mouse-pointer", // will add sub-elements to this
      default: true,
      helparticle: "5e8905c52c7d3a7e9aea6489",
      itemOptions: [
        { name: "Enabled", value: true },
        { name: "Disabled", value: false },
      ],
    });

    this.recordChartType = new Config<RecordDisplayType>({
      parent: this,
      cfgTitle: "Record Chart Type",
      cfgClass: "recordChartType",
      iconClass: "fal fa-bullseye", // will add sub-elements to this
      UISeperator: {
        title: "Record Chart",
      },
      default: "none",
      helparticle: "5eadcca72c7d3a5ea54a59e9",
      noExport: true,
      itemOptions: [
        { name: "None", value: "none" },
        {
          name: "ListButton",
          value: "list",
          activeWhen: () => true, // always visible
        },
        {
          name: "MapButton",
          value: "map",
          activeWhen: () => {
            return this.recordDisplay?.getRecordGeoAttributes().length > 0;
          },
        },
        {
          name: "TimeSeriesButton",
          value: "timeseries",
          activeWhen: () => {
            if (this.records?.length < 2) return false;
            return (
              this.recordDisplay.getAttribOptions_UI("timeSeries").length > 0
            );
          },
        },
        {
          name: "ScatterButton",
          value: "scatter",
          activeWhen: () => {
            if (this.records?.length < 5) return false;
            return (
              this.recordDisplay.getAttribOptions_UI("scatterX").length > 1
            );
          },
        },
      ],

      preSet: (v) => {
        return v.toLowerCase();
      },

      onSet: async (v: RecordDisplayType, obj) => {
        if (!this.records) return; // data not loaded yet
        if (!this.recordDisplay) return;

        try {
          var _type = v;

          if (this.records.length > 5000 && !["list", "none"].includes(_type)) {
            await Modal.confirm(
              "<div style='text-align:center;''>There are more than 2,000 records.<br>" +
                `The ${_type} chart will be crowded and potentially slow.<br><Br>` +
                `Are you sure you want to change to ${_type} chart?</div>`,
              "Change chart type"
            );
          }

          if (_type === "map") {
            if (!this.recordDisplay.config.geo) {
              var _ = this.recordDisplay.getRecordGeoAttributes()[0];
              if (!_) throw "Geo attribute not found";
              this.recordDisplay.config.geo = _.attribName;
            }
          }

          // setting the css style here so that the UI can prepare the layout
          this.DOM.root?.attr("recordChartType", _type);

          if (_type === "none") {
            this.recordDisplay.View = null;
            //
          } else {
            await this.recordDisplay.setView(_type);
          }

          // now, the chart can be considered "active"
          this.viewRecAs = _type;

          this.refreshIsEmpty();

          this.recordDisplay.recordConfigPanel.hide();

          if (_type !== "none") {
            this.recordDisplay.refreshViewAsOptions();
          }

          if (this.recordDisplay.View) {
            this.recordDisplay.View.initView_DOM();

            this.recordDisplay.View.initView();

            this.recordDisplay.View.initialized = true;

            this.recordDisplay.View?.updateRecordVisibility();

            this.recordDisplay.refreshWidth();
            this.recordDisplay.View.refreshViewSize(10);

            this.updateLayout_Height();
          }
        } catch (e) {
          console.log(e);
          this.recordChartType.val = this.viewRecAs;
        }
      },
    });

    this.dashboardMode = new Config<DashboardMode>({
      parent: this,
      cfgTitle: "Dashboard Mode",
      cfgClass: "dashboardMode",
      iconClass: "fa fa-wrench", // temporary
      UI: { disabled: true },
      default: "Explore",
      helparticle: "5e8943d504286364bc97d5e6",
      itemOptions: [
        { name: "Explore", value: "Explore" },
        { name: "Author", value: "Author" },
        { name: "Adjust", value: "Adjust" },
        { name: "Capture", value: "Capture" },
        { name: "Save", value: "Save" },
      ],
      preSet: (v) => {
        if (v === "Print") return "Capture";
        return v;
      },
      onSet: (v, cfg) => {
        if (this.finalized) {
          this.setNoAnim(true);

          if (v === "Author") this.refreshAttribList();

          this.panels.bottom.setWidth(this.width_Canvas);
          this.panels.bottom.refreshWidth();

          this.updateLayout();
          //updateLayout may not be "effective" if loading is not finalized...
          this.updateMiddlePanelWidth();

          setTimeout(() => this.setNoAnim(false), 500);

          this.onModeChange?.();
        }
        cfg.refresh();
      },
      onRefresh: (cfg) => {
        var v = cfg.val;
        if (this.DOM.panel_Footer) {
          this.DOM.panel_Footer
            .selectAll(".dashSelectMode")
            .classed("active", (_) => _.name === v);
          this.DOM.root.attr("data-dashboardMode", v);
        }
      },
    });

    [
      "measureFunc",
      "measureSummary",
      "breakdownMode",
      "stackedCompare",
      "showWholeAggr",
      "filteringMode",
      "mouseOverCompare",
      "recordChartType",
    ].forEach((_) => {
      this.configs[_] = this[_];
    });

    var me = this;

    this.colorTheme = {
      browser: this,
      // defaults
      sequential: "YlGnBu",
      diverging: "Spectral",
      getDiscrete(bins = 9) {
        let _theme = me.activeColorTheme;
        let scale = d3["scheme" + this[_theme]];
        if (scale && scale[bins]) {
          return scale[bins].slice(); // return a copy in case someone wants to edit
        }
        scale = d3["interpolate" + this[_theme]];
        var colors = [];
        if (bins === 1) {
          colors.push(d3.rgb(scale(0.8)).hex());
        } else if (bins === 2) {
          colors.push(d3.rgb(scale(0.8)).hex());
          colors.push(d3.rgb(scale(0.2)).hex());
        } else {
          for (let i = 0; i < bins; ++i) {
            colors.push(d3.rgb(scale(i / (bins - 1))).hex());
          }
        }
        return colors.reverse(); // cividis, etc, need to reverse from light to dark
      },
      getContinuous() {
        return d3["interpolate" + this[me.activeColorTheme]];
      },
      exportConfig() {
        var _: any = {};
        if (this.sequential !== "YlGnBu") _.sequential = this.sequential;
        if (this.diverging !== "Spectral") _.diverging = this.diverging;
        return _;
      },
    };

    this.allRecordsAggr = new Aggregate(null); // not placed in an attribute
    this.allAggregates.push(this.allRecordsAggr);

    Base.browsers[this.getDashboardID()] = this;
    Base.browser = this;

    if (this.options.onLoad) {
      // callback
      if (this.options.onLoad.callback) {
        if (this.options.onLoad.callback instanceof Function) {
          this.onLoad.callback = this.options.onLoad.callback;
        } else {
          delete this.options.onLoad;
        }
      }
      // main keys
      for (var key in this.options.onLoad) {
        this.onLoad.main[key] = this.options.onLoad[key];
      }
    }

    let lastMouseMoveEvent: MouseEvent = null;

    this.DOM.root = d3
      .select(this.domID)
      .classed("kshf", true)
      .classed("noAnim", true)
      .attr("data-dashboardMode", this.dashboardMode.val)
      .attr("recordChartType", "none")
      .on("mousemove", (event: MouseEvent) => {
        // Compute mouse moving speed, to adjust repsonsiveness
        if (!lastMouseMoveEvent) {
          lastMouseMoveEvent = event;
          return;
        }
        var timeDif = event.timeStamp - lastMouseMoveEvent.timeStamp;
        if (timeDif === 0) return;

        var xDif = Math.abs(event.x - lastMouseMoveEvent.x);
        var yDif = Math.abs(event.y - lastMouseMoveEvent.y);

        // controls highlight selection delay
        this.mouseSpeed = Math.min((xDif + yDif) / timeDif, 2);

        lastMouseMoveEvent = event;
      });

    if (this.dashZoomLevel != "1.00") {
      this.attemptToFixBrowserZoomLevel(this.dashZoomLevel);
    }

    this.updateWidth_Total();

    this.recordName = this.options.recordName || "";

    // remove any DOM elements under this domID, kshf takes complete control over what's inside
    var rootDomNode = this.DOM.root.node();
    while (rootDomNode.hasChildNodes())
      rootDomNode.removeChild(rootDomNode.lastChild);

    this.DOM.pointerBlock = this.DOM.root
      .append("div")
      .attr("class", "pointerBlock");
    this.DOM.attribDragBox = this.DOM.root
      .append("div")
      .attr("class", "attribDragBox");

    this.insertDOM_WarningBox();

    //this.DOM.mainWrapper = this.DOM.root.append("div").attr("class","mainWrapper");

    this.recordDetailsPopup = new RecordDetailPopup(this);

    this.insertDOM_Panel_Overlay();

    this.insertDOM_AttribPanel();

    this.DOM.panel_Wrapper = this.DOM.root
      //.append("div").attr("class","panel_Data_Wrapper")
      .append("div")
      .attr("class", "panel_Wrapper")
      .classed("emptyDashboard", true) // empty dashboard by default on initialization.
      .classed("panel_bottom_empty", true);

    this.insertDOM_PanelBasic();

    this.dashboardConfigPanel = new ConfigPanel(
      this.DOM.panel_Wrapper,
      "DashboardAnalyticsConfig",
      "DashboardAnalyticsConfig",
      Object.values(this.configs),
      this,
      this.DOM.metricFuncSelectButton
    );

    this.panels.left = new Panel(this, "left", this.DOM.panel_Wrapper);
    this.panels.right = new Panel(this, "right", this.DOM.panel_Wrapper);

    this.DOM.middleColumn = this.DOM.panel_Wrapper
      .append("div")
      .attr("class", "middleColumn");

    this.panels.middle = new Panel(this, "middle", this.DOM.middleColumn);
    this.DOM.middleColumn.append("div").attr("class", "recordDisplay");

    this.panels.bottom = new Panel(this, "bottom", this.DOM.panel_Wrapper);

    this.DOM.panelEmpty = this.DOM.panel_Wrapper
      .append("div")
      .attr("class", "panelEmpty")
      .append("div")
      .attr("class", "actionInfo")
      .html(i18n.EmptyDashboardNotice);

    this.insertDOM_Panel_Footer();

    this.DOM.root.selectAll(".panel").on("mouseleave", () => {
      setTimeout(() => {
        if (!this.needToRefreshLayout) return;
        this.updateLayout_Height();
        this.needToRefreshLayout = false;
      }, 1500); // update layout after 1.5 seconds
    });

    this.loadDataSources();
  }

  needToRefreshLayout: boolean = false;

  /** -- */
  refreshConfigs() {
    Object.values(this.configs).forEach((cfg) => cfg.refresh());

    this.attribsInDashboard.forEach((attrib) => attrib.refreshConfigs());

    this.refreshAnalytics();
  }

  /** -- */
  activateWidthDrag(DOM, event, onMove) {
    DOM.classList.add("dragging");
    this.setNoAnim(true);

    this.DOM.root
      .style("cursor", "ew-resize")
      .on("mousemove.temp", onMove)
      .on("mouseup.temp", () => {
        DOM.classList.remove("dragging");
        this.setNoAnim(false);
      });

    event.preventDefault();
  }

  blockWithOpenConfig: Block = null;

  /** -- */
  closeConfigPanels() {
    this.blockWithOpenConfig?.DOM?.root.classed("showConfig", false);
    this.blockWithOpenConfig = undefined;
    this.dashboardConfigPanel.hide();
    this.recordDisplay.recordConfigPanel.hide();
  }

  /** -- */
  noAnim: boolean = false;
  setNoAnim(v) {
    if (!this.finalized) return;
    this.noAnim = v;
    this.DOM.root.classed("noAnim", this.noAnim);
    this.DOM.pointerBlock.attr("active", this.noAnim ? "" : null);
    if (!this.noAnim) {
      this.DOM.root
        .style("cursor", null)
        .on("mousemove.temp", null)
        .on("mouseup.temp", null);
    }
  }

  /** -- */
  refreshIsEmpty() {
    this.DOM.panel_Wrapper.classed(
      "emptyDashboard",
      this.attribsInDashboard.length === 0 &&
        this.recordChartType.val === "none"
    );
  }

  /** Returns data type based on first found valid value, null if type not detected */
  getAttribTypeFromFunc(func: Function): BlockType {
    var type = null;

    this.records.some((record) => {
      var _val = func.call(record.data, record);
      if (_val == null || _val == "") return false; // cannot infer type

      var v_type = typeof _val;
      if (v_type === "object" && _val._timeseries_) {
        type = "timeseries";
      } else if (v_type === "object" && _val.coordinates) {
        type = "recordGeo";
      } else if (v_type === "number") {
        type = "numeric";
      } else if (_val instanceof Date) {
        type = "timestamp";
      } else if (v_type === "string" || v_type === "boolean") {
        // TO-DO: Think about boolean summaries (?)
        type = "categorical";
      } else if (Array.isArray(_val)) {
        type = "categorical";
      }

      return type ? true : false;
    });

    return type;
  }

  /** -- */
  createAttrib(
    name: string,
    func = undefined,
    type: BlockType = undefined
  ): Attrib {
    if (!name) return;

    // return existing block with same name
    if (this.attribWithName(name)) {
      return this.attribWithName(name);
    }

    var attrib: Attrib;

    if (type === "content") {
      attrib = new Attrib_Content(this, name);
    } else {
      if (func == null) {
        func = name;
      }
      var _v = new AttribTemplate(func, this);

      type = type ?? _v.blockType;

      if (!type) {
        type = this.getAttribTypeFromFunc(_v.func);
      }

      if (!type) {
        console.log(`Summary data type could not be detected for: ${name}`);
        return;
      }

      if (type === "categorical") {
        attrib = new Attrib_Categorical(this, name, _v);
        //
      } else if (type === "timeseries") {
        attrib = new Attrib_Timeseries(this, name, _v);
        //
      } else if (type === "recordGeo") {
        attrib = new Attrib_RecordGeo(this, name, _v);
        //
      } else if (type === "timestamp") {
        attrib = new Attrib_Timestamp(this, name, _v);
        //
      } else if (type === "numeric") {
        attrib = new Attrib_Numeric(this, name, _v);
      }
    }

    this.insertAttribIntoGroupIndex(attrib);

    return attrib;
  }

  /** -- */
  destroyAttrib(attrib: Attrib) {
    attrib?.block?.removeFromPanel();

    var indexFrom = -1;
    this.attribs.forEach((a, i) => {
      if (a === attrib) indexFrom = i;
    });
    if (indexFrom === -1) return;

    this.attribs.splice(indexFrom, 1);

    // if the attrib is within the record display sorting list, remove!
    this.recordDisplay?.refreshAttribOptions("sort");

    this.removeAttribFromGroupIndex(attrib);
    this.refreshAttribList();
  }

  /** -- */
  insertAttribIntoGroupIndex(attrib: Attrib) {
    var target = this.attribs_by_group;
    // find position in hierarchy
    attrib.groupPath.forEach((_key, i, list) => {
      if (!target[_key]) {
        // "group" node (simple string, not a summary group)
        target[_key] = {
          name: _key,
          item: _key,
          parents: list.slice(0, i),
          sub: {},
        };
      }
      target = target[_key].sub;
    });
    var _key = attrib.printName;
    if (!target[_key]) {
      target[_key] = {
        name: _key,
        parents: attrib.groupPath,
        sub: {},
      };
    } // if new, establish "sub".
    target[_key].item = attrib;
  }

  /** -- */
  removeAttribFromGroupIndex(attrib: Attrib) {
    var target = this.attribs_by_group;
    attrib.groupPath.forEach((_key) => {
      // when changing timeseries, the key numeric summaries get updated after timeseries name is updated
      // target[_key] may be indexing old stuff that's no longer valid
      target = target && target[_key] && target[_key].sub;
    });
    if (target) delete target[attrib.printName];
    delete attrib?.block?.DOM.nugget;
    this.removeEmptySubs();
  }

  /** -- */
  removeEmptySubs() {
    function recurse(obj) {
      for (let [key, value] of Object.entries(obj)) {
        let v = value as any;
        if (typeof v.item === "string" && Object.entries(v.sub).length === 0) {
          // not a block, doesn't have sub-blocks
          delete obj[key];
        } else {
          recurse(v.sub);
        }
      }
    }
    recurse(this.attribs_by_group);
  }

  /** -- */
  setRecordName(v) {
    this.recordName = v;
    this.DOM.root.selectAll(".recordName").html(this.recordName);
  }
  /** -- */
  setDescription(t) {
    this.options.description = t;
    this.DOM.browserDescription
      .select(".customDescription")
      .style("display", t ? "inline-block" : null);
    this.DOM.browserDescription.select(".customDescriptionText").html(t);
  }

  private divWidth: number;
  /** -- */
  updateWidth_Total() {
    this.divWidth = this.DOM.root.node().clientWidth;
  }
  /** -- */
  getWidth_Total() {
    return this.divWidth;
  }
  /** This also considers if the available attrib panel is shown */
  get width_Canvas() {
    return (
      this.divWidth -
      (this.authorMode ? this._attribPanelWidth : 0) -
      2 * Base.width_PanelGap
    ); // 8 pixels on both sides are gone
  }

  /** -- */
  get height_PanelHeader() {
    var _ = parseInt(this.DOM.panel_DataStatus.style("height"));
    return isNaN(_) ? 0 : _;
  }
  /** -- */
  get height_PanelFooter() {
    var _ = parseInt(this.DOM.panel_Footer.style("height"));
    return isNaN(_) ? 0 : _;
  }

  /** -- */
  getDashboardID() {
    return window.location.pathname + this.domID;
  }

  // ********************************************************************
  // Warning panel
  // ********************************************************************

  panel_warningBox = null;

  /* -- */
  insertDOM_WarningBox() {
    this.panel_warningBox = this.DOM.root
      .append("div")
      .attr("class", "warningBox_wrapper");
    var x = this.panel_warningBox.append("span").attr("class", "warningBox");
    this.DOM.warningText = x.append("span").attr("class", "warningText");
    x.append("span")
      .attr("class", "dismiss fa fa-times")
      .tooltip(i18n.Close)
      .on("click", () => this.hideWarning());
  }
  showWarning(v) {
    this.panel_warningBox.classed("active", true);
    this.DOM.warningText.html(v);
    setTimeout(() => this.hideWarning(), 5000); // auto-hide after 5 seconds
  }
  hideWarning() {
    if (this.panel_warningBox) this.panel_warningBox.classed("active", null);
  }

  private mouseSpeed: number = 0;
  get movingMouseDelay() {
    return this.mouseSpeed < 0.2 ? 0 : this.mouseSpeed * 500;
  }

  /** -- */
  getMeasurableSummaries(_t): Attrib[] {
    return this.attribs
      .filter(
        (attrib) =>
          attrib.supportedMetricFuncs.includes(_t) &&
          !attrib.isEmpty() &&
          !attrib.hasTimeSeriesParent()
      )
      .sort((s1, s2) =>
        Util.sortFunc_List_String(s1.attribName, s2.attribName)
      );
  }

  /** -- */
  addMeasureOptions_Summaries(dom) {
    dom
      .on("change", (event) => {
        this.measureSummary.val =
          event.currentTarget.selectedOptions[0].__data__;
      })
      .selectAll("option")
      .remove();

    if (this.measureFunc.val === "Count") return;

    var opts = this.getMeasurableSummaries(this.measureFunc.val);

    dom
      .selectAll("option")
      .data(opts)
      .enter()
      .append("option")
      .attr("selected", (s) =>
        s.attribID === this.measureSummary.val.attribID ? true : null
      )
      .html((s) => s.attribName);
  }

  /** -- */
  addMeasureOptions_Keys(dom) {
    dom.selectAll("option").remove();

    dom // slice creates a copy, reverse in-place updates this copy
      .selectAll("option")
      .data(this.measureSummary.val.timeseriesParent.timeKeys.slice().reverse())
      .enter()
      .append("option")
      .attr("value", (timeKey) => timeKey._time_src)
      .attr("selected", (timeKey) =>
        timeKey._time_src === this.measureSummary.val.timeKey._time_src
          ? "true"
          : null
      )
      .html((timeKey) => timeKey._time_src);
  }

  /** -- */
  addMeasureOptions_Func(dom) {
    dom
      .on("change", (event) => {
        this.measureFunc.val =
          event.currentTarget.selectedOptions[0].__data__.v;
      })
      .selectAll("option")
      .remove();

    var opts = [{ v: "Count", l: i18n.measure_Count, active: true }];

    ["Sum", "Avg"].forEach((_t) => {
      opts.push({
        v: _t,
        l: i18n["measure_" + _t],
        active: this.getMeasurableSummaries(_t).length > 0,
      });
    });

    dom
      .selectAll("option")
      .data(opts)
      .enter()
      .append("option")
      .attr("disabled", (d) => (d.active ? null : true))
      .attr("selected", (d) => (d.v === this.measureFunc.val ? true : null))
      .html((d) => d.l);
  }

  /** -- */
  insertDOM_Panel_DatasetInfo() {
    this.DOM.datasource = this.DOM.browserDescription
      .append("a")
      .attr("class", "fal fa-table datasource")
      .attr("target", "_blank")
      .tooltip(i18n.OpenDataSource);

    var _ = this.DOM.browserDescription
      .append("div")
      .attr("class", "DataPrivacy")
      .html(
        '<span class="DataPrivacy-Public">Public data</span>' +
          '<span class="DataPrivacy-Private">Private data</span>'
      );

    var x = this.DOM.browserDescription
      .append("span")
      .attr("class", "customDescription");
    x.append("span")
      .attr("class", "customDescriptionButton")
      .tooltip("Edit")
      .on("click", () => {
        var _descr = Modal.prompt(
          "Provide a short description or credit for the dataset",
          this.options.description
        );
        if (_descr === "") {
          this.setDescription(null);
          return;
        }
        if (!_descr) return;
        var _url = Modal.prompt("Provide the link for credit", "");
        if (_url) {
          // if _url doesn't start with http, add http://
          if (_url.substr(0, 4) !== "http") _url = "http://" + _url;
          _descr =
            "<a target='_blank' rel='noopener noreferrer' href='" +
            _url +
            "'>" +
            _descr +
            "</a>";
        }
        this.setDescription(_descr);
      })
      .html("<i class='fa fa-info-circle'></i> ");
    x.append("span").attr("class", "customDescriptionText");

    this.setDescription(this.options.description);
  }

  /** -- */
  insertDOM_Panel_Footer() {
    this.DOM.panel_Footer = this.DOM.root
      .append("div")
      .attr("class", "panel_Footer");

    var x = this.DOM.panel_Footer
      .append("div")
      .attr("class", "dashboardModeSelect");
    x.append("div")
      .attr("class", "dashboardModeSelectTitle")
      .attr("data-helparticle", "5e8943d504286364bc97d5e6")
      .html(i18n.Mode);

    Modal.createHelpScoutLinks(x, true);

    x.selectAll("div.dashSelectMode")
      .data([
        {
          name: "Explore",
          class: "far fa-compass",
        },
        {
          name: "Author",
          class: "far fa-pen-fancy",
        },
        {
          name: "Adjust",
          class: "far fa-sliders-h",
        },
        {
          name: "Capture",
          class: "far fa-draw-square",
        },
        {
          name: "Save",
          class: "far fa-bookmark",
        },
      ])
      .enter()
      .append("div")
      .attr("class", (_) => `dashSelectMode dashSelectMode-${_.name}`)
      .classed("active", (_) => _.name === this.dashboardMode.val)
      .on("click", (_event, _) => (this.dashboardMode.val = _.name))
      .tooltip((_) => i18n[`${_.name} Mode`])
      .call((dashSelectMode) => {
        dashSelectMode.append("div").attr("class", (_) => _.class);
        dashSelectMode
          .append("div")
          .attr("class", "theText")
          .html((_) => i18n[_.name]);
      });

    this.DOM.browserDescription = this.DOM.panel_Footer
      .append("span")
      .attr("class", "browserDescription");

    // Info & Credits
    var x = this.DOM.panel_Footer
      .append("span")
      .attr("class", "logoHost")
      .tooltip(i18n.ShowInfoCredits)
      .on("click", () => {
        this.showCredits();
        this.DOM.overlay_wrapper
          .attr("show", "infobox")
          .classed("easyDismiss", true);
      })
      .html(
        `<span class='keshifSVG'>Keshif<img></span>
        <span class='theDataMadeExplorable'>Data Made Explorable</span>
        `
      );
    x.select("svg")
      .style("width", "20px")
      .style("width", "18px")
      .style("height", "19px");
  }
  /** -- */
  insertDOM_PanelBasic() {
    var me = this;

    this.DOM.panel_DataStatus = this.DOM.root
      .append("div")
      .attr("class", "panel_DataStatus");

    this.DOM.metricFuncSelectButton = this.DOM.panel_DataStatus
      .append("span")
      .attr("class", "metricFuncSelectButton basicIcon fal fa-cog")
      .tooltip(i18n.DashboardAnalyticsConfig)
      .on("click", () => this.dashboardConfigPanel.showAtPos(8, 8));

    this.DOM.recordInfo = this.DOM.panel_DataStatus
      .append("span")
      .attr("class", "recordInfo");

    this.DOM.activeRecordMeasure = this.DOM.recordInfo
      .append("span")
      .attr("class", "activeRecordMeasure");
    this.DOM.metricFuncText = this.DOM.recordInfo
      .append("span")
      .attr("class", "metricFuncText");
    this.DOM.metricFuncText.html(
      "" +
        "<span class='measureFunc metricOptionWrapper'>" +
        "<span class='measureFuncText metricOptionWrapper_Text'></span>" +
        "<select class='measureFuncOptions metricOptionWrapper_Opts'></select>" +
        "</span>" +
        "<span class='timeKeys metricOptionWrapper'>" +
        "<i class='fal fa-calendar'></i>" +
        "<span class='timeKeyText metricOptionWrapper_Text'></span>" +
        "<select class='timeKeys metricOptionWrapper_Opts'></select>" +
        "</span>" +
        "<span class='measureSummary metricOptionWrapper'>" +
        "<span class='measureSummaryName metricOptionWrapper_Text'></span>" +
        "<select class='measureSummary metricOptionWrapper_Opts'></select>" +
        "</span>" +
        `<span class='Of_NumberRecord'>${i18n.Of_NumberRecord}</span>`
    );

    this.DOM.metricFuncText.select("select.timeKeys").on("input", (event) => {
      this.measureSummary.val =
        this.measureSummary.val.timeseriesParent.getTimepointSummary(
          event.currentTarget.selectedOptions[0].__data__
        );
    });

    this.DOM.recordName = this.DOM.recordInfo
      .append("span")
      .attr("class", "recordName")
      .tooltip("")
      .on("mouseenter", function (event) {
        this.tippy.setContent(this.isContentEditable ? "OK" : i18n.EditTitle);
        event.stopPropagation();
        event.preventDefault();
      })
      .on("focus", function () {
        this.tippy.hide();
        this._initValue = DOMPurify.sanitize(this.innerHTML);
      })
      .on("blur", function () {
        this.tippy.hide();
        this.contentEditable = false;
      })
      .on("keyup", (event) => event.stopPropagation())
      .on("keypress", (event) => event.stopPropagation())
      .on("keydown", function (event) {
        if (event.keyCode === 27) {
          // Escape : Do not apply the new label
          this.blur();
          this.innerHTML = DOMPurify.sanitize(this._initValue);
          return;
        }
        if (event.keyCode === 13) {
          // ENTER
          me.setRecordName(this.textContent);
          this.blur();
        }
        event.stopPropagation();
      })
      .on("click", function () {
        if (!this.isContentEditable) {
          this.contentEditable = true;
          this.focus();
        } else {
          this.contentEditable = false;
          me.setRecordName(DOMPurify.sanitize(this.innerHTML));
        }
      });

    var dashboardSettings = this.DOM.panel_DataStatus
      .append("span")
      .attr("class", "iconGroup dashboardSettings");

    this.DOM.panel_Basic_In = this.DOM.panel_DataStatus
      .append("div")
      .attr("class", "panel_Basic_In");

    this.DOM.panel_DataStatus
      .append("div")
      .attr("class", "iconGroup rightSideIcons")
      .call((rightSideIcons) => {
        rightSideIcons
          .append("div")
          .attr("class", "viewFullscreen basicIcon far fa-expand-arrows-alt")
          .tooltip(i18n.ShowFullscreen)
          .on("click", () => this.showFullscreen());

        if (this.dashZoomLevel !== "1.00") {
          rightSideIcons
            .append("div")
            .attr("class", "basicIcon fa fa-window-restore")
            .tooltip(i18n["Reset Zoom Level"])
            .on("click", () => this.attemptToFixBrowserZoomLevel("1.00", true));
        }

        rightSideIcons
          .append("div")
          .attr("class", "showHelpIn basicIcon fal fa-question-circle")
          .tooltip(i18n.Help)
          .on("click", () => Modal.helpUI());
      });

    dashboardSettings
      .append("span")
      .attr("class", "dashboardSetting breakdownModeIcon far fa-percent")
      .tooltip("", {
        onShow: (instance) => {
          instance.reference.tippy.setContent(
            `<div>${i18n["Breakdown"]}</div>
          <b>${this.breakdownMode}</b><br>
          <i>${i18n["Click to change"]}</i>`
          );
        },
      })
      .on("click", (event) => {
        Modal.popupMenu(
          event,
          {
            name: "Breakdown",
            items: [
              {
                id: "absoluteBreakdown",
                name: "Absolute",
                iconClass: "far fa-hashtag",
                helparticle: "5e8944682c7d3a7e9aea659a",
                active: this.breakdownMode.val === "absolute",
                do: (_) => {
                  this.breakdownMode.val = "absolute";
                },
              },
              {
                id: "percentBreakdown",
                name: "Percentage",
                iconClass: "far fa-percent",
                expanded: true,
                options: [
                  {
                    id: "dependentBreakdown",
                    name: "% of Compared",
                    helparticle: "5e8944812c7d3a7e9aea659b",
                    active: this.breakdownMode.val === "dependent",
                    do: (_) => {
                      this.breakdownMode.val = "dependent";
                    },
                  },
                  {
                    id: "relativeBreakdown",
                    name: "% of Groups",
                    helparticle: "5e8944932c7d3a7e9aea659c",
                    active: this.breakdownMode.val === "relative",
                    do: (_) => {
                      this.breakdownMode.val = "relative";
                    },
                  },
                  {
                    id: "totalBreakdown",
                    name: "% of All",
                    helparticle: "5e94ff6904286364bc984a7a",
                    active: this.breakdownMode.val === "total",
                    do: (_) => {
                      this.breakdownMode.val = "total";
                    },
                  },
                ],
              },
            ],
          },
          this,
          { placement: "bottom-start" }
        );
      });

    dashboardSettings
      .append("span")
      .attr("class", "dashboardSetting lockCrumbMode")
      .tooltip("", {
        onShow: (instance) => {
          instance.reference.tippy.setContent(
            `<div>${i18n["Group View"]}</div>
          <b>${this.stackedCompare}</b><br>
          <i>${i18n["Click to change"]}</i>`
          );
        },
      })
      .on("click", () => {
        this.stackedCompare.val = !this.stackedCompare.val;
      })
      .append("div")
      .attr("class", "CompareModeIcon")
      .selectAll("div")
      .data([0, 1, 2])
      .enter()
      .append("div")
      .attr("class", "CompareModeIcon-block");

    this.DOM.breadCrumbs_Filter = this.DOM.panel_Basic_In
      .append("div")
      .attr("class", "breadCrumbs breadCrumbs_Filter")
      .call((breadCrumbs_Filter) => {
        breadCrumbs_Filter
          .append("div")
          .attr("class", "breadCrumbHeader")
          .tooltip(i18n.RemoveAllFilters)
          .text(i18n.Filters)
          .on("click", () => this.clearFilters_All());
        breadCrumbs_Filter
          .append("div")
          .attr("class", "breadCrumbCollapseControl far fa-angle-double-right")
          .tooltip("", {
            onTrigger: (instance) => {
              instance.reference.tippy.setContent(
                i18n[
                  (breadCrumbs_Filter.node().classList.contains("collapsed")
                    ? "Show"
                    : "Hide") + " Filters"
                ]
              );
            },
          })
          .on("click", () => {
            var cl = breadCrumbs_Filter.node().classList;
            cl.toggle("collapsed");
            if (!cl.contains("collapsed")) {
              this.filters_wrap_letItWrap = true;
            }
          });
      });

    this.DOM.breadCrumbs_Compare = this.DOM.panel_Basic_In
      .append("div")
      .attr("class", "breadCrumbs breadCrumbs_Compare")
      .call((breadCrumbs_Compare) => {
        breadCrumbs_Compare
          .append("span")
          .attr("class", "breadCrumbHeader")
          .tooltip(i18n.Unlock)
          .text(i18n.Compare)
          .on("click", () =>
            this.clearSelect_Compare(this.activeComparisons, true, true)
          )
          .append("span")
          .attr("class", "lockCrumbSummary blockName");
      });
  }

  /** -- */
  applyConfig(config) {
    // Import panel config
    Base.Panel_List.forEach((p) =>
      this.panels[p].importConfig({
        ...config.panels[p],
        ...config.panels.default,
      })
    );

    config.summaries = config.summaries || [];

    config.summaries.forEach((cfg) => this.applyBlockConfig(cfg));

    if (config.recordName && this.recordName !== config.recordName) {
      this.setRecordName(config.recordName);
    }

    if (config.metric) {
      var a = this.attribWithName(config.metric.summary);
      if (a instanceof Attrib_Numeric) {
        this.measureSummary.val = a;
        this.measureFunc.val = config.metric.type;
      }
    } else {
      this.measureFunc.val = "Count";
    }

    this.breakdownMode.val = config.breakdownMode;
    this.stackedCompare.val = config.stackedCompare;
    this.filteringMode.val = config.filteringMode;
    this.showWholeAggr.val = config.showWholeAggr;
    this.mouseOverCompare.val = config.mouseOverCompare;

    this.recordDisplay.importConfig(config.recordDisplay);

    this.records.forEach((rec) => rec.refreshFilterCache());
    this.updateRecordCount_Active();

    this.updateAfterFilter();

    this.updateLayout();
  }

  /* -- */
  insertDOM_Panel_Overlay() {
    this.DOM.overlay_wrapper = this.DOM.root
      .append("div")
      .attr("class", "overlay_wrapper");

    // BACKGROUND
    this.DOM.overlay_wrapper
      .append("div")
      .attr("class", "fullBackground")
      .on("click", (event) => {
        if (!event.currentTarget.parentNode.classList.contains("easyDismiss"))
          return;

        this.DOM.overlay_wrapper.attr("show", "none");

        this.recordDetailsPopup.closeRecordDetailPanel();

        Modal._removeModal(this.DOM.overlay_wrapper);
      });

    // LOADING BOX
    this.DOM.loadingBox = this.DOM.overlay_wrapper
      .append("div")
      .attr("class", "overlay_content overlay_loading");
    var ssdsd = this.DOM.loadingBox
      .append("span")
      .attr("class", "spinner")
      .selectAll(".spinner_x")
      .data([1, 2, 3, 4, 5])
      .enter()
      .append("span")
      .attr("class", (d) => "spinner_x spinner_" + d);
    var hmmm = this.DOM.loadingBox.append("div").attr("class", "status_text");
    hmmm
      .append("span")
      .attr("class", "status_text_sub info")
      .html(i18n.LoadingData);
    this.DOM.status_text_sub_dynamic = hmmm
      .append("span")
      .attr("class", "status_text_sub dynamic");

    // CREDITS
    this.DOM.overlay_infobox = this.DOM.overlay_wrapper
      .append("div")
      .attr("class", "overlay_content overlay_infobox");
    this.DOM.overlay_infobox
      .append("div")
      .attr("class", "overlay_Close fa fa-times fa-times-circle")
      .tooltip(i18n.Close)
      .on("click", () => this.DOM.overlay_wrapper.attr("show", "none"));

    // RECORD DETAILS
    this.recordDetailsPopup.initDOM();

    // HELP
    this.DOM.overlay_wrapper
      .append("div")
      .attr("class", "overlay_content overlay_help");
  }

  // prevents inserting credits, which sets img src tags and adds image requests, until it is shown
  creditsInserted = false;
  showCredits() {
    if (this.creditsInserted) return;
    this.DOM.overlay_infobox
      .append("div")
      .attr("class", "creditsBox")
      .html(
        `<div style="text-align: center;">
  <a target='_blank' href='https://keshif.me'><img class='kshfLogo'></a>
</div>
<div>
  <a class='creditsLink' target='_blank' href='https://keshif.me/Terms'>Terms of Use</a>
  <a class='creditsLink' target='_blank' href='https://keshif.me/Privacy'>Privacy Policy</a>
  <a class='creditsLink' target='_blank' href='https://keshif.me/License'>Other Licenses</a>
</div>
<div class='copyright'>© Keshif, LLC 2022. All rights reserved.</div>
`
      );
    this.creditsInserted = true;
  }

  /** -- */
  helper_AddSidePanelGroup(className, _title, _tooltip) {
    this.DOM[className] = this.DOM.authoringPanel
      .append("div")
      .attr("class", "sidePanelGroup " + className);

    var xx = this.DOM[className]
      .append("div")
      .attr("class", "sidePanelGroupHeader");
    xx.append("span").html(_title);
    xx.select(".fa").tooltip(_tooltip);
    xx.append("span")
      .attr("class", "closeAttribPanel fa fa-window-close")
      .tooltip(i18n.Close)
      .on("click", () => {
        this.dashboardMode.val = "Explore";
      });

    return this.DOM[className]
      .append("div")
      .attr("class", "sidePanelGroupContent");
  }

  /** -- */
  refreshAttibFilterState() {
    this.DOM.dataTypeFilters.classed("active", (_) => _.active);
    var filterActive = this.dataTypeDescrs.some((_) => _.active);

    var filterLevel;

    var isExcluded = (_) => {
      var visibleSubItems = filterLevel(Object.values(_.sub));
      if (visibleSubItems > 0) return false;
      if (typeof _.item === "string") {
        return visibleSubItems === 0; // no visible items in the sub-tree
      }
      _ = _.item;
      if (this.attribTextQuery) {
        // also searches the query in descriptions
        var searchIn = (
          _.attribName + (_.description ? " " + _.description : "")
        ).toLowerCase();
        if (searchIn.indexOf(this.attribTextQuery) === -1) return true; // not found
      }
      if (!filterActive) return false;
      return !this.dataTypeDescrs.some(
        (descr) => descr.active && descr.member(_)
      );
    };

    filterLevel = (items) => {
      var visibleCount = 0;
      items.forEach((_) => {
        var s = isExcluded(_);
        d3.select(_.DOM).classed("filtered", s);
        if (!s) visibleCount++;
      });
      return visibleCount;
    };

    this.removeEmptySubs();
    filterLevel(Object.values(this.attribs_by_group));
  }

  /** -- */
  refreshAttibButtonState() {
    this.DOM.dataTypeFilters.classed("hidden", (_) =>
      this.attribs.every(
        (attrib) => !attrib?.block?.hasNugget || !_.member(attrib)
      )
    );
  }

  private _attribPanelWidth: number = Base.width_AttribPanelDefault;
  get attribPanelWidth() {
    return this._attribPanelWidth;
  }

  /** -- */
  setAttribPanelWidth(v) {
    v = Number(v);
    if (typeof v !== "number" || isNaN(v)) return;
    v = Math.max(Math.min(v, 400), 200);
    if (v === this._attribPanelWidth) return;
    this._attribPanelWidth = v;
    this.DOM.authoringPanel.style("width", this._attribPanelWidth + "px");
    this.updateLayout();
  }

  attribTextQuery: string = null;

  /** -- */
  insertDOM_AttribPanel() {
    this.DOM.authoringPanel = this.DOM.root
      .append("div")
      .attr("class", "authoringPanel");

    this.DOM.authoringPanel.style("width", this._attribPanelWidth + "px");

    // ****************************************************************************
    // ***************************************************************************

    var attributeInfo = this.helper_AddSidePanelGroup(
      "attributePanel",
      `<i class='panelIcon fal fa-cube'></i> ${i18n.Attributes}`,
      "<b>Author</b> your dashboard<br> using dataset attributes"
    );

    attributeInfo
      .append("div")
      .attr("class", "panelAdjustWidth")
      .tooltip(i18n["Adjust Panel Width"])
      .on("mousedown", (event) => {
        if (event.which !== 1) return; // only respond to left-click
        var mouseDown_width =
          this._attribPanelWidth - d3.pointer(event, document.body)[0];

        this.activateWidthDrag(event.currentTarget, event, (event2) => {
          this.setAttribPanelWidth(
            mouseDown_width + d3.pointer(event2, document.body)[0]
          );
        });
      })
      .on("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
      });

    var attributePanelFilters = attributeInfo
      .append("div")
      .attr("class", "attributePanelFilters");

    this.DOM.dataTypeFilters = attributePanelFilters
      .append("div")
      .attr("class", "dataTypeFilters")
      .selectAll("div")
      .data(this.dataTypeDescrs)
      .enter()
      .append("div")
      .each((_) => {
        _.active = false;
      })
      .attr("class", (_) => "filterTypeButton " + _.icon)
      .html((_) => _.iconDiv)
      .tooltip((_) => i18n[_.name + "Attribute"], { placement: "bottom" })
      .on("click", (event, _) => {
        _.active = !_.active;
        this.refreshAttibFilterState();
      });

    var attributePanelControl;

    attributePanelFilters
      .append("div")
      .attr("class", "filterTypeButton attribTextSearchIcon far fa-search")
      .on("click", (event) => {
        event.currentTarget.classList.toggle("active");
        attributePanelControl.node().classList.toggle("active");
        this.DOM.attribTextSearch.select("input").node().focus();
      });

    attributePanelFilters
      .append("div")
      .attr("class", "filterTypeButton attribListConfiguration fal fa-cog")
      .tooltip(i18n.Configure, { placement: "bottom" })
      .on("click", (event) =>
        Modal.popupMenu(event, MenuOpts.AttribPanel, this)
      );

    attributePanelControl = attributeInfo
      .append("div")
      .attr("class", "attributePanelControl");

    // *******************************************************
    // TEXT SEARCH
    // *******************************************************

    this.DOM.attribTextSearch = attributePanelControl
      .append("span")
      .attr("class", "textSearchBox attribTextSearch");
    this.DOM.attribTextSearch
      .append("input")
      .attr("class", "textSearchInput")
      .attr("type", "text")
      .attr("placeholder", i18n.Search)
      .on("keydown", (event) => event.stopPropagation())
      .on("keypress", (event) => event.stopPropagation())
      .on("keyup", (event) => event.stopPropagation())
      .on("input", (event) => {
        var DOM = event.currentTarget;
        if (DOM.timer) clearTimeout(DOM.timer);
        this.attribTextQuery = DOM.value.toLowerCase();
        this.DOM.attribTextSearch.classed(
          "showClear",
          this.attribTextQuery !== ""
        );
        DOM.timer = setTimeout(() => this.refreshAttibFilterState(), 250);
      });
    this.DOM.attribTextSearch
      .append("span")
      .attr("class", "fa fa-times-circle")
      .tooltip(i18n.ClearTextSearch)
      .on("click", () => {
        this.attribTextQuery = "";
        this.DOM.attribTextSearch
          .classed("showClear", false)
          .select("input")
          .property("value", "");
        this.refreshAttibFilterState();
      });

    this.DOM.attributeList = attributeInfo
      .append("div")
      .attr("class", "attributeList");

    this.DOM.boostButton = attributeInfo
      .append("div")
      .attr("class", "boostButton")
      .html("<i class='fal fa-rocket-launch'></i> Boost")
      .tooltip("Auto-boost dashboard")
      .on("click", () => this.runMagic());
  }

  /** -- */
  collapseAttribListGroups(v = true) {
    this.DOM.root
      .selectAll(".AttribListItem.hasSubItems")
      .nodes()
      .forEach((node) => {
        node.classList[v ? "add" : "remove"]("collapsed");
      });
  }

  /** -- */
  refreshAttribList() {
    if (!this.finalized) return;

    var recurse = (_selection, level) =>
      _selection.each((_item, i, nodes) => {
        refreshLevel(
          d3.select(nodes[i]).select(".subItems"),
          _item.sub,
          level + 1
        );
      });

    var refreshLevel = (_dom, _data, level) => {
      _data = Object.values(_data).sort((a: any, b: any) => {
        var isGroup_A =
          Object.keys(a.sub).length > 0 && typeof a.item === "string";
        var isGroup_B =
          Object.keys(b.sub).length > 0 && typeof b.item === "string";

        // folders first
        if (isGroup_A !== isGroup_B) return +isGroup_B - +isGroup_A;

        // first by type, then by name
        var diff =
          Util.getAttribTypeOrder(a.item.type) -
          Util.getAttribTypeOrder(b.item.type);
        return diff ? diff : Util.sortFunc_List_String(a.name, b.name);
      });

      _dom.selectAll("div.AttribListItem-Level" + level).remove();

      _dom
        .selectAll("div.AttribListItem-Level" + level)
        .data(_data, (_) => _.name + "_" + typeof _.item)
        .join(
          (enter) => {
            var listItems = enter
              .append("div")
              .attr("class", "AttribListItem AttribListItem-Level" + level)
              .classed("hasSubItems", (_) => Object.entries(_.sub).length > 0)
              .classed("collapsed", true);

            listItems
              .append("div")
              .attr("class", "nugget")
              //.attr("tempColumnName",   _ => _.item.template.str || null)
              .classed("inDashboard", (_) => _.item?.block?.inDashboard)
              .classed("condensedText", (_) => _.name?.length > 30)
              .each((_, i, nodes) => {
                _.DOM = nodes[i];

                var isGroup = typeof _.item === "string";
                let _dom = d3.select(nodes[i]);

                _dom.on("click", (event) => {
                  if (event.which !== 1) return; // only respond to left-click
                  nodes[i].parentNode.classList.toggle("collapsed");
                });

                _dom
                  .append("div")
                  .attr("class", "groupControl")
                  .tooltip(i18n["Open/Close"])
                  .on("click", (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    nodes[i].parentNode.classList.toggle("collapsed");
                  })
                  .append("div")
                  .attr("class", "fa fa-caret-down");

                _dom
                  .append("span")
                  .attr("class", "nuggetIcon")
                  .append("div")
                  .attr(
                    "class",
                    isGroup ? "fa fa-circle" : _.item?.nuggetClassName
                  );

                _dom
                  .append("span")
                  .attr("class", "summaryName")
                  .html(_.name)
                  .tooltip(i18n.EditTitle);

                var Y = _dom
                  .append("div")
                  .attr("class", "iconWrapper")
                  .on("dblclick", (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                  });

                if (!isGroup) {
                  let a: Attrib = _.item;
                  if (a.attribName === this.idSummaryName) {
                    Y.append("div")
                      .attr("class", "summaryRecordIDIcon far fa-fingerprint")
                      .tooltip(i18n["Record ID"], { placement: "bottom" });
                  }

                  if (a.type === "categorical") {
                    Y.append("div")
                      .attr("class", "summaryMultiCat far fa-tags")
                      .tooltip(i18n.MultiValued, { placement: "bottom" });
                  }

                  // no descriptions of simple groups currently
                  Y.append("div")
                    .attr("class", "summaryDescription far fa-info-circle")
                    .classed("active", !!a.description)
                    .tooltip(a.description, { placement: "bottom" })
                    .on("click", function () {
                      this.tippy.show();
                    });

                  a.block?.refreshNugget(_dom);
                }

                Y.append("div")
                  .attr("class", "showDeriveMenu fa fa-ellipsis-v")
                  .tooltip(i18n.Settings, { placement: "bottom" })
                  .on("mousedown", (event) => event.stopPropagation())
                  .on("click", (event) => {
                    event.currentTarget.parentNode.parentNode.classList.add(
                      "popupVisible"
                    );
                    if (isGroup) {
                      Modal.popupMenu(event, MenuOpts.Attrib_Grouping, _);
                    } else {
                      _.item.initializeAggregates();
                      Modal.popupMenu(event, MenuOpts.Attribute, _.item);
                    }
                    event.stopPropagation();
                    event.preventDefault();
                  });
              });

            listItems.append("div").attr("class", "subItems");

            recurse(listItems, level);
            return listItems;
          },
          (update) => recurse(update, level),
          (exit) => exit.remove()
        )
        .order();
    };

    this.removeEmptySubs();

    refreshLevel(this.DOM.attributeList, this.attribs_by_group, 0);

    this.refreshAttibButtonState();
  }

  // ********************************************************************
  // Full screen control
  // ********************************************************************

  private isFullscreen = false;

  /** -- */
  showFullscreen() {
    this.isFullscreen = this.isFullscreen ? false : true;
    var elem = this.DOM.root.node();
    if (this.isFullscreen) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  }

  // ********************************************************************
  // Data loading
  // ********************************************************************

  _loadedTableCount = 0;
  _totalTableCount = 0;

  /** Setter & getter accecss so that UI can be updated when data is updated */
  set loadedTableCount(v) {
    this._loadedTableCount = v;
    this.DOM.status_text_sub_dynamic?.text(
      `(${this._loadedTableCount} / ${this._totalTableCount})`
    );
  }
  get loadedTableCount() {
    return this._loadedTableCount;
  }

  /** -- */
  loadDataSources() {
    "use strict";

    this.DOM.overlay_wrapper.attr("show", "loading");

    DataTable.registerLoader(new DataLoader_FetchURL());
    DataTable.registerLoader(new DataLoader_GoogleSheets());

    this.insertDOM_Panel_DatasetInfo();

    var tableLoadPromises = [];

    if (this.options.source) {
      let tableSpecs = this.options.source;
      if (!Array.isArray(tableSpecs)) {
        tableSpecs = [tableSpecs];
      }

      this.loadedTableCount = 0;
      this._totalTableCount = tableSpecs.length;

      tableLoadPromises = tableSpecs.map(async (tableDescr, i) => {
        var dt = new DataTable(tableDescr);

        await dt.load();
        this._loadedTableCount++;

        if (i === 0) {
          this.primaryTableName = dt.name;
          this.idSummaryName = dt.id || "id";

          if (dt.linkToData) {
            this.DOM.datasource
              .style("display", "inline-block")
              .attr("href", dt.linkToData);
          }
        }
        return true;
      });
    }

    // Execute async data loading on multiple tables
    Promise.all(tableLoadPromises)
      // load charts
      .then(() => {
        if (!this.primaryTableName) {
          Modal.alert("Cannot load dashboard. Please define primaryTableName.");
          return;
        }

        this.records = Base.tables.get(this.primaryTableName)?.records || [];
        this.records.forEach((record, i) => {
          record.recordOrder = i;
        });

        this.setRecordName(this.recordName || this.primaryTableName);

        // uses setTimeout to be able to render the updated "Creating browser..." text.
        this.DOM.overlay_wrapper
          .select("div.status_text .info")
          .text(i18n.CreatingBrowser);
        this.DOM.overlay_wrapper.select("div.status_text .dynamic").text("");
        window.setTimeout(async () => this._loadCharts(), 20);
      })
      .catch((err) => {
        console.log(err);
        Modal.alert("Error in loading data.<br><br> Error: " + err);
      });
  }

  /** -- */
  prepBlockConfig(blockCfg) {
    // **************************************************
    // Deprecated/renamed configurations

    if (blockCfg.showPercentile)
      blockCfg.showPercentiles = blockCfg.showPercentile;
    if (blockCfg.intervalScale)
      blockCfg.valueScaleType = blockCfg.intervalScale;
    if (blockCfg.scaleType) blockCfg.valueScaleType = blockCfg.scaleType;
    if (blockCfg.minAggrValue) blockCfg.minAggrSize = blockCfg.minAggrValue;

    if (blockCfg.supportsCompareLock === false) {
      blockCfg.isComparable = false;
    }

    // Set type of summary automatically if type-specific attributes have been defined
    if (!blockCfg.type) {
      if (
        blockCfg.catLabel ||
        blockCfg.catTooltip ||
        blockCfg.catSortBy ||
        blockCfg.catGeo ||
        blockCfg.barHeight ||
        blockCfg.showSetMatrix
      ) {
        blockCfg.type = "categorical";
      } else if (blockCfg.showPercentile || blockCfg.skipZero) {
        blockCfg.type = "numeric";
      } else if (blockCfg.recordGeo) {
        blockCfg.type = "recordGeo";
      } else if (blockCfg.content) {
        blockCfg.type = "content";
      }
    }
  }
  /** -- */
  applyBlockConfig(attribCfg: SummarySpec) {
    "use strict";

    if (Object.keys(attribCfg).length === 0) return; // NO-OP
    if (attribCfg.skipConfig) return;

    this.prepBlockConfig(attribCfg);

    var attrib = this.attribWithName(attribCfg.name);

    var _byValue = null;
    if (typeof attribCfg.value === "string" && attribCfg.type !== "recordGeo") {
      _byValue = this.attribWithName(attribCfg.value);
    }

    if (!attrib && _byValue) {
      // converting name from "value" to "name"
      attrib = _byValue;
      attrib.attribName = attribCfg.name;
    } else {
      if (
        attrib &&
        attribCfg.value &&
        attribCfg.value !== attribCfg.name &&
        attrib.template.str !== attribCfg.value
      ) {
        // redefining the attrib with the requested name using the new value function
        attrib.destroy();
      }
      attrib = this.createAttrib(attribCfg.name, attribCfg.value, attribCfg.type);
    }

    // handle summary/attribCfg type mismatch...
    if (attribCfg.type && attribCfg.type !== attrib.type) {
      attrib.destroy();
      attribCfg.value = attribCfg.value || attribCfg.name;

      if (typeof attribCfg.value === "string") {
        attrib = this.createAttrib(attribCfg.value, null, attribCfg.type);
        attrib.attribName = attribCfg.name;
      } else if (typeof attribCfg.value === "function") {
        attrib = this.createAttrib(
          attribCfg.name,
          attribCfg.value,
          attribCfg.type
        );
      }
    }

    // If attrib object is not found/created, nothing else to do
    if (!attrib) return;

    attrib.applyConfig(attribCfg);

    if (
      attrib.isEmpty() &&
      (attrib instanceof Attrib_Categorical ||
        attrib instanceof Attrib_Interval)
    ) {
      attrib.destroy();
      return;
    }

    if (attribCfg.panel) {
      attrib.block?.addToPanel(this.panels[attribCfg.panel], undefined, true);
    }
  }

  /** -- */
  runMagic() {
    var newConfig: any = this.exportConfig();

    var potentialChanges = [];

    // See if we can detect some auto-conversions!
    var recordKeys = Object.keys(this.records[0].data);

    // LAT_LONG conversion
    var latKey, longKey;
    var hasLat = recordKeys.some((k) => {
      latKey = k;
      var _ = k.toUpperCase();
      return ["LAT", "LATITUDE"].includes(_);
    });
    var hasLong = recordKeys.some((k) => {
      longKey = k;
      var _ = k.toUpperCase();
      return ["LON", "LONGITUDE", "LNG", "LONG"].includes(_);
    });
    if (hasLat && hasLong && !this.options.onLoad["_POINT"]) {
      potentialChanges.push({
        i: '<i class="far fa-map-marker"></i>',
        q: `(<b>${latKey}</b>, <b>${longKey}</b>) is the point location.`,
        a: () => {
          this.options.onLoad["_POINT"] = `LAT_LONG(${latKey},${longKey})`;
          // delete lat/long summaries
          newConfig.summaries = newConfig.summaries.filter((cfg) => {
            return cfg.name !== latKey && cfg.name !== longKey;
          });
          if (!newConfig.recordDisplay.geo)
            newConfig.recordDisplay.geo = "_POINT";
          if (newConfig.recordDisplay.viewAs === "none")
            newConfig.recordDisplay.viewAs = "map";
        },
      });
    }

    // Derive time feature
    var timeStampSummaries = this.attribs.filter(
      (attrib) => attrib instanceof Attrib_Timestamp
    ) as Attrib_Timestamp[];

    timeStampSummaries.forEach((attrib) => {
      [
        { typed: "month", derivative: "Month" },
        { typed: "day", derivative: "DayOfMonth" },
        { typed: "day", derivative: "WeekDay" },
        { typed: "hour", derivative: "Hour" },
      ].forEach((_opt) => {
        if (
          !attrib.timeTyped[_opt.typed] ||
          attrib.derivatives[_opt.derivative]
        ) {
          return;
        }
        potentialChanges.push({
          i: '<i class="far fa-calendar-day"></i>',
          q: `Derive ${_opt.derivative} of <b>${attrib.attribName}</b>`,
          a: () => {
            newConfig.summaries.push({
              name: attrib.attribName + "->" + _opt.derivative,
              value: attrib.template.str + "->" + _opt.derivative + "()",
              panel: "none",
            });
          },
        });
      });
    });

    // Detect TIMESERIES
    // Merge first ten records
    var _mergedRecData = {};
    this.records.slice(0, 10).forEach((rec: Record) => {
      for (var k in rec.data) {
        _mergedRecData[k] = _mergedRecData[k] || [];
        _mergedRecData[k].push(rec.data[k]);
      }
    });

    recordKeys.forEach((k) => {
      var _values: any = _mergedRecData[k];
      _values.some((v) => {
        if (v == null || typeof v !== "object" || Array.isArray(v))
          return false;

        // TO-DO: Process non-number, string types time series field info ("2017-05","2017-04", etc)
        // both keys and values must be numbers
        if (
          Object.entries(v).every(([key, val]) => {
            return !isNaN(Number(key)) && val !== null && !isNaN(Number(val));
          })
        ) {
          potentialChanges.push({
            i: '<i class="fa fa-chart-line"></i>',
            q: `<b>${k}</b> is timeseries by year/order.`,
            a: () => {
              this.options.onLoad[k] = k + "->${DATETIME(%Y)}";
              // Remove summaries of individual time keys
              newConfig.summaries = newConfig.summaries.filter(
                (s: SummarySpec) => {
                  if (s.panel !== "none") return true;
                  var _t = new AttribTemplate(s.name, this);
                  return !(_t && _t.pathStr === k);
                }
              );
            },
          });
          return true;
        }
        return false;
      });
    });

    // ZIPCODE?
    var isZipCode = (attrib: Attrib) => {
      var _ = attrib.attribName;
      return _.toUpperCase() === "ZIP" || _.toUpperCase() === "ZIPCODE";
    };

    // Convert from integer to string
    this.attribs.forEach((attrib) => {
      if (attrib instanceof Attrib_Numeric && isZipCode(attrib)) {
        potentialChanges.push({
          i: '<i class="far fa-map-marker"></i>',
          q: `<b>${attrib.attribName}</b> is zipcode.`,
          a: () => {
            this.options.onLoad[attrib.template.str] = "STR()";
            newConfig.summaries = newConfig.summaries.filter((_) => {
              return _.name !== attrib.attribName;
            });
            attrib.destroy();
          },
        });
      }
    });

    var numToDateMagic = [
      {
        // Serial dates
        filter: (attrib: Attrib) => {
          return (
            attrib instanceof Attrib_Numeric &&
            attrib.aggr_initialized &&
            !attrib.unitName &&
            attrib.rangeOrg[0] >= 18264 && // =DATEVALUE("1/1/1950")
            attrib.rangeOrg[1] <= 54789 && // =DATEVALUE("1/1/2050")
            !isZipCode(attrib)
          );
        },
        i: "hashtag",
        convert: "DATETIME(%sn)",
        message: " is a spreadsheet date field?",
      },
      {
        // Year only
        filter: (attrib: Attrib) => {
          return (
            attrib instanceof Attrib_Numeric &&
            attrib.aggr_initialized &&
            !attrib.unitName &&
            attrib.rangeOrg[0] >= 1950 && // =DATEVALUE("1/1/1950")
            attrib.rangeOrg[1] <= 2050 && // =DATEVALUE("1/1/2050")
            !isZipCode(attrib)
          );
        },
        convert: "DATETIME(%Y)",
        message: " stores year values?",
      },
      // Timestamp: -631152000 ... 2524608000
      // Range too wide. Need more complex analysis to detect if fields are potentially dates
    ];

    this.attribs.forEach((attrib: Attrib) => {
      numToDateMagic.some((_) => {
        if (_.filter(attrib)) {
          potentialChanges.push({
            i: '<i class="fa fa-calendar-day"></i>',
            q: attrib.attribName + _.message,
            a: () => {
              this.options.onLoad[attrib.template.str] = _.convert;
              // delete the type of existing attrib
              newConfig.summaries
                .filter((s) => s.name === attrib.attribName)
                .forEach((c) => delete c.type);
            },
          });
        }
        return false;
      });
    });

    // SPLIT CATEGORIES
    this.attribs.forEach((attrib) => {
      if (!(attrib instanceof Attrib_Categorical) || attrib.isEmpty()) return;

      var allText = "";
      attrib._aggrs.forEach((aggr) => {
        allText += aggr.id;
      });

      [
        { char: ",", convert: "SPLIT(\\s*,\\s*)" },
        { char: ";", convert: "SPLIT(\\s*;\\s*)" },
        { char: "|", convert: "SPLIT(\\s*\\|\\s*)" },
        { char: "+", convert: "SPLIT(\\s*\\+\\s*)" },
      ].forEach((_) => {
        var n = allText.split(_.char).length - 1;
        if (n <= allText.length / 20) return;
        potentialChanges.push({
          i: '<i class="far fa-tags"></i>',
          q: `<b>${attrib.attribName}</b> has multiple categories split by <b>${_.char}</b>`,
          a: () => {
            this.options.onLoad[attrib.template.str] = _.convert;
          },
        });
      });
    });

    // Detect ID field
    var recordTextCandidate = null;

    if (this.idSummaryName === "id") {
      let candidateSummaries: Attrib[] = this.attribs.filter((attrib) => {
        if (
          attrib instanceof Attrib_Categorical &&
          attrib.uniqueCategories() &&
          attrib.template.str &&
          attrib.template.str !== "id"
        ) {
          var allText = "";
          attrib._aggrs.forEach((aggr) => {
            allText += aggr.id;
          });
          attrib["___temp"] = allText.length;
          return true;
        }
        return false;
      });

      candidateSummaries.sort((a, b) => a["___temp"] - b["___temp"]); // shortest first

      var idCandidate = candidateSummaries[0];
      if (idCandidate) {
        potentialChanges.push({
          i: "<i class='far fa-fingerprint'></i>",
          q: `<b>${idCandidate.attribNameHTML}</b> is the unique fingerprint (ID) of the ${this.recordName}`,
          a: () => {
            newConfig.source.tables[0].id = idCandidate.template.str;
            if (this.attribWithName("id")) this.attribWithName("id").destroy();
            newConfig.summaries = newConfig.summaries.filter((_) => {
              return _.name !== "id";
            });
          },
        });
      }

      recordTextCandidate = candidateSummaries[1] || candidateSummaries[0];
    }

    if (!this.recordDisplay.codeBy.text) {
      if (!recordTextCandidate) {
        let candidateSummaries = this.attribs
          .filter((attrib) => {
            if (
              attrib.type === "categorical" &&
              attrib.template.str &&
              attrib.template.str !== "id" &&
              attrib._aggrs
            ) {
              attrib["___temp"] = attrib._aggrs.length;
              return true;
            }
            return false;
          })
          .sort((a, b) => b["___temp"] - a["___temp"]); // longest first
        recordTextCandidate = candidateSummaries[0];
      }
      if (recordTextCandidate) {
        potentialChanges.push({
          i: '<i class="fa fa-font"></i>',
          q: `<b>${recordTextCandidate.summaryName}</b> can be used as record text.`,
          a: () => {
            newConfig.recordDisplay.textBy = recordTextCandidate.summaryName;
            if (newConfig.recordDisplay.viewAs === "none") {
              newConfig.recordDisplay.viewAs = "list";
            }
          },
        });
      }
    }

    if (
      timeStampSummaries.length > 0 &&
      timeStampSummaries.length < 3 &&
      this.panels.bottom.isEmpty()
    ) {
      let attrib = timeStampSummaries[0];
      if (!attrib.block?.inDashboard) {
        potentialChanges.push({
          i: '<i class="fa fa-th"></i>',
          q: `Place <b>${attrib.attribName}</b> on dashboard bottom`,
          a: () => {
            newConfig.summaries.forEach((s) => {
              if (s.name === attrib.attribName) s.panel = "bottom";
            });
          },
        });
      }
    }

    this.attribs.forEach((attrib) => {
      delete attrib["___temp"];
    });

    if (potentialChanges.length === 0) {
      Modal.alert(i18n.Boost_NoSuggestions);
    } else {
      // set change by default
      potentialChanges.forEach((c) => {
        if (c.change === undefined) c.change = true;
      });
      Modal.autoChanges(potentialChanges).then(
        (potentialChanges: any[]) => {
          var reloadDashboard = false;
          potentialChanges.forEach((_) => {
            if (_.change) {
              _.a();
              reloadDashboard = true;
            } // apply
          });

          if (reloadDashboard) {
            // delete the loaded dataset, so onLoad work correctly
            Base.tables.delete(this.primaryTableName);

            (window as any).dashboard = new Browser(newConfig);
          } else {
            // No changes applied. Remove animation.
            if (this.DOM.boostButton)
              this.DOM.boostButton.classed("animate", false);
          }
        },
        () => {
          // Cancel changes
          if (this.DOM.boostButton)
            this.DOM.boostButton.classed("animate", false);
        }
      );
    }
  }

  public chartsLoaded = false;

  /** -- */
  async _loadCharts() {
    if (this.chartsLoaded) return;

    this.DOM.root.classed("dataLoaded", true);

    if (this.records.length === 0) {
      Modal.alert(`Dataset (${this.recordName}) includes no records.`);
      return;
    }

    // process non-function specifications.
    for (var _key in this.onLoad.main) {
      applyPreProc(_key, this.onLoad.main[_key], this.records);
    }
    this.onLoad.callback?.call(this);

    loadMapStandards();

    // apply panel layout
    if (!this.options.panels) {
      this.options.panels = {};
    }
    if (!this.options.panels.default) {
      this.options.panels.default = {};
    }
    if (this.options.panels.default.catBarWidth == null) {
      this.options.panels.default.catBarWidth = (() => {
        var totalWidth = this.divWidth;
        ["left", "middle", "right"].forEach((panelName) => {
          if (this.panels[panelName].isEmpty()) return;
          totalWidth -=
            this.panels[panelName].width_Real -
            this.panels[panelName].width_CatBars;
        });
        return Math.floor(totalWidth / 8);
      })();
    }
    ["left", "middle", "right"].forEach((side) => {
      if (this.options[side + "PanelLabelWidth"]) {
        if (!this.options.panels[side]) this.options.panels[side] = {};
        this.options.panels[side].catLabelWidth =
          this.options[side + "PanelLabelWidth"];
      }
    });

    this.breakdownMode.val = this.options.breakdownMode;
    this.stackedCompare.val = this.options.stackedCompare;
    this.filteringMode.val = this.options.filteringMode;
    this.showWholeAggr.val = this.options.showWholeAggr;
    this.mouseOverCompare.val = this.options.mouseOverCompare;

    this.records.forEach((rec) => this.allRecordsAggr.addRecord(rec));

    if (this.options.attribPanelWidth) {
      this.setAttribPanelWidth(this.options.attribPanelWidth);
    }

    if (this.options.colorTheme) {
      this.colorTheme = Object.assign(this.colorTheme, this.options.colorTheme);
    }

    Base.Panel_List.forEach((p) =>
      this.panels[p].importConfig(this.options.panels[p])
    );

    // look at first "autoDetect_RowCount" rows to identify the column names
    var firstFiveRow_Cols = {};
    function _recurse(_src, _trgt) {
      if (!_src) return;
      for (var _key in _src) {
        var _v = _src[_key];
        if (_v == null) continue;
        if (
          _v != null &&
          typeof _v === "object" &&
          !(_v instanceof Date) &&
          !Array.isArray(_v) &&
          !_v._timeseries_ &&
          !_v.geometry &&
          !_v.coordinates // map
        ) {
          // Object index
          _trgt[_key] = _trgt[_key] || {};
          _recurse(_v, _trgt[_key]);
        } else {
          _trgt[_key] = _v;
        }
      }
    }

    this.records
      .slice(0, Base.autoDetect_RowCount)
      .forEach((rec) => _recurse(rec.data, firstFiveRow_Cols));

    // Create a summary for each existing column in the data
    // Separated to a function to work recursively
    var addAttribs = (parentPath, _obj, timeSeriesParent = false) => {
      for (var attribName in _obj) {
        if (typeof attribName !== "string") {
          continue;
        }

        var _v = _obj[attribName];

        if (_v != null && _v._timeseries_) {
          let s = this.createAttrib(parentPath + attribName);
          if (s) {
            s.initializeAggregates();
          }
          // addAttribs(parentPath + attribName + "->", _v, true);
          //
        } else if (
          _v != null &&
          typeof _v === "object" &&
          !(_v instanceof Date) &&
          !Array.isArray(_v) &&
          !_v.geometry &&
          !_v.coordinates // map
        ) {
          addAttribs(parentPath + attribName + "->", _v);
        } else {
          if (!timeSeriesParent) {
            let s = this.createAttrib(parentPath + attribName);
            if (s) {
              s.initializeAggregates();
            }
          }
        }
      }
    };

    addAttribs("", firstFiveRow_Cols);

    this.recordDisplay = new RecordDisplay(
      this,
      this.options.recordDisplay || {}
    );

    if (this.options.metric) {
      var metric = this.options.metric;
      if (typeof metric === "string") metric = { type: "Sum", summary: metric };
      let a = this.attribWithName(metric.summary);
      if (a instanceof Attrib_Numeric) {
        this.measureSummary.val = a;
        this.measureFunc.val = metric.type;
      }
    }

    this.options.summaries = this.options.summaries || [];
    this.options.summaries.forEach((cfg) => this.applyBlockConfig(cfg));

    await this.recordDisplay.initialize();

    this.panels.bottom.refreshWidth();

    this.updateMiddlePanelWidth();

    this.records.forEach((rec) => rec.refreshFilterCache());
    this.updateRecordCount_Active();

    this.updateAfterFilter();

    // Load compare selections
    if (this.options.selections && !this.options.selections.auto) {
      var summary = this.attribWithName(this.options.selections.summary);
      Base.Compare_List.forEach((cT) => {
        var selection = this.options.selections[cT];
        if (!selection) return;
        if (!summary) return;

        summary.initializeAggregates();

        var aggr: Aggregate;
        if (summary instanceof Attrib_Categorical) {
          aggr = summary.getAggrWithLabel(selection.id);
        } else if (summary instanceof Attrib_Numeric) {
          this.flexAggrs[cT] = new Aggregate_Interval_Numeric(
            summary,
            selection.min as number,
            selection.max as number
          );
          aggr = this.flexAggrs[cT];
        }
        if (!aggr) return;

        if (this.setSelect_Compare(aggr, cT, false)) {
          this.lockSelect_Compare(false);
        }
      });
    }

    this.enableAnalytics = true; // before this, do not run analytics computations

    this.refreshConfigs();

    // This needs to be called after analytics mode and configs are set-up.
    // Auto-compare works on "top" categories, which depend on various analytics & chart modes.
    if (this.options.selections && this.options.selections.auto) {
      this.attribWithName(this.options.selections.summary)?.autoCompare();
    }

    this.checkBrowserZoomLevel();

    // hide overlay
    if (
      this.DOM.overlay_wrapper.selectAll(".overlay_modal").nodes().length === 0
    ) {
      this.DOM.overlay_wrapper.attr("show", "none");
    }

    this.dashboardMode.val = this.options.dashboardMode;

    this.options.onReady?.call(this);

    this.finalized = true;

    if (this.authorMode) this.refreshAttribList();

    // height of histograms depend on dashboard width, which depends on mode.
    this.updateLayout();

    setTimeout(() => this.setNoAnim(false), 1000);

    this.chartsLoaded = true;

    if (this.options.recordInDetail) {
      var record = Base.tables
        .get(this.primaryTableName)
        .getRecord(this.options.recordInDetail);
      if (record) this.recordDetailsPopup.updateRecordDetailPanel(record);
    }
  }

  /** -- */
  unregisterBodyCallbacks() {
    d3.select("body")
      .on("mousemove.layout", null)
      .on("mouseup.layout", null)
      .on("keydown.layout", null);
  }

  // ********************************************************************
  // Moving blocks across panels
  // ********************************************************************

  movedAttrib: Attrib = null;

  private showDropZones = false;

  /** -- */
  prepareDropZones(attrib: Attrib, dropSource) {
    this.movedAttrib = attrib;
    this.showDropZones = true;
    this.DOM.root.classed("showDropZone", true).attr("dropSource", dropSource);
    this.DOM.attribDragBox.style("display", "block").html(attrib.attribName);
  }

  /** -- */
  clearDropZones() {
    this.movedAttrib = null;
    this.showDropZones = false;
    this.unregisterBodyCallbacks();
    this.DOM.root
      .classed("showDropZone", false)
      .attr("dropattrtype", null)
      .attr("dropSource", null);
    this.DOM.attribDragBox.style("display", "none");
  }

  /** -- */
  autoAddAttib(attrib: Attrib): void {
    if (attrib?.block?.inDashboard) return; //

    if (attrib instanceof Attrib_Timeseries) {
      this.recordDisplay.setAttrib("timeSeries", attrib).then(() => {
        this.recordChartType.val = "timeseries";
      });
      return;
    }

    if (attrib instanceof Attrib_RecordGeo) {
      this.recordDisplay.setAttrib("geo", attrib).then(() => {
        this.recordChartType.val = "map";
      });
      return;
    }

    if (attrib instanceof Attrib_Categorical && attrib.uniqueCategories()) {
      this.recordDisplay.setAttrib("text", attrib).then(() => {
        this.recordChartType.val = "list";
      });
      return;
    }

    var target_panel: PanelName =
      {
        timestamp: "bottom",
        categorical: "left",
        numeric: "right",
      }[attrib.type] || "left";

    if (!this.panels[target_panel].welcomesNewBlock()) {
      target_panel = "middle";
    }

    attrib?.block?.addToPanel(this.panels[target_panel]);
  }

  /** -- */
  getGlobalActiveMeasure() {
    if (this.allRecordsAggr.recCnt("Active") === 0) return i18n["No [Record]"];
    var numStr = this.allRecordsAggr.measure("Active").toLocaleString();
    return this.getMeasureFormattedValue(numStr);
  }

  /** -- */
  updateRecordCount_Active() {
    this.DOM.activeRecordMeasure.html(this.getGlobalActiveMeasure());
  }

  /**************************************************************
   * FILTERS
   **************************************************************/

  filters: Filter_Base[] = [];
  filterCounter = 0;

  /** -- */
  get numOfActiveFilters() {
    return this.filters.filter((filter) => filter.isFiltered).length;
  }

  /** -- */
  isFiltered() {
    return this.numOfActiveFilters > 0;
  }

  /** -- */
  getFilteredSummaryText() {
    if (this.numOfActiveFilters === 0) return "";
    if (this.numOfActiveFilters > 1) return "filtered";
    var f = this.filters.find((filter) => filter.isFiltered);
    return f.getRichText_flipped();
  }

  /** -- */
  refresh_filterClearAll() {
    this.DOM.breadCrumbs_Filter.classed("isActive", this.isFiltered());
  }

  skipSortingSummary: Attrib_Categorical = null;

  /** -- */
  clearFilters_All(exceptThis: Filter_Base = null) {
    if (this.numOfActiveFilters === 0) return;
    // sometimes, it looks like the exceptThis selection is already filtered. Skip in that case
    if (
      this.numOfActiveFilters === 1 &&
      this.filters.filter((filter) => filter.isFiltered)[0] === exceptThis
    )
      return;
    if (this.skipSortingSummary) {
      // you can now sort the last filtered summary, attention is no longer there.
      this.skipSortingSummary.dirtySort = false;
    }

    // clear all registered filters
    this.filters.forEach(
      (filter) => filter !== exceptThis && filter.clearFilter(false)
    );

    // Only update records which were not wanted before.
    this.records.forEach((rec) => rec.filteredOut && rec.refreshFilterCache());
    this.updateRecordCount_Active();
    this.updateAfterFilter(true); // more results

    setTimeout(() => this.updateLayout_Height(), 1000); // update layout after 1 seconds
  }

  /** -- */
  updateAfterFilter(how = false) {
    Base.browser = this;

    Base.Compare_List.forEach((cT) => {
      var compared_Aggr = this.selectedAggrs[cT];
      if (compared_Aggr) this.refresh_Compare_Measures(compared_Aggr, cT);
    });

    this.refreshPanelsSyncedMeasureExtend();

    this.blocks.forEach((block) => block.updateAfterFilter(true)); // refresh viz
    this.recordDisplay.updateAfterFilter(how);

    this.updateWidth_CatMeasureLabels();
    this.refreshAllMeasureLabels();
    this.refresh_filterClearAll();

    this.filteringMode.refresh();

    this.needToRefreshLayout = true;
  }

  /**************************************************************
   * ANALYTICS MODES
   **************************************************************/

  enableAnalytics: boolean = false;

  private refreshAnalytics() {
    if (!this.enableAnalytics) return;

    this.DOM?.root
      ?.classed("stackedCompare", this.stackedCompare.val)
      .classed("stackedChart", this.stackedChart)
      .classed("showWholeAggr", this.showWholeAggr.val)
      .attr("breakdownMode", this.breakdownMode.val)
      .attr("measureFunc", this.measureFunc.val);

    this.updateWidth_CatMeasureLabels();

    if (this.stackedCompare.val) {
      this.attribs.forEach((attrib) => {
        if (attrib.measureScale_Log) attrib.measureScaleType.val = "linear";
      });
    }

    this.refreshPanelsSyncedMeasureExtend();

    this.attribsInDashboard.forEach((attrib) => {
      attrib.updateChartScale_Measure(true); // skip refresh viz
      attrib.block.refreshViz_All();
      attrib.block.refreshMeasureDescrLabel();

      if (attrib instanceof Attrib_Categorical) {
        if (attrib.catOrder_Dynamic && attrib.catSortBy !== "Active") {
          attrib.block.updateCatSorting(); // delay, with animation
        }
      }
    });

    this.recordDisplay.View?.refreshSelect_Compare();

    this.refreshAllMeasureLabels();
  }

  /** -------------------------------------------------- */
  // Auto-computed from stacked compare setting
  get stackedChart() {
    if (!this.stackedCompare.val) return false;
    if (this.activeComparisonsCount >= 1) return true;
    if (this.activeComparisonsCount === 0) return false;
    return this.lockedCompare[this.activeComparisons[0]]; // single comparison
  }

  /** -------------------------------------------------- */
  get exploreMode() {
    return this.dashboardMode.val === "Explore";
  }
  get adjustMode() {
    return this.dashboardMode.val === "Adjust";
  }
  get authorMode() {
    return this.dashboardMode.val === "Author";
  }
  get captureMode() {
    return this.dashboardMode.val === "Capture";
  }
  get saveMode() {
    return this.dashboardMode.val === "Save";
  }

  /** -------------------------------------------------- */
  get measureFunc_Count() {
    return this.measureFunc.val === "Count";
  }
  get measureFunc_Avg() {
    return this.measureFunc.val === "Avg";
  }
  get measureFunc_Sum() {
    return this.measureFunc.val === "Sum";
  }

  /** -------------------------------------------------- */
  get singleFiltering() {
    return this.filteringMode.val === "single";
  }
  get chainedFiltering() {
    return this.filteringMode.val === "chained";
  }

  /** -------------------------------------------------- */
  get absoluteBreakdown() {
    return this.breakdownMode.val == "absolute";
  }
  get percentBreakdown() {
    return this.breakdownMode.val != "absolute";
  }
  get relativeBreakdown() {
    return this.breakdownMode.val == "relative";
  }
  get dependentBreakdown() {
    return this.breakdownMode.val == "dependent";
  }
  get totalBreakdown() {
    return this.breakdownMode.val == "total";
  }

  /** Updates shared (synced) measure extent within the panel (so bar charts can share the same scale) */
  private refreshPanelsSyncedMeasureExtend() {
    Object.values(this.panels).forEach((panel) =>
      panel.refreshSharedMeasureExtent()
    );
  }

  /** -- */
  refreshAllMeasureLabels(t: MeasureType = null, _fixed = false) {
    if (!t) {
      // no mode specified, go through it all
      this.refreshAllMeasureLabels("Active", true);
      this.activeComparisons.forEach((cT) =>
        this.refreshAllMeasureLabels(cT, true)
      );
      return;
    }
    this.blocks.forEach((block) => {
      block.refreshMeasureLabelText(t);
      if (block instanceof Block_Categorical) {
        // refresh map visualization (TODO: fix/improve this part)
        if (!_fixed && block.isView_Map) block.refreshViz(t);
      }
    });
  }

  /** -- */
  updateWidth_CatMeasureLabels() {
    Base.Panel_List.forEach((p) =>
      this.panels[p].updateWidth_CatMeasureLabels()
    );
  }

  /**************************************************************
   * COMPARISONS
   **************************************************************/

  /** True if given compare type is locked */
  lockedCompare: { [key in CompareType]?: boolean } = {};

  /** Returns selected aggregate, if selection is active on given compare type */
  selectedAggrs: { [key in CompareType]?: Aggregate } = {};

  /** True if selected comparison is active (checks selected aggregate)  */
  vizActive(key: CompareType) {
    return this.selectedAggrs[key] !== null;
  }

  /** Locked attribute - equal to compared attribute, unless the compared one is not locked */
  get lockedAttrib(): Attrib {
    var cT = Base.Compare_List.find((cT) => this.lockedCompare[cT]);
    return cT ? this.selectedAggrs[cT].attrib : null;
  }

  /** -- */
  get comparedAttrib(): Attrib | null {
    var cT = Base.Compare_List.find((cT) => this.selectedAggrs[cT]);
    return cT ? this.selectedAggrs[cT].attrib : null;
  }

  /** Can select aggregate only with current active compared attribute */
  can_setSelect_Compare(aggr: Aggregate) {
    return !this.comparedAttrib || this.comparedAttrib === aggr.attrib;
  }

  /** -- */
  refresh_Compare_Measures(aggr, cT) {
    this.resetAllAggrMeasures(cT);
    aggr.records.forEach((record) => record.addToAggrMeasure(cT));
  }

  get activeComparisonsCount() {
    return this.activeComparisons.length;
  }
  get activeComparisons(): CompareType[] {
    return Base.Compare_List.filter((cT) => this.vizActive(cT));
  }
  isCompared() {
    return this.activeComparisonsCount > 0;
  }

  /** Which Comparison (Compare_X) to use as highlighting */
  get Compare_Highlight(): CompareType {
    return Base.Compare_List.find((cT) => {
      if (!this.lockedCompare[cT]) return cT;
    });
  }

  /** Return the name for remaining "other" selection. Only valid if using categorical */
  get otherNameInCompare(): string {
    if (!this.comparedAttrib) return;
    if (this.comparedAttrib.type === "categorical") {
      var notCompared = this.comparedAttrib._aggrs.filter((_) => !_.compared);
      // only one other unselected option, no missing values, all that remains fall into one category
      if (
        notCompared.length === 1 &&
        this.comparedAttrib.noValueAggr.recCnt("Total") === 0
      ) {
        return notCompared[0].label;
      }
    }
    return i18n.Other;
  }

  /** -- */
  crumbs: { [key in CompareType]?: BreadCrumb } = {};

  // creates a new breadcrumb for active highlight, and returns the previous crumb
  createNewCrumb(): BreadCrumb {
    let cT: CompareType = this.Compare_Highlight;
    var r = this.crumbs[cT] || new BreadCrumb(this, cT);
    this.crumbs[cT] = new BreadCrumb(this, cT);
    return r;
  }

  isComparedSummaryMultiValued(): boolean {
    var a = this.comparedAttrib;
    if (a instanceof Attrib_Categorical) {
      return a.isMultiValued;
    }
    return false;
  }

  /** -- */
  get flexAggr_Highlight(): Aggregate_Interval<IntervalT> {
    return this.flexAggrs[Base.Compare_List.find((cT) => !this.vizActive(cT))];
  }

  /** -- */
  set flexAggr_Highlight(aggr: Aggregate_Interval<IntervalT>) {
    this.flexAggrs[Base.Compare_List.find((cT) => !this.vizActive(cT))] = aggr;
  }

  /** -- */
  refreshViz_Compare_All() {
    this.recordDisplay.refreshViz_Compare_All();
    this.blocks.forEach((block) => block.refreshViz_Compare_All());
  }

  /** -- */
  refreshComparedSummary() {
    if (!this.comparedAttrib) return;

    this.comparedAttrib.addDOMBlockName(
      this.DOM.breadCrumbs_Compare.select(".lockCrumbSummary")
    );

    this.comparedAttrib.block.DOM.root?.classed("comparedSummary", true);
  }

  /** -- */
  lockSelect_Compare(refreshAnalytics = true) {
    var cT = this.Compare_Highlight;
    if (!cT) return false; // cannot, sorry

    if (!this.vizActive(cT)) return false;
    if (this.lockedCompare[cT]) return false;
    if (!this.selectedAggrs[cT]) return false;

    if (!this.selectedAggrs[cT].attrib?.isComparable.val) {
      return false;
    }

    this.selectedAggrs[cT].lockSelection();
    this.lockedCompare[cT] = true;

    this.lockedAttrib?.block?.DOM.root?.classed("lockedAttrib", true);

    if (refreshAnalytics) this.refreshAnalytics();

    return true;
  }

  selectTimeouts: { [key in CompareType]?: number } = {};

  /** -- */
  setSelect_Compare(
    selAggregate: Aggregate,
    cT: CompareType = null,
    refreshAnalytics = true
  ) {
    if (!selAggregate) return false;

    if (!cT) cT = this.Compare_Highlight;
    if (!cT) return false; // cT must be set beyond this point

    if (this.selectTimeouts[cT]) {
      window.clearTimeout(this.selectTimeouts[cT]);
      this.clearSelect_Compare(cT, false, true);
      delete this.selectTimeouts[cT];
    }

    // If there's active compared summary, cannot compare aggregate from another summary
    if (
      this.comparedAttrib &&
      selAggregate.attrib &&
      this.comparedAttrib !== selAggregate.attrib
    ) {
      return false;
    }

    if (selAggregate !== this.flexAggr_Highlight) {
      // Already comparing that aggregate, nothing else to do
      if (this.vizActive(cT)) return cT;
      if (selAggregate.compared) return cT;
    }

    this.addedCompare = true;

    this.DOM.root
      .classed("select" + cT, true)
      .classed("comparedMultiValue", this.isComparedSummaryMultiValued());

    this.DOM.breadCrumbs_Compare.classed("isActive", true);

    this.selectedAggrs[cT] = selAggregate;
    this.selectedAggrs[cT].selectCompare(cT);

    this.crumbs[cT].showCrumb(cT, selAggregate.attrib?.summaryFilter);

    this.refreshComparedSummary();

    if (selAggregate.attrib instanceof Attrib_Interval) {
      selAggregate.attrib.block.refreshIntervalSlider([cT]);
    }

    this.blocks.forEach((block) => {
      if (block instanceof Block_Categorical) {
        if (block.isView_Dropdown) block.dropdown_refreshCategories();
      }
    });

    if (refreshAnalytics) {
      this.refreshConfigs();
    }

    return cT;
  }

  /** -- */
  clearSelect_Compare(
    cT: CompareType | CompareType[] = this.Compare_Highlight,
    finalize = true,
    noWait = false
  ) {
    if (!cT) return;

    if (!noWait && !Array.isArray(cT)) {
      if (this.selectTimeouts[cT]) window.clearTimeout(this.selectTimeouts[cT]);
      this.selectTimeouts[cT] = window.setTimeout(() => {
        this.clearSelect_Compare(cT, finalize, true);
        delete this.selectTimeouts[cT];
      }, 750);
      return;
    }

    var comparedSummary_old = this.comparedAttrib;
    var lockedSummary_old = this.lockedAttrib;

    var finishClearSelect = () => {
      this.recordDisplay.refreshCompareLegend();

      this.blocks.forEach((block) => {
        if (block instanceof Block_Categorical && block.isView_Dropdown) {
          block.dropdown_refreshCategories();
        }
      });

      if (this.comparedAttrib !== comparedSummary_old) {
        comparedSummary_old.block.DOM.root?.classed("comparedSummary", false);
      }

      if (this.lockedAttrib !== lockedSummary_old) {
        lockedSummary_old.block?.DOM.root?.classed("lockedAttrib", false);
      }

      if (finalize) {
        this.refreshConfigs();
      }
    };

    if (Array.isArray(cT)) {
      cT.forEach((_) => this.clearSelect_Compare(_, false, noWait));
      finishClearSelect();
      return;
    }

    if (typeof cT !== "string") return;
    if (!this.vizActive(cT)) return;

    this.addedCompare = false;

    this.crumbs[cT].removeCrumb();
    this.lockedCompare[cT] = false;

    if (this.selectedAggrs[cT]) {
      let a = this.selectedAggrs[cT].attrib;
      if (a instanceof Attrib_Interval) {
        a.block.refreshIntervalSlider([cT]);
      }
      this.selectedAggrs[cT].clearCompare(cT);
      this.selectedAggrs[cT] = null;
    }

    this.DOM.root.classed("select" + cT, this.vizActive(cT));
    this.DOM.breadCrumbs_Compare.classed(
      "isActive",
      this.activeComparisonsCount !== 0
    );

    this.resetAllAggrMeasures(cT);

    if (finalize) {
      finishClearSelect();
    }
  }

  /** -- */
  private resetAllAggrMeasures(t) {
    this.allAggregates.forEach((aggr) => aggr.resetMeasure(t));
  }

  /**************************************************************
   * MEASUREMENTS
   **************************************************************/

  /** -- */
  hasIntOnlyMeasure() {
    return (
      this.measureFunc_Count ||
      (this.measureFunc_Sum && !this.measureSummary.val.hasFloat)
    );
  }
  /** --*/
  measureSumWithNegativeValues() {
    return this.measureFunc_Sum && this.measureSummary.val.hasNegativeValues();
  }
  /** --*/
  measureWithPositiveValues() {
    if (this.measureFunc_Count) return true;
    // TODO: This may return true, but other code relies on disabling when using avg measures
    if (this.measureFunc_Avg) return false;
    return (
      this.measureSummary.val && !this.measureSummary.val.hasNegativeValues()
    );
  }

  /** funcType: "Count", Sum" or "Avg" */
  refreshMeasureMetric() {
    if (!this.records) return; // if calling the function too early in initialization
    let attrib = this.measureSummary?.val;
    if (!attrib) return;

    this.records.forEach(
      this.measureFunc_Count
        ? (rec: Record) => {
            rec.measure_Self = 1;
          }
        : (rec: Record) => {
            rec.measure_Self = attrib.getRecordValue(rec);
          }
    );

    this.allAggregates.forEach((aggr) => aggr.resetAggregateMeasures());
    this.blocks.forEach((block) => block.updateAfterFilter(false));

    this.recordDisplay.refreshRecordVis();

    this.updateRecordCount_Active();

    this.refreshAnalytics();

    if (attrib.hasTimeSeriesParent()) {
      this.recordDisplay.currentTimeKey.val = attrib.timeKey;
    }
  }

  /**************************************************************
   * ZOOM LEVELS (UI)
   **************************************************************/

  /** -- */
  get dashZoomLevel() {
    var r = "1.00";
    try {
      r = window.localStorage.getItem("kshfZoom") || "1.00";
    } catch (error) {}
    return r;
  }

  /** -- */
  attemptToFixBrowserZoomLevel(
    multiplier = "1.00" /*reset*/,
    forceReload = false
  ) {
    // Doesn't apply in firefox.
    this.DOM.root.style("zoom", multiplier);
    try {
      window.localStorage.setItem("kshfZoom", multiplier);
    } catch (error) {}
    if (forceReload) window.location.reload();
  }
  /** -- */
  detectPageZoom() {
    // Other page size detection approaches:
    // document.documentElement.clientWidth;
    // document.documentElement.scrollWidth;

    // CONSTANT - Does not seem to be affected by zoom level. Thus, serves as the "default" (100%) zoom
    var windowOuterWidth = window.outerWidth;

    // On safari,
    // - Page zoomed in: innerWidth < outerwidth.
    // - Page zoomed out: innerWidth > outerWidth
    var windowInnerWidth = window.innerWidth;

    if (window.parent) {
      try {
        // if placed inside an iframe, window.outerWidth measures the size of the top window, not the current frame.
        // so, instead, when there's access to parent, I am using parent's zoom level detection.
        windowOuterWidth = window.parent.outerWidth;
        windowInnerWidth = window.parent.innerWidth;
      } catch (exception) {
        console.log("page detect zoom exception: " + exception);
        // use pageZoom URL parameter (TEMP - TODO. Not documented, may be removed in future)
        let URLparams = new URL((document as any).location).searchParams;
        if (URLparams && URLparams.get("pageZoom")) {
          return Number(URLparams.get("pageZoom")) || 1;
        }
        return 1;
      }

      // visualViewport: Generally not useful. It reacts to pinch zoom and such.
      // Didn't find a useful case where it's needed
      // window.visualViewport.scale = Chrome only, pinch effect (not useful for detecting zoom level)
      //windowOuterWidth = window.visualViewport.width;
      // on safari, visualViewport.width is the window.innerWidth,
    }

    var pageZoomLevel_num = 1;

    if (windowInnerWidth !== windowOuterWidth) {
      pageZoomLevel_num = windowInnerWidth / windowOuterWidth;
    } else {
      // On chrome, changing zoom level changes devicePixelRatio, BUT it also changes inner/outer width
      // and that change is captured in the code above before it comes here...
      // devicePixelRatio
      // - Not very helpful
      // - On Safari, devicePixelRatio is CONSTANT (independent of zoom level). Cannot be used for detection.
      // - On Firefox & Chrome, it is dependent on zoom level
      //   - It can be "2" by default (retina displays, for example).
      //   - Then what does a value of 1.5 mean? There's no way to know "native" zoom level, thus is not reliable.
      /*
      var devicePixelRatio = window.devicePixelRatio ? window.devicePixelRatio : 1;
      if(devicePixelRatio!==undefined && devicePixelRatio!==1 && devicePixelRatio!==2){
        if(devicePixelRatio>2) devicePixelRatio = devicePixelRatio / 2; 
        var multiplier = 1/devicePixelRatio;
      }
      */
    }

    return pageZoomLevel_num;
  }
  /** -- */
  checkBrowserZoomLevel() {
    var pageZoomLevel_num = this.detectPageZoom();

    // If diff between detected ideal and current is less than 1%, no need to change
    if (Math.abs(pageZoomLevel_num - parseFloat(this.dashZoomLevel)) < 0.01) {
      return;
    }

    setTimeout(() => {
      this.showWarning(i18n.ZoomLevelWarning);
      this.DOM.warningText
        .select(".attemptToFix")
        .on("click", () =>
          this.attemptToFixBrowserZoomLevel(pageZoomLevel_num.toFixed(2), true)
        );
      this.DOM.warningText
        .selectAll(".dismiss")
        .on("click", () => this.hideWarning());
    }, 1000);
  }

  /**************************************************************
   * UPDATING LAYOUT
   **************************************************************/

  /** -- */
  updateLayout() {
    if (this.finalized !== true) return;
    this.updateWidth_Total();
    this.updateLayout_Height();
    this.updateMiddlePanelWidth();
    this.panels.bottom.refreshWidth();
  }
  /** -- */
  filters_wrap_letItWrap = false;
  checkAndAdjustBreadcrumbs() {
    if (this.filters_wrap_letItWrap) return;
    var wrapped = this.isBreadcrumbAreaWrapped();
    if (wrapped) {
      this.DOM.breadCrumbs_Filter.classed("collapsed", true);
      this.filters_wrap_letItWrap = true;
    }
  }
  /** -- */
  isBreadcrumbAreaWrapped() {
    var DOM = this.DOM.breadCrumbs_Filter.node();
    if (DOM.classList.contains("collapsed")) return false; // not wrapped
    var _top = null,
      _height = null;
    var DOM_items = this.DOM.panel_Basic_In.selectAll(".breadCrumb").nodes();
    return DOM_items.some((DOM_item) => {
      if (_top != null && DOM_item.offsetTop > _top + _height * 0.7) {
        return true;
      }
      _height = DOM_item.offsetHeight;
      _top = DOM_item.offsetTop;
      return false;
    });
  }
  /** -- */
  updateLayout_Height() {
    if (!this.recordDisplay) {
      return; // dashboard not initialized yet
    }

    let divHeight = this.DOM.root.nodes()[0].offsetHeight;

    var divHeight_Total =
      divHeight -
      this.height_PanelHeader -
      this.height_PanelFooter -
      2 * Base.width_PanelGap;

    // ****************************************************************
    // BOTTOM PANEL
    var targetHeight_bottom = divHeight_Total;
    // In case there is something above the bottom panel, target half the size
    if (
      this.panels.left.hasBlocks() ||
      this.panels.right.hasBlocks() ||
      this.panels.middle.hasBlocks() ||
      this.recordChartType.val !== "none"
    ) {
      // maximum half height if there is any other content
      targetHeight_bottom *= 0.5;
    }
    this.panels.bottom.setHeightAndLayout(targetHeight_bottom);

    var topPanelsHeight = divHeight_Total - this.panels.bottom.height;

    // ****************************************************************
    // LEFT PANEL
    this.panels.left.setHeightAndLayout(topPanelsHeight);

    // ****************************************************************
    // RIGHT PANEL
    this.panels.right.setHeightAndLayout(topPanelsHeight);

    // ****************************************************************
    // MIDDLE PANEL
    var targetHeight_middle = topPanelsHeight;
    if (this.recordChartType.val !== "none") {
      targetHeight_middle -= this.recordDisplay.collapsed
        ? this.recordDisplay.height_Header + 4
        : 200;
      targetHeight_middle -= Base.width_PanelGap;
    }
    this.panels.middle.setHeightAndLayout(targetHeight_middle);

    // The part where summary DOM is updated
    this.blocks.forEach((block) => block.refreshHeight());

    if (!this.recordDisplay.collapsed && this.recordChartType.val !== "none") {
      var listDisplayHeight =
        topPanelsHeight -
        this.recordDisplay.height_Header -
        this.panels.middle.height;
      if (this.showDropZones && this.panels.middle.isEmpty())
        listDisplayHeight *= 0.5;
      this.recordDisplay.setHeight(listDisplayHeight);
    }
  }

  /** -- */
  updateMiddlePanelWidth() {
    // for some reason, on page load, this variable may be null. urgh.
    var widthMiddlePanel =
      this.width_Canvas -
      this.panels.left.width_Real_withGap -
      this.panels.right.width_Real_withGap;

    this.panels.middle.setWidth(widthMiddlePanel);
    this.panels.middle.refreshWidth();
    // set summaries are also always placed in middle panel.
    this.blocks
      .filter((block) => block.attrib.type === "setpair")
      .forEach((block) => block.refreshWidth());

    if (this.recordDisplay) {
      this.recordDisplay.setWidth(widthMiddlePanel);
    }
  }

  // ********************************************************************
  // Value access
  // ********************************************************************

  /**  */
  getPercentageValue(_val: number, sT, breakMode = null, aggr = null) {
    breakMode = breakMode || this.breakdownMode.val;
    if (breakMode === "absolute") {
      return _val;
    }
    if (breakMode === "relative" && aggr) {
      if (!this.isCompared()) {
        return (100 * _val) / this.allRecordsAggr["Active"].measure;
      }
      if (aggr.Active.measure === 0) return 0;
      return (100 * _val) / aggr.Active.measure; // divide by aactive measure of aggregate
    }
    if (breakMode === "dependent") {
      return (100 * _val) / this.allRecordsAggr[sT].measure; // divide by total's compared measure
    }
    if (breakMode === "total") {
      return (100 * _val) / this.allRecordsAggr["Active"].measure; // divide by total's Active measure
    }
  }
  /** -- */
  getChartValue(aggr: Aggregate, sT) {
    return this.getPercentageValue(aggr.measure(sT), sT, null, aggr);
  }
  /** -- */
  getMeasureValue(
    aggr: Aggregate,
    sT: MeasureType = "Active",
    breakMode = null,
    offset: MeasureType[] = []
  ) {
    var _val = aggr.measure(sT);

    if (sT === "Active" && offset) {
      offset.forEach((t: MeasureType) => {
        _val -= aggr.measure(t);
      });
    }

    return this.getPercentageValue(_val, sT, breakMode, aggr);
  }
  /** -- */
  getMeasureFormattedValue(_val, isSVG = false) {
    return this.measureFunc.val !== "Count"
      ? this.measureSummary.val.getFormattedValue(_val, isSVG)
      : _val;
  }
  /** -- */
  getValueLabel(_val, isSVG = false, decimals = 1, withPercentage = null) {
    withPercentage =
      withPercentage != null ? withPercentage : this.percentBreakdown;
    if (withPercentage) {
      if (_val !== 100 && _val !== 0) _val = _val.toFixed(decimals);
      return _val + (isSVG ? "%" : "<span class='unitName'>%</span>");
    }

    if (this.measureFunc_Count) {
      return Util.formatForItemCount(_val);
    }

    var measureSummary = this.measureSummary.val;

    if (
      this.measureFunc_Sum &&
      !measureSummary.hasNegativeValues() &&
      !measureSummary.hasFloat
    ) {
      return Util.formatForItemCount(_val, measureSummary.unitName);
    }

    if (_val <= -1000 || _val >= 1000) {
      return Util.formatForItemCount(_val, measureSummary.unitName);
    }

    if (this.measureFunc_Avg) {
      _val = _val.toFixed(decimals);
    }

    return this.measureSummary.val.getFormattedValue(_val);
  }

  // ********************************************************************
  // Export & import
  // ********************************************************************

  /** -- */
  exportData() {
    var out = [];
    var _clear = (_data) => {
      for (let attribName in _data) {
        var attr = _data[attribName];
        if (typeof attr !== "object") continue;
        if (attr == null) continue;
        if (attribName === "_timeseries_") {
          delete _data[attribName];
        }
        if (attr._timeseries_) {
          delete attr._timeseries_;
        }
        for (let key in attr) {
          if (attr[key] === "") delete attr[key];
          if (typeof attr[key] == "object") _clear(attr[key]);
        }
      }
    };
    this.records.forEach((record) => {
      if (record.filteredOut) return;
      let dataCopy = Object.assign({}, record.data);
      _clear(dataCopy);
      out.push(dataCopy);
    });
    return out;
  }

  exportConfig(): ConfigSpec {
    var config: ConfigSpec = {
      domID: this.domID !== Base.defaultDOM ? this.domID : undefined,
      recordName: this.recordName,
      source: Object.assign({}, this.options.source),
      description: this.options.description || undefined,
      attribPanelWidth:
        this.attribPanelWidth !== Base.width_AttribPanelDefault
          ? this.attribPanelWidth
          : undefined,
      summaries: [],
      panels: {},
      recordDisplay: this.recordDisplay.exportConfig() as any,

      colorTheme: this.colorTheme.exportConfig(),
    };

    Object.values(this.configs).forEach((_cfg) => _cfg.exportConfigTo(config));

    if (!this.measureFunc_Count && this.measureSummary.val) {
      config.metric = {
        type: this.measureFunc.val,
        summary: this.measureSummary.val.template.str,
      };
    }

    // ***********************************************
    // Export summary configuration
    var _exportAttrib = (attrib: Attrib) => {
      if (attrib.isExportable()) {
        var cfg = attrib.exportConfig() as SummarySpec;
        Util.removeEmptyKeys(cfg);
        config.summaries.push(cfg);
      }
    };
    // export attribs within dashboard, ordered by block, in view order
    Object.values(this.panels).forEach((panel) =>
      panel.blocks.forEach((block) => _exportAttrib(block.attrib))
    );
    // exports attribs that are not within the panels already / not exported yet
    this.attribs
      .filter((attrib) => !attrib?.block?.inDashboard)
      .forEach(_exportAttrib);

    // Export panel configurations
    for (let [name, panel] of Object.entries(this.panels)) {
      if (panel.hasBlocks()) {
        config.panels[name] = panel.exportConfig();
      }
    }

    // Export selections
    var comparedAttrib = this.comparedAttrib;
    if (comparedAttrib) {
      config.selections = {
        summary: comparedAttrib.attribName,
      };
      Base.Compare_List.forEach((cT) => {
        if (!this.selectedAggrs[cT] || !this.selectedAggrs[cT].locked) return;
        config.selections[cT] = this.selectedAggrs[cT].exportAggregateInfo();
      });
    }

    // remove all settings that are {}
    let clearSetting = (_) => {
      if (!Object.keys(config[_]).length) delete config[_];
    };
    clearSetting("panels");
    clearSetting("colorTheme");

    Util.removeEmptyKeys(config);

    return config;
  }
}
