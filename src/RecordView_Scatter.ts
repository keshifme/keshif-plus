import { zoom, zoomTransform, zoomIdentity } from "d3-zoom";
import { easePolyOut } from "d3-ease";
import { line, curveNatural, curveCatmullRomOpen } from "d3-shape";
import { select, pointer } from "./d3_select";

import { Attrib } from "./Attrib";
import { Base } from "./Base";
import { Config } from "./Config";
import { i18n } from "./i18n";
import { RecordDisplay } from "./RecordDisplay";
import { RecordView } from "./RecordView";
import { Util } from "./Util";
import { Record } from "./Record";
import { Attrib_Interval } from "./Attrib_Interval";
import { CompareType, LinearOrLog, RecordVisCoding } from "./Types";
import { Attrib_Numeric } from "./Attrib_Numeric";

const d3 = {
  select,
  pointer,
  zoom,
  zoomTransform,
  zoomIdentity,
  line,
  curveNatural,
  curveCatmullRomOpen,
  easePolyOut,
};

export class RecordView_Scatter extends RecordView {
  // ********************************************************************
  // Configurations
  // ********************************************************************

  configs: { [index: string]: Config<any> } = {};

  scatter_showTrails: Config<boolean>;
  scatter_xAxisScale: Config<LinearOrLog | "auto">;
  scatter_yAxisScale: Config<LinearOrLog | "auto">;

  private scatterZoom: any; // d3 zoom control obj
  scatterTransform: { x: number; y: number; z: number } = { x: 0, y: 0, z: 1 };

  scatterAxisScale_X: any; // d3 stuff
  scatterAxisScale_Y: any; // d3 stuff

  async prepareAttribs() {
    if (!this.scatterYAttrib) {
      await this.rd.setAttrib(
        "scatterY",
        this.rd.config.scatterYBy ||
          (this.rd.codeBy.sort instanceof Attrib_Numeric
            ? this.rd.codeBy.sort
            : 0)
      );
    }
    if (!this.scatterXAttrib) {
      await this.rd.setAttrib("scatterX", this.rd.config.scatterXBy || 0);
    }
    if (!this.rd.codeBy.color && this.rd.config.colorBy) {
      await this.rd.setAttrib("color", this.rd.config.colorBy);
    }
    if (!this.rd.codeBy.size && this.rd.config.sizeBy) {
      await this.rd.setAttrib("size", this.rd.config.sizeBy);
    }
    return Promise.resolve(true);
  }

