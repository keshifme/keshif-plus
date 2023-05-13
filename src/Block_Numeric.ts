import { quantile } from "d3-array";
import { select } from "./d3_select";

import { Attrib_Numeric } from "./Attrib_Numeric";
import { Base } from "./Base";
import { Block_Interval, ZoomableStatus } from "./Block_Interval";
import { Config } from "./Config";
import { CompareType, MeasureType } from "./Types";
import { Util } from "./Util";
import { Aggregate_Interval } from "./Aggregate_Interval";
import { i18n } from "./i18n";

const d3 = { select, quantile };

export class Block_Numeric extends Block_Interval<number> {
  // specific attribute type
  public readonly attrib: Attrib_Numeric;

  readonly showPercentiles: Config<boolean>;

  constructor(attrib: Attrib_Numeric) {
    super(attrib);

    this.showPercentiles = new Config<boolean>({
      cfgClass: "showPercentiles",
      cfgTitle: "Percentiles",
      iconClass: "percentileBlocks",
      default: false,
      parent: this,
      itemOptions: [
        { name: "Show", value: true },
        { name: "Hide", value: false },
      ],
      onDOM: (DOM) => {
        DOM.root
          .select(".percentileBlocks")
          .classed("percentileChart_Active", true)
          .selectAll(".block")
          .data([1, 4, 4, 3, 2, 1])
          .enter()
          .append("i")
          .attr("class", (_) => "percentileBlock qG" + _);
      },
      onSet: () => {
        if (!this.DOM.inited) return;
        var curHeight = this.getHeight();
        this.refreshChartsVisibleOption();
        this.updatePercentiles();
        this.setHeight(curHeight);
        this.browser.updateLayout_Height();
      },
    });

    this.attrib.configs.showPercentiles = this.showPercentiles;
  }

  /** -- */
  get height_Percentile() {
    return this.showPercentiles.is(true) ? Base.height_Percentile : 0;
  }
  /** -- */
  get height_Extra_base() {
    return super.height_Extra_base + this.height_Percentile;
  }

  /** - */
  refreshWidth() {
    this.attrib.refreshScaleType();
    super.refreshWidth();
  }

  getScaleNicing(): number {
    if (!this.inDashboard) {
      return this.width_histogram / 10;
    }
    var v = this.optimumBinWidth.get();
    if (this.attrib.unitName) {
      v += (v * (2 + this.attrib.unitName.length * 8)) / 45;
    }
    return this.width_histogram / v;
  }

  dragRange(initPos, curPos, initMin, initMax) {
    var targetDif;
    var r = {
      min: undefined,
      max: undefined,
    };

    if (this.attrib.isValueScale_Log) {
      targetDif = curPos - initPos;
      r.min = this.valueScale.invert(this.valueScale(initMin) + targetDif);
      r.max = this.valueScale.invert(this.valueScale(initMax) + targetDif);
      //
    } else if (this.attrib.isValueScale_Linear) {
      targetDif =
        this.valueScale.invert(curPos) - this.valueScale.invert(initPos);
      if (!this.attrib.hasFloat) targetDif = Math.round(targetDif);

      r.min = initMin + targetDif;
      r.max = initMax + targetDif;

      var diff = initMax - initMin;
      
      var currentLimit = this.attrib.valueScale.domain();

      // Limit the active filter to expand beyond the current min/max of the view.
      if (r.min < currentLimit[0]) {
        r.min = currentLimit[0];
        r.max = currentLimit[0] + diff;
      }
      if (r.max > currentLimit[1]) {
        r.max = currentLimit[1];
        r.min = currentLimit[1] - diff;
      }
    }

    this.attrib.setRangeFilter_Custom( r.min, r.max);
  }

  /** -- */
  showValuePicker(DOM, d: "min" | "max") {
    var pikanum = DOM.pikanum;
    if (!pikanum) {
      DOM.pikanum = pikanum = d3
        .select(DOM)
        .append("input")
        .attr("class", "rangeInput")
        .attr("type", "number")
        .attr("min", this.attrib.rangeOrg[0])
        .attr("max", this.attrib.rangeOrg[1])
        .on("blur", function () {
          pikanum.style("display", "none");
        })
        .on("focusout", function () {
          pikanum.style("display", "none");
        })
        .on("keydown", function (event) {
          if (event.keyCode === 27) {
            // Escape key
            pikanum.node().blur();
          }
        })
        .on("change", () => {
          var v = 1 * pikanum.node().value;
          var minV = this.attrib.summaryFilter.active.minV;
          var maxV = this.attrib.summaryFilter.active.minV;
          if(d==="min") minV = v;
          if(d==="max") maxV = v;
          this.attrib.setRangeFilter_Custom( minV, maxV);
          pikanum.node().blur();
        });
    }
    pikanum.attr("step", 1).style("display", "block");
    pikanum.node().focus();
    pikanum.node().value = this.attrib.summaryFilter.active[d];
  }

