import { select, pointer } from "./d3_select";
import { min, max, extent } from "d3-array";

import { Block } from "./Block";
import { Base } from "./Base";
import { i18n } from "./i18n";
import { Attrib_Interval } from "./Attrib_Interval";
import { Aggregate_Interval } from "./Aggregate_Interval";
import { Config } from "./Config";
import { Record } from "./Record";

import { CompareType, IntervalT, MeasureType } from "./Types";

const d3 = {
  select,
  pointer,
  min,
  max,
  extent,
};

export type ZoomableStatus = "plus" | "minus" | "";

export abstract class Block_Interval<T extends IntervalT> extends Block {
  // specific attribute type
  public readonly attrib: Attrib_Interval<T>;

  readonly zoomed: Config<boolean>;
  readonly optimumBinWidth: Config<number>;
  readonly maxHeightRatio: Config<number>;
  readonly showHistogram: Config<boolean>;

  abstract dragRange(initPos, curPos, initMin, initMax): void;
  abstract showValuePicker(DOM, d: "min" | "max"): void;

  // shorthand
  get valueScale() {
    return this.attrib.valueScale;
  }

  constructor(attrib: Attrib_Interval<T>) {
    super(attrib);

    this.zoomed = new Config<boolean>({
      parent: this,
      cfgClass: "zoomed",
      cfgTitle: "ValueAxisZoom",
      default: false,
      UI: { disabled: true },
      iconClass: "far fa-search",
      helparticle: "5e87ea002c7d3a7e9aea606c",
      itemOptions: [
        { name: "Zoomed", value: true },
        { name: "Full", value: false },
      ],
      forcedValue: () => {
        if (!this.attrib.isFiltered()) return false;
      },
      onSet: async (v) => {
        if (!this.attrib.aggr_initialized) return;

        this.attrib.refreshValueScale();

        if (this.DOM.inited) {
          this.DOM.summaryInterval.classed("zoomed", v);
          this.DOM.zoomControl.attr("sign", v ? "minus" : "plus");
        }

        this.noRefreshVizAxis = true;
        var tempScale_prev = this.attrib.chartScale_Measure.copy().clamp(false);

        if (this.attrib.type !== "timestamp") this.attrib.refreshScaleType(); // linear vs log
        this.attrib.updateScaleAndBins();
        this.refreshHeight();

        this.noRefreshVizAxis = false;
        this.attrib.chartScale_Measure_prev = tempScale_prev;
        this.refreshViz_Axis();

        await this.browser.recordDisplay?.refreshAttribScaleType(this);

        this.attrib.updateScaleAndBins();
      },
    });

    // ******************************************************
    // Interval Bin width
    this.optimumBinWidth = new Config<number>({
      parent: this,
      cfgClass: "optimumBinWidth",
      cfgTitle: "BinWidth",
      UISeperator: {
        title: "Binning",
      },
      default: Base.width_HistBinDefault,
      iconClass: "fa fa-arrows-h",
      helparticle: "5e87e8952c7d3a7e9aea6065",
      itemOptions: [
        { name: "<i class='fa fa-minus'></i>", value: -99, _type: "minus" },
        { name: "1x", value: 45, max: 90 },
        { name: "2x", value: 90, max: 135 },
        { name: "3x", value: 135, max: 180 },
        { name: "4x", value: 180, max: 100000 },
        { name: "<i class='fa fa-plus'></i>", value: -199, _type: "plus" },
      ],
      isActive: (d) =>
        d.value <= this.optimumBinWidth.get() && d.max > this.optimumBinWidth.get(),
      preSet: async (v, obj) => {
        if (v === -99) {
          v = obj._value - 5;
        } else if (v === -199) {
          v = obj._value + 5;
        }
        return Math.max(45, Math.min(180, v));
      },
      onSet: () => this.attrib.updateScaleAndBins(),
    });

    // ******************************************************
    // Interval Bin height (linear / log)
    this.maxHeightRatio = new Config<number>({
      parent: this,
      cfgClass: "maxHeightRatio",
      cfgTitle: "BinHeight",
      default: Base.height_MaxRatioDefault,
      UISeperator: {
        title: "Size",
      },
      iconClass: "fa fa-arrows-v",
      helparticle: "5e87e7502c7d3a7e9aea6060",
      itemOptions: [
        { name: "<i class='fa fa-minus'></i>", value: -99, _type: "minus" },
        { name: "1x", value: 0.15, max: 0.3 },
        { name: "2x", value: 0.3, max: 0.6 },
        { name: "4x", value: 0.6, max: 1.2 },
        { name: "8x", value: 1.2, max: 1.5 },
        { name: "10x", value: 1.5, max: 2.0 },
        { name: "<i class='fa fa-plus'></i>", value: -199, _type: "plus" },
      ],
      isActive: (d) => {
        var v = this.maxHeightRatio.get();
        if (this.attrib.type === "timestamp") v *= 3;
        return d.value <= v && d.max > v;
      },
      // if timestamp, the returned value is divided by 3.
      onRead: (v: number) => (this.attrib.type === "timestamp" ? v / 3 : v),
      preSet: async (v, obj) => {
        if (v === -99) {
          v = obj._value - 0.05;
        } else if (v === -199) {
          v = obj._value + 0.05;
        }
        return Math.max(0.08, Math.min(1.5, v));
      },
      onSet: () => {
        if(!this.attrib.aggr_initialized) return;
        this.browser.updateLayout_Height();
      }
    });

    this.showHistogram = new Config<boolean>({
      parent: this,
      cfgClass: "showHistogram",
      cfgTitle: "Histogram",
      iconClass: "fa fa-chart-bar",
      UISeperator: {
        title: "Charts",
      },
      default: true,
      itemOptions: [
        { name: "Show", value: true },
        { name: "Hide", value: false },
      ],
      onSet: (v) => {
        if (!attrib.aggr_initialized) return; // not initialized yet
        if (!v) this.height_hist = 0;
        this.refreshChartsVisibleOption();
        this.browser.updateLayout_Height();
      },
    });

    this.attrib.configs.zoomed = this.zoomed;
    this.attrib.configs.optimumBinWidth = this.optimumBinWidth;
    this.attrib.configs.maxHeightRatio = this.maxHeightRatio;
    this.attrib.configs.showHistogram = this.showHistogram;
  }

