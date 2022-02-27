import { BlockType } from "./Types";
import { Attrib } from "./Attrib";
import { TimeSeriesData } from "./TimeSeriesData";
import { Browser } from "./Browser";

type SpecialKey =
  | "Degree"
  | "Year"
  | "Month"
  | "DayOfMonth"
  | "WeekDay"
  | "Hour"
  | "TimeseriesChange-#"
  | "TimeseriesChange-%"
  | "TimePoint";

/**
  ->Degree(), Year(), ....
  ->[UPPERCASE(*.)]
  ->[*.]
  ->...->...
  ->2010 (timekey)
  ->Change(%)
  ->Change(#)
*/
export class AttribTemplate {
  // the string representation of the template
  str: string = null;
  // used for easy serialization
  toString() {
    return this.str;
  }

  // the function to call to access values from records
  func: Function = null;

  // path of the access
  path: string[] = [];
  get pathStr() {
    return this.path.join("->");
  }
  // special access to last information
  special: SpecialKey = null;
  // parent attribute
  parent: Attrib = null;
  // type of the attribute
  blockType: BlockType = null;
  lastKey: string = null;
  vFrom: string[];

  constructor(input: string | Function, dashboard: Browser) {
    if (typeof input === "function") {
      this.func = input;
      this.str = "" + this.func;
      return;
    }

    this.str = input;

    var path = input.split("->");
    this.lastKey = path[path.length - 1];
    this.path = path.slice(0, -1);
    this.parent = dashboard.attribWithName(this.path.join("->")) || null;

    if (this.path.length === 0) {
      // direct index in the object
      this.func = function () {
        return this[input];
      };
    } else {
      // closure variable - it is updated later depending on special type
      var lastAccess = (v) => v[this.lastKey];

      switch (this.lastKey) {
        case "Degree()":
          lastAccess = (v) => v.length;
          this.special = "Degree";
          this.blockType = "numeric";
          break;

        case "Year()":
          lastAccess = (v) =>
            v && !isNaN(v.getTime()) ? v.getUTCFullYear() : null;
          this.special = "Year";
          this.blockType = "categorical";
          break;

        case "Month()":
          lastAccess = (v) =>
            v && !isNaN(v.getTime()) ? v.getUTCMonth() : null;
          this.special = "Month";
          this.blockType = "categorical";
          break;

        case "DayOfMonth()":
          lastAccess = (v) =>
            v && !isNaN(v.getTime()) ? v.getUTCDate() : null;
          this.special = "DayOfMonth";
          this.blockType = "numeric";
          break;

        case "WeekDay()":
          lastAccess = (v) => (v && !isNaN(v.getTime()) ? v.getUTCDay() : null);
          this.special = "WeekDay";
          this.blockType = "categorical";
          break;

        case "Hour()":
          lastAccess = (v) =>
            v && !isNaN(v.getTime()) ? v.getUTCHours() : null;
          this.special = "Hour";
          this.blockType = "numeric";
          break;

        case "Change(#)":
          lastAccess = (v) => {
            let _ts = new TimeSeriesData();

            v._timeseries_.forEach((k, i) => {
              if (i == 0) return;

              var cur = v._timeseries_[i];
              var prev = v._timeseries_[i - 1];
              if (!cur || !prev) return;

              _ts.addTimeData({
                _time: k._time,
                _time_src: k._time_src,
                _value: cur._value - prev._value,
              });
            });
            return _ts;
          };
          this.special = "TimeseriesChange-#";
          this.blockType = "timeseries";
          break;

        case "Change(%)":
          lastAccess = (v) => {
            let _ts = new TimeSeriesData();

            v._timeseries_.forEach((k, i) => {
              if (i == 0) return;

              var cur = v._timeseries_[i];
              var prev = v._timeseries_[i - 1];
              if (!cur || !prev) return;

              _ts.addTimeData({
                _time: k._time,
                _time_src: k._time_src,
                _value: (100 * (cur._value - prev._value)) / (prev._value || 1),
              });
            });
            return _ts;
          };
          this.special = "TimeseriesChange-%";
          this.blockType = "timeseries";
          break;
      }

      // TimePoint of a TimeSeries variable
      if (!this.special && this.parent?.type === "timeseries") {
        this.special = "TimePoint";
        this.blockType = "numeric";

        if (
          ["TimeseriesChange-%", "TimeseriesChange-#"].includes(
            this.parent.template.special
          )
        ) {
          // anonymous function, has access to this context in this scope.
          this.func = (record) => {
            var v = this.parent.getRecordValue(record);
            if (!v || v.length != null || v.length === 0) return null;
            if (v) v = lastAccess.call(this, v._keyIndex);
            return v ? v._value : v;
          };
          return;
        } else {
          lastAccess = (v: TimeSeriesData) => v._keyIndex[this.lastKey]._value;
        }
      }

      this.func = function () {
        var v = this;
        for (var i = 0; i < path.length - 1; i++) {
          v = v[path[i]];
          if (v == null) return null; // hit a null key in the object path. Abort! Abort!
        }
        return v ? lastAccess.call(this, v) : v;
      };
    }
  }

}
