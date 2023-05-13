import { scaleTime, scaleLinear } from "d3-scale";
import { min, max, extent, deviation } from "d3-array";
import { format } from "d3-format";
import { easePolyInOut } from "d3-ease";

import { Config } from "./Config";
import { i18n } from "./i18n";
import { Util } from "./Util";
import { Record } from "./Record";
import { Attrib } from "./Attrib";
import { Attrib_Numeric } from "./Attrib_Numeric";
import { LinearOrLog, RecordVisCoding } from "./Types";
import { AttribTemplate } from "./AttribTemplate";
import { Base } from "./Base";
import { TimeData, TimeKey, TimeSeriesData } from "./TimeSeriesData";

const d3 = {
  scaleTime,
  scaleLinear,
  min,
  max,
  extent,
  format,
  deviation,
  easePolyInOut,
};

var _tempClipPathCounter;

/** -- */
export class Attrib_Timeseries extends Attrib {
  get measureRangeMax(): number {
    throw new Error("Not applicable.");
  }

  // hared with Attribute_Numeric
  // accessed by RecordView_Timeseries
  public hasFloat: boolean;

  public tickPrecision = 3;

  public timeKeys: TimeKey[] = [];

  public timeKeyAttribs: Attrib_Numeric[] = [];

  valueScaleType: Config<LinearOrLog>;

  public timeSeriesScale_Time: any;
  public timeSeriesScale_Value: d3.ScaleContinuousNumeric<number, number, never>;

  // given a number, returns the formatted string
  numberFormat: (number) => string;

  constructor(browser, name: string, template: AttribTemplate) {
    super(browser, name, template, "timeseries", "", "far fa-chart-line");

    this.measurable = {
      metricFuncs: Base.defaultMetricFuncs
    };

    this.valueScaleType = new Config<LinearOrLog>({
      cfgClass: "valueScaleType",
      cfgTitle: "BinScale",
      iconClass: "fa fa-arrows-h",
      parent: this,
      default: "linear",
      helparticle: "5e87eabc04286364bc97d0cf",
      itemOptions: [
        { name: `${i18n.Linear} ${i18n.LinearSequence}`, value: "linear" },
        { name: `${i18n.Log} ${i18n.Log2Sequence}`, value: "log" },
      ],
      forcedValue: () => {
        if (!this.supportsLogScale()) return "linear";
      },
      preSet: async (v) => {
        if (v !== "log" && v !== "linear") return;
        // don't set to log if it's not applicable
        return v;
      },
      onSet: async (v) => {
        if (!this.timeSeriesScale_Value) return;

        for (var c in this.timeKeyAttribs) {
          var s = this.timeKeyAttribs[c];
          if (s.timeKey) await s.applyScaleType();
        }

        this.timeSeriesScale_Value = Util.getD3Scale(v === "log").domain(
          this.getExtent_Value()
        );

        await this.browser.recordDisplay.refreshAttribScaleType(this);
      },
    });

    this.numberFormat = (x) => {
      if (this.hasFloat && x < 1000) {
        return d3.format(",.3~f")(x);
      }
      var m = d3.format(".3~s")(x); // if input is 9, it returns 9.0 . ARGH!
      return m.replace(".0", "");
    };

    this.finishTemplateSpecial();
  }

  getRecordValue(record: Record): TimeSeriesData {
    return record.getValue(this);
  }

  /** -- */
  supportsRecordEncoding(coding: RecordVisCoding): boolean {
    if (this.isEmpty()) return false;
    this.initializeAggregates();
    if (this.isComparable.is(false)) return false;
    if (coding === "timeSeries") return true;
    if (coding === "sort") return true;
    if (coding === "scatterX") return true;
    if (coding === "scatterY") return true;
    if (coding === "color") return true;
    if (coding === "size") {
      return !this.hasNegativeValues();
    }
    return false;
  }
  /** -- */
  isEmpty() {
    return !this.timeKeys || this.timeKeys.length === 0;
  }
  /** -- */
  get canHaveMetricFuncs() {
    return true;
  }
  /** -- */
  get supportedMetricFuncs() {
    return this._metricFuncs;
  }
  /** -- */
  supportsLogScale(): boolean {
    if (!this.timeSeriesScale_Value) {
      return true; // assume it supports by default
    }
    return (
      this.timeSeriesScale_Value &&
      this.timeSeriesScale_Value.domain().every((_) => _ > 0)
    );
    // Do not filter by unitName!=="%" - in some cases it may make sense
  }
  /** -- */
  hasNonNegativeValueDomain() {
    return this.timeSeriesScale_Value.domain().every((_) => _ >= 0);
  }