  get _aggrs(): Aggregate_Interval<T>[] {
    return this.attrib._aggrs;
  }

  abstract zoomableStatus(): ZoomableStatus;

  abstract getScaleNicing(): number;

  // pixel width settings...
  public height_hist = 1; // Initial height (will be updated later...)
  public height_Ticklabels = 13; // can be double line
  private width_measureAxisLabel = 35; // ..

  protected highlightRangeLimits_Active = false;

  // width for one aggregate - fixed width
  public aggrWidth: number = 0;

  refreshIntervalSlider(t: MeasureType[] = undefined) {
    if (!this.DOM.intervalSlider) return;

    (t || Base.Active_Compare_List).forEach((cT: CompareType | "Active") => {
      var minPos: IntervalT, maxPos: IntervalT, visible;
      switch (cT) {
        case "Active":
          // based on filtered range
          visible = this.attrib.isFiltered();
          minPos =
            this.attrib.summaryFilter.active?.minV ?? this.attrib.rangeOrg[0];
          maxPos =
            this.attrib.summaryFilter.active?.maxV ?? this.attrib.rangeOrg[1];
          break;
        default:
          visible =
            this.browser.vizActive(cT) && this.attrib.isComparedAttrib();
          var aggr = this.browser.selectedAggrs[cT] as Aggregate_Interval<T>;
          if (visible) {
            minPos = aggr.minV;
            maxPos = aggr.maxV;
          }
          break;
      }

      minPos = Math.max(this.valueScale.range()[0], this.valueScale(minPos));
      maxPos = Math.min(this.valueScale.range()[1], this.valueScale(maxPos));

      this.DOM.intervalSlider
        .select(".base_" + cT)
        .classed("visible", visible)
        .style("left", minPos + "px")
        .style("width", maxPos - minPos + "px");
      if (cT === "Active") {
        this.DOM.rangeHandle.style(
          "transform",
          (d) => `translateX(${d === "min" ? minPos : maxPos}px)`
        );
      }
    });
  }

  // ********************************************************************
  // Height & width
  // ********************************************************************

  get height_hist_max() {
    return Math.max(
      Base.height_HistMin,
      this.width_histogram * this.maxHeightRatio.get()
    ); // Maximim possible histogram height
  }

  get height_RangeMax() {
    if (this.attrib.isEmpty()) return this.height_Header;
    return (
      this.height_Header +
      this.height_Extra_max +
      (this.showHistogram.get() ? this.height_hist_max : 0)
    );
  }

  get height_RangeMin() {
    if (this.attrib.isEmpty()) return this.height_Header;
    return 0 + this.height_Header + this.height_Extra_max;
  }

  get height_slider() {
    return 12;
  }
  get height_padding() {
    return 7;
  }

  get height_Extra_base() {
    return this.height_padding + this.height_slider + this.height_Ticklabels;
  }

  get height_Extra() {
    return (
      this.height_Extra_base +
      (this.showHistogram.get() ? Base.height_HistBottomGap : 0) +
      4
    ); // 4 is some gap
  }