  constructor(rd: RecordDisplay, config) {
    super(rd);

    this.scatter_showTrails = new Config<boolean>({
      cfgClass: "scatter_showTrails",
      cfgTitle: "Scatter Trails",
      iconXML: Base.custom_icons.trails,
      default: true,
      parent: this,
      helparticle: "5e89138704286364bc97d51f",
      itemOptions: [
        { name: "Show", value: true },
        { name: "Hide", value: false },
      ],
      forcedValue: () => {
        // No trails if both of the axis are not a part of time-series.
        if (
          !this.scatterXAttrib?.hasTimeSeriesParent() ||
          !this.scatterYAttrib?.hasTimeSeriesParent()
        )
          return false;
      },
    });

    this.scatter_xAxisScale = new Config<LinearOrLog | "auto">({
      parent: this,
      cfgClass: "scatter_xAxisScale",
      cfgTitle: "X Axis Scale",
      iconClass: "fa fa-arrows-h",
      default: "linear",
      helparticle: "5f137ac32c7d3a10cbaaf048",
      itemOptions: [
        { name: i18n.Linear + " " + i18n.LinearSequence, value: "linear" },
        { name: i18n.Log + " " + i18n.Log10Sequence, value: "log" },
      ],
      noExport: true,
      forcedValue: () => {
        if (!this.scatterXAttrib?.supportsLogScale()) return "linear";
      },
      onSet: async (v) => {
        if (!this.scatterXAttrib) return;
        if (!this.scatterXAttrib.hasTimeSeriesParent()) {
          await this.scatterXAttrib.valueScaleType.set(v);
        } else if (v !== "auto"){
          await this.scatterXAttrib.timeseriesParent.valueScaleType.set(v);
        }
      },
    });

    this.scatter_yAxisScale = new Config<LinearOrLog | "auto">({
      parent: this,
      cfgClass: "scatter_yAxisScale",
      cfgTitle: "Y Axis Scale",
      iconClass: "fa fa-arrows-v",
      default: "linear",
      helparticle: "5f137ac32c7d3a10cbaaf048",
      itemOptions: [
        { name: `${i18n.Linear} ${i18n.LinearSequence}`, value: "linear" },
        { name: `${i18n.Log} ${i18n.Log10Sequence}`, value: "log" },
      ],
      noExport: true,
      forcedValue: () => {
        if (!this.scatterYAttrib?.supportsLogScale()) return "linear";
      },
      onSet: async (v) => {
        if (!this.scatterYAttrib) return;
        if (!this.scatterYAttrib.hasTimeSeriesParent()) {
          await this.scatterYAttrib.valueScaleType.set(v);
        } else if (v !== "auto"){
          await this.scatterYAttrib.timeseriesParent.valueScaleType.set(v);
        }
      },
    });

    ["scatter_showTrails", "scatter_xAxisScale", "scatter_yAxisScale"].forEach(
      (t) => {
        this[t].val = config[t];
        this.rd.configs[t] = this[t];
        this.rd.recordConfigPanel.insertConfigUI(this[t]);
      }
    );

    this.scatterZoom = d3
      .zoom()
      .filter(() => this.rd.visMouseMode === "pan" && this.rd.curHeight)
      .scaleExtent([1, 8]) // 1 covers the whole dataset. 2 is double-zoom-in.
      .on("start", () => {
        this.DOM.recordDisplayWrapper.classed("dragging", true);
      })
      .on("end", () => {
        this.DOM.recordDisplayWrapper.classed("dragging", false);
        this.refreshLabelOverlaps();
      })
      .on("zoom", () => {
        let t = d3.zoomTransform(this.DOM.recordBase_Scatter.node());
        this.scatterTransform = { x: t.x, y: t.y, z: t.k };
        this.DOM.recordGroup_Scatter.style(
          "transform",
          `translate(${this.scatterTransform.x}px, ${this.scatterTransform.y}px) scale(${this.scatterTransform.z})`
        );
        this.refreshRecordVis();
      });

    this.refreshZoomScaleExtent();
  }

  /** -- */
  initView() {
    this.rd.refreshAttribOptions("scatterX");
    this.rd.refreshAttribOptions("scatterY");

    this.rd.refreshRecordDOM();

    this.refreshScales();

    this.zoomToFit();

    this.refreshQueryBox_Filter();

    this.rd.updateRecordSizeScale();
    this.rd.updateRecordColorScale();
  }