  get attribName(): string {
    return super.attribName;
  }
  set attribName(name: string) {
    super.attribName = name;

    // name wasn't updated
    if (this.attribName !== name) return;

    for (var timeKey in this.timeKeyAttribs) {
      var attrib = this.timeKeyAttribs[timeKey];
      attrib.attribName = `${this.attribName} <i class="far fa-calendar-day"></i> ${attrib.timeKey._time_src}`;
    }

    // Refresh other places which is linked to this timeseries variable
    if (this.browser.recordChartType.is("timeseries")) {
      this.browser.recordDisplay.refreshAttribOptions("timeSeries");
    }

    this.browser.recordDisplay.refreshAttribOptions("sort");
  }

  /** -- */
  updateChartScale_Measure(): void {
    // no-op
  }

  applyTemplateSpecial(): void {
    if (this.template.special === "TimeseriesChange-%") {
      this.unitName = "%";
    }
  }

  /** -- */
  initializeAggregates(): void {
    if (this.aggr_initialized) return;

    var timeIndex: { [index: number]: string } = {};
    var extent_Time: [Date, Date][] = [];
    var extent_Value: [number, number][] = [];
    var allRecordValues: number[] = [];

    this.browser.records.forEach((record: Record) => {
      var _ = this.template.func.call(record.data, record);
      if (_ == null) {
        record.setValue(this, null);
        return;
      }

      var ts = _ as TimeSeriesData;

      record.setValue(this, ts);

      ts.sortTimeseries();

      ts.computeCaches();

      // per whole attribute
      ts._timeseries_.forEach((k: TimeData) => {
        timeIndex[k._time.getTime()] = k._time_src;
        allRecordValues.push(k._value);
      });
      extent_Time.push(ts.extent_Time);
      extent_Value.push(ts.extent_Value);
    });

    if (extent_Time.length === 0) {
      this.aggr_initialized = true;
      return;
    }

    // min of the min's, max of the max's
    var valueDomain: [number, number] = this.valueDomain || [
      d3.min(extent_Value, (_) => _[0]),
      d3.max(extent_Value, (_) => _[1]),
    ];
    var timeDomain: [Date, Date] = [
      d3.min(extent_Time, (_) => _[0]),
      d3.max(extent_Time, (_) => _[1]),
    ];

    // Figure out if the values are floating points or full integers
    this.hasFloat = allRecordValues.some((v) => v % 1 !== 0);

    if (!this.hasFloat) {
      this.tickPrecision = valueDomain[1].toLocaleString().length > 5 ? 3 : 0;
    }

    // Set scale
    var deviation = d3.deviation(allRecordValues);
    var activeRange = valueDomain[1] - valueDomain[0];
    this.valueScaleType.set(
      (deviation / activeRange < 0.12 && valueDomain[0] > 0) ? "log" : "linear"
    );

    // Currently static settings once a timeseries is selected
    this.timeSeriesScale_Time = d3.scaleTime().domain(timeDomain);
    this.timeSeriesScale_Value = Util.getD3Scale(this.isValueScale_Log);
    this.timeSeriesScale_Value.domain(valueDomain);

    for (var _ in timeIndex) {
      this.timeKeys.push({
        _time: new Date(Number(_)), // convert string to number
        _time_src: timeIndex[_],
      });
    }
    this.timeKeys.sort((a, b) => a._time.getTime() - b._time.getTime());
    this.timeKeys.forEach((timeKey, i) => {
      timeKey._index = i;
    });

    // Some records may be missing some values on some time-keys.
    // Here, we need to insert new time keys and set them to undefined
    // Charting will take care whether to interpolate the missing values or not.
    this.browser.records.forEach((record) => {
      var _ts: TimeSeriesData | null = this.getRecordValue(record);
      if (!_ts) return;

      var newTimeKeyAdded = false;

      this.timeKeys.forEach((_key: TimeKey) => {
        if (!_ts._keyIndex[_key._time_src]) {
          _ts.addTimeData({
            _time: _key._time,
            _time_src: _key._time_src,
            _value: undefined,
          });
          newTimeKeyAdded = true;
        }
      });

      if (newTimeKeyAdded) {
        _ts.sortTimeseries();
      }
    });

    this.aggr_initialized = true;
  }

