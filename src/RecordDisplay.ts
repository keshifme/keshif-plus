import noUiSlider from "nouislider/dist/nouislider.mjs";
import "nouislider/dist/nouislider.css";
import { DateTime } from "luxon/build/es6/luxon";

import { select } from "./d3_select";
import { scaleLinear, scaleSqrt, scaleThreshold, scaleTime } from "d3-scale";
import { max, extent, quantile } from "d3-array";
import { easePolyInOut } from "d3-ease";
import { format } from "d3-format";
import { hsl } from "d3-color";
import { arc } from "d3-shape";

import { TimeData, TimeKey } from "./TimeSeriesData";

import { Filter_Record, Filter_Text } from "./Filter";
import { Config } from "./Config";
import { Util } from "./Util";
import { i18n } from "./i18n";
import { Modal } from "./UI/Modal";
import { AttribDropdown } from "./UI/AttribDropdown";
import { ConfigPanel } from "./UI/ConfigPanel";
import { Browser, ColorThemeType } from "./Browser";
import { Base } from "./Base";
import { Aggregate_PointCluster, Attrib_RecordGeo } from "./Attrib_RecordGeo";

import { Attrib_Numeric } from "./Attrib_Numeric";
import { Attrib_Timeseries } from "./Attrib_Timeseries";
import { Attrib_Interval } from "./Attrib_Interval";
import { Attrib } from "./Attrib";
import { Attrib_Categorical } from "./Attrib_Categorical";

import { Record } from "./Record";
import { RecordView } from "./RecordView";
import { RecordView_Timeseries } from "./RecordView_Timeseries";
import { RecordView_Map } from "./RecordView_Map";
import { RecordView_Scatter } from "./RecordView_Scatter";
import { RecordView_List } from "./RecordView_List";

import {
  CompareType,
  IntervalT,
  RecordDisplayType,
  RecordVisCoding,
} from "./Types";

const d3 = {
  select,
  scaleLinear,
  scaleSqrt,
  scaleThreshold,
  scaleTime,
  max,
  extent,
  quantile,
  easePolyInOut,
  format,
  hsl,
  arc,
};

declare let L: any;

/** -- */
export class RecordDisplay {
  readonly browser: Browser;

  // ********************************************************************
  // record vis mapping attributes
  // ********************************************************************

  codeBy: {
    text: Attrib_Categorical;
    textBrief: Attrib_Categorical;
    // numeric
    sort: Attrib_Interval<IntervalT>;
    scatterX: Attrib_Numeric;
    scatterY: Attrib_Numeric;
    // if coloring aggregates, can be set to "_measure_", whioch links to active measure attrib
    size: Attrib_Numeric | "_measure_";
    color: Attrib_Numeric | "_measure_";
    // timeseries
    timeSeries: Attrib_Timeseries;
    // geo
    geo: Attrib_RecordGeo;
  } = {
    text: null,
    textBrief: null,
    sort: null,
    scatterX: null,
    scatterY: null,
    size: null,
    color: null,
    timeSeries: null,
    geo: null,
  };

  // ********************************************************************
  // Color control (shared)
  // ********************************************************************

  invertedColorTheme: boolean = false;
  recordColorStepTicks: boolean = false;
  recordColorScale: any = null;
  recordColorScaleTicks: any = null;
  mapColorScalePos: any = null;

  // ********************************************************************
  // Time keys / current key (used for synchronizing time keys)
  // ********************************************************************

  timeKeys: TimeKey[] = [];
  currentTimeKey: Config<TimeKey>;
  timeKeySlider: any;
  timeKeySlider_PauseUpdate: boolean = true;

  // ********************************************************************
  // Point-based records
  // ********************************************************************

  recordPointSize: Config<number>;
  recordRadiusScale: any;
  recordDrawArc: any;
  drawArc: any;

  // ********************************************************************
  // ...
  // ********************************************************************

  // general text filter (on text attribute)
  textFilter: Filter_Text = null;
  // record filter: to filter out individual records
  recordFilter: Filter_Record = null;

  collapsed: boolean = false;

  DOM: { [index: string]: any } = {};

  View: RecordView; // TODO
  Views: { [index: string]: RecordView } = {};

  config: any; // TODO

  recordConfigPanel: ConfigPanel; // TODO

  configs: { [index: string]: Config<any> } = {};

  visMouseMode: "pan" | "draw" | "filter" = "pan";

  async setView(_type: RecordDisplayType) {
    if (_type === "none") {
      this.View = null;
      return;
    }

    // Create the view object if it does not exist.
    if (!this.Views[_type]) {
      var recordDisplayOptions = this.browser.options.recordDisplay || {};
      if (_type === "list") {
        this.Views[_type] = new RecordView_List(this, recordDisplayOptions);
      } else if (_type === "map") {
        this.Views[_type] = new RecordView_Map(this, recordDisplayOptions);
      } else if (_type === "scatter") {
        this.Views[_type] = new RecordView_Scatter(this, recordDisplayOptions);
      } else if (_type === "timeseries") {
        this.Views[_type] = new RecordView_Timeseries(
          this,
          recordDisplayOptions
        );
      }
    }

    this.View = this.Views[_type];

    if (!this.codeBy.text) {
      var potentials = this.browser.attribs.filter(
        (attrib) => attrib instanceof Attrib_Categorical
      ) as Attrib_Categorical[];

      if (potentials.length === 0) {
        throw new Error("Data must have at least one categorical attribute.");
      }

      // find the categorical attribute with most number of categories (i.e. most unique)
      var mostUnique = potentials[0];
      potentials.forEach((catAttr) => {
        if (mostUnique._aggrs.length < catAttr._aggrs.length) {
          mostUnique = catAttr;
        }
      });

      this.codeBy.text = mostUnique;
    }

    this.recordConfigPanel.hide();

    await this.View.initView_DOM();

    await this.View.prepareAttribs();

    this.refreshViewAsOptions();

    this.View.initView();

    this.View.initialized = true;

    this.View.updateRecordVisibility();

    this.refreshWidth();
    this.View.refreshViewSize(10);
  }

  /** -- */
  constructor(browser: Browser, config) {
    this.browser = browser;

    this.recordFilter = new Filter_Record(this.browser);

    this.config = Object.assign({}, config);

    if (this.config.mapUsePins !== false) {
      this.config.mapUsePins = true;
    }

    this.recordPointSize = new Config<number>({
      cfgClass: "recordPointSize",
      cfgTitle: "Point Size",
      iconClass: "fa fa-dot",
      UI: { disabled: true },
      default: Base.defaultRecordPointSize,
      parent: this,
      helparticle: "5e8907cf2c7d3a7e9aea6499",
      preSet: async (v) => Math.max(0.5, Math.min(v, Base.maxRecordPointSize)),
      onSet: async () => {
        if (!this.recordPointSize) return;
        this.updateRecordSizeScale();
      },
    });

    this.currentTimeKey = new Config<TimeKey>({
      cfgClass: "currentTimeKey",
      cfgTitle: "Focused Time Key",
      iconClass: "fa fa-arrows-v",
      default: null,
      parent: this,
      UI: { disabled: true },
      helparticle: "5b37053a2c7d3a0fa9a3a30c",
      onRefreshDOM: () => {
        if (!this.DOM.root) return;
        this.DOM.root.classed("hasTimeKey", this.hasTimeKey);

        if (!this.currentTimeKey.get()) return;
        if (!this.DOM.timeAnimation) return;
        if (!this.hasTimeKey) return;

        this.DOM.timeAnimation
          .select(".rangeTick-min")
          .text(this.timeKeys[0]._time_src);
        this.DOM.timeAnimation
          .select(".rangeTick-max")
          .text(this.timeKeys[this.timeKeys.length - 1]._time_src);
        this.DOM.timeAnimation
          .select(".rangeTick-cur")
          .text(this.currentTimeKey.get()._time_src)
          .style(
            "left",
            (100 * this.currentTimeKey.get()._index) /
              (this.timeKeys.length - 1) +
              "%"
          );

        this.timeKeySlider_PauseUpdate = true;
        this.timeKeySlider.updateOptions({
          range: {
            min: 0,
            max: Math.max(1, this.timeKeys.length - 1),
          },
        });
        this.timeKeySlider.setHandle(0, this.currentTimeKey.get()._index, false);
        this.timeKeySlider_PauseUpdate = false;

        this.DOM.timeAnimation
          .select(".timeKeySelect")
          .selectAll("option")
          .data(this.timeKeys, (d) => d._time)
          .join(
            (enter) => enter.append("option").text((d) => d._time_src),
            (update) => update,
            (exit) => exit.remove()
          )
          .attr("selected", (timeKey) =>
            timeKey._time_src === this.currentTimeKey.get()._time_src
              ? true
              : null
          );
      },
      preSet: async (v, obj) => {
        if (v === "previous" && obj._value) {
          v = this.timeKeys[obj._value._index - 1];
        }

        if (v === "next" && obj._value) {
          v = this.timeKeys[obj._value._index + 1];
        }

        if (!v || !v._time_src) return;

        // _index may have been updated. Better to refresh
        v = this.timeKeys.find((_) => _._time_src === v._time_src);

        if (!v) return;
        return v;
      },
      onSet: async (v: TimeKey) => {
        if (!v) return;

        // sync timekey across all vis attributes
        this.skipRefreshRecordVis = true;

        (
          ["sort", "scatterX", "scatterY", "color", "size"] as RecordVisCoding[]
        ).forEach((_type) => {
          var targetAttrib = this.codeBy[_type];
          if (
            targetAttrib instanceof Attrib_Numeric &&
            targetAttrib.timeKey?._time_src !== v._time_src
          ) {
            // record visualizations are updated through these setting updates
            this.setAttrib(
              _type,
              targetAttrib.timeseriesParent.getTimepointSummary({
                _time_src: v._time_src,
              })
            );
          }
        });

        this.skipRefreshRecordVis = false;

        this.refreshRecordVis(); // refresh visualization ONCE after all attributes are updated.

        // update measure attrib to use the same time key
        if (this.measureSummary?.hasTimeSeriesParent()) {
          var newMeasureSummary =
            this.measureSummary.timeseriesParent.getTimepointSummary(v);
          if (newMeasureSummary)
            await this.browser.measureSummary.set(newMeasureSummary);
        }

        // timeKeyStep timeKeyNext
        this.DOM.timeAnimation
          .select(".timeKeyPrev")
          .classed("active", v._time_src !== this.timeKeys[0]._time_src);
        this.DOM.timeAnimation
          .select(".timeKeyNext")
          .classed(
            "active",
            v._time_src !== this.timeKeys[this.timeKeys.length - 1]._time_src
          );
      },
    });

    ["currentTimeKey", "recordPointSize"].forEach((t) => {
      this.configs[t] = this[t];
      this[t].val = config[t];
    });

    if (config.timeSeriesAnnotations) {
      var _converted = [];
      Object.keys(config.timeSeriesAnnotations).forEach((_k) => {
        var _v = config.timeSeriesAnnotations[_k];
        var _t = DateTime.fromFormat(_v, DateTime.DATE_SHORT, { zone: "UTC" });
        if (_t.isValid) {
          _converted.push({ _time: _t.toJSDate(), _time_src: _k, _text: _v });
        }
      });
      this.config.timeSeriesAnnotations = _converted;
    }

    config.timeseriesWidth = config.timeseriesWidth || 400;
  }