  /** -- */
  async initView_DOM() {
    // set CSS variables
    this.browser.DOM.root
      .node()
      .style.setProperty(
        "--width_scatter_margin_left",
        Base.width_scatter_margin_left + "px"
      );

    this.browser.DOM.root
      .node()
      .style.setProperty(
        "--height_scatter_margin_bottom",
        Base.height_scatter_margin_bottom + "px"
      );

    if (this.DOM.recordBase_Scatter) {
      this.DOM.recordGroup = this.DOM.recordBase_Scatter.select(".recordGroup");
      this.DOM.kshfRecords =
        this.DOM.recordGroup_Scatter.selectAll(".kshfRecord");
      this.DOM.kshfRecords_Path = this.DOM.recordGroup.selectAll(
        ".kshfRecord > path.glyph_Main"
      );
      this.DOM.linkGroup = this.DOM.recordGroup_Scatter.select(".linkGroup");
      return; // Do not initialize twice
    }

    this.DOM.recordBase_Scatter = this.DOM.recordDisplayWrapper
      .append("div")
      .attr("class", "recordBase_Scatter")
      .call(this.scatterZoom);

    this.DOM.recordBase_Scatter
      .append("span")
      .attr("class", "ScatterControl-SwapAxis")
      .tooltip(i18n.SwapAxis)
      .on("mousedown", (event) => event.stopPropagation() )
      .on("mouseup", (event) => event.stopPropagation() )
      .on("dblclick", (event) => event.stopPropagation() )
      .on("wheel", (event) => event.stopPropagation() )
      .on("click", (event) => {
        this.swapAxis();
        event.stopPropagation();
      })
      .append("i")
      .attr("class", "far fa-exchange");

    // recordAxis_X, recordAxis_Y
    ["X", "Y"].forEach((a) => {
      this.DOM["recordAxis_" + a] = this.DOM.recordBase_Scatter
        .append("div")
        .attr("class", "recordAxis recordAxis_" + a)
        .html("<div class='tickGroup'></div><div class='onRecordLine'><div class='tickLine'></div><div class='tickText'></div></div>");
    });

    this.DOM.recordGroup_Scatter = this.DOM.recordBase_Scatter
      .append("div")
      .attr("class", "recordGroup_Scatter_Wrapper")
      .append("div")
      .attr("class", "recordGroup_Scatter");

    ["X", "Y"].forEach((axis) => {
      this.DOM["scatter" + axis + "ControlGroup"] = this.DOM.recordBase_Scatter
        .append("div")
        .attr("class", "recordGroup_Scatter_" + axis + "Axis_Options")
        .on("mousedown", (event) => event.stopPropagation() )
        .on("mouseup", (event) => event.stopPropagation() )
        .on("dbclick", (event) => event.stopPropagation() )
        .on("wheel", (event) => event.stopPropagation() )
        .append("span")
        .attr("class", "scatter" + axis + "ControlGroup attribControlGroup");

      this.rd.initDOM_AttribSelect(axis === "X" ? "scatterX" : "scatterY");
    });

    var _svg = this.DOM.recordGroup_Scatter
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg");

    this.DOM.recordGroup = _svg.append("g").attr("class", "recordGroup");

    this.DOM.recordTrail = _svg.append("g").attr("class", "recordTrail");
    this.DOM.recordTrail_Path = this.DOM.recordTrail
      .append("path")
      .attr("class", "recordTrail_Path");

    this.insertQueryBoxes(
      this.DOM.recordGroup_Scatter,
      // setSizeCb
      (event, t) => {
        if (event.which !== 1) return; // only respond to left-click
        this.DOM.recordDisplayWrapper
          .classed("dragging", true)
          .classed("drawSelecting", true);
        d3.select("body")
          .on("mousemove", (event2) => {
            var targetPos: number = d3
              .pointer(event2, this.DOM.recordGroup_Scatter.node().parentNode)
              .map((_, i) => this["scatterAxisScale_" + (i ? "Y" : "X")].invert(_) );
            if (t === "l") {
              this.scatterXAttrib.setRangeFilter_Custom(
                targetPos[0],
                this.scatterXAttrib.summaryFilter.active.maxV
              );
            }
            if (t === "r") {
              this.scatterXAttrib.setRangeFilter_Custom(
                this.scatterXAttrib.summaryFilter.active.minV,
                targetPos[0]
              );
            }
            if (t === "t") {
              this.scatterYAttrib.setRangeFilter_Custom(
                this.scatterYAttrib.summaryFilter.active.minV,
                targetPos[1]
              );
            }
            if (t === "b") {
              this.scatterYAttrib.setRangeFilter_Custom(
                targetPos[1],
                this.scatterYAttrib.summaryFilter.active.minV
              );
            }
            this.refreshQueryBox_Filter();
          })
          .on("mouseup", () => {
            this.DOM.recordDisplayWrapper
              .classed("dragging", false)
              .classed("drawSelecting", false);
            d3.select("body").on("mousemove", null).on("mouseup", null);
          });
        event.preventDefault();
        event.stopPropagation();
      },
      // drag callback
      (event) => {
        if (event.which !== 1) return; // only respond to left-click
        this.DOM.recordDisplayWrapper.classed("dragging", true);
        var initScreenPos = d3.pointer(
          event,
          this.DOM.recordGroup_Scatter.node().parentNode
        );

        var initMin_X = this.scatterAxisScale_X( this.scatterXAttrib.summaryFilter.active.minV );
        var initMax_X = this.scatterAxisScale_X( this.scatterXAttrib.summaryFilter.active.maxV );
        var initMin_Y = this.scatterAxisScale_Y( this.scatterYAttrib.summaryFilter.active.minV );
        var initMax_Y = this.scatterAxisScale_Y( this.scatterYAttrib.summaryFilter.active.maxV );

        d3.select("body")
          .on("mousemove", (event3) => {
            var curScreenPos = d3.pointer(
              event3,
              this.DOM.recordGroup_Scatter.node().parentNode
            );
            var diffX = initScreenPos[0] - curScreenPos[0];
            var diffY = initScreenPos[1] - curScreenPos[1];
            this.scatterYAttrib.setRangeFilter_Custom(
              this.scatterAxisScale_Y.invert(initMin_Y - diffY),
              this.scatterAxisScale_Y.invert(initMax_Y - diffY)
            );
            this.scatterXAttrib.setRangeFilter_Custom(
              this.scatterAxisScale_X.invert(initMin_X - diffX),
              this.scatterAxisScale_X.invert(initMax_X - diffX)
            );
            this.refreshQueryBox_Filter();
          })
          .on("mouseup", () => {
            this.DOM.recordDisplayWrapper.classed("dragging", false);
            d3.select("body").on("mousemove", null).on("mouseup", null);
          });
        event.preventDefault();
        event.stopPropagation();
      },
      // click callback
      (event, d) => {
        if (d === "Filter") {
          this.scatterXAttrib.summaryFilter.clearFilter();
          this.scatterYAttrib.summaryFilter.clearFilter();
        } else {
          this.browser.clearSelect_Compare(d);
          this.displayQueryBox(d, false);
        }
        event.currentTarget.tippy.hide();
      }
    );
  }