  /** -- */
  getExtent_Value(onlyUnfiltered = false, timeDomain: [Date, Date] = null) {
    if (!onlyUnfiltered && this.valueDomain) {
      return this.valueDomain;
    }

    var inTimeDomain = (_d: TimeData) => true;
    if (timeDomain) {
      inTimeDomain = (d: TimeData) =>
        d._time >= timeDomain[0] && d._time <= timeDomain[1];
    }

    var extent_Value: [number, number][] = [];

    var valFunc = (k: TimeData): number => (inTimeDomain(k) ? k._value : null);
    if (this.isValueScale_Log) {
      valFunc = (k: TimeData): number => (inTimeDomain(k) && k._value > 0 ? k._value : null);
    }

    this.browser.records.forEach((record) => {
      if (onlyUnfiltered && record.filteredOut) return;
      var _ts = this.getRecordValue(record);
      if (!_ts) return;

      _ts.extent_Value = d3.extent(_ts._timeseries_, valFunc);
      if (typeof _ts.extent_Value[0] === "number") {
        extent_Value.push(_ts.extent_Value);
      }
    });

    return [
      d3.min(extent_Value, (_) => _[0]),
      d3.max(extent_Value, (_) => _[1]),
    ];
  }

  /** -- */
  hasNegativeValues() {
    return d3.min(this.timeSeriesScale_Value.domain()) < 0;
  }
  /** -- */
  hasFlippedDomain() {
    var tsDomain = this.timeSeriesScale_Value.domain();
    return tsDomain[0] > tsDomain[1];
  }

  /** -- */
  computeRecordRanks() {
    this.timeKeys.forEach((timeKey: TimeKey) => {
      // sort records in place
      var compFunc = this.hasFlippedDomain()
        ? (vA: TimeData, vB: TimeData) => vA._value - vB._value
        : (vA: TimeData, vB: TimeData) => vB._value - vA._value;

      var getValueAtTime = (record: Record, key: string): TimeData => {
        var v = this.getRecordValue(record);
        if (!v || v.isEmpty()) return null;
        let v2 = v._keyIndex[key];
        if (v2 == null) return null;
        return v2;
      };

      // sorts a copied record list, and assigns _rank.
      Array.from(this.browser.records)
        .sort((a: Record, b: Record) => {
          if (a.filteredOut) return 1;
          if (b.filteredOut) return -1;

          var vA = getValueAtTime(a, timeKey._time_src);
          if (vA == null) return 1;

          var vB = getValueAtTime(b, timeKey._time_src);
          if (vB == null) return -1;

          return compFunc(vA, vB);
        })
        .forEach((record: Record, i) => {
          var v: TimeData = getValueAtTime(record, timeKey._time_src);
          if (v != null) v._rank = i + 1;
        });
    });
  }

  /** -- */
  get isValueScale_Log() {
    return this.valueScaleType.is("log");
  }
  get isValueScale_Linear() {
    return this.valueScaleType.is("linear");
  }

  // No-ops
  createSummaryFilter() {}
  refreshViz_Compare() {}

  // ********************************************************************
  // Accessing specific timepoint attributes
  // ********************************************************************

