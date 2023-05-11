import DOMPurify from "dompurify/dist/purify.es";
import noUiSlider from "nouislider/dist/nouislider.mjs";
import tippy from "tippy.js";

import { select, pointer, selection } from "./d3_select";
import { scaleLinear } from "d3-scale";
import { min, max, extent } from "d3-array";
import { line, curveLinear, curveMonotoneX } from "d3-shape";
import { easePoly } from "d3-ease";
import { schemeCategory10 } from "d3-scale-chromatic";
import { format } from "d3-format";

import { Attrib } from "./Attrib";
import { Attrib_Timeseries } from "./Attrib_Timeseries";
import { Config } from "./Config";
import { LinearOrLog, RecordVisCoding } from "./Types";
import { i18n } from "./i18n";
import { RecordDisplay } from "./RecordDisplay";
import { RecordView } from "./RecordView";
import { Record } from "./Record";
import { Base } from "./Base";

import { TimeData, TimeKey, TimeSeriesData } from "./TimeSeriesData";

const d3 = {
  select,
  selection,
  pointer,
  min,
  max,
  extent,
  line,
  curveMonotoneX,
  curveLinear,
  scaleLinear,
  easePoly,
  schemeCategory10,
  format,
};

/** -- */
class LabelSpacer {
  usedList: { _min: number; _max: number; _entity: Record }[];

  constructor() {
    this.clear();
  }
  clear() {
    this.usedList = [];
  }
  isEmpty(pixel: number): boolean {
    return !this.isUsed(pixel);
  }
  isUsed(pixel: number): boolean {
    return this.usedList.some((_) => pixel < _._max && pixel > _._min);
  }
  /** returns the entity that hee given pixel intersects with */
  intersectsWith(pixel: number) {
    return this.usedList.find((_) => pixel < _._max && pixel > _._min);
  }
  insertUsed(pos: number, range: number, entity: Record) {
    this.usedList.push({
      _min: pos - range,
      _max: pos + range,
      _entity: entity,
    });
  }
}

function hideAllPoppers() {
  var poppers = [].slice.call(document.querySelectorAll("[data-tippy-root]"));

  poppers.forEach(function (popper) {
    var tippy = popper._tippy;
    if (tippy) {
      tippy.hide();
      tippy.reference.classList.remove("visible");
    }
  });
}

export class RecordView_Timeseries extends RecordView {
  ts_Type: Config<string>;
  ts_timeKeysStep: Config<"all" | "limits">;
  ts_valueAxisScale: Config<LinearOrLog>;
  timeSeriesSelectMode: Config<"record" | "time">;
  timeSeriesChangeVsTimeKey: Config<TimeKey>;
  fitValueAxis: Config<boolean>;

  private timeKeys_Active: TimeKey[] = [];

  private timeRange: any;

  private scale_Value: any = null;
  private scale_Time: any = null;
  private scale_Time_prev: any = null;

  private timeseriesRange: any;
  private timeseriesRange_noUpdate: boolean = false;

  y_Generator: any; // TODO: check

  private recordInView: (record: Record) => boolean;

  get timeseriesAttrib() {
    return this.rd.codeBy.timeSeries;
  }

  /** -- */
  async prepareAttribs() {
    if (!this.timeseriesAttrib) {
      await this.rd.setAttrib("timeSeries", this.rd.config.timeSeriesBy || 0);
    }
    return Promise.resolve(true);
  }

  constructor(rd: RecordDisplay, config) {
    super(rd);

    this.ts_Type = new Config<string>({
      cfgClass: "ts_Type",
      cfgTitle: "Timeseries Plot",
      iconClass: "far fa-chart-line",
      default: "Value",
      parent: this,
      helparticle: "5eaf64de042863474d1a0efc",
      tooltip: `Timeseries plot chart type`,
      itemOptions: [
        { name: "# Value", value: "Value" },
        { name: "⩔ Rank", value: "Rank" },
        { name: "#-Change", value: "ChangeAbs" },
        { name: "%-Change", value: "ChangePct" },
      ],
      preSet: async (v) => v === "Change" ? "ChangePct" /* old value*/ : v,
      onSet: () => this.refreshTimeSeriesPlotType(),
    });

    this.timeSeriesChangeVsTimeKey = new Config<TimeKey>({
      parent: this,
      cfgClass: "ts_ChangeVsTimeKey",
      cfgTitle: "Change vs.",
      iconClass: "far fa-calendar",
      default: null,
      helparticle: "5e87f81e2c7d3a7e9aea60a4",
      onDOM: (DOM) => {
        var _ = DOM.root.select(".configItem_Options");
        DOM.keySelect = _.append("select")
          .attr("class", "keySelect")
          .on("change", async (event) => {
            await this.timeSeriesChangeVsTimeKey.set(event.currentTarget.selectedOptions[0].__data__._time_src);
          });
      },
      onRefreshDOM: (cfg: Config<TimeKey>) => {
        if (!cfg.get()) return; // nothing to do!
        cfg.DOM.root.classed("hidden", !this.isTimeseriesChange());
        cfg.DOM.keySelect
          .selectAll("option")
          .data(this.timeKeys_Active || [], (d: TimeKey) => d._time_src)
          .join(
            (enter) => enter.append("option").text((d) => d._time_src),
            (update) => update,
            (exit) => exit.remove()
          )
          .attr("selected", (d: TimeKey) =>
            d._time_src === cfg.get()._time_src ? true : null
          );
      },
      preSet: async (v, obj) => {
        if (!this.timeseriesAttrib) return; // NOT SET now

        if (typeof v === "string") {
          v = this.timeseriesAttrib.timeKeys.find((k) => k._time_src === v);
        }

        // if not set, use first timeKey
        if (!v) return this.timeseriesAttrib.timeKeys[0];

        return v;
      },
      onSet: (v, obj) => {
        this.refreshScaleValue();
        this.refreshKeyLine();
      },
    });

    this.ts_timeKeysStep = new Config<"all" | "limits">({
      parent: this,
      cfgClass: "ts_timeKeysStep",
      cfgTitle: "Time Keys",
      iconClass: "far fa-calendar",
      UISeperator: {
        title: "Axis",
        className: "ts_only",
      },
      default: "all",
      helparticle: "5e891b8504286364bc97d544",
      itemOptions: [
        { name: "All", value: "all" },
        { name: "1st &amp; Last (Slope)", value: "limits" },
      ],
      forcedValue: () => {
        if (!this.timeseriesAttrib) return;
        if (this.timeseriesAttrib.timeKeys.length < 3) return "limits";
      },
      onSet: () => this.refreshTimeRange(),
    });

    this.ts_valueAxisScale = new Config<LinearOrLog>({
      cfgClass: "ts_valueAxisScale",
      cfgTitle: "Value Axis Scale",
      iconClass: "fa fa-arrows-v",
      default: config.ts_valueAxisScale || "linear",
      parent: this,
      helparticle: "5f137b5304286306f8070db3",
      itemOptions: [
        { name: i18n.Linear + " " + i18n.LinearSequence, value: "linear" },
        { name: i18n.Log + " " + i18n.Log10Sequence, value: "log" },
      ],
      noExport: true,
      forcedValue: () => {
        if (this.ts_Type.get() !== "Value") return "linear";
        if (this.timeseriesAttrib && !this.timeseriesAttrib.supportsLogScale())
          return "linear";
      },
      onSet: async (v) => {
        if (this.timeseriesAttrib) {
          await this.timeseriesAttrib.valueScaleType.set(v);
        }
      },
    });

    // Timeseries-only?
    this.fitValueAxis = new Config<boolean>({
      cfgClass: "fitValueAxis",
      cfgTitle: "Fit Value Axis",
      iconClass: "fa fa-arrows-v",
      default: false,
      parent: this,
      helparticle: "5e891b992c7d3a7e9aea64fb",
      itemOptions: [
        { name: "Static", value: false },
        { name: "Dynamic", value: true },
      ],
      forcedValue: () => {
        if (!this.browser.isFiltered()) return false; // full
        if (this.ts_Type.is("Rank")) return false; // full
        if (this.isTimeseriesChange()) return true; // fit
      },
      onSet: () => {
        this.refreshScaleValue();
      },
    });

    this.timeSeriesSelectMode = new Config<"record" | "time">({
      cfgClass: "timeSeriesSelectMode",
      cfgTitle: "Mouse Select",
      iconClass: "fa fa-hand-pointer",
      UISeperator: {
        title: "Control",
        className: "ts_only",
      },
      default: "record", // not set
      parent: this,
      helparticle: "5e88c11004286364bc97d3c0",
      itemOptions: [
        { name: "Nearest Record", value: "record" },
        { name: "Nearest Time-Key", value: "time" },
        // {name: "Filter", value: "filter" },
      ],
      onSet: (v) => {
        // TODO
        // this.visMouseMode.val = (v==='filter')?'filter':'pan';
      },
    });

    [
      "ts_Type",
      "timeSeriesChangeVsTimeKey",
      "timeSeriesSelectMode",
      "ts_timeKeysStep",
      "fitValueAxis",
      "ts_valueAxisScale",
    ].forEach((t) => {
      this[t].val = config[t];
      this.rd.configs[t] = this[t];
      this.rd.recordConfigPanel.insertConfigUI(this[t]);
    });

    var me = this;

    this.timeRange = {
      _src: {},
      get min() {
        return this.val("min");
      },
      get max() {
        return this.val("max");
      },
      set min(v) {
        this._src.min = v ? v._time_src : null;
      },
      set max(v) {
        this._src.max = v ? v._time_src : null;
      },
      val: function (t) {
        var v = this._src[t];
        if (!v || !me.timeseriesAttrib || !me.timeseriesAttrib.timeKeys)
          return null;
        return me.timeseriesAttrib.timeKeys.find((_) => _._time_src === v);
      },
      minActive() {
        return this.min._index > 0;
      },
      maxActive() {
        return this.max._index < me.timeseriesAttrib.timeKeys.length - 1;
      },
      isActive(t) {
        if (t === "min") return this.minActive();
        if (t === "max") return this.maxActive();
        return this.minActive() || this.maxActive();
      },
      exportConfig() {
        var o = {};
        if (this._src.min) o["min"] = this._src.min;
        if (this._src.max) o["max"] = this._src.max;
        return o;
      },
      importConfig(o) {
        if (!o) return;
        ["min", "max"].forEach((t) => {
          if (o[t]) this._src[t] = o[t];
        });
      },
    };

    this.timeRange.importConfig(config.timeRange);
  }