  async refreshAttribScaleType(attrib: Attrib) {
    if (!this.scatterXAttrib || !this.scatterYAttrib) return;

    if (
      this.scatterXAttrib === attrib ||
      this.scatterXAttrib.timeseriesParent === attrib
    ) {
      await this.scatter_xAxisScale.set(this.scatterXAttrib.valueScaleType.get());
      this.refreshRecordVis();
    }

    if (
      this.scatterYAttrib === attrib ||
      this.scatterYAttrib.timeseriesParent === attrib
    ) {
      await this.scatter_yAxisScale.set(this.scatterYAttrib.valueScaleType.get());
      this.refreshRecordVis();
    }
  }

  refreshAttribUnitName(attrib: Attrib) {
    this.refreshScatterTicks();
  }

  async finishSetAttrib(t: RecordVisCoding) {
    if (t === "text") {
      this.DOM.kshfRecords
        .selectAll("foreignObject .recordText")
        .html((record: Record) =>
          this.textBriefAttrib.renderRecordValue(record)
        );
      this.refreshRecordBounds();
      this.refreshLabelOverlaps();
      //
    } else if (t === "scatterX" || t === "scatterY") {
      if (t === "scatterX") {
        this.scatter_xAxisScale.set(this.scatterXAttrib.valueScaleType.get());
      }
      if (t === "scatterY") {
        this.scatter_yAxisScale.set(this.scatterYAttrib.valueScaleType.get());
      }
      this.refreshScales();
      this.refreshLabelOverlaps();
      this.refreshRecordVis();
      //
    } else if (t === "color") {
      this.refreshRecordColors();
      //
    } else if (t === "size") {
      //
    }
  }

  /** -- */
  refreshViewSize(_delayMS: number = 0) {
    if (!this.scatterXAttrib || !this.scatterYAttrib) return;

    this.refreshZoomScaleExtent();
    this.refreshRecordVis();
    this.rd.refreshColorLegendTicks();
  }

  // ********************************************************************
  // Scale of X and Y attributes
  // ********************************************************************

  /** -- */
  get realWidth() {
    return this.rd.curWidth - Base.width_scatter_margin_left;
  }
  /** -- */
  get realHeight() {
    return (
      this.rd.curHeight -
      Base.height_scatter_margin_bottom -
      (this.rd.hasTimeKey ? Base.timeKeyHeight : 0)
    );
  }

  scatterScaleX: any; // d3 scale
  scatterScaleY: any; // d3 scale

  /** -- */
  getScale(attrib) {
    return Util.getD3Scale(attrib.isValueScale_Log)
      .domain(attrib.getVizDomain())
      .clamp(false);
  }