  get height_Extra_max() {
    return this.height_Extra_base + Base.height_HistBottomGap;
  }

  get height_Content() {
    return !this.isVisible()
      ? 0
      : (this.showHistogram.get() ? this.height_hist : 0) + this.height_Extra;
  }

  chartAxis_Measure_TickSkip(): number {
    return this.height_hist / 30;
  }

  setHeight(targetHeight) {
    if (!this._aggrs) return;
    var c = Math.min(
      this.height_hist_max,
      targetHeight - this.height_Header - this.height_Extra
    );
    if (this.height_hist === c) return;
    this.height_hist = c;
    this.attrib.updateChartScale_Measure(true);
  }

  refreshHeight() {
    super.refreshHeight();
    if (this.attrib.isEmpty() || !this.inDashboard || !this.DOM.inited) return;

    var _h = this.showHistogram.get() ? this.height_hist + 23 : 10;

    this.DOM.valueTickGroup.style("height", this.height_Ticklabels + "px");
    this.DOM.rangeHandle
      .style("height", _h + "px")
      .style("top", -_h + 10 + "px");
    this.DOM.highlightRangeLimits.style("height", this.height_hist + "px");
    this.DOM.histogram.style("height", this.height_hist + "px");

    this.DOM.root
      .select(".chartAxis_Measure > .measureDescrLabel")
      .style("width", this.height_hist + "px")
      .style("left", -this.height_hist / 2 + "px");

    this.refreshViz_Bins();
    this.updateValueTicks();

    this.refreshViz_All();
  }

  get width_marginLeft() {
    return this.width_measureAxisLabel + Base.width_measureDescrLabel;
  }

  get width_marginRight() {
    return this.width_measureAxisLabel * (this.isWideChart() ? 1 : 0.5) + 8;
  }

  get width_histogram() {
    if (!this.inDashboard) return 30;
    return Math.max(
      2,
      this.getWidth() - this.width_marginLeft - this.width_marginRight
    );
  }

  get width_Bin() {
    return this.aggrWidth - Base.width_HistBarGap * 2;
  }

  isWideChart() {
    return this.getWidth() > 500;
  }

  refreshWidth() {
    this.attrib.updateScaleAndBins(true); // forces render update

    if (this.DOM.inited === false) return;

    this.DOM.wrapper.classed("showMeasureAxis_2", this.isWideChart());
    this.DOM.summaryInterval
      .style("padding-left", this.width_marginLeft + "px")
      .style("padding-right", this.width_marginRight + "px");

    this.DOM.blockName.style(
      "max-width",
      this.collapsed ? null : this.getWidth() - 40 + "px"
    );
  }

  // ********************************************************************
  // Visualization
  // ********************************************************************

  insertVizDOM() {
    this.refreshViz_Bins();
    this.refreshViz_Axis();
    this.refreshMeasureLabelText("Active");
    this.updateValueTicks();
  }