  /** -- */
  initView() {
    this.recordInView = (record: Record) => {
      var _ts = this.timeseriesAttrib.getRecordValue(record);
      if (!_ts || _ts.isEmpty()) return false;
      if (this.isTimeseriesChange()) {
        var _compareKey = this.timeSeriesChangeVsTimeKey.get()._time_src;
        var _index = _ts._keyIndex[_compareKey];
        return _index != null && _index._value != null;
      }
      return true;
    };

    this.refreshTimeSeriesPlotType();

    this.refreshScaleTime();

    this.rd.refreshRecordDOM();

    this.rd.refreshRecordVis();
    this.refreshTimeseriesTicks();
    this.refreshTicks_AxisY();

    this.updateDotVisibility();

    this.refreshFilterRanges();
  }

  /** -- */
  async initView_DOM() {
    if (this.DOM.recordBase_Timeseries) {
      this.DOM.recordGroup =
        this.DOM.recordBase_Timeseries.select(".recordGroup");
      this.DOM.kshfRecords = this.DOM.recordGroup.selectAll(".kshfRecord");
      return;
    }

    var me = this;

    let prevClosestRecord: Record = null;
    let prevClosestTime: TimeKey = null;

    var changeFormat = d3.format("+.2");

    function refreshDotTooltip(d) {
      var record: Record = d.DOM.parentNode.__data__;
      var recordText = me.textBriefAttrib.getRecordValue(record) || "";
      var recordValue = me.timeseriesAttrib.getFormattedValue(d._value);
      var _recordRank =
        me.ts_Type.is("Rank")
          ? ` <span class='extraInfo'>(#${d._rank})</span>`
          : "";
      var recordChange = "";
      if (me.isTimeseriesChange()) {
        var _key = me.timeSeriesChangeVsTimeKey.get()._time_src;
        var ref =
          me.timeseriesAttrib.getRecordValue(record)?._keyIndex[_key]?._value;
        var _v = changeFormat((100 * (d._value - ref)) / (ref || 1)) + "%"; // avoid divide by zero
        if (me.ts_Type.is("ChangeAbs")) {
          _v = me.timeseriesAttrib.getFormattedValue(d._value - ref);
        }
        recordChange = ` <span class='extraInfo'>(${_v} vs. ${_key})</span>`;
      }
      var x;
      var fullValue = recordValue + _recordRank + recordChange;
      if (me.timeSeriesSelectMode.is("time")) {
        x = `<span class='asdsdadsada'>${recordText}: <b>${fullValue}</b></span>`;
      } else {
        x =
          `<span class='mapItemName'>${recordText}</span>` +
          "<div class='recordColorInfo'>" +
          "<div class='mapTooltipLabel'>" +
          `<b>${me.timeseriesAttrib.attribName}</b>` +
          ` <i class='fal fa-calendar'></i> ${d._time_src}` +
          "</div><br>" +
          `<span class='mapTooltipValue'>${fullValue}</span>` +
          "</div>";
      }
      d.DOM.tippy.popper.children[0].children[0].innerHTML =
        DOMPurify.sanitize(x);
    }

    var spacer_left = new LabelSpacer();
    var spacer_right = new LabelSpacer();

    function pofff(c, record, _placement = "right") {
      if (!c.DOM) return; // no tooltip
      c.DOM.tippy = tippy(
        c.DOM,
        Object.assign({}, d3.selection.tippyDefaultConfig, {
          theme: "dark kshf-tooltip kshf-record",
          placement: _placement,
          animation: "fade",
          trigger: "manual",
          delay: 0,
          duration: [500, 100],
          appendTo: Base.browser.DOM.root.node(),
        })
      );
      refreshDotTooltip(c);
      c.DOM.tippy.show();
    }

    this.DOM.recordBase_Timeseries = this.DOM.recordDisplayWrapper
      .append("div")
      .attr("class", "recordBase_Timeseries");

    this.refreshTimeSeriesChartWidth();

    // Y & X axis
    ["Y", "X"].forEach((a) => {
      var _ = this.DOM.recordBase_Timeseries
        .append("div")
        .attr("class", "recordAxis recordAxis_" + a);
      _.append("div").attr("class", "tickGroup");
      _.append("div")
        .attr("class", "keyLine")
        .style("display", this.isTimeseriesChange() ? "block" : null);
    });

    // X-axis min/max time key setting
    ["min", "max"].forEach((limit) => {
      var __ = this.DOM.recordBase_Timeseries
        .append("span")
        .attr("class", "timeLimit timeLimit-" + limit);
      __.append("select").on("change", (event) => {
        this.setTimeRange({
          [limit]: event.currentTarget.selectedOptions[0].__data__._index,
        });
      });
      __.append("span").attr(
        "class",
        limit === "min"
          ? "far fa-angle-double-right"
          : "far fa-angle-double-left"
      );
    });
    this.refreshTimeSeriesRangeOpts();

    // ******************************************************

    this.DOM.recordGroup = this.DOM.recordBase_Timeseries
      .append("svg")
      .attr("class", "recordGroup recordGroup_Timeseries")
      .attr("xmlns", "http://www.w3.org/2000/svg")

      .on("click", () => {
        if (this.rd.visMouseMode === "filter") return;
        if (prevClosestRecord) {
          hideAllPoppers();
          this.browser.recordDetailsPopup.updateRecordDetailPanel(prevClosestRecord);
          this.browser.recordDetailsPopup.updateFocusedTimeKey(prevClosestTime);
        }
        this.rd.setDimmed(false);
      })

      .on("mouseleave", () => {
        if (this.rd.visMouseMode === "filter") return;
        if (this.timeSeriesSelectMode.is("time")) {
          hideAllPoppers();
          this.browser.records.forEach((record) => {
            // remove "visible" from dots
            if (record.filteredOut) return;
            if (!prevClosestTime) return;
              this.timeseriesAttrib.getRecordValue(record)?._keyIndex[
                prevClosestTime._time_src
              ]?.DOM?.classList.remove("visible");
          });
          prevClosestTime = null;
        }
        this.rd.onRecordMouseLeave(prevClosestRecord);
        prevClosestRecord = null;
      })

      .on("mousemove", (event) => {
        if (this.rd.visMouseMode === "filter") return;

        var _m = d3.pointer(event);

        if (_m[1] > event.currentTarget.offsetHeight || _m[1] < 0) {
          // out of chart bounds
          if (this.timeSeriesSelectMode.is("record")) {
            this.rd.onRecordMouseLeave(prevClosestRecord);
            prevClosestRecord = null;
          }
          if (this.timeSeriesSelectMode.is("time") && prevClosestTime) {
            hideAllPoppers();
            this.browser.records.forEach((record: Record) => {
              if (record.filteredOut) return;
              if (!prevClosestTime) return;
              this.timeseriesAttrib
                .getRecordValue(record)
                ?._keyIndex[prevClosestTime._time_src]?.DOM?.classList.remove(
                  "visible"
                );
            });
          }

          return;
        }

        var _m_Time = this.scale_Time.invert(_m[0]);
        var _compareKey = this.timeSeriesChangeVsTimeKey.get()?._time_src || null;

        var closestTimeKey = null;
        if (
          _m_Time.getTime() <= this.scale_Time.domain()[1].getTime() &&
          _m_Time.getTime() >= this.scale_Time.domain()[0].getTime()
        ) {
          var closestTimeDist = 999999999999999;
          this.timeKeys_Active.every((timeKey) => {
            var _dist = Math.abs(timeKey._time.getTime() - _m_Time.getTime());
            if (_dist < closestTimeDist) {
              closestTimeKey = timeKey;
              closestTimeDist = _dist;
              return true;
            }
            return false; // getting farther away. We already found the closest
          });
        }

        // Select closest time
        if (this.timeSeriesSelectMode.is("time")) {
          if (closestTimeKey === prevClosestTime) return;

          if (prevClosestTime) {
            hideAllPoppers();
            this.browser.records.forEach((record) => {
              if (record.filteredOut) return;
              this.timeseriesAttrib.getRecordValue(record)?._keyIndex[
                prevClosestTime._time_src
              ]?.DOM?.classList.remove("visible");
            });
          }

          if (closestTimeKey) {
            spacer_right.clear();
            spacer_left.clear();

            this.browser.records.forEach((record) => {
              if (!this.recordInView(record) || record.filteredOut) return;
              var c =
                this.timeseriesAttrib.getRecordValue(record)?._keyIndex[
                  closestTimeKey._time_src
                ];
              if (!c) return;
              c.DOM.classList.add("visible"); // timeSeriesDot
              var placement;
              var ref = this.isTimeseriesChange()
                ? this.timeseriesAttrib.getRecordValue(record)?._keyIndex[
                    _compareKey
                  ]._value
                : 0;
              var top = this.y_Generator(c, ref);
              if (spacer_right.isEmpty(top)) {
                placement = "right";
                spacer_right.insertUsed(top, 30, record);
              } else if (spacer_left.isEmpty(top)) {
                placement = "left";
                spacer_left.insertUsed(top, 30, record);
              } else {
                return;
              }
              pofff(c, record, placement);
            });
          }
          prevClosestTime = closestTimeKey;
          return;
        }

        // Select closest point

        var closestRecord = null;
        if (!closestTimeKey) {
          this.rd.onRecordMouseLeave(prevClosestRecord);
          prevClosestRecord = null;
          return;
        }

        var closestValueDist = 999999999999999;
        this.browser.records.forEach((record) => {
          if (!this.recordInView(record) || record.filteredOut) return;
          var _ =
            this.timeseriesAttrib.getRecordValue(record)?._keyIndex[
              closestTimeKey._time_src
            ];
          if (!_) return;
          var ref = this.isTimeseriesChange()
            ? this.timeseriesAttrib.getRecordValue(record)?._keyIndex[
                _compareKey
              ]._value
            : 0;
          var _v = this.y_Generator(_, ref);
          var _dist = Math.abs(_v - _m[1]);
          if (_dist < 50 && _dist < closestValueDist) {
            closestRecord = record;
            closestValueDist = _dist;
          }
        });

        if (prevClosestRecord !== closestRecord) {
          this.rd.onRecordMouseLeave(prevClosestRecord);
          prevClosestRecord = null;
          if (closestRecord) {
            this.rd.onRecordMouseOver(closestRecord);
            var c =
              this.timeseriesAttrib.getRecordValue(closestRecord)?._keyIndex[
                closestTimeKey._time_src
              ];
            if (c) {
              pofff(c, closestRecord);
            }
          }
          prevClosestRecord = closestRecord;
        } else if (closestRecord) {
          // maybe record is the same, but the time changed?
          if (prevClosestTime !== closestTimeKey) {
            hideAllPoppers();
            var c =
              this.timeseriesAttrib.getRecordValue(closestRecord)?._keyIndex[
                closestTimeKey._time_src
              ];
            if (c) {
              pofff(c, closestRecord);
            }
          }
        }

        prevClosestTime = closestTimeKey;

        this.rd.setDimmed(!!prevClosestRecord);
      });

    this.DOM.recordLineClippath = this.DOM.recordGroup
      .append("clipPath")
      .attr("id", "recordLineClippath")
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("height", 4000);

    // annotations
    this.DOM.ts_annotations = this.DOM.recordBase_Timeseries
      .append("span")
      .attr("class", "ts_annotations");

    this.DOM.recordBase_Timeseries
      .append("div")
      .attr("class", "TimeseriesColorInfo")
      .html(i18n["Line colors are random"]);

    // ******************************************************

    this.DOM.timeSeriesControlGroup = this.DOM.recordBase_Timeseries
      .append("div")
      .attr("class", "timeSeriesControlGroup attribControlGroup");

    this.rd.initDOM_AttribSelect("timeSeries");

    // ******************************************************

    this.DOM.timeAnimationClearRange.on("click", () =>
      this.setTimeRange({ min: 0, max: 10000 })
    ); // max is just a very large number

    noUiSlider.create(this.DOM.timeseriesRange.node(), {
      start: [50, 50],
      connect: true,
      step: 1,
      behaviour: "tap-drag",
      margin: 1, // at least one step difference between the end/start point
      range: {
        min: 0,
        max: 100,
      },
    });

    this.timeseriesRange = this.DOM.timeseriesRange.node().noUiSlider;

    var _update_2 = (_values, _handle, unencoded) => {
      if (this.timeseriesRange_noUpdate) return;
      unencoded = unencoded.map((_) => Math.round(_));
      this.timeseriesRange_noUpdate = true;
      this.setTimeRange({ min: unencoded[0], max: unencoded[1] });
      delete this.timeseriesRange_noUpdate;
    };
    this.timeseriesRange.on("set", _update_2);
  }