  zoomableStatus(): ZoomableStatus {
    if (this.attrib.stepTicks) {
      return this.zoomed.is(true) ? "minus" : "";
    }
    return "plus";
  }
  hasStaticHeight(): boolean {
    return this.showHistogram.is(false);
  }

  /** -- */
  initDOM(beforeDOM): boolean {
    if (!super.initDOM(beforeDOM)) return false;
    this.initDOM_Percentile();
    return true;
  }

  refreshChartsVisibleOption() {
    if (!this.DOM.inited) return;
    super.refreshChartsVisibleOption();

    this.DOM.root.classed("chartVisiblePercentile", this.showPercentiles.is(true));
  }
  insertMinorTicks(ticks) {
    if(this.attrib.isValueScale_Log){
      Util.insertMinorTicks(this.attrib.intervalTicks, this.valueScale, ticks);
    }
  }

  /** - */
  updateAfterFilter(): void {
    if (!this.isVisible()) return;
    super.updateAfterFilter();
    this.updatePercentiles();
  }

  refreshViz_Active(): void {
    super.refreshViz_Active();

    this.updatePercentiles("Active");
  }

  /** - */
  refreshViz_Compare(cT: CompareType, curGroup, totalGroups, prevCts = []) {
    if (!this.isVisible() || !this.DOM.aggrGlyphs) return;
    super.refreshViz_Compare(cT, curGroup, totalGroups, prevCts);

    var baseline = this.measureLineZero;
    
    var maybePartial = this.attrib.isFiltered() && this.attrib.summaryFilter.active && !this.attrib.stepTicks;

    // used in partial rendering
    let filter_min: number, filter_max: number, minPos: number, maxPos: number;

    if(maybePartial){
      filter_min = this.attrib.summaryFilter.active.minV;
      filter_max = this.attrib.summaryFilter.active.maxV;
      minPos = this.valueScale(filter_min);
      maxPos = this.valueScale(filter_max);
    }

    var _do = (withScale: boolean) => {
      this.DOM["measure_" + cT].style(
        "transform",
        (aggr: Aggregate_Interval<number>) => {
          let _w = this.width_Bin;
          let _translateX = 0;

          if (maybePartial) {
            // it is within the filtered range
            if (aggr.maxV > filter_min && aggr.minV < filter_max) {
              if (aggr.minV < filter_min) {
                var lostWidth = minPos - this.valueScale(aggr.minV);
                _translateX = lostWidth;
                _w -= lostWidth;
              }
              if (aggr.maxV > filter_max) {
                _w -=
                  this.valueScale(aggr.maxV) -
                  maxPos -
                  Base.width_HistBarGap * 2;
              }
            } else {
              aggr.setScale(cT, 0);
            }
          }

          if (!this.attrib.stackedCompare) {
            _w = _w / totalGroups;
            _translateX = _w * curGroup;
          }

          return `translate(${_translateX}px, ${
            this.height_hist - baseline - aggr.offset(cT)
          }px) scale(${_w}, ${withScale ? aggr.scale(cT) : 0})`;
        }
      );
    };

    if (curGroup === totalGroups - 1 && this.browser.addedCompare) {
      _do(false);
    }
    _do(true);

    this.updatePercentiles(cT);
  }

  // ********************************************************************
  // Percentile chart
  // ********************************************************************

  // Percentile chart stuff
  quantile_val: { [index: number]: number } = {};