  /** Shortcut to access browser record chart type */
  get viewRecAs(): RecordDisplayType {
    return this.browser.recordChartType.get();
  }

  kshfRecords_Type: RecordDisplayType = "none";

  async initialize() {
    "use strict";
    var config = this.config;

    // **********************************************************************************
    // **********************************************************************************
    // **********************************************************************************

    this.DOM.root = this.browser.DOM.root
      .select(".recordDisplay")
      .attr("visMouseMode", this.visMouseMode);

    this.DOM.root
      .append("div")
      .attr("class", "dropZone")
      .on("mouseenter", function () {
        this.classList.add("onReadyToDrop");
      })
      .on("mouseleave", function () {
        this.classList.remove("onReadyToDrop");
      })
      .on("mouseup", async () => {
        if (this.viewRecAs !== "none") {
          return;
        }
        var attrib = this.browser.movedAttrib;
        if (!attrib) return;

        if (attrib instanceof Attrib_Categorical) {
          await this.setAttrib("text", attrib);
          if (this.viewRecAs === "none") {
            await this.browser.recordChartType.set("list");
          }
        } else if (attrib instanceof Attrib_Timeseries) {
          await this.setAttrib("timeSeries", attrib);
          await this.browser.recordChartType.set("timeseries");
          //
        } else if (attrib instanceof Attrib_RecordGeo) {
          await this.setAttrib("geo", attrib);
          await this.browser.recordChartType.set("map");
          //
        } else if (attrib instanceof Attrib_Interval) {
          await this.setAttrib("sort", attrib);
          if (this.viewRecAs === "none") {
            await this.browser.recordChartType.set("list");
          }
        }

        this.browser.updateLayout();
      })
      .call((x) => {
        x.append("div").attr("class", "dropIcon fa fa-list-ul");
        x.append("span")
          .attr("class", "dropZoneText")
          .text(i18n["Add Record Panel"]);
      });

    this.initDOM_RecordDisplayHeader();

    // **************************************************
    // TIME ANIMATION
    this.DOM.timeAnimation = this.DOM.root
      .append("div")
      .attr("class", "timeAnimation");

    this.DOM.recordDisplayWrapper = this.DOM.root
      .append("div")
      .attr("class", "recordDisplayWrapper");

    this.initDOM_CustomControls();

    this.recordConfigPanel = new ConfigPanel(
      this.DOM.root,
      "Record Chart Configuration",
      "recordDisplayConfig",
      Object.values(this.configs),
      this.browser,
      this.DOM.recordDisplayConfigButton
    );

    // always set record text attribute
    await this.setAttrib("text", config.textBy);
    if (!this.codeBy.text) {
      await this.setAttrib("text", this.browser.idSummaryName);
    }
    await this.setAttrib("textBrief", config.textBriefBy);

    // *************************************************************************
    // Initialize config options

    for (var v in [
      "sort",
      "scatterX",
      "scatterY",
      "color",
      "size",
      "link",
      "timeSeries",
    ]) {
      var _attrib: string = config[v + "By"];
      if (_attrib) await this.setAttrib(v as RecordVisCoding, _attrib);
    }

    this.textFilter = new Filter_Text(this.browser);

    if (config.colorTheme) {
      this.setRecordColorTheme(config.colorTheme);
    }

    if (config.recordPointSize) {
      await this.recordPointSize.set(config.recordPointSize);
    }

    if (config.colorInvert) {
      this.invertColorTheme(true);
    }

    if (config.filter) {
      this.recordFilter.importFilter(config.filter);
    } else {
      this.recordFilter.clearFilter();
    }
    
    config.viewAs ??= "none";

    if (config.viewAs !== this.viewRecAs) {
      await this.browser.recordChartType.set(config.viewAs);
    }

    if (config.collapsed) {
      this.collapseRecordViewSummary(true);
    } else {
      this.collapseRecordViewSummary(false);
    }
  }

  /** -- */
  refreshConfigs() {
    Object.values(this.configs).forEach((cfg) => cfg.refresh());
  }

  curWidth: number;
  curHeight: number;

  setHeight(v) {
    var oldHeight = this.curHeight;
    this.curHeight = v;
    if (this.viewRecAs === "none") return;
    if (this.curHeight !== oldHeight) this.View.refreshViewSize(0);
  }

  setWidth(v) {
    var oldWidth = this.curWidth;
    this.curWidth = v;
    if (this.viewRecAs === "none") return;
    if (this.curWidth !== oldWidth) {
      this.refreshWidth();
      this.View.refreshViewSize(0);
    }
  }

  refreshWidth() {
    this.DOM.root
      ?.classed("narrow", this.curWidth < 500)
      .classed("wide", this.curWidth > 700)
      .style("width", this.curWidth + "px");
  }

  /** -- */
  getNumOfColorScaleBins() {
    return this.recordColorScale.range().length - 2;
  }

  /** -- */
  get textAttrib_Brief(): Attrib_Categorical {
    return this.codeBy.textBrief || this.codeBy.text;
  }

  /** -- */
  get height_Header() {
    if (!this.DOM.recordDisplayHeader) return 0;
    return this.DOM.recordDisplayHeader.node().offsetHeight;
  }

  /** -- */
  refreshCompareLegend() {
    if (!this.DOM.colorCompareGroup) return;

    this.DOM.colorCompareGroup.classed("active", !!this.browser.comparedAttrib);

    if (
      !this.browser.comparedAttrib ||
      !this.browser.comparedAttrib.attribName
    ) {
      return;
    }

    var str =
      "<div class='comparedSummaryName'>" +
      this.browser.comparedAttrib.attribNameHTML +
      "</div>";
    str += "<div class='compareBlocks'>";
    this.browser.activeComparisons.forEach((cT: CompareType) => {
      str += `<div class='compareBlock'><span class='colorBox bg_${cT}'></span> 
        <span class='theText'>${this.browser.selectedAggrs[cT].label}</span></div>`;
    });

    // "Other group"
    if (
      this.browser.records.filter(
        // TODO: depending on view type certain records may be excluded
        // Example: Map: records with no geo. Timeseries : records with no timeseries, etc.
        (x: Record) => !x.isSelected() && x.isIncluded
      ).length
    ) {
      str +=
        "<div class='compareBlock'><span class='colorBox bg_Active'></span> " +
        `<span class='theText'>(${this.browser.otherNameInCompare})</span></div>`;
    }
    str += "</div>";
    this.DOM.colorCompareGroup.html(str).classed("active", true);
  }

  getColorValue(v) {
    if (this.codeBy.color instanceof Attrib_Numeric) {
      return this.codeBy.color.getFormattedValue(v);
    } else {
      return v;
    }
  }

  /** -- */
  refreshColorLegend() {
    if (!this.DOM.mapColorScaleGroup) return;

    this.DOM.root
      .select(".editColorTheme.fa-adjust")
      .classed("rotatedY", this.invertedColorTheme);

    this.DOM.root.classed("usesColorAttrib", this.codeBy.color != null);

    if (!this.recordColorScale) return;
    if (!this.codeBy.color) return;

    var colorBins = this.recordColorScale.range();
    // remove first and last color elements
    colorBins = colorBins.slice(1, colorBins.length - 1);

    var logScale = false;
    if (this.codeBy.color === "_measure_") {
      if (this.measureSummary?.isValueScale_Log) {
        logScale = true;
      }
    } else {
      if (this.codeBy.color.isValueScale_Log) {
        logScale = true;
      }
    }

    this.mapColorScalePos = Util.getD3Scale(logScale);

    var totalDomain = this.recordColorScale.domain();
    this.mapColorScalePos
      .domain([totalDomain[0], totalDomain[totalDomain.length - 1]])
      .range([0, 100]);

    this.DOM.mapColorScaleBins.selectAll(".mapColorThemeBin").remove();
    this.DOM.mapColorScaleBins
      .selectAll(".mapColorThemeBin")
      .data(colorBins)
      .enter()
      .append("div")
      .attr("class", "mapColorThemeBin")
      .tooltip(
        (_) => {
          var d = this.recordColorScale.invertExtent(_);
          return this.recordColorStepTicks
            ? d[0]
            : this.getColorValue(d[0]) + " &mdash; " + this.getColorValue(d[1]);
        },
        {
          placement: "bottom",
        }
      )
      .style("background-color", (d) => d)
      .style("transform", (d, i) => {
        var d = this.recordColorScale.invertExtent(d);
        var left = this.mapColorScalePos(d[0]);
        var right = this.mapColorScalePos(d[1]);
        return `translateX(${left}%) scaleX(${Math.abs(right - left) / 100})`;
      });

    this.refreshColorLegendTicks();
  }