  /** -- */
  isTimeseriesChange() {
    return this.ts_Type.is("ChangePct") || this.ts_Type.is("ChangeAbs");
  }

  extendRecordDOM(newRecords) {
    newRecords.append("path");
    newRecords.append("g").attr("class", "dotGroup");
    newRecords
      .append("foreignObject")
      .attr("width", "120")
      .attr("height", "1")
      .call((fO) => {
        fO.append("xhtml:div")
          .attr("xmlns", "http://www.w3.org/1999/xhtml")
          .attr("class", "recordText_side")
          .html((record: Record) =>
            this.textBriefAttrib?.renderRecordValue(record)
          );
        fO.append("xhtml:div")
          .attr("xmlns", "http://www.w3.org/1999/xhtml")
          .attr("class", "recordText_Dot");
      });
  }

  // ********************************************************************
  // Time range
  // ********************************************************************

  /** -- Parameters are integer index of the active timeseries attribute timekeys */
  setTimeRange({ min = -1, max = -1 } = {}) {
    if (min >= 0) {
      this.timeRange.min = this.timeseriesAttrib.timeKeys[min];
    }
    if (max >= 0) {
      max = Math.min(max, this.timeseriesAttrib.timeKeys.length - 1);
      this.timeRange.max = this.timeseriesAttrib.timeKeys[max];
    }
    this.refreshTimeRange();
  }

