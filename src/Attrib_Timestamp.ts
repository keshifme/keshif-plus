import { scaleUtc } from "d3-scale";
import { utcFormat } from "d3-time-format";
import {
  utcSecond,
  utcMinute,
  utcHour,
  utcDay,
  utcWeek,
  utcMonth,
  utcYear,
} from "d3-time";
import { DateTime } from "luxon/build/es6/luxon";

import { Attrib_Interval } from "./Attrib_Interval";
import { RecordVisCoding } from "./Types";
import { Browser } from "./Browser";
import { Block_Timestamp } from "./Block_Timestamp";
import { AttribTemplate } from "./AttribTemplate";
import { Aggregate_Interval_Date } from "./Aggregate_Interval_Date";

const d3 = {
  scaleUtc,
  utcFormat,
  utcSecond,
  utcMinute,
  utcHour,
  utcDay,
  utcWeek,
  utcMonth,
  utcYear,
};

type DateRes = "Second" | "Minute" | "Hour" | "Day" | "Month" | "Year";

type TTTT = {
  type: DateRes;
  step: number;
  format: (any) => string;
  twoLine?: boolean;
};

// All dates are based on UTC.
// Since dates are created with zone offset by default, need to offset them back sometimes
var offsetUTC = DateTime.now().offset;

export class Attrib_Timestamp extends Attrib_Interval<Date> {
  timeTyped?: {
    activeRes?: TTTT;
    second?: boolean;
    minute?: boolean;
    hour?: boolean;
    day?: boolean;
    month?: boolean;
    year?: boolean;
    print?: (any) => string;
    finestRes?: () => DateRes;
  };

  /** -- */
  initTimeTyped() {
    // Check time resolutions
    this.timeTyped.year = false;
    this.timeTyped.month = false;
    this.timeTyped.day = false;
    this.timeTyped.hour = false;
    this.timeTyped.minute = false;
    this.timeTyped.second = false;

    var tempYear = null;

    this.records.forEach((record) => {
      var v = this.getRecordValue(record);
      if (!v) return;
      if (v.getUTCMonth() !== 0) this.timeTyped.month = true;
      if (v.getUTCHours() !== 0) this.timeTyped.hour = true;
      if (v.getUTCMinutes() !== 0) this.timeTyped.minute = true;
      if (v.getUTCDate() !== 1) this.timeTyped.day = true;
      if (!this.timeTyped.year) {
        if (tempYear === null) {
          tempYear = v.getUTCFullYear();
        } else {
          if (tempYear !== v.getUTCFullYear()) this.timeTyped.year = true;
        }
      }
    });
  }

  timeAxis_XFunc: any;

  constructor(browser: Browser, name: string, template: AttribTemplate) {
    super(
      browser,
      name,
      template,
      "timestamp",
      "kshfSummary_Timestamp",
      "far fa-calendar-day"
    );

    this._block = new Block_Timestamp(this);

    this.timeAxis_XFunc = (aggr) =>
      (this.valueScale(aggr.minV) + this.valueScale(aggr.maxV)) / 2;

    this.configs.showHistogram.cfgTitle = "Line Chart"; // customize from "Histogram"

    this.timeTyped = {
      // Finest level of resolution
      finestRes: function () {
        if (this.second) return "Second";
        if (this.minute) return "Minute";
        if (this.hour) return "Hour";
        if (this.day) return "Day";
        if (this.month) return "Month";
        if (this.year) return "Year";
      },
    };
  }

  createAggregate(minV: Date, maxV: Date) {
    return new Aggregate_Interval_Date(this, minV, maxV);
  }

  /** -- */
  supportsRecordEncoding(coding: RecordVisCoding) {
    if (this.isEmpty()) return false;
    if (coding === "sort") return true;
    if (coding === "text") return true;
    if (coding === "textBrief") return true;
    return false;
  }

  /** -- */
  getFormattedValue(v) {
    return v instanceof Date ? this.intervalTickPrint(v) : v;
  }

  getValuePosX(v: Date): number {
    var offset = 0;
    if (this.stepTicks) {
      offset += this.block.aggrWidth / 2;
    }
    return this.valueScale(v) + offset;
  }

  /** -- */
  getValueScaleObj() {
    return d3.scaleUtc();
  }
  refreshScaleType() {
    return;
  }

  /** -- */
  fillValueCache() {
    this.records.forEach((record) => {
      var v = this.template.func.call(record.data, record);
      if (v === undefined) v = null;
      if (!(v instanceof Date)) v = null;
      record.setValue(this, v);
      if (v == null) {
        this.noValueAggr.addRecord(record);
      }
    });

    this.initTimeTyped();
  }

  /** -- */
  pofffff() {
    this.updateScaleAndBins();
  }

  refreshValueScale() {
    super.refreshValueScale();

    var maxScale: (Date) => Date = d3["utc" + this.timeTyped.finestRes()];

    if (this.intervalTicks.some((tick: Date) => maxScale(tick) < tick)) {
      var nicing = maxScale;

      this.valueScale = this.getValueScaleObj()
        .domain(this.rangeActive)
        .range([0, this.block.width_histogram])
        .nice(nicing);

      this.intervalTicks = this.valueScale.ticks(nicing);
    }
  }

  updateTickPrintFunc() {
    const formatSecond = d3.utcFormat(":%S"),
      formatMinute = d3.utcFormat("%I:%M"),
      formatHour = d3.utcFormat("%I %p"),
      formatDay = d3.utcFormat("%a %d"),
      formatWeek = d3.utcFormat("%b %d"),
      formatMonth = d3.utcFormat("%b"),
      formatYear = d3.utcFormat("%Y");

    this.intervalTickPrint = (date) => {
      return (
        d3.utcMinute(date) < date
          ? formatSecond
          : d3.utcHour(date) < date
          ? formatMinute
          : d3.utcDay(date) < date
          ? formatHour
          : d3.utcMonth(date) < date
          ? d3.utcWeek(date) < date
            ? formatDay
            : formatWeek
          : d3.utcYear(date) < date
          ? formatMonth
          : formatYear
      )(date);
    };
  }
}