  /** -- */
  refreshColorLegendTicks() {
    if (!this.codeBy.color) return;
    if (!this.recordColorScaleTicks) return;

    var legendWidth = this.DOM.mapColorScaleLabels.node().offsetWidth;
    var lastTickPos = -200;

    var tickWidthGap = 30;

    let c: Attrib_Numeric = null;

    if (this.codeBy.color === "_measure_") {
      var attrib = !this.browser.measureFunc_Count && this.measureSummary;
      if (attrib) {
        c = attrib;
        tickWidthGap += attrib.unitName.length * 6;
      }
    } else {
      c = this.codeBy.color;
      tickWidthGap += this.codeBy.color.unitName.length * 6;
    }

    var _print = (v) => (c ? c.printAbbr(v) : v);

    var ticks = this.recordColorScaleTicks.slice();
    var offset = 0;
    if (this.recordColorStepTicks) {
      ticks.pop();
      offset = 50 / ticks.length;
    }

    this.DOM.mapColorScaleLabels.selectAll(".mapColorScaleLabel").remove();
    this.DOM.mapColorScaleLabels
      .selectAll(".mapColorScaleLabel")
      .data(ticks)
      .enter()
      .append("div")
      .attr("class", "mapColorScaleLabel")
      .style("left", (i) => offset + this.mapColorScalePos(i) + "%")
      .classed("hidden", (i) => {
        var curTickPos = (legendWidth * this.mapColorScalePos(i)) / 100;
        var visible = curTickPos - lastTickPos > tickWidthGap;
        if (visible) lastTickPos = curTickPos;
        return !visible;
      })
      .call((tick) => {
        tick
          .append("div")
          .attr("class", "tickLabel")
          .html((i) => "" + _print(i));
      });
  }

  /** -- */
  invertColorTheme(v = null) {
    this.invertedColorTheme = v == null ? !this.invertedColorTheme : v;
    this.updateRecordColorScale();
  }

  /** -- */
  setRecordColorTheme(v: ColorThemeType) {
    this.browser.activeColorTheme = v;
    this.updateRecordColorScale();
  }

  /** -- */
  initDOM_RecordDisplayHeader() {
    this.DOM.recordDisplayHeader = this.DOM.root
      .append("div")
      .attr("class", "recordDisplayHeader");

    // Remove record display button
    this.DOM.removeRecordPanelButton = this.DOM.recordDisplayHeader
      .append("div")
      .attr("class", "removeRecordPanelButton far fa-times-circle")
      .tooltip(i18n.RemoveRecordPanel, { placement: "bottom" })
      .on("click", async () => await this.browser.recordChartType.set("none") );

    // Expand record display button
    this.DOM.recordDisplayHeader
      .append("div")
      .attr("class", "buttonRecordViewExpand far fa-expand-alt")
      .tooltip(i18n.OpenSummary, { placement: "bottom" })
      .on("click", () => this.collapseRecordViewSummary(false));

    // Collapse record display button
    this.DOM.recordDisplayHeader
      .append("div")
      .attr("class", "buttonRecordViewCollapse far fa-compress-alt")
      .tooltip(i18n.CollapseSummary, { placement: "bottom" })
      .on("click", () => this.collapseRecordViewSummary(true));

    this.initDOM_GlobalTextSearch();

    // Record Name
    this.DOM.recordDisplayHeader
      .append("div")
      .attr("class", "recordName recordDisplayName")
      .html(this.browser.recordName);

    this.DOM.recordDisplayConfigButton = this.DOM.recordDisplayHeader
      .append("span")
      .attr("class", "recordDisplayConfigButton fal fa-cog")
      .tooltip(i18n.Configure)
      .on("click", (event) => {
        this.recordConfigPanel.showAtPos(
          event.target.offsetLeft + 25,
          event.target.offsetTop + 25
        );
      });

    // Change record display view
    var x = this.DOM.recordDisplayHeader
      .append("span")
      .attr("class", "recordDisplay_ViewGroup");
    x.selectAll("span.fa")
      .data([
        {
          v: "list",
          t: i18n.ListButton,
          i: "<span class='far fa-list-ul'></span>",
        },
        {
          v: "map",
          t: i18n.MapButton,
          i: "<span class='fal fa-globe'></span>",
        },
        {
          v: "node",
          t: i18n.NodeButton,
          i: "<span class='far fa-share-alt'></span>",
        },
        {
          v: "timeseries",
          t: i18n.TimeSeriesButton,
          i: "<span class='far fa-chart-line'></span>",
        },
        {
          v: "scatter",
          t: i18n.ScatterButton,
          i: "<span class='far fa-chart-scatter'></span>",
        },
      ])
      .enter()
      .append("span")
      .attr("class", (d) => "recordDisplay_ViewAs_" + d.v + " disabled")
      .tooltip((_) => i18n.RecordViewTypeTooltip(_.t), { placement: "bottom" })
      .on("click", async (_event, d) => await this.browser.recordChartType.set(d.v) )
      .html((d) => d.i + "<span class='ViewTitle'>" + d.t + "</span>");
  }

  /** -- */
  initDOM_GlobalTextSearch() {
    this.DOM.recordTextSearch = this.DOM.recordDisplayHeader
      .append("span")
      .attr("class", "recordTextSearch textSearchBox");

    this.DOM.recordTextSearch.append("span").attr("class", "far fa-search");
    this.DOM.recordTextSearch
      .append("span")
      .attr("class", "fa fa-times-circle")
      .tooltip(i18n.RemoveFilter)
      .on("click", () => this.textFilter.clearFilter());
    this.DOM.recordTextSearch
      .append("input")
      .attr("type", "text")
      .attr("class", "textSearchInput")
      .tooltip(i18n.TextSearchForRecords)
      .on("keydown", (event) => event.stopPropagation())
      .on("keypress", (event) => event.stopPropagation())
      .on("keyup", (event) => {
        var dom = event.currentTarget;
        if (event.key === "Enter") {
          dom.tippy.hide();
          if (dom.timer) clearTimeout(dom.timer);
          dom.timer = null;
          this.textFilter.queryString = dom.value;
          if (this.textFilter.queryString === "") {
            this.textFilter.clearFilter();
            return;
          }
          this.browser.clearSelect_Compare();
          this.textFilter.setFiltered();
          return;
        }
        event.stopPropagation();
      });
  }

  getMaxSizeScaleRange() {
    if (this.codeBy.size === "_measure_" && this.isPointMap()) {
      return Math.max(
        10,
        Math.min(
          this.recordPointSize.get(),
          this.codeBy.geo.pointClusterRadius / 2
        )
      );
    } else if (this.codeBy.size instanceof Attrib_Interval) {
      return this.recordPointSize.get();
    }
    throw Error("Unexpected status");
  }

  getMaxSizeDomainRange(): number {
    if (this.codeBy.size === "_measure_" && this.isPointMap()) {
      return (
        d3.max(this.codeBy.geo._aggrs, (_: Aggregate_PointCluster) =>
          _.measure("Active")
        ) || 1 // || 1: there may be no clusters
      );
    } else if (this.codeBy.size instanceof Attrib_Interval) {
      return this.codeBy.size.valueScale.domain()[1];
    }
    throw Error("Unexpected status");
  }

  /** -- */
  updateRecordSizeScale() {
    var constPointSize = Math.max(this.recordPointSize.get(), 4); // const size must be 4 or larger

    this.drawArc = d3
      .arc()
      .outerRadius(constPointSize) // fixed radius arc by default
      .innerRadius(0)
      .startAngle(0)
      .endAngle(2 * Math.PI);

    var getArc = (v) => this.drawArc.outerRadius(this.recordRadiusScale(v));

    if (this.codeBy.size === null) {
      // Constant size, constant shape - both are functions returning constant values
      this.recordRadiusScale = () => constPointSize;
      this.recordDrawArc = () => this.drawArc;
      //
    } else {
      this.recordRadiusScale = d3
        .scaleSqrt()
        .clamp(false)
        .range([0, this.getMaxSizeScaleRange() * 2])
        .domain([0, this.getMaxSizeDomainRange()]);

      if (this.codeBy.size === "_measure_" && this.isPointMap()) {
        // point map using measure as a size attribute
        this.recordDrawArc = (record) => getArc(record.measure_Self);
        //
      } else if (this.codeBy.size instanceof Attrib_Interval) {
        // point map usig regular numeric size attribute
        var m = this.codeBy.size;
        this.recordDrawArc = (record) => {
          var v = m.template.func.call(record.data, record);
          // in cases where point would be invisible/negligable, set very small so that it has a path
          if (isNaN(v) || v == null || (m.isValueScale_Log && v <= 0))
            v = 0.0001;
          return getArc(v);
        };
      }
    }

    this.refreshSizeLegend();
    this.View?.refreshRecordSizes();
  }