  /** -- */
  refreshTimeRange() {
    this.refreshScaleTime();
    this.refreshTimeseriesTicks();

    if (this.timeRange.min._time > this.timeSeriesChangeVsTimeKey.get()?._time) {
      this.timeSeriesChangeVsTimeKey.set(this.timeRange.min);
      this.refreshTimeSeriesRangeOpts(); // updates combobox for vs.

    } else if (this.timeRange.max._time < this.timeSeriesChangeVsTimeKey.get()?._time) {
      this.timeSeriesChangeVsTimeKey.set(this.timeRange.max);
      this.refreshTimeSeriesRangeOpts(); // updates combobox for vs.

    } else {
      this.refreshScaleValue();
    }
  }

  /** -- */
  refreshTimeSeriesRangeOpts() {
    ["min", "max"].forEach((limit) => {
      this.DOM.root
        .select(".timeLimit-" + limit)
        .classed("filtered", this.timeRange.isActive(limit));
      this.DOM.root
        .select(".timeLimit-" + limit + " > select")
        .selectAll("option")
        .data(
          this.timeseriesAttrib.timeKeys.filter(
            limit === "min"
              ? (key) => key._time < this.timeRange.max._time
              : (key) => key._time > this.timeRange.min._time
          ),
          (d) => d._time_src
        )
        .join(
          (enter) => enter.append("option").text((d) => d._time_src),
          (update) => update,
          (exit) => exit.remove()
        )
        .attr("selected", (d) =>
          d._time_src === this.timeRange[limit]._time_src ? true : null
        );
    });
  }

  async refreshAttribScaleType(attrib: Attrib) {
    if (
      attrib instanceof Attrib_Timeseries &&
      this.timeseriesAttrib === attrib
    ) {
      await this.ts_valueAxisScale.set(attrib.valueScaleType.get()); // apply it back to the attribute
      if (this.ts_Type.is("Value")) {
        this.refreshScaleValue();
      }
    }
  }

  async finishSetAttrib(t: RecordVisCoding) {
    if (t === "textBrief") {
      this.DOM.kshfRecords
        .selectAll("foreignObject > .recordText_side")
        .html((record: Record) =>
          this.textBriefAttrib.renderRecordValue(record)
        );
      //
    } else if (t === "timeSeries") {
      this.scale_Time = this.timeseriesAttrib.timeSeriesScale_Time.copy();

      if (
        !this.timeRange.min ||
        !this.timeseriesAttrib.timeKeys.some(
          (_) => _._time_src === this.timeRange.min._time_src
        ) ||
        !this.timeRange.max ||
        !this.timeseriesAttrib.timeKeys.some(
          (_) => _._time_src === this.timeRange.max._time_src
        )
      ) {
        this.setTimeRange({ min: 0, max: 10000 });
      }

      await this.ts_valueAxisScale.set(this.timeseriesAttrib.valueScaleType.get());

      if (this.ts_Type.is("Rank")) {
        this.timeseriesAttrib.computeRecordRanks();
      }

      if (!this.timeSeriesChangeVsTimeKey.get()) {
        await this.timeSeriesChangeVsTimeKey.set(this.rd.config.timeSeriesChangeVsTimeKey);
      }

      this.refreshScaleTime();
      this.refreshScaleValue();
      this.refreshFilterRanges();
    }
  }

  /** -- */
  refreshViewSize(_delayMS: number = 0) {
    this.refreshScaleTime();
    this.refreshRecordVis();
    this.refreshTimeseriesTicks();
    this.refreshTicks_AxisY();
    this.updateDotVisibility();
  }

  // ********************************************************************
  // Scale of time and values
  // ********************************************************************

  /** -- */
  refreshScaleTime() {
    if (!this.timeseriesAttrib) return;
    if (!this.timeseriesRange) return;

    this.scale_Time_prev = this.scale_Time.copy();

    this.scale_Time.domain([
      this.timeRange.min._time,
      this.timeRange.max._time,
    ]);

    var timeKeys = this.timeseriesAttrib.timeKeys;

    this.timeKeys_Active = timeKeys.filter(
      (key) =>
        key._time >= this.timeRange.min._time &&
        key._time <= this.timeRange.max._time
    );

    if (this.ts_timeKeysStep.is("limits")) {
      this.timeKeys_Active = [
        this.timeKeys_Active[0],
        this.timeKeys_Active[this.timeKeys_Active.length - 1],
      ];
      if (this.isTimeseriesChange()) {
        this.timeKeys_Active.splice(1, 0, this.timeSeriesChangeVsTimeKey.get());
      }
    }

    this.timeSeriesChangeVsTimeKey.refresh();

    this.marginLeft = 85;
    this.chartWidth = this.rd.curWidth - this.marginTotal;
    this.expandMargin();
    this.scale_Time.range([0, this.chartWidth]);

    // first time setting scale_Time should also reset prev to current
    if (!this.scale_Time_prev) {
      this.scale_Time_prev = this.scale_Time.copy();
    }

    this.refreshTimeSeriesChartWidth();

    this.refreshTimeSeriesRangeOpts();

    this.timeseriesRange_noUpdate = true;
    this.timeseriesRange.updateOptions({
      range: {
        min: 0,
        max: timeKeys.length - 1,
      },
    });
    delete this.timeseriesRange_noUpdate;

    // "false" avoid firing the "set" event
    this.timeseriesRange.setHandle(0, this.timeRange.min._index, false);
    this.timeseriesRange.setHandle(1, this.timeRange.max._index, false);

    this.DOM.timeAnimation.select(".rangeTick-min").html(timeKeys[0]._time_src);
    this.DOM.timeAnimation
      .select(".rangeTick-max")
      .html(timeKeys[timeKeys.length - 1]._time_src);
    this.DOM.timeAnimation
      .select(".clearRange")
      .classed("active", this.timeRange.isActive());

    this.addAnnotations();
  }