  /** -- */
  setTimepointAttrib(timePoint, summary: Attrib_Numeric) {
    if (typeof timePoint === "string" || !timePoint._time) {
      timePoint = this.timeKeys.filter((key) => key._time_src === timePoint)[0];
      if (!timePoint) return; // nope
    }
    summary.timeKey = timePoint;
    this.timeKeyAttribs[timePoint._time_src] = summary;
  }

  /** -- */
  getTimepointSummary_Next(curSummary, shift = 1) {
    this.initializeAggregates(); // make sure the summary is ready
    if (this.isEmpty()) return null;
    var timeKey = curSummary.timeKey._time_src;
    if (!timeKey) return null;

    // Return null if end of keys
    var curIndex = -1;
    this.timeKeys.some((key, i) => {
      if (key._time_src === timeKey) {
        curIndex = i;
        return true;
      }
    });

    // check if new value is in range
    if (shift > 0 && curIndex === this.timeKeys.length - 1) {
      return null;
    }
    if (shift < 0 && curIndex === 0) {
      return null;
    }
    var target = Math.min(
      this.timeKeys.length - 1,
      Math.max(0, curIndex + shift)
    );
    return this.getTimepointSummary(this.timeKeys[target]);
  }

  /** - */
  getTimepointSummary(timePoint): Attrib_Numeric {
    this.initializeAggregates(); // make sure the summary is ready
    var attrib = this.timeKeyAttribs[timePoint._time_src];
    if (!attrib) {
      attrib = this.browser.createAttrib(
        `${this.attribName} <i class="far fa-calendar-day"></i> ${timePoint._time_src}`,
        `${this.template}->${timePoint._time_src}`,
        "numeric"
      ) as Attrib_Numeric;
      this.setTimepointAttrib(timePoint, attrib);
      attrib.initializeAggregates();
    }
    return attrib;
  }