  refreshViz_Bins() {
    if (!this.DOM.inited) return;
    var me = this;

    var baseline = this.measureLineZero;

    var _width = (aggr: Aggregate_Interval<T>) =>
      this.valueScale(aggr.maxV) -
      this.valueScale(aggr.minV) -
      Base.width_HistBarGap * 2;
    var _transform = (aggr) =>
      `translateX(${this.valueScale(aggr.minV) + Base.width_HistBarGap}px)`;

    var updateVizBinWidth = (selection) => {
      Base.Total_Active_Compare_List.forEach((t) => {
        selection
          .selectAll(".measure_" + t)
          .style(
            "transform",
            (aggr) =>
              `translateY(${this.height_hist - baseline}px) scale(${_width(
                aggr
              )},0)`
          );
      });
    };

    this.DOM.aggrGlyphs = this.DOM.histogram_bins
      .selectAll(".aggrGlyph")
      .data(this._aggrs, (aggr) => [aggr.maxV, aggr.minV])
      .join(
        (enter) =>
          enter
            .append("span")
            .attr("class", "aggrGlyph rangeGlyph")
            .tooltip((aggr: Aggregate_Interval<T>) => aggr.getTooltipHTML(), {
              theme: "dark kshf-tooltip kshf-record",
              placement: "bottom",
              animation: "fade",
              trigger: "manual",
            })
            .on("mouseenter", function (_event, aggr) {
              if (aggr.Active.recCnt === 0) return;
              if (me.highlightRangeLimits_Active) return;

              this.highlightTimeout = window.setTimeout(() => {
                me.onAggrHighlight(aggr);
                this.tippy.show();
              }, me.browser.movingMouseDelay);
            })
            .on("mouseleave", function (_event, aggr) {
              this.tippy.hide();
              if (aggr.Active.recCnt === 0) return;
              if (me.highlightRangeLimits_Active) return;
              if (this.highlightTimeout)
                window.clearTimeout(this.highlightTimeout);
              me.onAggrLeave(aggr);
            })
            .on("click", (event, aggr) => this.onAggrClick(event, aggr))
            .call((aggrGlyph) => {
              aggrGlyph
                .transition()
                .duration(0)
                .delay(10)
                .style("opacity", null)
                .style("pointer-events", null);

              var measureGroup = aggrGlyph
                .append("div")
                .attr("class", "measureGroup");

              Base.Total_Active_Compare_List.forEach((t) => {
                this.DOM["measure_" + t] = measureGroup
                  .append("span")
                  .attr("class", `measure_${t} bg_${t}`)
                  .on("mouseenter", (_event, aggr) => {
                    aggr.DOM.aggrGlyph
                      .querySelector(".measureLabel_" + t)
                      .classList.add("forceShow");
                    if (Base.Compare_List.find((_) => _ === t)) {
                      this.browser.refreshAllMeasureLabels(t);
                    }
                  })
                  .on("mouseleave", (_event, aggr) => {
                    var labelDOM = aggr.DOM.aggrGlyph.querySelector(
                      ".measureLabel_" + t
                    );
                    if (labelDOM) labelDOM.classList.remove("forceShow");
                    if (Base.Compare_List.find((_) => _ === t)) {
                      this.browser.refreshAllMeasureLabels("Active");
                    }
                  });
              });

              updateVizBinWidth(aggrGlyph);

              this.insertAggrLockButton(aggrGlyph, "top");

              aggrGlyph
                .append("span")
                .attr("class", "measureLabelGroup")
                .call((measureLabelGroup) => {
                  Base.Active_Compare_List.forEach((t) => {
                    measureLabelGroup
                      .append("span")
                      .attr("class", "measureLabel measureLabel_" + t);
                  });
                });
            }),
        (update) =>
          update
            .style(
              "width",
              (aggr: Aggregate_Interval<T>) => _width(aggr) + "px"
            )
            .style("transform", _transform)
            .call((update) => updateVizBinWidth(update)),
        (exit) => {
          if (this.noRefreshVizAxis && this.browser.finalized) {
            exit
              .style(
                "width",
                (aggr: Aggregate_Interval<T>) => _width(aggr) + "px"
              )
              .style("transform", _transform)
              .style("opacity", 0)
              .style("pointer-events", "none")
              .transition()
              .duration(0)
              .delay(700)
              .remove();

            updateVizBinWidth(exit);
          } else {
            exit.remove();
          }
          return exit;
        }
      )
      .call((merged) => {
        merged
          .style("width", (aggr: Aggregate_Interval<T>) => _width(aggr) + "px")
          .style("transform", _transform);

        merged.each(function (aggr: Aggregate_Interval<T>) {
          aggr.isVisible = true;
          aggr.setAggrGlyph(this);
        });

        Base.Total_Active_Compare_List.forEach((t) => {
          this.DOM["measure_" + t] = merged.selectAll(".measure_" + t);
        });
        this.DOM.lockButton = merged.selectAll(".lockButton");
        this.DOM.measureLabelGroup = merged.selectAll(".measureLabelGroup");
        Base.Active_Compare_List.forEach((t) => {
          this.DOM["measureLabel_" + t] = merged.selectAll(
            ".measureLabel_" + t
          );
        });
      });
  }