  /** -- */
  refreshScaleValue() {
    if (!this.ts_Type) return;
    if (!this.timeseriesAttrib) return;

    // RANK    *****************************************************
    if (this.ts_Type.is("Rank")) {
      var timeDomain = this.scale_Time.domain();
      var inTimeDomain = (d) => true;
      if (timeDomain) {
        inTimeDomain = (d) =>
          d._time >= timeDomain[0] && d._time <= timeDomain[1];
      }

      // count number of records with data within the time domain
      var maxNumRecords = this.browser.records.reduce(
        (accumulator, currentRecord: Record) => {
          if (currentRecord.filteredOut) return accumulator;

          var _val = this.timeseriesAttrib.getRecordValue(currentRecord);
          if (!_val) return accumulator;

          // consider only values that are inTimeDomain
          if (_val._timeseries_.filter(inTimeDomain).length === 0) {
            return accumulator;
          }

          return accumulator + 1;
        },
        0
      );

      this.scale_Value = d3.scaleLinear().domain([maxNumRecords, 1]);
    }

    // VALUE   *****************************************************
    if (this.ts_Type.is("Value")) {
      this.scale_Value = this.timeseriesAttrib.timeSeriesScale_Value
        .copy()
        .nice();

      var new_domain = this.timeseriesAttrib.getExtent_Value(
        this.fitValueAxis.get(), // onlyFiltered
        this.scale_Time.domain() // in current domain
      );

      var _domain = this.scale_Value.domain();
      if (_domain[0] > _domain[1]) new_domain = [new_domain[1], new_domain[0]]; // flip domain

      this.scale_Value.domain(new_domain);
    }

    // CHANGE   *****************************************************
    if (this.isTimeseriesChange()) {
      if (!this.timeSeriesChangeVsTimeKey.get()) {
        this.timeSeriesChangeVsTimeKey.set(this.timeKeys_Active[0]);
      }

      var _key = this.timeSeriesChangeVsTimeKey.get()._time_src;

      var timeDomain = this.scale_Time.domain();
      var inTimeDomain = (d) =>
        d._time >= timeDomain[0] && d._time <= timeDomain[1];

      var vizVal;
      if (this.ts_Type.is("ChangeAbs")) {
        vizVal = (v, ref) => v._value - ref;
      } else if (this.ts_Type.is("ChangePct")) {
        vizVal = (v, ref) => 100 * ((v._value - ref) / ref);
      }

      var x = this.browser.records.map((record: Record) => {
        if (!this.recordInView(record) || record.filteredOut) {
          return [0, 0];
        }

        var r_ts = this.timeseriesAttrib.getRecordValue(record);
        var ref = r_ts._keyIndex[_key]._value;
        if (!ref) return [0, 0];
        return d3.extent(r_ts._timeseries_, (v) =>
          inTimeDomain(v) ? vizVal(v, ref) : null
        );
      });

      this.scale_Value = d3
        .scaleLinear()
        .domain([d3.min(x, (x) => x[0]), d3.max(x, (x) => x[1])])
        .nice();
    }

    // FINALIZE ******************************************************
    this.refreshRecordVis();
    this.refreshTicks_AxisY();
    this.refreshFilterRanges();
  }

  /** -- */
  refreshYGenerator() {
    this.y_Generator = {
      Value: (d: TimeData) => this.scale_Value(d._value),
      ChangePct: (d: TimeData, ref) =>
        this.scale_Value(ref ? (100 * (d._value - ref)) / ref : 0),
      ChangeAbs: (d: TimeData, ref) => this.scale_Value(d._value - ref),
      Rank: (d: TimeData) => this.scale_Value(d._rank),
    }[this.ts_Type.get()];
  }

  /** VALUE AXIS */
  refreshTicks_AxisY() {
    var screenHeight = Math.abs(
      this.scale_Value.range()[1] - this.scale_Value.range()[0]
    );
    var targetNumTicks = Math.floor(screenHeight / 40); // one tickevery 40 pixels
    var _scale = this.scale_Value.copy();
    if (_scale.base) _scale.base(10);
    var ticks = _scale.ticks(targetNumTicks);

    // if the values are integer only, keep only integer values here.
    if (!this.timeseriesAttrib.hasFloat || this.ts_Type.is("Rank")) {
      ticks = ticks.filter((d) => d % 1 === 0);
    }

    if (this.ts_Type.is("Rank")) {
      ticks.unshift(1);
      ticks = ticks
        .sort((a, b) => b - a)
        // keep unique values onlu=y
        .reduce((accumulator, currentValue) => {
          if (accumulator[accumulator.length - 1] !== currentValue)
            accumulator.push(currentValue);
          return accumulator;
        }, []);
    }

    var tickTextFunc = {
      Rank: (tick) => "# " + d3.format("d")(tick),
      ChangePct: (tick) => (tick > 0 ? "+" : "") + d3.format(".3s")(tick) + "%",
      ChangeAbs: (tick) =>
        (tick > 0 ? "+" : "") + this.timeseriesAttrib.printAbbr(tick, true),
      Value: (tick) => this.timeseriesAttrib.getFormattedValue(tick, true),
    }[this.ts_Type.get()];

    var timeAxisDOM = this.DOM.root.select(
      ".recordBase_Timeseries .recordAxis_Y > .tickGroup"
    );

    var visiblePos = 0;

    timeAxisDOM
      .selectAll(".hmTicks")
      .data(ticks.reverse(), (t) => t) // reverse from decreasing to increasing order
      .join(
        (enter) =>
          enter
            .append("div")
            .attr("class", "hmTicks")
            .classed("zero", (tick) => tick === 0)
            .style("opacity", 0)
            .call((hmTicks) => {
              hmTicks.append("div").attr("class", "tickLine");
              hmTicks.append("div").attr("class", "tickText tickText_1");
              hmTicks.transition().delay(500).duration(0).style("opacity", 1);
            }),
        (update) => update,
        (exit) => {
          exit
            .style(
              "transform",
              (tick) =>
                "translateY(" + this.scale_Value(tick) + "px) translateZ(0)"
            )
            .style("opacity", 0)
            .transition()
            .duration(0)
            .delay(500)
            .remove();
        }
      )
      .style(
        "transform",
        (tick) => "translateY(" + this.scale_Value(tick) + "px) translateZ(0)"
      )
      .classed("hideLabel", (tick) => {
        var pos = this.scale_Value(tick);
        if (pos >= visiblePos) {
          visiblePos = pos + 20;
          return false;
        }
        return true;
      })
      .call((ticks) => {
        ticks.selectAll(".tickText").html(tickTextFunc);
      });
  }

  refreshFilterRanges() {
    this.DOM.root
      .selectAll(".recordBase_Timeseries .recordAxis_X > .tickGroup > .hmTicks")
      .each((tick: TimeKey) => {
        tick._histogram = this.timeseriesAttrib.timeKeyAttribs[tick._time_src];
      })
      .classed(
        "isFiltered",
        (tick: TimeKey) => tick._histogram?.isFiltered() && this.ts_Type.is("Value")
      )
      .filter(
        (tick: TimeKey) => tick._histogram?.isFiltered() && this.ts_Type.is("Value")
      )
      .selectAll(".filterArea")
      .style("height", (event) => {
        var d = _DOM.parentNode.__data__ as TimeKey;
        var _DOM = event.currentTarget;
        var attrib = d._histogram;
        var _a = this.scale_Value(attrib.summaryFilter.active.minV);
        var _b = this.scale_Value(attrib.summaryFilter.active.maxV);
        var _domain = this.scale_Value.domain();
        var flipped = _domain[0] > _domain[1];
        _DOM._minn = flipped ? _b : _a;
        _DOM._maxx = flipped ? _a : _b;
        // That's where printing happens
        d3.select(_DOM.childNodes[flipped ? 1 : 0]).html(
          attrib.printAbbr(attrib.summaryFilter.active.minV)
        );
        d3.select(_DOM.childNodes[flipped ? 0 : 1]).html(
          attrib.printAbbr(attrib.summaryFilter.active.maxV)
        );
        return Math.abs(_DOM._maxx - _DOM._minn) + 14 + "px";
      })
      .style("top", (event) => {
        var _domain = this.scale_Value.domain();
        if (_domain[0] > _domain[1])
          return event.currentTarget._minn - 5 + "px";
        return event.currentTarget._maxx - 5 + "px";
      });
  }