  /** -- */
  private initDOM_Percentile() {
    if (!this.DOM.summaryInterval || this.DOM.percentileGroup) return;

    var me = this;
    this.DOM.percentileGroup = this.DOM.summaryInterval
      .append("div")
      .attr("class", "percentileGroup");
    this.DOM.percentileGroup
      .append("span")
      .attr("class", "percentileTitle")
      .html(i18n.Percentiles);

    (Base.Compare_List as MeasureType[])
      .concat("Active")
      .forEach((sT: MeasureType) => {
        var parent = me.DOM.percentileGroup
          .append("div")
          .attr("class", "percentileChart_" + sT);

        parent
          .selectAll(".aggrGlyph")
          .data([
            [10, 20, 1],
            [20, 30, 2],
            [30, 40, 3],
            [40, 50, 4],
            [50, 60, 4],
            [60, 70, 3],
            [70, 80, 2],
            [80, 90, 1],
          ])
          .enter()
          .append("span")
          .attr("class", (qb) => "quantile aggrGlyph q_range qG" + qb[2])
          .each(function () {
            this.__data__.summary = me;
          })
          .tooltip(
            (qb) =>
              `<div><span style='font-weight:400'>${qb[0]}% - ${
                qb[1]
              }%</span> Percentile:</div><div style='font-weight: 500'>${me.attrib.printAbbr(
                me.quantile_val[sT + qb[0]]
              )} - ${me.attrib.printAbbr(me.quantile_val[sT + qb[1]])}</div>`,
            { placement: "top" }
          )
          .on("mouseover", (_event, qb) => {
            if (this.browser.comparedAttrib && !this.attrib.isComparedAttrib())
              return;
            if (this.browser.mouseOverCompare.is(false)) return;
            this.highlightRangeLimits_Active = true;

            var aggr = this.attrib.createAggregate(
              this.quantile_val[sT + qb[0]],
              this.quantile_val[sT + qb[1]]
            );
            aggr.updateRecords();

            this.browser.allRecordsAggr.clearCompare(
              this.browser.Compare_Highlight
            );
            this.browser.setSelect_Compare(aggr);
          })
          .on("mouseout", () => {
            if (this.browser.comparedAttrib && !this.attrib.isComparedAttrib())
              return;
            this.browser.clearSelect_Compare();
            this.highlightRangeLimits_Active = false;
          })
          .on("click", (event, qb) => {
            if (event.shiftKey) {
              this.browser.clearSelect_Compare(null, true, true);
              this.highlightRangeLimits_Active = false;
              return;
            }

            this.attrib.summaryFilter.active = this.attrib.createAggregate(
              this.quantile_val[sT + qb[0]],
              this.quantile_val[sT + qb[1]]
            );
            this.attrib.summaryFilter.setFiltered();
          });

        parent
          .selectAll(".q_pos")
          .data([50])
          .enter()
          .append("span")
          .attr("class", (q) => "quantile q_pos q_" + q)
          .tooltip(
            (q) =>
              `<u>Median</u><br><b>${me.attrib.getFormattedValue(
                me.quantile_val[sT + q]
              )}</b>`,
            { placement: "top" }
          );
      });

    this.refreshChartsVisibleOption();
  }

  /** - */
  private refreshViz_Percentiles(distr) {
    if (!this.DOM.percentileGroup) return;
    if (!this.valueScale) return;
    if (this.showPercentiles.is(false)) return;

    var percentileChart = this.DOM.percentileGroup.select(
      ".percentileChart_" + distr
    );

    percentileChart
      .style("margin-left", "0px")
      .style("opacity", (q) =>
        this.quantile_val[distr + "10"] == null ? 0 : 1
      )
      .style(
        "transform",
        this.attrib.stepTicks
          ? "translateX(" + this.aggrWidth / 2 + "px)"
          : null
      );
    percentileChart
      .selectAll(".q_pos")
      .style(
        "transform",
        (q) =>
          "translateX(" + this.valueScale(this.quantile_val[distr + q]) + "px)"
      );
    percentileChart
      .selectAll(".quantile.aggrGlyph")
      .style("transform", (qb) => {
        var pos_1 = this.valueScale(this.quantile_val[distr + qb[0]]);
        var pos_2 = this.valueScale(this.quantile_val[distr + qb[1]]);
        return `translateX(${pos_1}px) scaleX(${pos_2 - pos_1})`;
      });
  }

  private updatePercentiles(sT: MeasureType = null) {
    if (sT === "Other") return;

    if (this.showPercentiles.is(false)) return;

    if (!sT) {
      this.browser.activeComparisons.forEach((t) => this.updatePercentiles(t));
      this.updatePercentiles("Active");
      return;
    }

    if (sT === "Total") return; // no total-vis for percentiles

    if( sT !== "Active"){
      if (!this.attrib.vizActive(sT)) return;
    }

    // the items are already sorted by their numeric value, it's just a linear pass.
    var values = this.attrib.sortedRecords
      .filter(
        sT === "Active"
          ? (record) => record.isIncluded
          : (record) => record.isIncluded && record.isSelected(sT)
      )
      .map((record) => this.attrib.getRecordValue(record));

    [10, 20, 30, 40, 50, 60, 70, 80, 90].forEach((q) => {
      this.quantile_val[sT + q] = d3.quantile(values, q / 100);
    });

    this.refreshViz_Percentiles(sT);
  }
}