  /** -- */
  initDOM_CustomControls() {
    if (this.DOM.visViewControl) return;
    var me = this;

    var X, _;

    // Scale legend
    X = this.DOM.recordDisplayWrapper
      .append("span")
      .attr("class", "mapGlyphColorSetting");
    this.DOM.mapGlyphColorSetting = X;

    // Record point size
    var sizeGroup = this.DOM.mapGlyphColorSetting
      .append("div")
      .attr("class", "attribGroup sizeGroup")
      .classed("active", this.codeBy.size != null);

    // Gap
    this.DOM.mapGlyphColorSetting.append("div").attr("class", "attribGap");

    // Record color (attrib)
    this.DOM.colorCompareGroup = this.DOM.mapGlyphColorSetting
      .append("div")
      .attr("class", "colorCompareGroup attribGroup");

    // Record color (compare)
    var colorGroup = this.DOM.mapGlyphColorSetting
      .append("div")
      .attr("class", "attribGroup colorGroup")
      .classed("active", this.codeBy.color != null);

    // ****************************************************************
    // ** SIZE ********************************************************

    this.DOM.sizeControlGroup = sizeGroup
      .append("div")
      .attr("class", "sizeControlGroup attribControlGroup");
    sizeGroup
      .append("div")
      .attr("class", "dotSizes")
      .call((dom) => {
        dom
          .append("i")
          .attr("class", "dotSize dotSize-expand-alt far fa-plus")
          .tooltip(i18n.Larger, { placement: "top" })
          .on("click", async () => {
            await this.recordPointSize.set(this.recordPointSize.get() * Math.sqrt(2));
          });
        dom
          .append("i")
          .attr("class", "dotSize dotSize-compress-alt far fa-minus")
          .tooltip(i18n.Smaller, { placement: "top" })
          .on("click", async () => {
            await this.recordPointSize.set(this.recordPointSize.get() / Math.sqrt(2));
          });
      });
    this.DOM.sizeLegendGroup = sizeGroup
      .append("div")
      .attr("class", "attribLegendGroup sizeLegendGroup");

    this.DOM.sizeControlGroup
      .append("span")
      .attr("class", "header")
      .text(i18n.Size + " ");
    this.initDOM_AttribSelect("size");

    // ****************************************************************
    // ** COLOR *******************************************************

    // Control
    this.DOM.colorControlGroup = colorGroup
      .append("div")
      .attr("class", "colorControlGroup attribControlGroup");
    this.DOM.colorControlGroup
      .append("span")
      .attr("class", "header")
      .text(i18n.Color + " ");
    this.initDOM_AttribSelect("color");

    this.DOM.mapColorScaleGroup = colorGroup
      .append("div")
      .attr("class", "attribLegendGroup mapColorScaleGroup");

    // Invert color theme
    colorGroup
      .append("div")
      .attr("class", "editColorTheme fa fa-paint-brush")
      .tooltip(i18n.ChangeColorTheme, { placement: "left" })
      .on("click", (event) => {
        var addLegend = function (dom) {
          var _theme = me.browser.activeColorTheme;
          var _temp = me.browser.colorTheme[_theme];
          me.browser.colorTheme[_theme] = this.value;

          let colors: string[] = me.browser.colorTheme.getDiscrete(9);
          me.browser.colorTheme[_theme] = _temp;
          if (me.invertedColorTheme)
            colors = colors.reverse();

          d3.select(dom)
            .append("div")
            .attr("class", "colorLegend")
            .selectAll(".colorLegendBox")
            .data(colors)
            .enter()
            .append("span")
            .attr("class", "colorLegendBox")
            .style("background-color", (_) => _);
        };

        Modal.popupMenu(
          event,
          {
            name: "Color Theme",
            items: [
              {
                id: "colorThemeInverse",
                name: "Invert",
                iconClass: "far fa-adjust",
                active: this.invertedColorTheme,
                do: () => this.invertColorTheme(),
              },
              {
                id: "colorScaleScale",
                name: "BinScale",
                iconClass: "far fa-arrows-h",
                when: () =>
                  this.codeBy.color &&
                  this.codeBy.color instanceof Attrib_Numeric &&
                  this.codeBy.color.supportsLogScale(),
                do: async (_, opt) => {
                  var attrib = this.codeBy.color as Attrib_Numeric; // checked by when
                  if (!attrib) return;
                  if (attrib.timeseriesParent) {
                    await attrib.timeseriesParent.valueScaleType.set(opt);
                  } else {
                    await attrib.valueScaleType.set(opt);
                  }
                },
                options: [
                  {
                    name: "Linear",
                    value: "linear",
                    active:
                      this.codeBy.color instanceof Attrib_Numeric &&
                      this.codeBy.color.isValueScale_Linear,
                  },
                  {
                    name: "Log",
                    value: "log",
                    active:
                      this.codeBy.color instanceof Attrib_Numeric &&
                      !this.codeBy.color.isValueScale_Linear,
                  },
                ],
              },
              {
                id: "colorThemeSwitch",
                name: "Switch (Seq. ↔ Div.)",
                iconClass: "far fa-exchange",
                do: () =>
                  this.setRecordColorTheme(
                    this.browser.activeColorTheme === "sequential"
                      ? "diverging"
                      : "sequential"
                  ),
              },
              {
                id: "colorThemeSequential",
                name: "Sequential",
                iconClass: "far fa-long-arrow-right",
                do: (_, opt) => {
                  this.browser.colorTheme.sequential = opt;
                  this.setRecordColorTheme("sequential");
                },
                // todo: highlight the active one
                options: [
                  { name: "Greys", value: "Greys", onName: addLegend },
                  { name: "Blues", value: "Blues", onName: addLegend },
                  { name: "Green-Blue", value: "GnBu", onName: addLegend },
                  {
                    name: "Yellow-Green-Blue",
                    value: "YlGnBu",
                    onName: addLegend,
                  },
                  { name: "Greens", value: "Greens", onName: addLegend },
                  { name: "Yellow-Green", value: "YlGn", onName: addLegend },
                  { name: "Blue-Green", value: "BuGn", onName: addLegend },
                  {
                    name: "Purple-Blue-Green",
                    value: "PuBuGn",
                    onName: addLegend,
                  },
                  { name: "Purple-Blue", value: "PuBu", onName: addLegend },
                  { name: "Purples", value: "Purples", onName: addLegend },
                  { name: "Blue-Purple", value: "BuPu", onName: addLegend },
                  { name: "Purple-Red", value: "PuRd", onName: addLegend },

                  { name: "Oranges", value: "Oranges", onName: addLegend },
                  { name: "Orange-Red", value: "OrRd", onName: addLegend },
                  {
                    name: "Yellow-Orange-Red",
                    value: "YlOrRd",
                    onName: addLegend,
                  },
                  {
                    name: "Yellow-Orange-Brown",
                    value: "YlOrBr",
                    onName: addLegend,
                  },

                  { name: "Inferno", value: "Inferno", onName: addLegend }, // no discrete version
                  { name: "Magma", value: "Magma", onName: addLegend }, // no discrete version
                  { name: "Plasma", value: "Plasma", onName: addLegend }, // no discrete version

                  { name: "Cividis", value: "Cividis", onName: addLegend }, // no discrete version
                  { name: "Viridis", value: "Viridis", onName: addLegend }, // no discrete version
                  { name: "Warm", value: "Warm", onName: addLegend }, // no discrete version
                  { name: "Cool", value: "Cool", onName: addLegend }, // no discrete version
                ],
              },
              {
                id: "colorThemeDiverging",
                name: "Diverging",
                iconClass: "far fa-arrows-h",
                do: (_, opt) => {
                  this.browser.colorTheme.diverging = opt;
                  this.setRecordColorTheme("diverging");
                },
                options: [
                  { name: "Spectral", value: "Spectral", onName: addLegend },
                  { name: "Brown-Green", value: "BrBG", onName: addLegend },
                  { name: "Purple-Green", value: "PRGn", onName: addLegend },
                  {
                    name: "Pink-Yellow-Green",
                    value: "PiYG",
                    onName: addLegend,
                  },
                  { name: "Purple-Orange", value: "PuOr", onName: addLegend },
                  { name: "Red-Blue", value: "RdBu", onName: addLegend },
                  { name: "Red-Gray", value: "RdGy", onName: addLegend },
                  {
                    name: "Red-Yellow-Blue",
                    value: "RdYlBu",
                    onName: addLegend,
                  },
                  {
                    name: "Red-Yellow-Green",
                    value: "RdYlGn",
                    onName: addLegend,
                  },
                ],
              },
            ],
          },
          null,
          { placement: "top" }
        );
      });

    // Scale
    this.DOM.mapColorHighlightedValue = this.DOM.mapColorScaleGroup
      .append("div")
      .attr("class", "mapColorHighlightedValue fa fa-caret-down");
    this.DOM.mapColorScaleBins = this.DOM.mapColorScaleGroup
      .append("div")
      .attr("class", "mapColorScaleBins");
    this.DOM.mapColorScaleLabels = this.DOM.mapColorScaleGroup
      .append("div")
      .attr("class", "mapColorScaleLabels");

    // play/pause buttons
    var x = this.DOM.timeAnimation
      .append("span")
      .attr("class", "detailPlay attribDetailPlay");
    x.append("i")
      .attr("class", "fa fa-play-circle")
      .tooltip(i18n.AutoPlay)
      .on("click", (event) =>
        this.startTimeseriesAnimation(event.shiftKey ? 5 : 1)
      )
      .on("mouseover", () => {
        if (this.View instanceof RecordView_Timeseries) {
          this.View.timeseriesWiden();
        }
      })
      .on("mouseout", () => {
        if (this.View instanceof RecordView_Timeseries) {
          this.View.timeseriesWidenOff();
        }
      });
    x.append("i")
      .attr("class", "fa fa-pause-circle")
      .tooltip(i18n.StopAutoPlay)
      .on("click", () => this.stopTimeseriesAnimation());

    this.DOM.timeAnimation
      .append("div")
      .attr("class", "timeKeyStep timeKeyPrev")
      .tooltip(i18n.Previous)
      .on("click", () => this.currentTimeKey.set(this.timeKeys[this.currentTimeKey.get()._index - 1]) )
      .append("span")
      .attr("class", "fa fa-caret-left");

    this.DOM.timeAnimation
      .append("select")
      .attr("class", "timeKeySelect")
      .on("change", async (event) => await this.currentTimeKey.set(event.currentTarget.selectedOptions[0].__data__) );

    this.DOM.timeAnimation
      .append("div")
      .attr("class", "timeKeyStep timeKeyNext")
      .tooltip(i18n.Next)
      .on("click", async () => await this.currentTimeKey.set(this.timeKeys[this.currentTimeKey.get()._index + 1]) )
      .append("span")
      .attr("class", "fa fa-caret-right");

    this.DOM.timeAnimation
      .append("div")
      .attr("class", "timeKeyRange")
      .call((timeKeyRange) => {
        timeKeyRange.append("span").attr("class", "rangeTick-min").text("min");

        // SINGLE-KEY SLIDER (MAP, SCATTERPLOT, LIST)
        var attribDetailRange = timeKeyRange
          .append("div")
          .attr("class", "attribDetailRange");

        noUiSlider.create(attribDetailRange.node(), {
          connect: true,
          step: 1,
          behaviour: "tap-drag",
          range: {
            min: 0,
            max: this.hasTimeKey ? this.timeKeys.length - 1 : 100,
          },
          start: this.currentTimeKey.get()?._index ?? 0,
        });

        attribDetailRange.append("span").attr("class", "rangeTick-cur");

        this.timeKeySlider = attribDetailRange.node().noUiSlider;
        var _update_1 = async (v) => {
          if (this.timeKeySlider_PauseUpdate) return;
          var _node = this.DOM.timeAnimation
            .selectAll(".timeKeySelect > option")
            .nodes()[Math.round(1 * v)];
          if (_node) {
            this.timeKeySlider_PauseUpdate = true;
            await this.currentTimeKey.set(_node.__data__);
            this.timeKeySlider_PauseUpdate = false;
          }
        };
        this.timeKeySlider.on("set", _update_1);

        // DOUBLE-KEY SLIDER (TIMESERIES)
        this.DOM.timeseriesRange = timeKeyRange
          .append("div")
          .attr("class", "timeseriesRange");

        timeKeyRange.append("span").attr("class", "rangeTick-max");
      });

    this.DOM.timeAnimationClearRange = this.DOM.timeAnimation
      .append("span")
      .attr("class", "clearRange fa fa-times")
      .tooltip(i18n.Reset);
    // handled added in TimeSeries view

    this.currentTimeKey.refresh();

    // View control...
    this.DOM.visViewControl = this.DOM.recordDisplayWrapper
      .append("span")
      .attr("class", "visViewControl");

    // **************************************************
    // ZOOM IN / OUT / RESET
    this.DOM.visViewControl
      .append("span")
      .attr("class", "ChartControlGroup ViewControlGroup")
      .call((_) => {
        _.append("span")
          .attr("class", "ChartControlGroupTitle")
          .html(i18n.Zoom);
        _.append("span")
          .attr("class", "visViewControlButton far fa-plus")
          .tooltip(i18n.ZoomIn)
          .on("click", () => this.View.zoomIn());
        _.append("span")
          .attr("class", "visViewControlButton far fa-minus")
          .tooltip(i18n.ZoomOut)
          .on("click", () => this.View.zoomOut());
        _.append("span")
          .attr("class", "visViewControlButton far fa-expand-arrows-alt")
          .tooltip(i18n.ZoomToFit)
          .on("click", () => this.View.zoomToFit());
      });

    // MOUSE SELECT MODE
    var _m = (t) =>
      t === "filter"
        ? "Filter"
        : "Select nearest " + (t === "record" ? "point" : "time");

    // Maps only
    this.DOM.visViewControl
      .append("div")
      .attr("class", "visViewControlButton mapView-UnmatchedData")
      .tooltip(i18n.MissingLocations)
      .text("∅")
      .on("click", () => {
        Modal.alert(
          "The following records do not appear on the map.<br><br>" +
            this.codeBy.geo.noValueAggr.records.map((_) => _._id).join(", ") +
            (this.codeBy.geo.geoType !== "Point"
              ? "<br><br>" +
                "<span style='font-size: 0.9em; color: gray; font-weight: 300'>" +
                "Please see the list of standard region names " +
                "<a style='color: gray; text-decoration: underline;' href='https://docs.google.com/spreadsheets/d/1DKNXwsJy6_Mdy3ofwbBIZeBGrxSItYOJXNZgLyu0IM4' target='_blank'>here</a>.<br>" +
                "If the place names above are misspelled, please update your data source.<span>"
              : "")
        );
      });
  }