  // ********************************************************************
  // Size / width / height / margins
  // ********************************************************************

  // is dyanmically updated, needs a setter too, so setting this as regular var.
  marginLeft: number = 85;
  chartWidth: number;

  /** -- */
  get marginRight() {
    return 150;
  }
  /** -- */
  get marginTotal() {
    return this.marginLeft + this.marginRight;
  }
  /** -- */
  isMarginExpandable() {
    var maxWidth = 200 * (this.timeKeys_Active.length - 1);
    return maxWidth < this.rd.curWidth - this.marginTotal;
  }
  /** -- */
  expandMargin() {
    if (this.wideTimeScale) return;
    // shrink the width if there are few time keys active
    var maxWidth = 200 * (this.timeKeys_Active.length - 1);
    if (maxWidth < this.chartWidth) {
      this.marginLeft += (this.chartWidth - maxWidth) / 2;
      this.chartWidth = maxWidth;
    }
  }

  /** -- */
  refreshTimeSeriesChartWidth() {
    this.DOM.recordBase_Timeseries
      ?.style("width", this.chartWidth + "px")
      .style("left", this.marginLeft + "px");

    this.DOM.recordLineClippath?.attr("width", this.chartWidth);
  }

  /** -- */
  updateRecordVisibility() {
    this.refreshLabelOverlaps();
  }

  /** -- */
  refreshKeyLine() {
    if (!this.timeseriesAttrib) return;

    if (!this.timeSeriesChangeVsTimeKey.get()) return;
    this.DOM.root
      .select(".recordAxis_X > .keyLine")
      .style(
        "transform",
        `translateX(${this.scale_Time(
          this.timeSeriesChangeVsTimeKey.get()._time
        )})`
      );
  }

  /** -- */
  onRecordMouseLeave() {
    hideAllPoppers();
  }
  /** -- */
  onRecordMouseOver(record) {
    record.moveDOMtoTop();
  }

  /** -- */
  refreshTimeseriesTicks() {
    if (!this.timeseriesAttrib) return;

    var me = this;

    var timeAxisDOM = this.DOM.root.select(
      ".recordBase_Timeseries .recordAxis_X > .tickGroup"
    );

    var lastTickPos = -300;

    var maxChar = this.timeseriesAttrib.timeKeys.reduce(
      (accum, key) => Math.max(accum, key._time_src.length),
      0
    );
    var tickGapWidth = maxChar * 9;

    timeAxisDOM
      .selectAll(".hmTicks")
      .data(this.timeKeys_Active, (t: TimeKey) => t._time_src)
      .join(
        (enter) => {
          var tk = enter
            .append("div")
            .attr("class", "hmTicks")
            .style("opacity", 1)
            .style(
              "transform",
              (tick) =>
                `translateX(${this.scale_Time_prev(
                  tick._time
                )}px) translateZ(0)`
            )
            .call((tk) =>
              tk
                .transition()
                .delay(0)
                .duration(0)
                .style(
                  "transform",
                  (tick) =>
                    `translateX(${this.scale_Time(tick._time)}px) translateZ(0)`
                )
            );

          var tickText = tk.append("div").attr("class", "tickText");

          tk.append("div").attr("class", "tickLine");
          tk.append("div")
            .attr("class", "timeSelectArea")
            .on("mousedown", (event, tick) => {
              if (event.which !== 1) return; // only respond to left-click
              me.browser.DOM.root.classed("noPointerEvents", true);
              var DOM = event.currentTarget;
              var initPos = me.scale_Value.invert(d3.pointer(event)[1]);
              var histSummary = me.timeseriesAttrib.getTimepointSummary(tick);
              d3.select("body")
                .on("mousemove.test", () => {
                  var targetPos = me.scale_Value.invert(
                    d3.pointer(event, DOM)[1]
                  );
                  var _min = initPos > targetPos ? targetPos : initPos;
                  var _max = initPos > targetPos ? initPos : targetPos;
                  if (me.ts_Type.is("Rank")) {
                    var _minRank = Math.floor(_min);
                    var _maxRank = Math.ceil(_max);
                    me.browser.records.forEach((r) => {
                      var mm = r.getValue(this.timeseriesAttrib)._keyIndex;
                      if (mm) {
                        var dasds = mm[tick._time_src];
                        if (dasds) {
                          if (dasds._rank === _minRank) _min = dasds._value;
                          if (dasds._rank === _maxRank) _max = dasds._value;
                        }
                      }
                    });
                    // find records with these limit ranks
                  }
                  histSummary.setRangeFilter_Custom(_min, _max);
                  me.refreshFilterRanges();
                })
                .on("mouseup.test", () => {
                  me.browser.DOM.root.classed("noPointerEvents", false);
                  d3.select("body")
                    .on("mousemove.test", null)
                    .on("mouseup.test", null);
                });
              event.preventDefault();
            });

          var filterArea = tk
            .append("div")
            .attr("class", "filterArea")
            .on("mousedown", (event, tick) => {
              if (event.which !== 1) return; // only respond to left-click
              me.browser.DOM.root.classed("noPointerEvents", true);
              var e = event.currentTarget.parentNode.childNodes[2]; // selectArea. TODO: Make this harder to fail!
              var DOM = event.currentTarget;
              DOM.classList.add("dragging");

              var histSummary = me.timeseriesAttrib.getTimepointSummary(tick);

              var initPos = me.scale_Value.invert(d3.pointer(event, e)[1]);
              d3.select("body")
                .on("mousemove.test", () => {
                  var curPos = me.scale_Value.invert(d3.pointer(event, e)[1]);
                  histSummary.setRangeFilter_Custom(
                    Math.min(initPos, curPos),
                    Math.max(initPos, curPos)
                  );
                })
                .on("mouseup.test", () => {
                  me.browser.DOM.root.classed("noPointerEvents", false);
                  DOM.classList.remove("dragging");
                  d3.select("body")
                    .on("mousemove.test", null)
                    .on("mouseup.test", null);
                });
              event.preventDefault();
            });

          tickText
            .append("span")
            .attr("class", "clearFilterButton fa")
            .tooltip(i18n.RemoveFilter)
            .on("click", (tick) => {
              var _ = this.timeseriesAttrib.getTimepointSummary(tick);
              if (_) _.summaryFilter.clearFilter();
            });
          tickText
            .append("span")
            .attr("class", "theTextText")
            .html((tick) => tick._time_src);
          tickText
            .append("span")
            .attr("class", "openTimepointSummary fa fa-external-link-square")
            .tooltip("Create Time-Key<br>Histogram")
            .on("click", (tick) => {
              var newSummary = this.timeseriesAttrib.getTimepointSummary(tick);
              newSummary.block.addToPanel(this.browser.panels.left);
              this.browser.updateLayout();
            });

          ["min", "max"].forEach(function (endType) {
            filterArea
              .append("div")
              .attr("class", "filterRangeValue filterRangeValue_" + endType)
              .on("mousedown", function (event, tick) {
                if (event.which !== 1) return; // only respond to left-click
                me.browser.DOM.root.classed("noPointerEvents", true);
                var e = this.parentNode.parentNode.childNodes[2]; // selectArea. TODO: Make this harder to fail!
                var _ = this.parentNode;
                _.classList.add("dragging");

                var histSummary = me.timeseriesAttrib.getTimepointSummary(tick);

                d3.select("body")
                  .on("mousemove.range", function () {
                    var curVal = me.scale_Value.invert(d3.pointer(event, e)[1]);
                    histSummary.summaryFilter.active[endType] = curVal;
                    histSummary.summaryFilter.setFiltered(true);
                    me.refreshFilterRanges();
                  })
                  .on("mouseup.range", function () {
                    _.classList.remove("dragging");
                    me.browser.DOM.root
                      .attr("adjustWidth", null)
                      .classed("noPointerEvents", false);
                    d3.select("body")
                      .style("cursor", "auto")
                      .on("mousemove.range", null)
                      .on("mouseup.range", null);
                  });

                event.preventDefault();
                event.stopPropagation();
              });
          });
          return tk;
        },

        (update) => {
          return update.style(
            "transform",
            (tick) =>
              `translateX(${this.scale_Time(tick._time)}px) translateZ(0)`
          );
        },

        (exit) => {
          return exit
            .transition()
            .duration(0)
            .delay(500)
            .style(
              "transform",
              (tick) =>
                `translateX(${this.scale_Time(tick._time)}px) translateZ(0)`
            )
            .style("opacity", 0)
            .remove();
        }
      )
      .selectAll(".tickText")
      .style("display", (tick) => {
        var newTickPos = this.scale_Time(tick._time);
        if (newTickPos - lastTickPos < tickGapWidth) return "none";
        lastTickPos = newTickPos;
        return null;
      });

    this.refreshKeyLine();
  }