  /** -- */
  printAbbr(v: TimeData, isSVG = false) {
    // uses print from a timeKey summary
    return this.getTimepointSummary(this.timeKeys[0]).printAbbr(v._value, isSVG);
  }
  /** -- */
  getFormattedValue(v, isSVG = false) {
    var formatted = this.numberFormat(v);
    return v == null ? "-" : Util.addUnitName(formatted, this.unitName, isSVG);
  }
  /** -- */
  async applyConfig(blockCfg) {
    super.applyConfig(blockCfg);

    this.measurable.valueDomain = blockCfg.valueDomain;

    if (blockCfg.valueScaleType) {
      await this.valueScaleType.set(blockCfg.valueScaleType);
    }
    if (blockCfg.unitName) {
      this.unitName = blockCfg.unitName;
    }
  }
  /** -- */
  exportConfig() {
    return Object.assign(
      super.exportConfig(), 
      {
        unitName: this.unitName,
        valueScaleType: this.valueScaleType.get(),
      });
  }
  /** -- */
  renderRecordValue(v, d3_selection, timeKeys: TimeKey[] = null ): string {
    if (v instanceof Record) v = this.getRecordValue(v);

    if (!d3_selection || !v) return;

    if(!(v instanceof TimeSeriesData)) return

    this.initializeAggregates();

    var timeseriesWidth = this.browser.recordDisplay.config.timeseriesWidth;

    var timeScale = d3
      .scaleTime()
      .domain(d3.extent(timeKeys, (f) => f._time))
      .rangeRound([5, timeseriesWidth - 5]);

    let timeData: TimeData[] = v._timeseries_;

    var [value_min, value_max] = d3.extent(timeData, (d) => d._value);
    let steadyValue: number;
    if (value_min === value_max) {
      steadyValue = value_max;
      value_min -= 0.00001;
      value_max += 0.00001;
    } else if (this.hasFlippedDomain()) {
      // if the timeseries value-axis is flipped
      [value_min, value_max] = [value_max, value_min];
    }

    var valueScale = d3
      .scaleLinear()
      .domain([value_min, value_max])
      .rangeRound([40, 0]);

    _tempClipPathCounter++;

    var colorOut = this.browser.colorTheme.getContinuous();
    var mapp = this.timeSeriesScale_Value.copy().range([0, 1]);

    var _timeSeriesSvg = d3_selection
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("class", "recordDetailTimeseries")
      .style("width", timeseriesWidth + "px");

    var defs = _timeSeriesSvg.append("defs");
    defs
      .append("clipPath")
      .attr("id", "RecordTimeseriesClip_" + _tempClipPathCounter)
      .append("rect")
      .attr("class", "recordTimeseriesClipPath")
      .attr("x", 0)
      .attr("y", -10)
      .attr("height", 70)
      .attr("width", 1)
      .transition()
      .duration(1500)
      .delay(0)
      .ease(d3.easePolyInOut)
      .attr("width", timeseriesWidth + 10);

    var _ = defs
      .append("linearGradient")
      .attr("id", "GradientPath_" + _tempClipPathCounter)
      .attr("x1", "0")
      .attr("x2", "0")
      .attr("y1", "0")
      .attr("y2", "1");
    _.append("stop")
      .attr("stop-color", colorOut(mapp(value_max)))
      .attr("offset", "0%");
    _.append("stop")
      .attr("stop-color", colorOut(mapp(value_min)))
      .attr("offset", "100%");

    _timeSeriesSvg
      .selectAll(".extentValueGroup")
      .data(steadyValue != null ? [steadyValue] : [value_min, value_max])
      .enter()
      .append("g")
      .attr("class", "extentValueGroup")
      .attr("transform", (d) => `translate(0,${valueScale(d)})`)
      .call((_) => {
        _.append("text")
          .attr("class", "extentText")
          .html((timeData) => this.printAbbr(timeData, true))
          .attr("x", timeseriesWidth + 6);
        _.append("line")
          .attr("class", "extentLine")
          .attr("x1", 0)
          .attr("x2", timeseriesWidth)
          .attr("y1", 0)
          .attr("y2", 0);
      });

    var maxChar = timeKeys.reduce(
      (accum, key) => Math.max(accum, key._time_src.length),
      0
    );
    var tickGapWidth = maxChar * 7;

    var lastTickPos = 30000;
    _timeSeriesSvg
      .append("g")
      .attr("class", "extentYearGroup")
      .selectAll(".extentYear")
      .data(timeKeys)
      .enter()
      .append("text")
      .attr("class", "extentYear")
      .attr("y", 53)
      .attr("x", (tick) => timeScale(tick._time))
      .html((tick) => tick._time_src)
      .style("opacity", (tick) => {
        var newTickPos = timeScale(tick._time);
        if (lastTickPos - newTickPos < tickGapWidth) return 0;
        lastTickPos = newTickPos;
        return 0.8;
      });

    _timeSeriesSvg
      .append("g")
      .attr(
        "clip-path",
        'url("#RecordTimeseriesClip_' + _tempClipPathCounter + '")'
      )
      .call((_g) => {
        _g.append("path")
          .attr("class", "recordTimeseriesLine")
          .datum(timeData)
          .attr("d", Util.getLineGenerator(timeScale, valueScale))
          .attr(
            "stroke",
            steadyValue != null
              ? colorOut(mapp(value_max))
              : "url(#GradientPath_" + _tempClipPathCounter + ")"
          );

        _g.selectAll(".recordTimeseriesDot")
          .data(timeData.filter((_: TimeData) => !!_._value)) // only use the entries which have a _value set
          .enter()
          .append("circle")
          .attr("class", "recordTimeseriesDot")
          .attr("r", 3)
          .attr("cx", (d) => timeScale(d._time))
          .attr("cy", (d) => valueScale(d._value))
          .attr("fill", (d) => colorOut(mapp(d._value)))
          .tooltip(
            (d) =>
              "<div class='recordColorInfo'>" +
              "<span class='mapTooltipLabel'>" +
              "<i class='far fa-calendar'></i> " +
              d._time_src +
              "</span><br> " +
              "<b><span class='mapTooltipValue'>" +
              this.getFormattedValue(d._value) +
              "</span></b>" +
              "</div>",
            {
              theme: "dark timeseriesRecordDot",
              placement: "top",
            }
          )
          .on("click", (_event, d) => this.browser.recordDetailsPopup.updateFocusedTimeKey(d));
      });
  }
}