  /** -- */
  refreshTimeKeys() {
    this.timeKeys = [];

    ["sort", "scatterX", "scatterY", "color", "size"].forEach((_type) => {
      var targetAttrib = this.codeBy[_type];
      if (
        targetAttrib instanceof Attrib_Numeric &&
        targetAttrib.hasTimeSeriesParent()
      ) {
        // make a copy of timeKeys of the timeseries summary
        var timeKeyOptions = Array.from(targetAttrib.timeseriesParent.timeKeys);
        // finds the shared subset of keys across all timeseries variables
        if (this.timeKeys.length === 0) {
          this.timeKeys = timeKeyOptions;
        } else {
          this.timeKeys = this.timeKeys.filter((k) =>
            timeKeyOptions.find((_) => _._time_src === k._time_src)
          );
        }
      }
    });

    // From 0 (oldest) to last (newest)
    this.timeKeys = this.timeKeys.sort(
      (a, b) => a._time.getTime() - b._time.getTime()
    );

    // re-assign index numbers
    this.timeKeys.forEach((key, i) => {
      key._index = i;
      delete key._histogram; // not needed - does not apply
    });

    this.currentTimeKey.refresh();
  }

  /** -- */
  get hasTimeKey() {
    return this.timeKeys.length > 1; // must be at least two - single time-key has no control
  }

  filterStatusUpdated(attrib: Attrib) {
    if (attrib instanceof Attrib_Numeric) {
      if (
        this.viewRecAs === "scatter" &&
        (this.codeBy.scatterX === attrib || this.codeBy.scatterY === attrib)
      ) {
        this.View?.refreshQueryBox_Filter(null);
      }
      if (
        attrib.timeseriesParent === this.codeBy.timeSeries &&
        this.View instanceof RecordView_Timeseries
      ) {
        this.View.refreshFilterRanges();
      }
    }
  }

  /** -- */
  collapseRecordViewSummary(collapsed) {
    this.collapsed = collapsed;
    this.DOM.root.classed("collapsed", this.collapsed);
    if (this.browser.finalized) this.browser.updateLayout_Height();
  }

  /** -- */
  refreshViz_Compare_All() {
    this.DOM.root
      .selectAll("[class*='spatialQueryBox_Compare']")
      .classed(
        "active",
        (d) => this.browser.vizActive(d) && this.browser.selectedAggrs[d].bounds
      );
  }

  /** -- */
  refreshViewAsOptions() {
    var activeCount = 0;
    ["list", "map", "timeseries", "scatter"].forEach((viewType) => {
      var t = this.browser.recordChartType.itemOptions.find(
        (_) => _.value === viewType
      );
      var disabled = !t.activeWhen || !t.activeWhen();
      activeCount += !disabled ? 1 : 0;
      this.DOM.recordDisplayHeader
        .select(".recordDisplay_ViewAs_" + viewType)
        .classed("disabled", disabled)
        .classed("active", viewType.toLowerCase() == this.viewRecAs);
    });

    this.DOM.recordDisplayHeader
      .select(".recordDisplay_ViewGroup")
      .classed("disabled", activeCount <= 1);
  }

  private attribDropdowns: {
    [index: string /* RecordVisCoding */]: AttribDropdown;
  } = {};

  /** -- */
  refreshAttribOptions(_type) {
    if (!this.attribDropdowns[_type]) return;
    this.attribDropdowns[_type].refresh();
  }

  /** -- */
  initDOM_AttribSelect(_type: RecordVisCoding) {
    this.attribDropdowns[_type] = new AttribDropdown(_type, this);
    this.refreshAttribOptions(_type);
  }

  /** -- */
  getAttribOptions_UI(_type: RecordVisCoding): Attrib[] {
    var opts = this.browser.attribs.filter(
      (attrib) =>
        attrib.supportsRecordEncoding(_type) && !attrib.hasTimeSeriesParent()
    );

    // scatterX / scatterY options cannot include the same active attribute
    if (["scatterX", "scatterY"].includes(_type)) {
      var other: Attrib =
        _type === "scatterX" ? this.codeBy.scatterY : this.codeBy.scatterX;
      if (other) {
        if (other.hasTimeSeriesParent()) other = other.parent;
        opts = opts.filter((s) => s.attribID != other.attribID);
      }
    }

    // generate new attribute if there's no sortable attribute
    if (_type === "sort" && opts.length === 0) {
      var newAttrib: Attrib_Numeric;
      if (this.browser.idSummaryName === "id") {
        newAttrib = this.browser.createAttrib("Sort by id", function () {
          return 1 * this.id;
        }) as Attrib_Numeric;
      } else {
        newAttrib = this.browser.createAttrib("Sort (random)", function () {
          return Math.random();
        }) as Attrib_Numeric;
      }
      newAttrib._metricFuncs = [];
      newAttrib.initializeAggregates();
      // calls the function again, but this time we have a numeric summary
      return this.getAttribOptions_UI("sort");
    }

    opts.sort((s1, s2) =>
      Util.sortFunc_List_String(s1.attribName, s2.attribName)
    );

    if (["color", "size"].includes(_type)) {
      opts.unshift(null); // The first option is no color/size attribute.
    }

    return opts;
  }

  timeseriesAnimInterval: number = 0;

  /** -- */
  startTimeseriesAnimation(stepSize = 1) {
    if (this.timeseriesAnimInterval) {
      this.stopTimeseriesAnimation();
    }

    if (this.View?.stepTimeAnimation(stepSize)) {
      this.DOM.root.classed("animatingTime", true);
    }
  }