  refreshViz_Active(): void {
    if (!this.isVisible() || !this.DOM.aggrGlyphs || !this.valueScale) return;

    var baseline = this.measureLineZero;

    this.DOM.aggrGlyphs.classed(
      "NoActiveRecords",
      (aggr) => aggr.measure("Active") === 0
    );

    this.refreshViz_Cache("Active");

    // Position the lock button
    this.DOM.lockButton
      .style(
        "transform",
        (aggr: Aggregate_Interval<T>) =>
          `translateY(${
            this.height_hist - baseline - aggr.sumOffsetScale("Active") - 10
          }px)`
      )
      .classed(
        "inside",
        (aggr: Aggregate_Interval<T>) =>
          this.browser.relativeBreakdown ||
          Math.abs(
            this.height_hist - aggr.offset("Active") - aggr.scale("Active")
          ) < 6
      );

    var maybePartial =
      this.attrib.isFiltered() &&
      !this.attrib.stepTicks &&
      this.attrib.summaryFilter.active &&
      this.attrib.type !== "timestamp";

    // Used for partial rendering
    let filter_min: T, filter_max: T, minPos: number, maxPos: number;
    if (maybePartial) {
      filter_min = this.attrib.summaryFilter.active.minV;
      filter_max = this.attrib.summaryFilter.active.maxV;
      minPos = this.valueScale(filter_min);
      maxPos = this.valueScale(filter_max);
    }

    this.DOM.measure_Active.style("transform", (aggr) => {
      var translateX = 0;
      var _w: number = this.width_Bin;

      if (maybePartial) {
        var aggr_min = aggr.minV;
        var aggr_max = aggr.maxV;
        // it is within the filtered range
        if (aggr_max > filter_min && aggr_min < filter_max) {
          if (aggr_min < filter_min) {
            var lostWidth = minPos - this.valueScale(aggr_min);
            translateX = lostWidth;
            _w -= lostWidth;
          }
          if (aggr_max > filter_max) {
            _w -=
              this.valueScale(aggr_max) - maxPos - Base.width_HistBarGap * 2;
          }
        } else {
          aggr.setScale("Active", 0);
        }
      }

      return `translate(${translateX}px, ${
        this.height_hist - baseline - aggr.offset("Active")
      }px) scale(${_w},${aggr.scale("Active")})`;
    });

    // doing position update after rendering the bar,
    // bc the active scale can be set to zero if the bar is outside filtering.
    this.refreshMeasureLabelText("Active");
    this.refreshMeasureLabelPos("Active");
  }

  refreshViz_Compare(cT: CompareType, curGroup, totalGroups, prevCts = []) {
    if (!this.isVisible() || !this.DOM.aggrGlyphs || !this.valueScale) return;

    this.refreshViz_Cache(cT, prevCts);

    this.refreshMeasureLabelText(cT);
    this.refreshMeasureLabelPos(cT, curGroup);
  }

  refreshMeasureLabelPos(sT: MeasureType = "Active", curGroup = 0) {
    if (!this.isVisible() || !this.DOM.aggrGlyphs || !this.valueScale) return;
    if (sT === "Other") return;

    if (this.browser.stackedChart) {
      this.DOM["measureLabel_" + sT]
        .classed(
          "hidden",
          (aggr: Aggregate_Interval<T>) =>
            aggr.scale(sT) < 16 || this.browser.getMeasureValue(aggr, sT) == 0
        )
        .style("width", "100%")
        .style("transform", (aggr: Aggregate_Interval<T>, i, nodes) => {
          nodes[i].setAttribute("labelAlign", "middle");
          return `translate(0px, ${-aggr[sT].offset - aggr[sT].scale / 2}px)`;
        });
    } else {
      if (
        this.attrib.type === "timestamp" &&
        (sT !== "Active" || this.browser.activeComparisonsCount > 0)
      ) {
        // Line chart

        // _spacer is needed to detect intersecting labels and prevent overlaps
        // cannot use LabelSpacer because this needs to maintain which selections are visible, etc.
        this._aggrs.forEach((_: Aggregate_Interval<T>) => {
          _._spacer = _._spacer || {};
        });

        var visibleStuff = ["Active"]
          .concat(this.browser.activeComparisons)
          .filter((_) => _ !== sT);

        this.DOM["measureLabel_" + sT].style(
          "transform",
          (aggr: Aggregate_Interval<T>, i, nodes) => {
            var v = aggr.offset(sT) + aggr.scale(sT);
            if (sT === "Active") {
              v += 20; // 20 pixel up
            }
            // 5px: just extra offset to avoid intersecting with line
            v = 5 - Math.min(v, this.height_hist);

            aggr._spacer[sT] = { min: v - 5, max: v + 20 };
            var intersects = visibleStuff.some((s) => {
              var l = aggr._spacer[s];
              return l ? l.min <= v && l.max >= v : false;
            });

            // the visibility (hidden class) of label depends on all other labels on the same aggregate
            nodes[i].classList[intersects ? "add" : "remove"]("hidden");

            return `translate(0px, ${v}px)`;
          }
        );
      } else {
        var totalGroups = this.browser.activeComparisonsCount;
        var width = 100;
        var tX = 0;
        var hidden = false;
        if (
          (sT !== "Active" && sT !== "Total") &&
          totalGroups > 1 &&
          this.browser.vizActive(sT)
        ) {
          var realWidth = this.width_Bin / totalGroups;
          tX = realWidth * curGroup;
          width = 100 / totalGroups;
          hidden = realWidth < this.panel.width_CatMeasureLabel;
        }
        this.DOM["measureLabel_" + sT]
          .classed("hidden", this.attrib.type !== "timestamp" && hidden)
          .style("transform", `translate(${tX}px, 2px)`)
          .style("width", `${width}%`);
      }
    }
  }

  // ********************************************************************
  // Show record value
  // ********************************************************************