  /** -- */
  updateDotVisibility() {
    // based on chart size (width, height) and active (or truly visible) record count
    var recCount =
      this.browser.records.length -
      this.DOM.root.selectAll(".noTimeSeries, .filteredOut").nodes().length;
    this.browser.DOM.root.classed(
      "noRecordDots",
      this.rd.curHeight / recCount < 100 ||
        this.rd.curWidth / this.timeKeys_Active.length < 30
    );
  }

  private wideTimeScale: boolean = false;
  private wideTimeScaleTimer: number;

  timeseriesWiden() {
    if (!this.isMarginExpandable()) return;
    this.wideTimeScaleTimer = window.setTimeout(() => {
      this.wideTimeScale = true;
      this.refreshTimeRange();
    }, 500);
  }
  timeseriesWidenOff() {
    if (!this.wideTimeScaleTimer) return;
    window.clearTimeout(this.wideTimeScaleTimer);
    this.wideTimeScaleTimer = 0;
    if (this.wideTimeScale && !this.rd.timeseriesAnimInterval) {
      this.wideTimeScale = false;
      this.refreshTimeRange();
    }
  }

  stepTimeAnimation(stepSize: number): boolean {
    this.wideTimeScale = true;

    var maxIndex = this.timeseriesAttrib.timeKeys.length - 1;

    // start from beginning
    if (this.timeRange.max._index >= maxIndex) {
      this.setTimeRange({ max: this.timeRange.min._index + 1 });
      window.setTimeout(
        () => this.rd.startTimeseriesAnimation(stepSize),
        this.animStepDelayMs
      ); // adds double-wait, but works fine
      return true;
    }

    this.rd.timeseriesAnimInterval = window.setInterval(() => {
      if (this.timeRange.max._index >= maxIndex) {
        this.rd.stopTimeseriesAnimation();
      } else {
        this.setTimeRange({ max: this.timeRange.max._index + stepSize });
      }
    }, this.animStepDelayMs);

    return true;
  }
  stopTimeAnimation() {
    this.refreshTimeRange();
    this.wideTimeScale = false;
  }

  updateAfterFilter() {
    this.updateRecordVisibility();

    this.updateDotVisibility();

    this.fitValueAxis.refresh();

    if (this.ts_Type.is("Rank")) {
      this.timeseriesAttrib.computeRecordRanks();
      this.refreshScaleValue();
      //
    } else if (this.ts_Type.is("Value")) {
      if (!this.browser.isFiltered() || this.fitValueAxis.get()) {
        // resets to default scale
        this.refreshScaleValue();
      } else {
        this.rd.refreshRecordVis();
      }
    } else if (this.isTimeseriesChange()) {
      this.refreshScaleValue();
    }

    this.refreshLineOpacity();
  }

  /** -- */
  addAnnotations() {
    if (!this.rd.config.timeSeriesAnnotations) return;

    this.DOM.ts_annotations
      .selectAll("div.annotation")
      .data(
        this.rd.config.timeSeriesAnnotations
          .filter((_) => _._time <= this.timeRange.max._time)
          .filter((_) => _._time >= this.timeRange.min._time),
        (_) => _._time
      )
      .join(
        (enter) =>
          enter
            .append("div")
            .attr("class", "annotation")
            .call((annotation) => {
              annotation.append("div").attr("class", "line");
              annotation.append("div").attr("class", "annotIcon fa fa-clock");
              annotation
                .append("div")
                .attr("class", "textBox")
                .call((textBox) => {
                  textBox
                    .append("div")
                    .attr("class", "timeText")
                    .text((_) => _._time_src);
                  textBox
                    .append("div")
                    .attr("class", "freeText")
                    .text((_) => _._text);
                });
            }),
        (update) => update,
        (exit) => exit.remove()
      )
      .style("left", (_) => this.scale_Time(_._time) + "px");
  }

  refreshLineOpacity() {
    var screenHeight = Math.abs(
      this.scale_Value.range()[1] - this.scale_Value.range()[0]
    );
    var _ratio = screenHeight / this.browser.allRecordsAggr.recCnt("Active");

    var _opacity = Math.max(0.4, Math.min(1.0, _ratio / 25)); // between 0.2 and 1

    var colorScheme = d3.schemeCategory10;

    var strokeWidth = 2;
    if (_ratio < 50) {
      strokeWidth = 2;
    } else if (_ratio < 70) {
      strokeWidth = 3;
    } else if (_ratio < 100) {
      strokeWidth = 4;
    } else {
      strokeWidth = 5;
    }

    this.DOM.kshfRecords
      .selectAll("path")
      .style(
        "opacity",
        (r: Record) => (((r.recordOrder % 3) + 10) / 11) * _opacity
      ) // slight variation opacity to differentiate
      .style("stroke", (r: Record) => colorScheme[r.recordOrder % 12])
      .style("stroke-width", strokeWidth);

    this.DOM.kshfRecords
      .selectAll(".recordText_Dot")
      .style(
        "background-color",
        (r: Record) => colorScheme[r.recordOrder % 12]
      );
  }