  /** -- */
  stopTimeseriesAnimation() {
    this.DOM.root.classed("animatingTime", false);

    this.View?.stopTimeAnimation();

    this.View.refreshLabelOverlaps();

    if (!this.timeseriesAnimInterval) return;
    window.clearInterval(this.timeseriesAnimInterval);
    this.timeseriesAnimInterval = 0;
  }

  isPointMap() {
    return this.viewRecAs === "map" && this.codeBy.geo?.geoType === "Point";
  }

  /** -- */
  hasAggregates() {
    return (
      this.isPointMap() &&
      this.DOM.clusterGlyphs &&
      this.codeBy.geo.pointClusterRadius > 0 &&
      this.codeBy.geo._aggrs.length > 0
    );
  }

  /** -- */
  async setAttrib(
    _type: RecordVisCoding,
    _attrib: number | string | Function | Attrib,
    stopAnimation = false
  ): Promise<boolean> {
    let attrib: Attrib = null;

    // if integer, index by integer among potential options
    if (typeof _attrib === "number") {
      attrib = this.getAttribOptions_UI(_type)[_attrib];
      //
    } else if (typeof _attrib === "function") {
      attrib = this.browser.createAttrib("_Records", _attrib, "categorical"); // create from function
      //
    } else if (typeof _attrib === "string") {
      if (_attrib !== "_measure_") {
        attrib = this.browser.createAttrib(_attrib); // create from string
      }
      //
    } else if (_attrib) {
      attrib = _attrib;
    }

    if (["sort", "scatterX", "scatterY", "size", "color"].includes(_type)) {
      var timeSrc;
      if (attrib instanceof Attrib_Numeric && attrib.timeseriesParent) {
        timeSrc = attrib.timeKey._time_src;
        attrib = attrib.timeseriesParent;
      }
      if (attrib instanceof Attrib_Timeseries) {
        timeSrc = this.currentTimeKey.get()?._time_src || timeSrc;
        attrib = attrib.getTimepointSummary(
          attrib.timeKeys.find((x) => x._time_src === timeSrc) || // current time-key
            attrib.timeKeys[attrib.timeKeys.length - 1] // most recent time-key
        );
      }
    }

    // if (attrib instanceof Attrib) {
    //   if (!attrib.supportsRecordEncoding(_type)) return;
    // }

    var prevTimeSeriesParent: Attrib_Timeseries = null;

    if (_type === "text") {
      if (!(attrib instanceof Attrib_Categorical)) return;
      this.codeBy.text = attrib;

    } else if (_type === "textBrief") {
      if (!(attrib instanceof Attrib_Categorical)) return;
      this.codeBy.textBrief = attrib;

    } else if (_type === "sort") {
      if (!(attrib instanceof Attrib_Interval)) return;
      if (this.codeBy.sort instanceof Attrib_Numeric)
        prevTimeSeriesParent = this.codeBy.sort.timeseriesParent;
      this.codeBy.sort = attrib;

    } else if (_type === "scatterX") {
      if (!(attrib instanceof Attrib_Numeric)) return;
      if (this.codeBy.scatterX)
        prevTimeSeriesParent = this.codeBy.scatterX.timeseriesParent;
      this.codeBy.scatterX = attrib;

    } else if (_type === "scatterY") {
      if (!(attrib instanceof Attrib_Numeric)) return;
      if (this.codeBy.scatterY) {
        prevTimeSeriesParent = this.codeBy.scatterY.timeseriesParent;
      }
      this.codeBy.scatterY = attrib;

    } else if (_type === "size") {
      prevTimeSeriesParent = this.codeBy.size instanceof Attrib_Numeric
        ? this.codeBy.size.timeseriesParent
        : null;

      if (_attrib === "_measure_") {
        this.codeBy.size = _attrib;
      } else if (attrib instanceof Attrib_Numeric) {
        this.codeBy.size = attrib;
      } else if (_attrib === null) {
        this.codeBy.size = null;
      } else {
        return;
      }

    } else if (_type === "color") {
      prevTimeSeriesParent = this.codeBy.color instanceof Attrib_Numeric
        ? this.codeBy.color.timeseriesParent
        : null;
      if (_attrib === "_measure_") {
        this.codeBy.color = _attrib;
      } else if (attrib instanceof Attrib_Numeric) {
        this.codeBy.color = attrib;
      } else if (_attrib === null) {
        this.codeBy.color = null;
      } else {
        return;
      }

    } else if (_type === "timeSeries") {
      if (!(attrib instanceof Attrib_Timeseries)) return;
      this.codeBy.timeSeries = attrib;

    } else if (_type === "geo") {
      if (!(attrib instanceof Attrib_RecordGeo)) return;
      this.codeBy.geo = attrib;
      await this.codeBy.geo.loadGeo();

    } else {
      return;
    }

    if (stopAnimation) {
      this.stopTimeseriesAnimation(); // hard-stop any existing animation
    }

    var timeKeysChange = false;

    if (_type !== "timeSeries") {
      if( attrib instanceof Attrib_Numeric &&
        attrib.timeseriesParent &&
        prevTimeSeriesParent !== attrib.timeseriesParent
      ) {
        timeKeysChange = true;
      }
    }

    if (timeKeysChange) {
      this.refreshTimeKeys();
      if (attrib instanceof Attrib_Numeric)
        await this.currentTimeKey.set(attrib.timeKey);
    }

    if (!this.DOM.root) return;

    if (attrib instanceof Attrib) {
      attrib.initializeAggregates();
    }

    if (_type === "text") {
      this.DOM.recordTextSearch
        .attr("active", true)
        .select("input")
        .attr("placeholder", this.textAttrib_Brief?.attribName);

      // Call the onDOM function for all the records that have been inserted to the page
      if (this.config.onDOM) {
        this.DOM.kshfRecords.each((record) => {
          this.config.onDOM.call(record.data, record);
        });
      }

    } else if (_type === "textBrief") {
      this.DOM.recordTextSearch
        .attr("active", true)
        .select("input")
        .attr("placeholder", this.textAttrib_Brief.attribName);

    } else if (_type === "color") {
      this.updateRecordColorScale();

    } else if (_type === "size") {
      if (this.codeBy.size instanceof Attrib_Numeric) {
        if (
          this.viewRecAs === "scatter" ||
          (this.viewRecAs === "map" && this.codeBy.geo?.geoType === "Point")
        ) {
          var s_f = this.codeBy.size.template.func;
          var s_log = this.codeBy.size.isValueScale_Log;

          var sortVal = (r) => {
            var v = s_f.call(r.data, r);
            return isNaN(v) || v == null || (s_log && v <= 0) ? -1 : v;
          };

          // need to apply delay to sorting (z-order) because we want the elements to animate to first
          if (this.sortRecordDomTimer) clearTimeout(this.sortRecordDomTimer);
          this.sortRecordDomTimer = window.setTimeout(() => {
            this.DOM.kshfRecords = this.DOM.recordGroup
              .selectAll(".kshfRecord")
              .sort((r_a, r_b) => sortVal(r_b) - sortVal(r_a));
            this.View.refreshLabelOverlaps();
          }, 1000);
        }
      }

      this.updateRecordSizeScale();

      this.refreshSizeLegend();
    }

    await this.View?.finishSetAttrib(_type);

    this.refreshAttribOptions(_type);
  }

  sortRecordDomTimer: number;

  // ********************************************************************
  // MAPPING
  // ********************************************************************

  /** -- */
  getMaxPointSize(): number {
    if (!(this.codeBy.size instanceof Attrib_Numeric)) {
      return 1; // only 1 point max
    }

    return this.codeBy.size.timeseriesParent // use timeseries parents domain...
      ? d3.max(this.codeBy.size.timeseriesParent.timeSeriesScale_Value.domain()) as any
      : this.codeBy.size.rangeActive[1];
  }

  /** -- */
  sanitizeTicks(ticks, attrib: Attrib_Numeric | "_measure_", numTicks: number) {
    if (ticks.domain) {
      var _scale = ticks.copy().nice(numTicks);
      ticks = _scale.ticks(numTicks);
      // d3 error ? make sure the ticks cover the full attrib Range
      var domain = _scale.domain();
      if (ticks[0] > domain[0]) ticks.unshift(domain[0]);
      if (ticks[ticks.length - 1] < domain[1]) ticks.push([domain[1]]);
    }

    // when ticks must be integer values, round them
    if (attrib === "_measure_" || !attrib.hasFloat) {
      ticks = ticks.map((v) => Math.round(v));
    }

    // avoid repeated tick values
    return ticks.filter((_, i) => i == 0 || _ !== ticks[i - 1]);
  }

  /** -- */
  refreshSizeLegend() {
    if(this.DOM.root == null) return;

    this.DOM.root.classed("usesSizeAttrib", hasSizeLegend);

    var hasSizeLegend =
      this.codeBy.size != null &&
      (this.viewRecAs === "scatter" ||
        (this.viewRecAs === "map" && this.codeBy.geo.geoType === "Point"));

    if (!hasSizeLegend) return;

    if (!this.DOM.sizeLegendGroup) return;

    var maxValue;

    if (this.viewRecAs === "map") {
      maxValue = this.recordRadiusScale.domain()[1];
      if (isNaN(maxValue)) {
        this.DOM.root.classed("usesSizeAttrib", false);
        return;
      }
    } else {
      maxValue = this.getMaxPointSize();
    }

    var markRatios = [0.2, 0.4, 0.6, 0.8, 1];

    if (this.recordPointSize.get() > 25) {
      markRatios = [0.1, 0.4, 0.7, 1];
    }

    var ticks = this.sanitizeTicks(
      markRatios.map((v) => maxValue * v * v),
      this.codeBy.size,
      10
    );
    ticks = ticks.filter((_) => _ !== 0);

    var printLabel;
    if (this.codeBy.size instanceof Attrib_Numeric) {
      let y = this.codeBy.size;
      printLabel = (v) => y.getFormattedValue(v);
    } else {
      printLabel = d3.format("~s");
    }

    maxValue = ticks[ticks.length - 1];

    ticks = ticks.map((_) => ({ size: 2 * this.recordRadiusScale(_), val: _ })); // size

    this.DOM.sizeLegendGroup.selectAll("div").remove();
    this.DOM.sizeLegendGroup
      .selectAll("div")
      .data(ticks)
      .join((enter) =>
        enter
          .append("div")
          .attr("class", "sizeGlyph")
          .call((sizeGlyphs) =>
            sizeGlyphs
              .append("span")
              .attr("class", "glyphWrapper")
              .append("span")
              .attr("class", "theGlyph")
              .style("width", (d) => d.size + "px")
              .style("height", (d) => d.size + "px")
          )
          .call((sizeGlyphs) =>
            sizeGlyphs
              .append("span")
              .attr("class", "glyphLabel")
              .html((_) => printLabel(_.val))
          )
      );
  }