  updateAfterFilter(): void {
    if (!this.isVisible()) return;
    this.attrib.updateChartScale_Measure();
    this.refreshMeasureLabelText("Active");
    this.refreshViz_NoValueAggr();
  }

  showRecordValue(record: Record): void {
    if (!this.inDashboard || !this.DOM.inited || !this.valueScale) return;
    var v: T = this.attrib.getRecordValue(record);
    if (v == null) return;
    if (v < this.valueScale.domain()[0]) return;
    if (v > this.valueScale.domain()[1]) return;

    this.DOM.recordValue
      .style("transform", "translateX(" + this.attrib.getValuePosX(v) + "px)")
      .style("display", "block");
    this.DOM.recordValueText.html(this.attrib.getFormattedValue(v, false));
  }

  hideRecordValue() {
    if (!this.DOM.inited || !this.DOM.recordValue) return;
    this.DOM.recordValue.style("display", null);
  }

  // ********************************************************************
  // DOM initializations
  // ********************************************************************

  _initPos: T = null;

  initDOM(beforeDOM): boolean {
    this.attrib.initializeAggregates();
    if (this.attrib.isEmpty()) return false;
    if (this.DOM.inited) return true;

    this.insertRoot(beforeDOM);

    this.DOM.summaryInterval = this.DOM.wrapper
      .append("div")
      .attr("class", "summaryInterval")
      .on("mousedown", (event) => {
        event.stopPropagation();
        event.preventDefault();
      });

    var _flexClear = (event) => {
      this._initPos = undefined;
      this.highlightRangeLimits_Active = false;
      event.preventDefault();
      event.stopPropagation();
    };

    this.DOM.histogram = this.DOM.summaryInterval
      .append("div")
      .attr("class", "histogram");
    this.DOM.histogram_bins = this.DOM.histogram
      .append("div")
      .attr("class", "aggrGroup")
      .on("mousemove", (event) => {
        if (!event.shiftKey) {
          if (this.highlightRangeLimits_Active) {
            this.browser.clearSelect_Compare();
            _flexClear(event);
          }
          return;
        }

        // dynamically select... range by mouse-move
        var pointerPosition = this.valueScale.invert(d3.pointer(event)[0]);
        if (this._initPos == null) {
          this._initPos = pointerPosition as T;
        }

        var [minV, maxV] = d3.extent([this._initPos, pointerPosition]);

        [minV, maxV] = this.attrib.sanitizeRange(minV, maxV);
        if (minV === maxV) return; // no selection!
        this.highlightRangeLimits_Active = true;

        if (this.browser.vizActive(this.browser.Compare_Highlight)) {
          this.browser.clearSelect_Compare(
            this.browser.Compare_Highlight,
            false
          );
        }

        var aggr = this.attrib.createAggregate(minV, maxV);
        aggr.updateRecords();

        this.browser.allRecordsAggr.clearCompare(
          this.browser.Compare_Highlight
        );
        this.browser.setSelect_Compare(aggr);
        event.preventDefault();
        event.stopPropagation();
      })
      .on("click", (event) => {
        if (event.shiftKey && this.highlightRangeLimits_Active) {
          this.browser.lockSelect_Compare();
          _flexClear(event);
        }
      });

    this.DOM.highlightRangeLimits = this.DOM.histogram_bins
      .selectAll(".highlightRangeLimits")
      .data([0, 1])
      .enter()
      .append("div")
      .attr("class", "highlightRangeLimits");

    this.insertChartAxis_Measure(this.DOM.histogram);

    this.initDOM_Slider();

    this.insertVizDOM();

    this.setCollapsed(this.collapsed);

    this.DOM.inited = true;

    this.refreshChartsVisibleOption();

    return true;
  }