  /** -- */
  refreshLabelOverlaps() {
    if (!this.timeseriesAttrib) return;

    var maxTime: number = this.scale_Time.domain()[1].getTime();
    var lastTime: string = this.timeseriesAttrib.timeKeys.find(
      (tk: TimeKey) => tk._time.getTime() === maxTime
    )._time_src;

    var spacer = new LabelSpacer();

    var _compareKey: string = this.timeSeriesChangeVsTimeKey.get()?._time_src || null;

    this.browser.records.forEach((record) => {
      record._view._labelHidden = true;
      record._view._labelPos = 0;

      if (!record.filteredOut && this.recordInView(record)) {
        var _keyIndex = this.timeseriesAttrib.getRecordValue(record)?._keyIndex;
        var v = _keyIndex[lastTime];
        if (v) {
          var m = this.scale_Value(v._value);
          if (m !== null && isFinite(m) && !isNaN(m)) {
            record._view._labelHidden = false;
            var ref = this.isTimeseriesChange()
              ? _keyIndex[_compareKey]._value
              : 0;
            record._view._labelPos = this.y_Generator(v, ref);
          }
        }
      }

      d3.select(record.DOM.record)
        .select("foreignObject")
        .classed("hidden", record._view._labelHidden);
    });

    var gapOffset = 14;

    Array.from(
      this.browser.records.filter((record) => !record._view._labelHidden)
    )
      .sort((r1, r2) => r1._view._labelPos - r2._view._labelPos)
      .forEach((record) => {
        var fo = d3.select(record.DOM.record).select("foreignObject");

        var intersectsWith = spacer.intersectsWith(record._view._labelPos);

        var overlaps;

        if (intersectsWith) {
          let intersectsWithRecord = intersectsWith._entity;

          // intersectsWith is above current record
          // try to move it above to create extra space
          spacer.usedList = spacer.usedList.filter(
            (_) => _._entity !== intersectsWithRecord
          );

          var _temp = Math.max(
            record._view._labelPos - gapOffset,
            intersectsWithRecord._view._labelPos - gapOffset / 2
          );

          if (spacer.isEmpty(_temp)) {
            d3.select(intersectsWithRecord.DOM.record)
              .select("foreignObject")
              .attr("y", _temp - 8);
            intersectsWithRecord._view._labelPos = _temp;
          }

          // insert back
          spacer.insertUsed(
            intersectsWithRecord._view._labelPos,
            gapOffset,
            intersectsWithRecord
          );

          var targetPos = Math.min(
            intersectsWithRecord._view._labelPos + gapOffset
          );
          if (
            spacer.isEmpty(targetPos) &&
            targetPos <= record._view._labelPos + 10
          ) {
            record._view._labelPos = targetPos;
          } else {
            overlaps = true;
          }
        }

        fo.classed("overlapping", overlaps);

        fo.attr("y", record._view._labelPos - 8);
        if (!overlaps) {
          spacer.insertUsed(record._view._labelPos, gapOffset, record);
        }
      });
  }

  /** -- */
  refreshTimeSeriesPlotType() {
    if (!this.ts_Type) return;
    if (!this.timeseriesAttrib) return;

    this.DOM.root.attr("data-ts_Type", this.ts_Type);
    this.refreshYGenerator();

    if (this.ts_Type.is("Rank")) {
      this.timeseriesAttrib.computeRecordRanks();
    }

    if (this.isTimeseriesChange()) {
      this.DOM.root.select(".MouseMode-filter").style("display", "none");
      if (this.rd.visMouseMode === "filter") {
        this.rd.visMouseMode = "pan";
        this.DOM.root.attr("visMouseMode", this.rd.visMouseMode);
      }
    } else {
      this.DOM.root.select(".MouseMode-filter").style("display", null);
    }

    this.DOM.root
      .select(".recordAxis_X > .keyLine")
      .style("display", this.isTimeseriesChange() ? "block" : null);

    this.refreshScaleValue();
  }

  /** -- */
  refreshRecordVis() {
    if (!this.ts_Type) return;
    if (!this.timeseriesAttrib) return;
    if (!this.DOM.recordBase_Timeseries) return;
    if (!this.DOM.kshfRecords) return;
    if (!this.y_Generator) return;
    if (!this.timeseriesAttrib.aggr_initialized) return;

    var x_Generator = (d) => this.scale_Time(d._time);

    var timeDomain = this.scale_Time.domain();
    var inTimeDomain = (d) =>
      d._time >= timeDomain[0] && d._time <= timeDomain[1];

    // This basically extends the draw area +/- time keys. These are out of the screen, but helps
    // generate smooth looking animations.
    var timeKeys = this.timeseriesAttrib.timeKeys;
    var drawMinTime =
      timeKeys[Math.max(this.timeRange.min._index - 5, 0)]._time;
    var drawMaxTime =
      timeKeys[Math.min(this.timeRange.max._index + 5, timeKeys.length - 1)]
        ._time;
    var inWiderTimeDomain = (d) =>
      d._time >= drawMinTime && d._time <= drawMaxTime;

    var _compareKey = this.timeSeriesChangeVsTimeKey.get()?._time_src || "";

    var _refVal;

    var lineGenerator = d3
      .line()
      .curve(this.ts_Type.is("Rank") ? d3.curveLinear : d3.curveMonotoneX)
      .x(x_Generator)
      .y((d) => this.y_Generator(d, _refVal))
      .defined((d) => {
        if (!inWiderTimeDomain(d)) return false;
        var v = this.y_Generator(d, _refVal);
        return v != null && isFinite(v) && !isNaN(v);
      });

    var topGap = 15;

    this.scale_Value.rangeRound([this.rd.curHeight - (topGap + 100), topGap]);

    var slopeOnly = this.ts_timeKeysStep.is("limits");

    var timeKeys_src = {};
    this.timeKeys_Active.forEach((_) => {
      timeKeys_src[_._time_src] = true;
    });

    var lineSelect = this.DOM.kshfRecords
      .attr("transform", null)
      .style("transform", null)
      .classed("noTimeSeries", (record) => !this.recordInView(record))
      .each((record, i, nodes) => {
        if (!this.recordInView(record) || record.filteredOut) return;

        var ts = this.timeseriesAttrib.getRecordValue(record);
        if (!ts) return;

        _refVal = ts._timeseries_.find(
          (x: TimeData) => x._time_src === _compareKey
        )?._value;

        var td: TimeData[] = ts._timeseries_.filter(inTimeDomain);

        if (slopeOnly) {
          td = td.filter((d: TimeData) => timeKeys_src[d._time_src]);
        }

        d3.select(nodes[i])
          .select(".dotGroup")
          .selectAll(".timeSeriesDot")
          .data(td, (d: TimeData) => d._time.getTime())
          .join(
            (enter) =>
              enter
                .append("circle")
                .attr("class", "timeSeriesDot")
                .attr("r", 3),
            (update) => update,
            (exit) => exit.remove()
          )
          .each((d: TimeData, i, nodes) => {
            d.DOM = nodes[i];
          })
          .attr("cx", x_Generator)
          .attr("cy", (d: TimeData) => this.y_Generator(d, _refVal))
          .style("display", (d: TimeData) => {
            var v = this.y_Generator(d, _refVal);
            return v != null && isFinite(v) && !isNaN(v) ? null : "none";
          });
      })
      .call((rec) => {
        rec
          .selectAll("foreignObject")
          .attr("x", this.scale_Time.range()[1] + 16)
          .on("mouseenter", (_event, record) =>
            this.rd.onRecordMouseOver(record)
          )
          .on("mouseleave", (_event, record) =>
            this.rd.onRecordMouseLeave(record)
          );
      })
      .selectAll("path")
      .attr("fill", "none");

    var dPath = (record) => {
      if (record.filteredOut) return;
      var _td: TimeData[] =
        this.timeseriesAttrib.getRecordValue(record)?._timeseries_;
      if (!_td) return;

      _refVal = _td.find((x) => x._time_src === _compareKey)?._value;

      if (slopeOnly) {
        _td = _td.filter((d) => timeKeys_src[d._time_src]);
      }
      return lineGenerator(_td);
    };

    if (this.rd.timeseriesAnimInterval) {
      var x_Generator_store = x_Generator;
      x_Generator = (d) => this.scale_Time_prev(d._time);
      lineGenerator.x(x_Generator);
      // no transition
      lineSelect.transition().duration(200).attr("d", dPath);
      x_Generator = x_Generator_store;
      lineGenerator.x(x_Generator);
    }

    // with transition
    lineSelect
      .transition()
      .duration(700)
      .ease(d3.easePoly.exponent(3))
      .delay(0)
      .attr("d", dPath);

    this.refreshLabelOverlaps();

    this.refreshLineOpacity();
  }

  refreshAttribUnitName(attrib: Attrib) {
    this.refreshTicks_AxisY();
  }
}