  /** -- */
  linkedTimeKey() {
    if (this.codeBy.scatterY == null) return false;
    if (this.codeBy.scatterX == null) return false;
    var yTs = this.codeBy.scatterY.timeseriesParent;
    var xTs = this.codeBy.scatterX.timeseriesParent;
    if (!xTs || !yTs) return false;
    return (
      yTs.attribName !== xTs.attribName &&
      yTs.timeKeys.length === xTs.timeKeys.length &&
      this.codeBy.scatterY.timeKey !== this.codeBy.scatterX.timeKey
    );
  }

  /** -- */
  flipSelected(f, cT) {
    if (!cT) cT = this.browser.Compare_Highlight;
    this.DOM.kshfRecords.each((record) => record.flipSelected(f, cT));
  }

  skipRefreshRecordVis: boolean = false;

  /** -- */
  refreshRecordVis() {
    if (!this.DOM.recordGroup) return;
    if (this.skipRefreshRecordVis) return;
    if (this.kshfRecords_Type !== this.viewRecAs) return;
    if (!this.View) return;
    this.View.refreshRecordVis();
  }

  /** -- */
  isSummaryUsedInRecordChart(summary) {
    return {
      list: ["sort"],
      map: ["color", "size"],
      scatter: ["scatterX", "scatterY", "color", "size"],
      timeseries: ["timeSeries"],
      none: [],
    }[this.viewRecAs].some((t) => {
      var _ = this[t + "Attrib"];
      return _ && (summary === _ || summary === _.parentSummary);
    });
  }

  /** -- */
  async refreshAttribScaleType(attrib) {
    if (this.codeBy.color instanceof Attrib) {
      if (
        this.codeBy.color === attrib ||
        this.codeBy.color.timeseriesParent === attrib
      ) {
        this.updateRecordColorScale();
      }
    }

    await this.View?.refreshAttribScaleType(attrib);
  }

  /** Instead of overall maximum, we can also get a quantile value */
  private getMaxMeasureValue(quantile = null): number {
    // maximum of records that are not in a special cluster - using measure_Self values
    var _list: number[] = this.browser.records.reduce((accum: number[], record: Record) => {
      if (record.isIncluded && !record._view.inCluster && record.measure_Self)
        accum.push(record.measure_Self);
      return accum;
    }, []);

    // add maximum active of all the clisters
    if (this.codeBy.geo) {
      _list = this.codeBy.geo._aggrs.reduce(
        (accum, aggr: Aggregate_PointCluster) => {
          accum.push(aggr.measure("Active"));
          return accum;
        },
        _list
      );
    }

    _list.sort((a, b) => b - a);

    if (quantile) return d3.quantile(_list, quantile);

    return _list[0];
  }

  get measureSummary() {
    return this.browser.measureSummary.get();
  }

  updateRecordColorScale() {
    if (!this.codeBy.color) {
      this.recordColorScale = null;
      this.recordColorScaleTicks = null;
      this.recordColorStepTicks = null;
      this.refreshColorLegend();
      return;
    }

    var c: Attrib_Numeric, domain: [number, number];

    if (this.codeBy.color === "_measure_") {
      domain = [1, this.getMaxMeasureValue()];
      c = this.measureSummary;
    } else {
      domain = this.codeBy.color.valueScale.domain();
      c = this.codeBy.color;
    }

    const _colorLegendScale = Util.getD3Scale(c?.isValueScale_Log).domain(domain);

    var numTicks = 10;
    while (true) {
      this.recordColorScaleTicks = this.sanitizeTicks(
        _colorLegendScale,
        c ?? "_measure_",
        numTicks
      );
      if (this.recordColorScaleTicks.length <= 10) break;
      numTicks--;
    }

    this.recordColorStepTicks = false;

    if (
      (!c || !c.hasFloat) &&
      Util.isStepTicks(this.recordColorScaleTicks) &&
      this.recordColorScaleTicks.length < 10
    ) {
      this.recordColorStepTicks = true;
      this.recordColorScaleTicks.push(
        this.recordColorScaleTicks[this.recordColorScaleTicks.length - 1] + 1
      );
    }

    // How many number of bins are we going to support?
    // Options are from 3 to 9!
    var numBins = Math.max(
      Math.min(this.recordColorScaleTicks.length - 1, 9),
      1
    );

    // from quantized scale to discrete colors
    var colors = this.browser.colorTheme.getDiscrete(numBins);
    if (this.invertedColorTheme) colors.reverse();
    // replicates first and last colors to match the ticks
    // needed because we are using threshold scale, which also considers below/above the scale limits
    // using slightl different colors so invertExtent would function well
    colors = [d3.hsl(colors[0]).brighter(0.1).formatHex()]
      .concat(colors)
      .concat(
        d3
          .hsl([colors[colors.length - 1]] as any)
          .darker(0.1)
          .formatHex()
      );

    this.recordColorScale = d3
      .scaleThreshold()
      .domain(this.recordColorScaleTicks)
      .range(colors);

    this.refreshColorLegend();
  }

  /** -- */
  onRecordMouseOver(record: Record) {
    record.highlightRecord();
    this.setDimmed(true);

    this.View.onRecordMouseOver(record);

    // manage color mapping here. can apply to map / scatterplot
    if (
      this.codeBy.color &&
      (this.viewRecAs === "map" || this.viewRecAs === "scatter")
    ) {
      var v;
      if (this.codeBy.color === "_measure_") {
        v = record.measure_Self;
      } else {
        v = this.codeBy.color.getRecordValue(record);
      }
      // Set opacity, and position

      var offset = 0;
      if (this.recordColorStepTicks) {
        offset = 50 / (this.recordColorScaleTicks.length - 1);
      }

      this.DOM.mapColorHighlightedValue
        .style("opacity", v === null ? null : 1)
        .style("left", offset + this.mapColorScalePos(v) + "%");
    }
  }

  /** -- */
  onRecordMouseLeave(record) {
    this.setDimmed(false);

    if (!record) return;
    record.unhighlightRecord();
    this.View.onRecordMouseLeave(record);
    if (
      this.codeBy.color &&
      (this.viewRecAs === "map" || this.viewRecAs === "scatter")
    ) {
      this.DOM.mapColorHighlightedValue.style("opacity", null);
    }
  }

  /** -- */
  refreshTextAttrib() {}

  sparklineCounter: number = 0;

