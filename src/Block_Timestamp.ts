import { DateTime } from "luxon/build/es6/luxon";

import "pikaday/css/pikaday.css";
import * as Pikaday from "pikaday";

import { area, curveMonotoneX } from "d3-shape";
import { easePoly } from "d3-ease";

import { Block_Interval, ZoomableStatus } from "./Block_Interval";
import { CompareType, MeasureType } from "./Types";
import { Attrib_Timestamp } from "./Attrib_Timestamp";
import { Aggregate_Interval } from "./Aggregate_Interval";
import { Base } from "./Base";

const d3 = {
  area,
  curveMonotoneX,
  easePoly,
};

// All dates are based on UTC.
// Since dates are created with zone offset by default, need to offset them back sometimes
var offsetUTC = DateTime.now().offset;

export class Block_Timestamp extends Block_Interval<Date> {
  // specific attribute type
  public readonly attrib: Attrib_Timestamp;
  constructor(attrib: Attrib_Timestamp) {
    super(attrib);
  }

  /** -- */
  dragRange(initPos, curPos, initMin, initMax) {
    // no-op - not supported
  }

  /** - */
  refreshViz_Active() {
    if (!this.isVisible() || !this.DOM.aggrGlyphs) return;
    super.refreshViz_Active();

    this.updateViz_Areas(
      "Active",
      !this.browser.stackedCompare && this.browser.activeComparisonsCount > 0
    );
  }
  /** - */
  refreshViz_Compare(cT: CompareType, curGroup, totalGroups, prevCts = []) {
    if (!this.isVisible() || !this.DOM.aggrGlyphs) return;
    super.refreshViz_Compare(cT, curGroup, totalGroups, prevCts);

    if (
      this.browser.stackedCompare &&
      this.browser.addedCompare &&
      curGroup === totalGroups - 1
    ) {
      // smoother animation, sets it as a chart-line at offset first - instead of area chart
      this.DOM["measure_Area_" + cT].attr("d", this.getVizArea(cT, true));
    }
    this.updateViz_Areas(cT, !this.browser.stackedCompare);
  }

  /** -- */
  insertVizDOM() {
    // insert these elements only once
    if (!this.DOM.timeSVG) {
      this.DOM.timeSVG = this.DOM.histogram
        .append("svg")
        .attr("class", "timeSVG")
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .style("margin-left", Base.width_HistBarGap / 2 + "px");

      this.DOM.timeSVG
        .append("defs")
        .selectAll("marker")
        .data(Base.Active_Compare_List.map((x) => "kshfLineChartTip_" + x))
        .enter()
        .append("marker")
        .attr("id", (d) => d)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("viewBox", "0 0 20 20")
        .attr("refX", 10)
        .attr("refY", 10)
        .attr("markerUnits", "strokeWidth")
        .attr("markerWidth", 9)
        .attr("markerHeight", 9)
        .attr("orient", "auto")
        .append("circle")
        .attr("r", 4)
        .attr("cx", 10)
        .attr("cy", 10);

      ["Total", "Active"]
        .concat(Array.from(Base.Compare_List).reverse())
        .forEach((cT) => {
          this.DOM["measure_Area_" + cT] = this.DOM.timeSVG
            .append("path")
            .attr("class", "measure_Area_" + cT + " measure_" + cT)
            .attr("marker-mid", "url(#kshfLineChartTip_" + cT + ")")
            .attr("marker-end", "url(#kshfLineChartTip_" + cT + ")")
            .attr("marker-start", "url(#kshfLineChartTip_" + cT + ")");
        });
    }

    Base.Total_Active_Compare_List.forEach((cT) => {
      this.DOM["measure_Area_" + cT].datum(this._aggrs).attr(
        "d",
        d3
          .area()
          .curve(d3.curveMonotoneX)
          .x(this.attrib.timeAxis_XFunc)
          .y0(this.height_hist - this.measureLineZero + 2)
          .y1(this.height_hist - this.measureLineZero + 2)
      );
    });

    super.insertVizDOM();
  }

  /** -- */
  getVizArea(sT: MeasureType, asLine) {
    if(sT==="Other") return;

    var _area = d3
      .area()
      .curve(d3.curveMonotoneX)
      .x(this.attrib.timeAxis_XFunc)
      .y(
        // sets y0 and y1
        (aggr: Aggregate_Interval<Date>) =>
          this.height_hist - aggr.sumOffsetScale(sT)
      );

    if (!asLine) {
      _area.y1((aggr) => this.height_hist - aggr.offset(sT));
    }

    /*
    // Removed, bc having all points defined help with smoother transitions between breakdown modes
    if (this.isFiltered()) {
      _area.defined(aggr => {
        if(this.summaryFilter.active.min && this.summaryFilter.active.min > aggr.maxV) return false;
        if(this.summaryFilter.active.max && this.summaryFilter.active.max < aggr.minV) return false;
        return true;
      });
    }
    */

    return _area;
  }
  /** - */
  updateViz_Areas(sT: MeasureType, asLine) {
    if(sT==="Other") return;

    return this.DOM["measure_Area_" + sT]
      .classed("asLine", asLine)
      .transition()
      .duration(this.browser.noAnim ? 0 : 800)
      .ease(d3.easePoly.exponent(3))
      .attr("d", this.getVizArea(sT, asLine));
  }

  /** -- */
  showValuePicker(DOM, d: "min" | "max") {
    if (typeof Pikaday === "undefined") return;
    var skipSelect = false;

    var pikaday = DOM.pikaday;

    var refreshPikadayDate = () => {
      var aggr = this.attrib.summaryFilter.active;
      var _date = DateTime.fromJSDate(d==="min" ? aggr.minV : aggr.maxV)
        .plus({ minutes: -offsetUTC })
        .toJSDate();
      skipSelect = true;
      pikaday.setDate(_date);
    };
    if (!pikaday) {
      var me = this;
      DOM.pikaday = pikaday = new (window as any).Pikaday({
        field: DOM,
        firstDay: 1,
        minDate: this.attrib.rangeOrg[0],
        maxDate: this.attrib.rangeOrg[1],
        onSelect: function () {
          if (skipSelect) {
            skipSelect = false;
            return;
          }
          var selectedDate: Date = this.getDate();
          selectedDate = DateTime.fromJSDate(selectedDate)
            // need to convert value to UTC
            .plus({ minutes: offsetUTC })
            .toJSDate();
          if (
            (d === "min" && selectedDate < me.attrib.summaryFilter.active.minV) ||
            (d === "max" && selectedDate > me.attrib.summaryFilter.active.maxV)
          ) {
            me.zoomed.set(false);
          }

          var minV = me.attrib.summaryFilter.active.minV;
          var maxV = me.attrib.summaryFilter.active.minV;
          if(d==="min") minV = selectedDate;
          if(d==="max") maxV = selectedDate;
          me.attrib.setRangeFilter_Custom( minV, maxV);
          refreshPikadayDate();
        },
      });
    }

    refreshPikadayDate();
    pikaday.show();
  }

  getScaleNicing(): number {
    return this.width_histogram / (this.inDashboard ? this.optimumBinWidth.get() : 10) * 1;
  }

  hasStaticHeight() {
    return this.showHistogram.is(false);
  }

  zoomableStatus(): ZoomableStatus {
    if (this.attrib.stepTicks) {
      if (
        this.attrib.timeTyped.finestRes() ===
        this.attrib.timeTyped.activeRes.type
      ) {
        return this.zoomed.get() ? "minus" : "";
      }
    }
    return "plus";
  }
}