  /** -- */
  refreshScales() {
    if (!this.scatterXAttrib || !this.scatterYAttrib) return;
    if (this.rd.timeseriesAnimInterval) return; // do not refresh scale during animation

    this.scatterScaleX = this.getScale(this.scatterXAttrib).range([
      this.realWidth * 0.05,
      this.realWidth * 0.9,
    ]);
    this.scatterScaleY = this.getScale(this.scatterYAttrib).range([
      this.realHeight * 0.9,
      this.realHeight * 0.05,
    ]);
  }

  /** -- */
  swapAxis() {
    var _ = this.scatterXAttrib;
    this.rd.codeBy.scatterX = this.scatterYAttrib;
    this.rd.codeBy.scatterY = _;

    this.rd.refreshAttribOptions("scatterX");
    this.rd.refreshAttribOptions("scatterY");

    this.refreshScales();

    this.refreshRecordVis();
  }

  // ********************************************************************
  // Zoom control
  // ********************************************************************

  /** -- */
  zoomIn() {
    this.scatterZoom.scaleBy(this.DOM.recordBase_Scatter, 2);
  }
  /** -- */
  zoomOut() {
    this.scatterZoom.scaleBy(this.DOM.recordBase_Scatter, 1 / 2);
  }
  /** -- */
  zoomToFit() {
    this.scatterZoom.transform(this.DOM.recordBase_Scatter, d3.zoomIdentity);
  }
  /** -- */
  refreshZoomScaleExtent() {
    this.scatterZoom.translateExtent([
      [0, 0],
      [this.realWidth, this.realHeight],
    ]);
  }

  /** -- */
  refreshLabelOverlaps() {
    if (!this.initialized) return;
    if (!this.DOM.kshfRecords) return;
    if (this.rd.timeseriesAnimInterval) return;
    var activeComparisons = this.browser.activeComparisons;

    var relevantRecords = this.browser.records.filter((record: Record) => {
      // hide text labels of all records by default
      record._view.hideTextLabel = true;
      return (
        record.DOM.record &&
        record._view.textBounds &&
        record._view.isInScatterPlot &&
        record._view.isInRange &&
        record.isIncluded &&
        (activeComparisons.length === 0 || record.isSelected())
      );
    });

    var maxNumOfRecords = (this.realWidth * this.realHeight) / 7000;
    var numOfLabels = 0;

    relevantRecords.forEach((record: Record, i) => {
      if (numOfLabels > maxNumOfRecords) return;
      delete record._view.hideTextLabel; // ok, now inverse logic: show by default
      // simple transformation on bounds to detect intersecting text labels
      var _ = record._view.textBounds;
      var _w = _.width / this.scatterTransform.z;
      var _h = _.height / this.scatterTransform.z;
      record._view.viewBounds = {
        width: _w,
        height: _h,
        left: record._view.x,
        right: record._view.x + _w,
        top: record._view.y,
        bottom: record._view.y + _h,
      };

      for (var j = 0; j < i; j++) {
        var record_2 = relevantRecords[j];
        if (
          !record_2._view.hideTextLabel &&
          Util.intersectsDOMRect(
            record._view.viewBounds,
            record_2._view.viewBounds
          )
        ) {
          record._view.hideTextLabel = true;
          return;
        }
      }
      numOfLabels++;
    });

    this.DOM.kshfRecords.classed(
      "hideTextLabel",
      (record: Record) => record._view.hideTextLabel
    );
  }

  /** -- */
  refreshRecordSizes(): void {
    if (!this.scatterXAttrib || !this.scatterYAttrib) return;
    if (!this.DOM.recordGroup) return;

    this.DOM.recordGroup
      .selectAll(".kshfRecord > path")
      .transition()
      .duration(700)
      .ease(d3.easePolyOut.exponent(3))
      .attr("d", (record) => this.rd.recordDrawArc(record)());
    this.refreshSelect_Compare(); // skip label overlap
  }

  /** -- */
  refreshRecordColors(): void {
    if (!this.scatterXAttrib || !this.scatterYAttrib) return;

    if (!this.DOM.kshfRecords) return;
    if (!this.DOM.kshfRecords_Path) return;

    var _fill = null;

    if (this.colorAttrib instanceof Attrib_Interval) {
      var c = this.colorAttrib;
      var s_log = this.colorAttrib.isValueScale_Log;
      _fill = (record) => {
        if (record.filteredOut) return;
        var v = c.getRecordValue(record);
        return isNaN(v) || v == null || (s_log && v <= 0)
          ? "url(#diagonalHatch)"
          : this.rd.recordColorScale(v);
      };
    }

    this.DOM.kshfRecords_Path.style("fill", _fill);
  }