  getRecordTitle(record: Record) {
    var recordName = `<span class='mapItemName'>${this.textAttrib_Brief.renderRecordValue(
      record
    )}</span>`;

    var catColorText = "";
    if (this.browser.comparedAttrib) {
      let a = this.browser.comparedAttrib;
      let compare_Color = "Active";
      Base.Compare_List.forEach((cX) => {
        if (record.isSelected(cX)) compare_Color = cX;
      });
      catColorText = `<div class='recordColorInfo'>
        <span class='mapTooltipLabel'>${a.attribName}</span>
        <div class='mapTooltipValue'><span class='colorBox bg_${compare_Color}'></span>${a.getRecordValue(
        record
      )}</div>
        </div>`;
    }

    if (!this.codeBy.color) return recordName + catColorText;

    var a = this.codeBy.color;

    if (a === "_measure_" || !a.hasTimeSeriesParent()) {
      var _value, _label;
      if (a === "_measure_") {
        _label = i18n.measureText(this.browser);
        _value = record.measure_Self;
      } else {
        _label = a.attribName;
        _value = a.getFormattedValue(a.template.func.call(record.data, record));
      }
      // Just a single value / not timeseries
      return (
        recordName +
        catColorText +
        "<div class='recordColorInfo'>" +
        `<span class='mapTooltipLabel'>${_label}</span>: ` +
        `<span class='mapTooltipValue'>${_value}</span>` +
        "</div>"
      );
    }

    var a2 = a;

    var activeVal = a.template.func.call(record.data, record);

    // Timeseries popup
    var ts = a.timeseriesParent;
    var timeseriesData = ts.getRecordValue(record);
    var chart_width = 150;
    var chart_height = 40;

    // converts the object into simple array
    var tsd = timeseriesData._timeseries_;

    if (tsd.length === 0) {
      // Just a single value / not timeseries
      return (
        recordName +
        catColorText +
        "<div class='recordColorInfo'> - " +
        `<span class='timeseriesName blockName'>${ts.attribNameHTML}</span>` +
        "</div>"
      );
    }

    // filter out the invalid values from beginning and end
    while (tsd[0]._value === undefined) {
      tsd = tsd.slice(1);
    }
    while (tsd[tsd.length - 1]._value === undefined) {
      tsd = tsd.slice(0, tsd.length - 1);
    }

    // **********************************
    // Time scale ***********************
    var timeScale = d3
      .scaleTime()
      .domain(d3.extent(tsd, (x: TimeData) => x._time))
      .range([0, chart_width]);

    // **********************************
    // Value scale **********************
    // compute the min-max of the tooltip using the real record values
    var [value_min, value_max] = d3.extent(tsd, (_: TimeData) => _._value);
    var steadyValue: number;
    if (value_min === value_max) {
      steadyValue = value_min;
      value_min -= 0.0001;
      value_max += 0.0001;
    }
    if (ts.hasFlippedDomain()) {
      [value_max, value_min] = [value_min, value_max];
    }
    var valueScale = d3
      .scaleLinear()
      .domain([value_min, value_max])
      .rangeRound([chart_height, 0]);

    // get activeTime
    var tsDots = "";
    var activeTime = null;
    if (activeVal != null) {
      activeTime = ts.timeKeys.filter(
        (tk) => tk._time_src === a2.timeKey._time_src
      )[0];
      tsDots =
        `<g transform='translate(${timeScale(activeTime._time)} ${valueScale(
          activeVal
        )})'><circle class='activeValueDot' r='4' fill='${this.recordColorScale(
          activeVal
        )}'/><text class='activeValueText' y='-5'>${a.printAbbr(
          activeVal,
          true
        )}</text>` + "</g>";
    }

    var colorOut = this.browser.colorTheme.getContinuous();
    var mapp = this.mapColorScalePos
      .copy()
      .range(this.invertedColorTheme ? [1, 0] : [0, 1]);

    this.sparklineCounter++;

    // add the time extent
    [tsd[0], tsd[tsd.length - 1]].forEach((t) => {
      tsDots += `<g transform='translate(${timeScale(
        t._time
      )} ${chart_height})'><text class='limitText activeValueTime' y='16'>${
        t._time_src
      }</text></g>`;
    });

    // add the value extent
    if (!steadyValue) {
      var onLeft = activeTime && activeTime._index > ts.timeKeys.length / 2;
      [value_max, value_min].forEach((v: number) => {
        tsDots +=
          "<g transform='translate(" +
          (onLeft ? 0 : chart_width) +
          " " +
          valueScale(v) +
          ")'>" +
          "<text class='limitText activeRangeText' x='" +
          (onLeft ? "-" : "") +
          "3' y='5' " +
          "style='text-anchor: " +
          (onLeft ? "end" : "start") +
          ";'>" +
          ts.printAbbr(v as any, true) +
          "</text>" +
          "</g>";
      });
    }

    var _stroke = steadyValue ? colorOut(mapp(value_max)) : "";

    return (
      recordName +
      catColorText +
      `<div class='sparklineWrapper'>
        <svg class='tooltipSparkline' xmlns='http://www.w3.org/2000/svg'>
          <defs>
            <clipPath id='SparklineClipPath${this.sparklineCounter}'>
              <rect x='-20' y='-25' height='100' class='sparkLineClipPath'></rect>
            </clipPath>
          </defs>
          <g>
            <path class='timeline' d='${Util.getLineGenerator(
              timeScale,
              valueScale
            )(tsd as any)}' stroke='${_stroke}' />
            ${tsDots}
          </g>
        </svg>
      </div>
      <span class='timeseriesName blockName'>${ts.attribNameHTML}</span>`
    );
  }

  /** -- */
  refreshRecordDOM() {
    var isCanvasView = ["map", "node", "scatter", "timeseries"].includes(
      this.viewRecAs
    );

    this.DOM.recordGroup
      .selectAll(".kshfRecord")
      .data(this.View.getRecordsForDOM(), (record: Record) => record.id)
      .join(
        (enter) => {
          // argh. removing this causes some weird animation problem..
          if (enter.nodes().length === 0) return enter;

          return (
            enter
              .append(
                {
                  map: "g",
                  node: "g",
                  scatter: "g",
                  timeseries: "g",
                  list: "div",
                }[this.viewRecAs]
              )
              // kshfRecord_XYZ can be used to apply custom CSS
              .attr(
                "class",
                (record: Record) =>
                  "kshfRecord kshfRecord_#" +
                  // record.id may not be string with dynamic data loading
                  ("" + record.id).replace(/\s/g, "_")
              )
              .tooltip((record: Record) => this.getRecordTitle(record), {
                theme: "dark kshf-tooltip kshf-record",
                placement: "right",
                animation: "fade",
                followCursor: this.viewRecAs === "map",
                offset: [0, this.viewRecAs === "map" ? 10 : 0],
                onShown: (instance) => {
                  d3.select(instance.popper)
                    .select(".sparkLineClipPath")
                    .attr("width", 2)
                    .transition()
                    .duration(1000)
                    .delay(0)
                    .ease(d3.easePolyInOut)
                    .attr("width", 200);
                },
              })
              .on("mouseenter", (event, record) => {
                if (this.viewRecAs === "timeseries") return;
                var DOM = event.currentTarget;
                if (DOM.highlightTimeout) clearTimeout(DOM.highlightTimeout);
                DOM.highlightTimeout = window.setTimeout(() => {
                  clearTimeout(DOM.highlightTimeout);
                  this.onRecordMouseOver(record);
                }, this.browser.movingMouseDelay);
              })
              .on("mouseleave", (event, record) => {
                if (this.viewRecAs === "timeseries") return;
                var DOM = event.currentTarget;
                if (DOM.highlightTimeout)
                  window.clearTimeout(DOM.highlightTimeout);
                this.onRecordMouseLeave(record);
              })
              .on("mousedown", (event) => {
                if (!isCanvasView) return;
                event.currentTarget._mousemove = false;
                event.stopPropagation();
                event.preventDefault();
              })
              .on("mousemove", (event) => {
                if (!isCanvasView) return;
                event.currentTarget._mousemove = true;
              })
              .on("click", (event, record) => {
                if (!isCanvasView) return;
                var DOM = event.currentTarget;
                if (DOM._mousemove) return; // Do not show the detail view if the mouse was used to drag the canvas
                this.browser.recordDetailsPopup.updateRecordDetailPanel(record);

                if (
                  this.viewRecAs === "map" &&
                  this.codeBy.color instanceof Attrib_Numeric
                ) {
                  this.browser.recordDetailsPopup.updateFocusedTimeKey(
                    this.codeBy.color.timeKey
                  );
                }

                if (DOM.highlightTimeout)
                  window.clearTimeout(DOM.highlightTimeout);
                if (DOM.tippy.state.visible) DOM.tippy.hide();
                this.onRecordMouseLeave(record);
              })
              .call((newRecords) => {
                this.View.extendRecordDOM(newRecords);
              })
          );
        },
        (_update) => null,
        (exit) => exit.each((record) => record.assignDOM(null)).remove()
      );

    this.DOM.kshfRecords = this.DOM.recordGroup
      .selectAll(".kshfRecord")
      .each((record, i, nodes) => {
        var DOM = nodes[i];
        record.assignDOM(DOM);

        if (this.viewRecAs === "list" || this.viewRecAs === "timeseries") {
          DOM.tippy.disable();
        } else {
          DOM.tippy.enable();
        }
      });

    if (isCanvasView) {
      this.DOM.kshfRecords_Path = this.DOM.recordGroup.selectAll(
        ".kshfRecord > path.glyph_Main"
      );
    }

    if (this.View instanceof RecordView_Map) {
      this.View.setMaxBounds();
      // continue executing below... no break
    } else if (this.View instanceof RecordView_Scatter) {
      this.View.finishSetAttrib("size"); // TODO: Check / can be removed.
      this.View?.refreshRecordColors();
      //
    }

    this.View?.refreshSelect_Compare();
    this.View?.updateRecordVisibility();
    this.refreshTextAttrib();

    this.kshfRecords_Type = this.viewRecAs;
  }

  /** -- */
  refreshAfterHighlight(v) {
    this.setDimmed(v);
    this.View.refreshLabelOverlaps();
  }

  /** -- */
  setDimmed(v) {
    this.DOM.root?.classed("dimmed", v);
  }

  /** -- */
  updateAfterFilter(how) {
    if (this.viewRecAs === "none") return;
    this.refreshCompareLegend();
    this.View.updateAfterFilter(how);
  }

  /** -- */
  getRecordGeoAttributes() {
    return this.browser.attribs.filter(
      (attrib) => attrib instanceof Attrib_RecordGeo
    );
  }

  /** -- */
  exportConfig() {
    var config = {
      viewAs: this.viewRecAs,
      collapsed: this.collapsed,
      colorInvert: this.invertColorTheme,
      filter: this.recordFilter.isFiltered
        ? this.recordFilter.exportFilter()
        : undefined,
    };

    var attribName: string;

    [
      "sort",
      "scatterX",
      "scatterY",
      "color",
      "size",
      "link",
      "timeSeries",
      "geo",
      "text",
      "textBrief",
    ].forEach((v) => {
      var attrib = this[v + "Attrib"];
      if (!attrib) return;

      if (attrib === "_measure_") {
        attribName = "_measure_";
      } else if (attrib instanceof Attrib) {
        attribName = attrib.template.str || attrib.attribName;
        if (attrib.hasTimeSeriesParent()) attribName = attrib.template.str;
      } else {
        return;
      }

      config[v + "By"] = attribName;
    });

    Object.values(this.configs).forEach((_cfg) => _cfg.exportConfigTo(config));

    return config;
  }

  /** -- */
  // TO-DO: Improve, A LOT.
  async importConfig(config) {
    if (config == null) return;

    await this.browser.recordChartType.set(config.viewAs);

    if (config.colorTheme) {
      this.setRecordColorTheme(config.colorTheme);
    }
    if (config.colorInvert) {
      this.invertColorTheme(true);
    }
    if (config.recordPointSize) {
      await this.recordPointSize.set(config.recordPointSize);
    }

    if (config.collapsed) {
      this.collapseRecordViewSummary(true);
    } else {
      this.collapseRecordViewSummary(false);
    }
  }
}