  initDOM_Slider() {
    var me = this;

    this.DOM.intervalSlider = this.DOM.summaryInterval
      .append("div")
      .attr("class", "intervalSlider");

    this.DOM.zoomControl = this.DOM.intervalSlider
      .append("span")
      .attr("class", "zoomControl far")
      .tooltip("", {
        onTrigger: (instance) => {
          var zoomIn = instance.reference.getAttribute("sign") === "plus";
          instance.reference.tippy.setContent(
            zoomIn ? "Zoom into filtered range" : "Zoom out"
          );
        },
      })
      .attr("sign", this.zoomed.is(true) ? "minus" : "plus")
      .on("click", async (event) => {
        await this.zoomed.set(event.currentTarget.getAttribute("sign") === "plus");
      });

    var controlLine = this.DOM.intervalSlider
      .append("div")
      .attr("class", "controlLine")
      .on("mousedown", function (event) {
        if (event.which !== 1) return; // only respond to left-click
        me.browser.DOM.root
          .classed("adjustingWidth", true)
          .classed("noPointerEvents", true);
        var e = this.parentNode;
        var initPos: T = me.valueScale.invert(d3.pointer(event, e)[0]);
        d3.select("body")
          .on("mousemove", function (event2) {
            var targetPos: T = me.valueScale.invert(d3.pointer(event2, e)[0]);
            me.browser.preventAxisScaleTransition = true;
            me.attrib.setRangeFilter_Custom(
              d3.min([initPos, targetPos]),
              d3.max([initPos, targetPos])
            );
          })
          .on("mouseup", function () {
            me.browser.preventAxisScaleTransition = false;
            me.browser.DOM.root
              .classed("adjustingWidth", false)
              .classed("noPointerEvents", false);
            d3.select("body").on("mousemove", null).on("mouseup", null);
          });
        event.preventDefault();
      });

    this.DOM.activeTotalRange = controlLine
      .append("span")
      .attr("class", "base base_Total");

    controlLine
      .append("span")
      .attr("class", "base base_Active")
      .tooltip(i18n.DragToFilter, { placement: "bottom" })
      .on("mousedown", function (event) {
        if (event.which !== 1) return; // only respond to left-click
        // time is not supported for now.
        // if (me instanceof Summary_Timestamp) return;
        if (me.attrib.type === "timestamp") return;

        me.browser.DOM.root.classed("noPointerEvents", true);

        var e = this.parentNode;
        var initMin = me.attrib.summaryFilter.active.minV;
        var initMax = me.attrib.summaryFilter.active.maxV;
        var initPos = d3.pointer(event, e)[0];

        d3.select("body")
          .on("mousemove", () => {
            me.browser.preventAxisScaleTransition = true;
            me.dragRange(initPos, d3.pointer(event, e)[0], initMin, initMax);
          })
          .on("mouseup", () => {
            me.browser.preventAxisScaleTransition = false;
            me.browser.DOM.root.classed("noPointerEvents", false);
            d3.select("body").on("mousemove", null).on("mouseup", null);
          });
        event.preventDefault();
        event.stopPropagation();
      });

    Base.Compare_List.forEach((cT) => {
      controlLine
        .append("span")
        .attr("class", "base base_Compare bg_" + cT)
        .tooltip(i18n.DragToFilter, { placement: "bottom" });
    });

    this.DOM.rangeHandle = controlLine
      .selectAll(".rangeHandle")
      .data(["min", "max"])
      .enter()
      .append("span")
      .attr("class", (d) => "rangeHandle " + d)
      .tooltip(i18n.DragToFilter)
      .on("mouseenter", function () {
        if (this.dragging) return;
        this.tippy.show();
        this.classList.add("dragging");
      })
      .on("mouseleave", function () {
        if (this.dragging) return;
        this.tippy.hide();
        this.classList.remove("dragging");
      })
      .on("dblclick", function (_event, d: "min" | "max") {
        me.showValuePicker(this, d);
      })
      .on("mousedown", function (event, d: "min" | "max") {
        if (event.which !== 1) return; // only respond to left-click

        me.browser.DOM.root
          .classed("adjustingWidth", true)
          .classed("noPointerEvents", true);
        this.classList.add("dragging");

        var mee = this;
        mee.dragging = true;
        var e = this.parentNode;
        var org = {
          min: me.attrib.summaryFilter.active.minV,
          max: me.attrib.summaryFilter.active.maxV,
        };
        d3.select("body")
          .on("mousemove.range", function (event2) {
            var _v: T = me.valueScale.invert(d3.pointer(event2, e)[0]);
            // TODO!
            // me.attrib.setRangeFilter({ [d]: _v }, true);
            // detect a flip :: TODO: Works only once, if there's a second flip, it doesn't detect correctly
            if (d === "min" && _v >= org.max) d = "max";
            if (d === "max" && _v <= org.min) d = "min";
            me.browser.preventAxisScaleTransition = true;
          })
          .on("mouseup.range", function () {
            delete me.browser.preventAxisScaleTransition;
            mee.dragging = false;
            mee.classList.remove("dragging");
            me.browser.DOM.root
              .classed("adjustingWidth", null)
              .classed("noPointerEvents", false);
            d3.select("body")
              .style("cursor", "auto")
              .on("mousemove.range", null)
              .on("mouseup.range", null);
          });
        event.stopPropagation();
      });

    this.DOM.recordValue = controlLine
      .append("div")
      .attr("class", "recordValue");
    this.DOM.recordValue.append("span").attr("class", "valueScaleMark");
    this.DOM.recordValueText = this.DOM.recordValue
      .append("span")
      .attr("class", "recordValueText")
      .append("span")
      .attr("class", "recordValueText-v");

    this.DOM.valueTickGroup = this.DOM.intervalSlider
      .append("div")
      .attr("class", "valueTickGroup");
  }