  refreshSelect_Compare(cT: CompareType = null, status: boolean = false) {
    this.refreshLabelOverlaps();
    super.refreshSelect_Compare(cT, status);
  }

  /** -- */
  refreshRecordVis() {
    if (!this.initialized) return;

    if (!this.DOM.recordBase_Scatter) return;
    if (!this.DOM.kshfRecords) return;
    if (!this.rd.curHeight) return;

    // running this first, as it also computes scatterAxisScale_X & scatterAxisScale_Y
    this.refreshScatterTicks();

    var visibleX = this.scatterAxisScale_X.domain();
    var visibleY = this.scatterAxisScale_Y.domain();
    visibleY.reverse();
    var inRange = (x, range) => x > range[0] && x < range[1];

    this.DOM.kshfRecords.each((record: Record) => {
      record._view.wasInScatterPlot = record._view.isInScatterPlot || false;
      var _x = this.scatterXAttrib.getRecordValue(record);
      var _y = this.scatterYAttrib.getRecordValue(record);
      record._view.isInScatterPlot = _x != null && _y != null;
      record._view.isInRange = inRange(_x, visibleX) && inRange(_y, visibleY);
    });

    // was in scatterplot, is in scatterplot
    this.DOM.kshfRecords
      .filter((record: Record) => record._view.isInScatterPlot)
      .classed(
        "noTransition",
        (record: Record) => !record._view.wasInScatterPlot
      )
      .style("transform", (record: Record) => {
        record._view.x = this.scatterScaleX(
          record.getValue(this.scatterXAttrib)
        );
        record._view.y = this.scatterScaleY(
          record.getValue(this.scatterYAttrib)
        );
        // scale is just based on zoom level - it reverses the affect of the zoom on parent node
        return `translate(${record._view.x}px, ${record._view.y}px) scale(${
          1 / this.scatterTransform.z
        })`;
      });

    this.DOM.kshfRecords.classed(
      "hidden",
      (record: Record) => !record._view.isInScatterPlot
    );
  }

  /** -- */
  refreshScatterTicks() {
    // Compute bounds in SVG coordinates after transform is applied.
    var minX_real = -this.scatterTransform.x / this.scatterTransform.z;
    var maxX_real = minX_real + this.realWidth / this.scatterTransform.z;
    var minY_real = -this.scatterTransform.y / this.scatterTransform.z;
    var maxY_real = minY_real + this.realHeight / this.scatterTransform.z;

    this.scatterAxisScale_X = this.scatterScaleX
      .copy()
      .range([0, this.realWidth])
      .domain([
        this.scatterScaleX.invert(minX_real),
        this.scatterScaleX.invert(maxX_real),
      ]);
    this.scatterAxisScale_Y = this.scatterScaleY
      .copy()
      .range([0, this.realHeight])
      .domain([
        this.scatterScaleY.invert(minY_real),
        this.scatterScaleY.invert(maxY_real),
      ]);

    if (this.scatterAxisScale_X.base) this.scatterAxisScale_X.base(10);
    if (this.scatterAxisScale_Y.base) this.scatterAxisScale_Y.base(10);

    var tickSpacing = {
      X: 60,
      Y: 40,
    };
    if (this.scatterXAttrib.unitName) {
      tickSpacing.X += 2 + this.scatterXAttrib.unitName.length * 8;
    }

    // TODO: add translateZ to reduce redraw (but causes flickering on chrome)
    var addTicks = (axis, axisScale, chartSize, attrib) => {
      var numTicks = Math.min(15, Math.floor(chartSize / tickSpacing[axis])); // no more than 15 ticks.

      var ticks = axisScale
        .ticks(numTicks)
        .filter((t) => attrib.hasFloat || t % 1 === 0);

      var visiblePos = 0;

      this.DOM["recordAxis_" + axis]
        .select(".tickGroup")
        .selectAll(".hmTicks")
        .data(ticks, (t) => t)
        .join(
          (enter) =>
            enter
              .append("div")
              .attr("class", "hmTicks")
              .call((newDOM) => {
                newDOM
                  .transition()
                  .delay(100)
                  .on("start", function () {
                    this.style.opacity = 1;
                  });
                newDOM.append("div").attr("class", "tickText");
                newDOM.append("div").attr("class", "tickLine");
              }),
          (update) => update,
          (exit) => exit.remove()
        )
        .classed("lineAtZero", (tick) => (tick === 0 ? true : false))
        .style(
          "transform",
          (tick) => `translate${axis}(${axisScale(tick)}px) translateZ(0)`
        )
        .classed("hideLabel", (tick) => {
          var pos = axisScale(tick);
          if (pos >= visiblePos) {
            visiblePos = pos + tickSpacing[axis] / 2;
            return false;
          }
          return true;
        })
        // unit name may change, don't just rely on inserting tick text on new ticks.
        .selectAll(".tickText")
        .html((tick) => attrib.printAbbr(tick));

      // sort ticks from large to small
    };

    addTicks("X", this.scatterAxisScale_X, this.realWidth, this.scatterXAttrib);
    addTicks(
      "Y",
      this.scatterAxisScale_Y,
      this.realHeight,
      this.scatterYAttrib
    );

    this.refreshQueryBox_Filter();
  }
  /** -- */
  updateAfterFilter(how) {
    this.updateRecordVisibility();
    this.refreshLabelOverlaps();
    if (how) {
      this.refreshRecordVis();
    }
    this.refreshRecordColors();
  }

