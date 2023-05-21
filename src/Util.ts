import { utcParse } from "d3-time-format";
import { format } from "d3-format";
import { easeCubicOut } from "d3-ease";
import { scaleLog, scaleLinear, ScaleContinuousNumeric } from "d3-scale";
import { arc, line, curveMonotoneX } from "d3-shape";

import { BlockType } from "./Types";

const d3 = {
  utcParse,
  format,
  easeCubicOut,
  scaleLog,
  scaleLinear,
  arc,
  line,
  curveMonotoneX,
};

/** A namespace for various independent functions */
export var Util = {
  // Does not modify _base or _extend configurations
  mergeConfig(_base, _extend = {}) {
    return Util._mergeLevel(
      JSON.parse(JSON.stringify(_base)),
      JSON.parse(JSON.stringify(_extend)),
      _base,
      _extend
    );
  },
  // _target: is updated
  // returns: _target
  _mergeLevel(_target, _extend, _base_raw, _extend_raw) {
    for (var _key in _extend_raw) {
      var _value = _extend_raw[_key];

      //if(_value==null) continue; // skip undefined values

      if (_target[_key] == null) {
        // key is new => Just assign the variable
        _target[_key] = _value;
        continue;
      }

      if (_value === null) {
        delete _target[_key];
        continue;
      }

      switch (typeof _value) {
        case "object":
          if (typeof _target[_key] === "object") {
            // merge summaries section - custom logic
            if (_key === "summaries") {
              // both source and target has "summaries" section set
              if (
                !Array.isArray(_extend.summaries) ||
                !Array.isArray(_target.summaries)
              ) {
                console.log("Merge error: summaries property is not array");
                continue;
              }

              var _finalSummaries = [];

              _extend_raw.summaries.forEach((srcSummaryConfig) => {
                if (!srcSummaryConfig.skipConfig)
                  srcSummaryConfig.skipConfig = false;

                var targetSummaryCfg = _base_raw.summaries.find(
                  (s) => s.name === srcSummaryConfig.name
                );
                if (targetSummaryCfg) {
                  srcSummaryConfig = Util._mergeLevel(
                    JSON.parse(JSON.stringify(targetSummaryCfg)),
                    JSON.parse(JSON.stringify(srcSummaryConfig)),
                    targetSummaryCfg,
                    srcSummaryConfig
                  );
                  if (!srcSummaryConfig.skipConfig)
                    delete srcSummaryConfig.skipConfig;
                }

                // summary gets added to end of summaries list
                _finalSummaries.push(srcSummaryConfig);
              });
              _base_raw.summaries.forEach((s) => {
                if (!_finalSummaries.find((_s) => _s.name === s.name)) {
                  _finalSummaries.push(s);
                }
              });
              _target.summaries = _finalSummaries;
            } else {
              // recursion to merge new objects
              Util._mergeLevel(
                _target[_key],
                _extend[_key],
                _base_raw[_key],
                _extend_raw[_key]
              );
            }
            break;
          }
        // just assign the value to the key
        default:
          _target[_key] = _value;
          break;
      }
    }

    // there may be keys in raw target OR source that's not in _target
    // Specically, function values (and dates) are skipped bc of JSON.stringify
    for (var _key in _base_raw) {
      if (_extend_raw[_key] === undefined) {
        _target[_key] = _base_raw[_key];
      }
    }
    for (var _key in _extend_raw) {
      _target[_key] = _target[_key] || _extend_raw[_key];
    }

    return _target;
  },

  // ********************************************
  // String methods
  // ********************************************

  // ***************
  strCollate: new Intl.Collator(undefined, {
    ignorePunctuation: true,
    sensitivity: "base",
    numeric: true,
  }),
  // ***************
  sortFunc_List_String(a, b) {
    return Util.strCollate.compare("" + a, "" + b);
  },
  // ***************
  sortFunc_List_Date(a, b) {
    if (a == null || a === "") return 1;
    if (b == null || b === "") return -1;
    return b.getTime() - a.getTime(); // recent first
  },
  sortFunc_List_Number(a:number, b: number): number {
    return b - a;
  },
  /** -- */
  toProperCase(str: string): string {
    return str.toLowerCase().replace(/\b[a-z]/g, (f) => f.toUpperCase());
  },

  /** -- */
  addUnitName(v, unitName, isSVG = false): string {
    if (!unitName) return (v + "").replace("G", "B"); // replace abbrevation G with B;
    var s = isSVG ? unitName : "<span class='unitName'>" + unitName + "</span>";
    return ((Util.isCurrency(unitName) ? s + v : v + s) + "").replace("G", "B"); // replace abbrevation G with B;
  },

  /** -- */
  isCurrency(unitStr: string): boolean {
    switch (unitStr) {
      case "$":
      case "€":
      case "₺":
      case "¥":
      case "£":
      case "₼":
      case "؋":
      case "ƒ":
      case "¢":
      case "﷼":
      case "₪":
      case "₣":
      case "₩":
      case "₦":
      case "₲":
      case "฿":
      case "₴":
      case "₡": // Costa Rican colon
      case "₱": // Cuban peso
      case "₫": // Vietnamese dong
      case "₽": // Russian ruble
      case "₹": // Indian rupee
      case "៛": // Cambodian riel
      case "лв":
      case "zł": // Polish zloty
      case "Br": // Belarusian ruble
      case "Lek": // Albanian lek
        return true;
      default:
        return false;
    }
  },

  /** -- */
  getTimeParseFunc(fmt: string) {
    // Note: new EPOCH config is %s (d3 standard method). Keeping for backwards compatibility!
    if (fmt === "%EPOCH")
      return (v: number) => new Date(Math.floor(v * 1000));

    if (fmt !== "%sn" && fmt !== "%SN")
      return d3.utcParse(fmt);

    // Parse (Google) Sheet Date
    // Days are counted from December 31st 1899 and are incremented by 1
    // Decimals are fractions of a day.
    return function (v) {
      if (v && v !== "") {
        var utc_days = Math.floor(v - 25569);
        var utc_base = utc_days * 86400;

        var fractional_day = v - Math.floor(v);
        if (fractional_day === 0) {
          return new Date(utc_base * 1000);
        }
        var total_seconds = Math.floor(86400 * fractional_day);

        return new Date(utc_base * 1000 + total_seconds * 1000);
      }
    };
  },

  baseMeasureFormat: d3.format(".2s"),

  /** You should only display at most 3 digits + k/m/etc */
  formatForItemCount(n, unitName = ""): string {
    n = Math.round(n);
    let str: string;
    if (n < 1000 && n > -1000) {
      str = n.toString();
    } else {
      str = Util.baseMeasureFormat(n);
      if (str.replace(/\D/g, "").length === 3) {
        str = d3.format(".3s")(n);
      }
    }
    return Util.addUnitName(str, unitName, false);
  },

  /** -- */
  isStepTicks(ticks: number[]): boolean {
    // increasing or decreasing (+/- 1)
    return (
      ticks.length >= 2 &&
      ticks.every((_, i) =>
        i === 0 ? true : Math.abs(ticks[i] - ticks[i - 1]) === 1
      )
    );
  },

  /** -- */
  insertMinorTicks(ticks, _scale, _out, numMinor = 4): void {
    // if ticks[0] is larger than ticks[last], reverse
    if (ticks[0] > ticks[ticks.length - 1]) ticks = ticks.reverse();
    for (var i = 1; i < ticks.length; i++) {
      let _minR = ticks[i - 1];
      const _maxR = ticks[i];
      const _difR = (_maxR - _minR) / numMinor;
      let _min = _scale(_minR);
      const _max = _scale(_maxR);
      for (let j = 1; j < numMinor; j++) {
        if (numMinor === 4) {
          // base 2
          let x = (_min + _max) / 2;
          const _midR = (_minR + _maxR) / 2;
          _out.push({
            tickValue: _scale.invert(x),
            major: false,
            tickUnique: _midR,
          });
          _min = x;
          _minR = _midR;
        } else {
          // new way
          let x = ticks[i - 1] + j * _difR;
          _out.push({ tickValue: x, major: false, tickUnique: x });
        }
      }
    }
  },

  /** -- */
  ignoreScrollEvents: false,
  scrollToPos_do(scrollDom, targetPos) {
    scrollDom = scrollDom.node();
    Util.ignoreScrollEvents = true;
    // scroll to top
    var startTime = null;
    var scrollInit = scrollDom.scrollTop;
    var easeFunc = d3.easeCubicOut;
    var scrollTime = 500;
    var animateToTop = function (timestamp) {
      var progress;
      if (startTime == null) startTime = timestamp;
      // complete animation in 500 ms
      progress = (timestamp - startTime) / scrollTime;
      var m = easeFunc(progress);
      scrollDom.scrollTop = (1 - m) * scrollInit + m * targetPos;
      if (
        scrollDom.scrollTop >= targetPos ||
        scrollDom.offsetHeight + scrollDom.scrollTop >= scrollDom.scrollHeight
      ) {
        Util.ignoreScrollEvents = false;
      } else {
        window.requestAnimationFrame(animateToTop);
      }
    };
    window.requestAnimationFrame(animateToTop);
  },

  removeEmptyKeys(cfg): void {
    Object.keys(cfg).forEach(
      (key) => cfg[key] === undefined && delete cfg[key]
    );
  },

  // http://stackoverflow.com/questions/13627308/add-st-nd-rd-and-th-ordinal-suffix-to-a-number
  ordinal_suffix_of(i): string {
    const j = i % 10, k = i % 100;
    if (j == 1 && k != 11) return `${i}st`;
    if (j == 2 && k != 12) return `${i}nd`;
    if (j == 3 && k != 13) return `${i}rd`;
    return `${i}th`;
  },

  /** -- Geo-helper */
  addMarginToBounds(bounds: L.LatLngBounds): L.LatLngBounds {
    if (!bounds.isValid()) return bounds;

    const NW = bounds.getNorthWest();
    const SE = bounds.getSouthEast();
    const dist = NW.distanceTo(SE);
    return bounds.extend(NW.toBounds(dist / 10)).extend(SE.toBounds(dist / 10));
  },

  /** The order of data type sorting on the attribute panel */
  getAttribTypeOrder(t: BlockType): number {
    switch (t) {
      case "categorical":
        return 1;
      case "numeric":
        return 2;
      case "timestamp":
        return 3;
      case "timeseries":
        return 4;
      case "recordGeo":
        return 5;
      case "content":
        return 6;
      case "recordGeo":
        return 7;
      default:
        return 20;
    }
  },

  /* -- */
  intersects(d3bound, leafletbound): boolean {
    if (d3bound[0][0] > leafletbound._northEast.lng) return false;
    if (d3bound[0][1] > leafletbound._northEast.lat) return false;
    if (d3bound[1][0] < leafletbound._southWest.lng) return false;
    if (d3bound[1][1] < leafletbound._southWest.lat) return false;
    return true;
  },

  /** -- */
  intersectsDOMRect(R1, R2): boolean {
    if (!R1 || !R2) return false;
    if (R1.left > R2.right) return false;
    if (R1.right < R2.left) return false;
    if (R1.top > R2.bottom) return false;
    if (R1.bottom < R2.top) return false;
    return true;
  },

  /** -- */
  getD3Scale(useLog): ScaleContinuousNumeric<number, number, never> {
    return useLog ? d3.scaleLog().base(2) : d3.scaleLinear();
  },

  /** -- */
  getLineGenerator(timeScale, valueScale) {
    return d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((d) => timeScale((d as any)._time))
      .y((d) => valueScale((d as any)._value))
      .defined((d) => (d as any)._value != null);
  },

  /** -- */
  // http://stackoverflow.com/questions/5737975/circle-drawing-with-svgs-arc-path
  // http://stackoverflow.com/questions/15591614/svg-radial-wipe-animation-using-css3-js
  // http://jsfiddle.net/Matt_Coughlin/j3Bhz/5/
  getPieSVGPath(_start: number, _angle: number, radius: number, strokeOnly: boolean): string {
    const _end = Math.min(_start + _angle, 0.999999);
    const startRadian = (Math.PI * (360 * _start - 90)) / 180;
    const endRadian = (Math.PI * (360 * _end - 90)) / 180;
    const largeArcFlag = _angle > 0.5 ? 1 : 0;

    return (
      "M " +
      Math.cos(startRadian) * radius +
      "," +
      Math.sin(startRadian) * radius +
      " A " +
      radius +
      "," +
      radius +
      " " +
      largeArcFlag +
      " " +
      largeArcFlag +
      " 1 " +
      Math.cos(endRadian) * radius +
      "," +
      Math.sin(endRadian) * radius +
      " " +
      (!strokeOnly ? "L0,0" : "")
    );
  },

  /** -- */
  getCirclePath(): string {
    return d3
      .arc()
      .innerRadius(0)
      .outerRadius(0.001)
      .startAngle(0)
      .endAngle(2 * Math.PI)(null);
  },
};