  onAggrHighlight(aggr: Aggregate_Interval<T>) {
    if (this.browser.adjustMode) return;
    if (this.browser.mouseOverCompare.is(false)) return;
    if (!this.browser.can_setSelect_Compare(aggr)) return;
    var [minV, maxV] = this.attrib.sanitizeRange(aggr.minV, aggr.maxV);

    if (minV === maxV) return; // no selection!

    if (!this.attrib.binMatch([minV, maxV, null], aggr)) {
      aggr.updateRecords();
    }
    aggr.DOM.aggrGlyph?.setAttribute("selection", "selected");
    this.browser.setSelect_Compare(aggr);
  }

  onAggrLeave(aggr) {
    if (this.browser.adjustMode) return;
    aggr.unselectAggregate();
    this.browser.clearSelect_Compare();
  }

  onAggrClick(event, aggr) {
    if (this.highlightRangeLimits_Active) return;
    if (event && event.shiftKey) {
      this.browser.lockSelect_Compare();
      return;
    }
    this.attrib.setRangeFilter(aggr);
  }

  refreshValueTickLabels() {
    this.DOM.valueTickGroup
      ?.selectAll(".valueTick > .text")
      .html((tick) => this.attrib.printAbbr(tick.tickValue, false));
  }

  refreshChartsVisibleOption() {
    if (!this.DOM.inited) return;
    this.DOM.root.classed("chartVisibleHistogram", this.showHistogram.is(true));
  }

  onClearFilter() {
    this.attrib.noValueAggr.filtered = false;
    this.attrib.summaryFilter.active = null;
    this.zoomed.set(false);
    this.refreshIntervalSlider();
  }

  // extended by Block_Numeric to add minor ticks when using log scale
  insertMinorTicks(ticks) {}

  updateValueTicks() {
    var me = this;

    // create ticks used in the value scale / interval range slider
    var ticksOrg: T[] = this.attrib.intervalTicks.slice();

    if (this.attrib.stepTicks) ticksOrg.pop(); // won't insert last tick here

    type Tick = { tickValue: T; major: boolean };

    let ticks: Tick[] = ticksOrg.map((p) => ({ tickValue: p, major: true }));

    this.insertMinorTicks(ticks);

    var finalPos = (d: Tick) => this.valueScale(d.tickValue) + "px";
    var prevPos = (d: Tick) => this.attrib.valueScale_prev(d.tickValue) + "px";

    if (!this.browser.chartsLoaded) prevPos = finalPos;

    this.DOM.valueTickGroup
      .selectAll(".valueTick")
      .data(ticks, (t: Tick) => t.tickValue)
      .join(
        (enter) =>
          enter
            .append("span")
            .attr("class", "valueTick")
            .style("opacity", 1)
            .style("left", finalPos)
            .style("top", "20px")
            .call((valueTicks) => {
              valueTicks.append("span").attr("class", "line");
              valueTicks
                .append("span")
                .attr("class", "text")
                .on("mouseover", function () {
                  if (this.bin) me.onAggrHighlight(this.bin);
                })
                .on("mouseleave", function () {
                  if (this.bin) me.onAggrLeave(this.bin);
                })
                .on("click", function (event) {
                  if (this.bin) me.onAggrClick(event, this.bin);
                });
            }),
        // .call((valueTicks) => {
        //   window.setTimeout(() => {
        //     valueTicks
        //       .style("pointer-events", null)
        //       .style("opacity", 1)
        //       .style("left", finalPos);
        //   }, 0);
        // })
        (update) => update,
        (exit) => {
          if (!this.browser.chartsLoaded) {
            exit.remove();
          } else {
            exit
              .style("left", finalPos)
              .style("opacity", 0)
              .transition()
              .duration(0)
              .delay(600)
              .remove();
          }
        }
      )
      .classed("major", (tick) => tick.major)
      .style("left", finalPos)
      .call((valueTicks) => {
        valueTicks.transition().duration(500).delay(5).style("top", "0px");
        //.style("left", finalPos);
        valueTicks.selectAll(".text").each(function (d) {
          this.bin = null;
          var v = +d.tickValue;
          me._aggrs.some((bin) => {
            if (+bin.minV - v) return false;
            this.bin = bin;
            return true;
          });
        });
      });

    this.refreshValueTickLabels();

    this.DOM.valueTickGroup.style(
      "left",
      (this.attrib.stepTicks ? this.aggrWidth / 2 : 0) + "px"
    );
  }
}