  /** -- */
  extendRecordDOM(newRecords) {
    newRecords.classed("noTransition", true);
    this.extendRecordDOM_Point(newRecords);
    newRecords
      .append("foreignObject")
      .attr("width", "120")
      .attr("height", "1")
      .append("xhtml:div")
      .attr("xmlns", "http://www.w3.org/1999/xhtml")
      .attr("class", "recordText");
  }

  /** -- */
  displayQueryBox(cT, show) {
    if (!this.initialized) return;

    this.DOM.recordDisplayWrapper
      .select(".spatialQueryBox_" + cT)
      .style("display", show ? "block" : null);
  }

  /** -- */
  refreshRecordBounds() {
    if (!this.initialized) return;

    // needed to make labels visible so that bounds can be computed correctly
    this.DOM.kshfRecords.classed("hideTextLabel", false);

    this.DOM.kshfRecords.selectAll(".recordText").each((record, i, nodes) => {
      if (!record.DOM.record) {
        delete record.textBounds;
        return;
      }
      var DOM = nodes[i];
      var recordTextBounds = DOM.getBoundingClientRect();
      DOM.parentNode.setAttribute("width", recordTextBounds.width * 1.07);
      DOM.parentNode.setAttribute("height", recordTextBounds.height);
      var _ = recordTextBounds; // record.DOM.record.getBoundingClientRect();
      record.textBounds = {
        width: _.width,
        height: _.height,
        left: _.left,
        right: _.right,
        top: _.top,
        bottom: _.bottom,
      };
    });
  }

  refreshQueryBox_Filter(bounds: { left; right; top; bottom } = null) {
    if (this.rd.collapsed) return;
    var _left, _right, _top, _bottom, temp;

    var isVisible: boolean = false;

    if (bounds === null) {
      isVisible =
        this.scatterXAttrib.isFiltered() || this.scatterYAttrib.isFiltered();

      if (!this.scatterXAttrib.isFiltered()) {
        _left = this.scatterXAttrib.rangeOrg[0];
        if (_left === 0) _left = -1000;
        _left = _left > 0 ? -_left * 100 : _left * 100;
        _right = this.scatterXAttrib.rangeOrg[1];
        if (_right === 0) _right = 1000;
        _right = _right > 0 ? _right * 100 : -_right * 100;
      } else {
        _left = this.scatterXAttrib.summaryFilter.active[0];
        _right = this.scatterXAttrib.summaryFilter.active[1];
        if (this.scatterXAttrib.stepTicks) {
          _left -= 0.5;
          _right -= 0.5;
        }
      }

      if (!this.scatterYAttrib.isFiltered()) {
        _top = this.scatterYAttrib.rangeOrg[1];
        if (_top === 0) _top = 1000;
        _top = _top > 0 ? _top * 100 : -_top * 100;
        _bottom = this.scatterYAttrib.rangeOrg[0];
        if (_bottom === 0) _bottom = -1000;
        _bottom = _bottom > 0 ? -_bottom * 100 : _bottom * 100;
      } else {
        _top = this.scatterYAttrib.summaryFilter.active[1];
        _bottom = this.scatterYAttrib.summaryFilter.active[0];
        if (this.scatterYAttrib.stepTicks) {
          _top -= 0.5;
          _bottom -= 0.5;
        }
      }
    } else {
      // use provided bounds
      if (bounds.left > bounds.right) {
        temp = bounds.left;
        bounds.left = bounds.right;
        bounds.right = temp;
      }
      if (bounds.top < bounds.bottom) {
        temp = bounds.top;
        bounds.top = bounds.bottom;
        bounds.bottom = temp;
      }
      _left = bounds.left;
      _right = bounds.right;
      _top = bounds.top;
      _bottom = bounds.bottom;
    }

    // convert from domain to screen coordinates
    _left = this.scatterScaleX(_left);
    if (isNaN(_left)) _left = -1000; // log scale fix
    _right = this.scatterScaleX(_right);
    _top = this.scatterScaleY(_top);
    _bottom = this.scatterScaleY(_bottom);
    if (isNaN(_bottom)) _bottom = 1000; // log scale fix

    // give more room
    _left -= 3;
    _right += 3;
    _top -= 3;
    _bottom += 3;

    this.DOM.recordDisplayWrapper
      .select(".recordGroup_Scatter .spatialQueryBox_Filter")
      .classed("active", bounds ? true : isVisible)
      .style("left", _left + "px")
      .style("top", _top + "px")
      .style("width", Math.abs(_right - _left) + "px")
      .style("height", Math.abs(_bottom - _top) + "px");
  }

  /** -- */
  onRecordMouseOver(record) {
    record.moveDOMtoTop();

    ["X", "Y"].forEach((axis, i) => {
      var attrib: Attrib = this["scatter" + axis + "Attrib"];
      var acc = attrib.attribID;
      var pos: number = this["scatterAxisScale_" + axis](
        record._valueCache[acc]
      );
      var dom = this.DOM["recordAxis_" + axis];
      dom
        .select(".onRecordLine")
        .style(
          "transform",
          "translate(" + pos * (i ? 0 : 1) + "px," + pos * (i ? 1 : 0) + "px)"
        )
        .style("opacity", 1);
      dom
        .select(".onRecordLine > .tickText")
        .html(attrib.getFormattedValue(record._valueCache[acc], false));
    });

    if (this.scatter_showTrails.is(false)) return;

    if (
      this.scatterYAttrib.hasTimeSeriesParent() &&
      this.scatterXAttrib.hasTimeSeriesParent()
    ) {
      var _ts_X =
        this.scatterXAttrib.timeseriesParent.getRecordValue(record)._keyIndex;
      var _ts_Y =
        this.scatterYAttrib.timeseriesParent.getRecordValue(record)._keyIndex;

      // merge the two
      var _ts = [];
      for (let _time_src in _ts_X) {
        if (_ts_Y[_time_src]) {
          _ts.push({
            x: _ts_X[_time_src]._value,
            y: _ts_Y[_time_src]._value,
          });
        }
      }

      var lineGenerator = d3
        .line()
        .curve(d3.curveNatural || d3.curveCatmullRomOpen)
        .x((d) => this.scatterScaleX(d.x))
        .y((d) => this.scatterScaleY(d.y));

      this.DOM.recordTrail.style("opacity", 1);

      this.DOM.recordTrail_Path
        .style("stroke-width", 2 / this.scatterTransform.z + "px")
        .attr("d", lineGenerator(_ts));

      this.DOM.recordTrail
        .selectAll("circle")
        .data(_ts)
        .join("circle")
        .attr("r", 3)
        .style("transform", (d) => {
          var x = this.scatterScaleX(d.x);
          var y = this.scatterScaleY(d.y);
          return `translate(${x}px,${y}px) scale(${
            1 / this.scatterTransform.z
          })`;
        });
    }
  }

  /** -- */
  onRecordMouseLeave() {
    this.DOM.root.selectAll(".onRecordLine").style("opacity", null);
    // hide the trail
    this.DOM.recordTrail?.style("opacity", 0);
  }
}
