import { Browser } from "../Browser";
import { TimeKey } from "../TimeSeriesData";
import { Record } from "../Record";
import { i18n } from "../i18n";
import { Util } from "../Util";
import { Attrib } from "../Attrib";

import { max } from "d3-array";
import { select } from "../d3_select";
import { scaleLinear } from "d3-scale";
import { Attrib_Timeseries } from "../Attrib_Timeseries";
import { Modal } from "./Modal";
import { RecordDetailSpec } from "../Types";

const d3 = {
  select,
  max,
  scaleLinear,
};

export class RecordDetailPopup {
  browser: Browser;
  recordInDetail?: Record;

  timeKeyInDetail?: TimeKey;
  recordDetailTimeKeys?: TimeKey[];

  recordDetailAttribs?: string[] = [];
  recordDetailAttribs_Hidden?: string[];

  constructor(browser: Browser) {
    this.browser = browser;

    if (this.browser.options.recordDetailAttribs) {
      this.recordDetailAttribs = Array.from(
        this.browser.options.recordDetailAttribs
      );
    }
  }

  get DOM() {
    return this.browser.DOM;
  }

  initDOM() {
    var overlay_recordDetails = this.DOM.overlay_wrapper
      .append("div")
      .attr("class", "overlay_content overlay_recordDetails");
    overlay_recordDetails.append("div").attr("class", "overlay_Header");
    overlay_recordDetails
      .append("div")
      .attr("class", "overlay_Close fa fa-window-close")
      .tooltip(i18n.Close, { placement: "bottom" })
      .on("click", () => this.closeRecordDetailPanel());
    overlay_recordDetails
      .append("div")
      .attr("class", "filterOutRecord fa fa-filter")
      .tooltip(i18n["Filter out"], { placement: "bottom" })
      .on("click", () => {
        this.browser.recordDisplay.recordFilter.removeRecord(
          this.recordInDetail
        );
        this.DOM.overlay_wrapper.attr("show", "none");
      });
    this.DOM.overlay_recordDetails_content = overlay_recordDetails
      .append("div")
      .attr("class", "content");
  }

  /** -- */
  prepareRecordDetailColumns() {
    this.browser.attribs.forEach((attrib) => {
      if (attrib.hasTimeSeriesParent()) return;
      if (attrib.attribName === "_Records") return;
      attrib.initializeAggregates();
      this.recordDetailAttribs.push(attrib.attribName);
    });

    this.recordDetailAttribs.sort((name1, name2) => {
      var s1 = this.browser.attribWithName(name1);
      var s2 = this.browser.attribWithName(name2);
      if (!s1) return -1;
      if (!s2) return 1;
      var diff =
        Util.getAttribTypeOrder(s1.type) - Util.getAttribTypeOrder(s2.type);
      return diff
        ? diff
        : Util.sortFunc_List_String(s1.attribName, s2.attribName);
    });
  }

  /** -- */
  updateRecordDetailPanel_Header(record) {
    var idSummary = this.browser.attribWithName(this.browser.idSummaryName);
    idSummary.initializeAggregates();

    var overlay_Header = this.DOM.overlay_wrapper.select(
      ".overlay_recordDetails > .overlay_Header"
    );
    overlay_Header.html("");

    overlay_Header
      .append("span")
      .attr("class", "idSummaryName")
      .html(idSummary.attribName);

    var disableRecordSelectBox = this.browser.records.length >= 2500;
    var _ = overlay_Header
      .append("span")
      .attr("class", "idContentWrapper")
      .classed("disabled", disableRecordSelectBox);
    _.append("span")
      .attr("class", "theText")
      .html(idSummary.getRecordValue(record));

    if (!disableRecordSelectBox) {
      _.append("select").on("change", (event) => {
        this.updateRecordDetailPanel(
          event.currentTarget.selectedOptions[0].__data__[0]
        );
      });
      _.select("select").selectAll("option").remove();

      _.select("select")
        .selectAll("option")
        .data(
          this.browser.records
            .map((r) => [r, idSummary.getRecordValue(r)])
            .sort((a, b) => Util.sortFunc_List_String(a[1], b[1]))
        )
        .enter()
        .append("option")
        .attr("selected", (r) => (r[0].id === record.id ? true : null))
        .html((r) => r[1]);
    }
  }

  /** -- */
  closeRecordDetailPanel() {
    if (!this.recordInDetail) return;
    this.recordInDetail = null;

    this.browser.options.onRecordClose?.call(this);

    this.DOM.overlay_wrapper.attr("show", "none");
  }
  /** -- */
  updateRecordDetailPanel(record: Record) {
    this.recordInDetail = record;

    this.DOM.overlay_wrapper
      .attr("show", "recordDetails")
      .classed("easyDismiss", true);

    this.updateRecordDetailPanel_Header(record);

    if (this.browser.options.onRecordView) {
      this.DOM.overlay_recordDetails_content.html(
        this.browser.options.onRecordView.call(record.data, record)
      );
      return;
    }

    if (this.recordDetailAttribs.length === 0) {
      this.prepareRecordDetailColumns();
    }

    // extend the "hidden" list based on what this record also contains
    this.recordDetailAttribs_Hidden = [];
    this.browser.attribs.forEach((attrib) => {
      attrib.initializeAggregates();

      if (attrib.hasTimeSeriesParent()) return;
      if (this.recordDetailAttribs.indexOf(attrib.attribName) >= 0) return;
      if (attrib.getRecordValue(record) == null) return;

      this.recordDetailAttribs_Hidden.push(attrib.attribName);
    });

    var menuOpt = {
      name: "Edit order",
      items: [
        {
          name: "▲ Move up",
          do: (summary) => {
            var movedSummaryName = summary.summaryName;
            var _i = this.recordDetailAttribs.indexOf(movedSummaryName);
            if (_i == -1 || _i === 0) return;
            this.recordDetailAttribs.splice(_i, 1);
            this.recordDetailAttribs.splice(_i - 1, 0, movedSummaryName);
            this.updateRecordDetailPanel(record);
          },
        },
        {
          name: "▼ Move down",
          do: (summary) => {
            var movedSummaryName = summary.summaryName;
            var _i = this.recordDetailAttribs.indexOf(movedSummaryName);
            if (_i == -1 || _i === this.recordDetailAttribs.length - 1) return;
            this.recordDetailAttribs.splice(_i, 1);
            this.recordDetailAttribs.splice(_i + 1, 0, movedSummaryName);
            this.updateRecordDetailPanel(record);
          },
        },
        {
          name: "Remove",
          iconClass: "fa fa-minus-square",
          do: (a) => {
            this.recordDetailAttribs = this.recordDetailAttribs.filter(
              (c) => c !== a.attribName
            );
            this.updateRecordDetailPanel(record);
          },
        },
        {
          name: "Add below",
          iconClass: "fa fa-plus-square",
          when: () => this.recordDetailAttribs_Hidden.length > 0,
          do: (selectedSummary, summaryNameToAdd) => {
            // add to visible list
            var pos = this.recordDetailAttribs.indexOf(
              selectedSummary.attribName
            );
            if (pos === -1) return;
            this.recordDetailAttribs.splice(pos + 1, 0, summaryNameToAdd);
            // remove from hidden list
            this.recordDetailAttribs_Hidden =
              this.recordDetailAttribs_Hidden.filter(
                (hc) => hc !== summaryNameToAdd
              );
            this.updateRecordDetailPanel(record);
          },
          options: this.recordDetailAttribs_Hidden.map((c) => ({
            name: c,
            value: c,
          })),
        },
      ],
    };

    // create the hierarchical outline!
    var outline = {
      _basic: [],
      _timeseries: [],
    };

    this.recordDetailAttribs.forEach((attribName) => {
      if (attribName === this.browser.idSummaryName) return;
      var attrib = this.browser.attribWithName(attribName);
      if (!attrib) return;
      var v = attrib.getRecordValue(record);
      if (v == null) return;
      if (v.length === 0) return;

      var _outline =
        attrib.type === "timeseries" ? outline._timeseries : outline._basic;

      attrib.pathName.forEach((path) => {
        if (
          !_outline.some((item) => {
            if (item instanceof Attrib) return false;
            if (item.path === path) {
              _outline = item.items;
              return true;
            }
            return false;
          })
        ) {
          // path not found
          var _ = {
            path: path,
            items: [],
          };
          _outline.push(_);
          _outline = _.items;
        }
      });

      _outline.push(attrib);
    });

    // if a summary has a printName same as its last path name, move it under to last path
    ["_basic", "_timeseries"].forEach((p) => {
      var proc = (_outline) =>
        _outline.filter((item) => {
          if (item.path) {
            item.items = proc(item.items);
            return true;
          }
          return !_outline.some((item2, i) => {
            if (item2 instanceof Attrib) return false;
            if (item2.path === item.printName) {
              item2.items.unshift(item);
              return true;
            }
            return false;
          });
        });
      outline[p] = proc(outline[p]);
    });

    var getMaxDepth = (_outline) =>
      _outline.reduce((accum, item) => {
        return !item.path
          ? accum
          : 1 + d3.max(item.items, (_) => (_.items ? getMaxDepth(_.items) : 1));
      }, 0);

    var maxDepth = getMaxDepth(outline._timeseries);

    // removes any content that was here previously.
    this.DOM.overlay_recordDetails_content.html("");

    var _table = this.DOM.overlay_recordDetails_content
      .append("table")
      .attr("class", "recordAttribTable");

    var renderRecordValues = (tbody, items, prevPath) => {
      var rowsDOM = tbody
        .selectAll("tr.nonexistent")
        .data(items)
        .enter()
        .append("tr");

      var lastPath = prevPath[prevPath.length - 1] || "";

      var addHWrapper = (_td) => {
        _td
          .append("div")
          .attr("class", "attribHierarchyWrapper")
          .call((_div) => {
            _div
              .filter((s) => !s.printName || s.printName === lastPath)
              .append("span")
              .attr("class", "hrchyItem collapseArrow")
              .on("click", () =>
                _td.node().parentNode.parentNode.classList.toggle("collapsed")
              )
              .append("span")
              .attr("class", "fa fa-caret-down")
              .tooltip("Show/Hide components");
            _div
              .selectAll("span.extendLine")
              .data((s) => Array.from(prevPath).filter((_) => _ != s.printName))
              .enter()
              .append("span")
              .attr("class", "hrchyItem extendLine");
          });
      };

      var addRecAttribName = (_tr) => {
        _tr
          .append("td")
          .attr("class", "recAttribName")
          .call((recAttribName) => {
            recAttribName
              .filter((attrib) => attrib.description)
              .append("span")
              .attr("class", "summaryDescription far fa-info-circle")
              .tooltip((_) => _.description, { placement: "bottom" });
            recAttribName
              .append("span")
              .attr("class", "TheName")
              .style(
                "font-size",
                Math.pow(1.1, maxDepth - prevPath.length) + "em"
              )
              .html((attrib) => attrib.printName.trim()); //+("<i class='fa fa-level-up'></i>").repeat(prevPath.length));
            recAttribName
              .append("span")
              .attr("class", "modifyAttribPos fa fa-bars")
              .on("click", (event, attrib) =>
                Modal.popupMenu(event, menuOpt, attrib)
              );
            addHWrapper(recAttribName);
          });
      };

      rowsDOM
        .filter((_) => !(_ instanceof Attrib_Timeseries))
        .attr("class", "attribRow basicAttrib")
        .classed("groupTitle", (s) => s.printName === lastPath)
        .attr("summaryID", (s) => s.attribID)
        .each((attrib, i, nodes) => {
          if (!(attrib instanceof Attrib)) return;

          var _tr = d3.select(nodes[i]);

          attrib.initializeAggregates();

          addRecAttribName(_tr);

          var _recAttribVal = _tr
            .append("td")
            .attr("class", "recAttribVal")
            .attr("colspan", 5);

          attrib.renderRecordValue(record, _recAttribVal);
        });

      rowsDOM
        .filter((_) => _ instanceof Attrib_Timeseries)
        .attr("class", "attribRow timeseriesAttrib")
        .classed("groupTitle", (s) => s.printName === lastPath)
        .attr("summaryID", (s) => s.attribID)
        .call((_tr) => {
          addRecAttribName(_tr);

          _tr
            .append("td")
            .attr("class", "recTimeKeyValue")
            .call((td) => {
              td.append("div").attr("class", "ValueText");
              td.filter((s) => s.isComparable.val)
                .append("div")
                .attr("class", "ValueBar")
                .append("div")
                .attr("class", "TheBar");
            });
          _tr
            .append("td")
            .attr("class", "recTimeKeyChange")
            .tooltip("", { placement: "bottom" })
            .html("<i class='fa fa-angle-right'></i>");
          _tr.append("td").attr("class", "recTimeKeyRank");

          _tr
            .append("td")
            .attr("class", "recAttribVal")
            .each((attrib: Attrib_Timeseries, i, nodes) => {
              attrib.renderRecordValue(
                record,
                d3.select(nodes[i]),
                this.recordDetailTimeKeys
              );
            });
        });

      rowsDOM
        .filter((_) => !(_ instanceof Attrib))
        .attr("class", "groupedTableWrapper")
        .append("td")
        .append("table")
        .append("tbody")
        .attr("class", "groupedTable collapsed")
        .each((_item, i, nodes) => {
          var _tbody = d3.select(nodes[i]);
          if (_item.items[0].printName !== _item.path) {
            var _tr = _tbody.append("tr").attr("class", "groupTitle");
            _tr
              .append("td")
              .attr("class", "recAttribName")
              .call((groupName) => {
                groupName
                  .append("span")
                  .attr("class", "TheName")
                  .style(
                    "font-size",
                    Math.pow(1.1, maxDepth - prevPath.length) + "em"
                  )
                  .on("click", () =>
                    _tbody.node().classList.toggle("collapsed")
                  )
                  .html(_item.path.trim());
                addHWrapper(groupName);
              });
            _tr.append("td").attr("class", "groupNameGap");
          }

          renderRecordValues(
            _tbody,
            _item.items,
            prevPath.concat([_item.path])
          );

          //_tbody.append("tr").attr("class","groupCloseRow").append("td");
        });
    };

    renderRecordValues(
      _table.append("tbody").attr("class", "basicAttribs"),
      outline._basic,
      []
    );

    if (outline._timeseries.length > 0) {
      _table
        .append("tr")
        .style("height", "0.5em")
        .style("grid-column", "1 / span 5");

      var _tbody = _table.append("tbody").attr("class", "timeseriesAttribs");

      this.recordDetailTimeKeys = record.getTimeKeys();

      this.browser.recordDisplay.config.timeseriesWidth = Math.min(
        (this.recordDetailTimeKeys.length - 1) * 70,
        400
      );

      var _tr = _tbody.append("tr");
      _tr.append("td");
      var timeKeySelect = _tr
        .append("td")
        .attr("colspan", 3)
        .attr("class", "timeKeySelect");

      timeKeySelect
        .append("i")
        .attr("class", "prevTimeKey fa fa-caret-left")
        .tooltip(i18n.Previous)
        .on("click", () =>
          this.updateFocusedTimeKey(this.timeKey_Step("previous"))
        );
      timeKeySelect
        .append("select")
        .on("change", (event) =>
          this.updateFocusedTimeKey(
            event.currentTarget.selectedOptions[0].__data__
          )
        )
        .selectAll("option")
        .data(this.recordDetailTimeKeys, (x) => x._time)
        .enter()
        .append("option")
        .text((k) => k._time_src);
      timeKeySelect
        .append("i")
        .attr("class", "nextTimeKey fa fa-caret-right")
        .tooltip(i18n.Next)
        .on("click", () =>
          this.updateFocusedTimeKey(this.timeKey_Step("next"))
        );

      _tr.append("td").attr("class", "timeseriesEditView");

      var _tr = _tbody.append("tr").attr("class", "columnHead");
      _tr.append("td");
      _tr.append("td").attr("class", "columnHead_Value").text("Value");
      _tr.append("td").attr("class", "columnHead_Change").text("Change");
      _tr.append("td").attr("class", "columnHead_Rank").text("Rank");
      _tr
        .append("td")
        .attr("class", "columnHead_TimeTrends")
        .text("Time Trends");

      renderRecordValues(_tbody, outline._timeseries, []);

      this.updateFocusedTimeKey(this.recordDetailTimeKeys[0]);
    }

    // Some random Keshif project uses this to inject some code after main record display view. Hmmm...
    this["updateRecordDetailPanel_custom"]?.call(this, record);
  }

  /** -- */
  updateFocusedTimeKey(timeKey: TimeKey) {
    if (!this.recordInDetail || !timeKey) return;

    var _time_src: string = timeKey._time_src;

    var timeKeyPos: number = this.getTimeKey_Index(timeKey);
    if (timeKeyPos < 0) return; // cannot find the timeKey within the record

    this.timeKeyInDetail = timeKey;

    var prevTimeKey: TimeKey =
      timeKeyPos >= this.recordDetailTimeKeys.length - 1
        ? null
        : this.recordDetailTimeKeys[timeKeyPos + 1];

    d3.select(".timeKeySelect > .nextTimeKey").classed(
      "active",
      timeKeyPos !== 0
    );
    d3.select(".timeKeySelect > .prevTimeKey").classed(
      "active",
      timeKeyPos !== this.recordDetailTimeKeys.length - 1
    );

    var _table = this.DOM.overlay_recordDetails_content.select(
      "table.recordAttribTable"
    );

    _table
      .selectAll(".timeseriesAttribs tr:first-child > td > select > option")
      .data([timeKey], (x) => x._time)
      .node().selected = true;

    _table
      .selectAll(".timeseriesAttribs .recTimeKeyValue")
      .each((attrib: Attrib_Timeseries) => attrib.computeRecordRanks());
    _table
      .selectAll(".timeseriesAttribs .recTimeKeyValue > .ValueText")
      .html((attrib: Attrib_Timeseries) => {
        var ts = attrib.getRecordValue(this.recordInDetail);
        if (!ts) return "-";
        let v = ts._keyIndex[_time_src];
        if (!v) return "-";
        return attrib.getFormattedValue(v._value);
      });

    var clampScale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([0, 100])
      .clamp(true);

    _table
      .selectAll(".timeseriesAttribs .recTimeKeyValue > .ValueBar > .TheBar")
      .style("width", (attrib: Attrib_Timeseries) => {
        var ts = attrib.getRecordValue(this.recordInDetail);
        if (!ts) return null;
        var v = ts._keyIndex[_time_src];
        if (!v) return null;
        if (attrib.unitName === "%") {
          // value is measured in percentage anyway, and width is percentage of the box!
          return clampScale(v._value) + "%";
        }
        return clampScale(attrib.timeSeriesScale_Value(v._value) * 100) + "%"; // cannot exceed 100%
      });

    _table
      .selectAll(".timeseriesAttribs .recTimeKeyChange")
      .attr("data-status", (attrib: Attrib_Timeseries, i, nodes) => {
        var DOM = nodes[i];
        var diff: number = null,
          disp = "-",
          _title = "-",
          status = "noValue";
        var ts = attrib.getRecordValue(this.recordInDetail);
        if (!ts || ts.isEmpty()) {
          nodes[i].tippy.setContent("No data");
          return "";
        }
        if (prevTimeKey) {
          var prev = ts._keyIndex[prevTimeKey._time_src];
          var cur = ts._keyIndex[_time_src];
          if (prev && cur) diff = cur._value - prev._value;
          if (attrib.hasFlippedDomain()) diff *= -1; // flip
        }
        if (diff !== null) {
          var threshold = attrib.timeSeriesScale_Value.domain();
          threshold = Math.abs(threshold[1] - threshold[0]) / 50; // 1/50th of the range is the signal of change
          // TODO: make this a parameter
          if (diff > threshold) {
            status = "improve";
          } else if (diff < -threshold) {
            status = "decline";
          } else {
            status = "steady";
          }
          _title =
            `<b>Change from<br>${prevTimeKey._time_src} to ${_time_src}</b>:<br>` +
            attrib.getFormattedValue(diff);
        }
        nodes[i].tippy.setContent(_title);
        return status;
      });

    _table
      .selectAll(".timeseriesAttribs .recTimeKeyRank")
      .html((attrib: Attrib_Timeseries, i, nodes) => {
        var DOM = nodes[i];
        DOM.__NumRecords = 0;
        var ts = attrib.getRecordValue(this.recordInDetail);
        if (!ts || ts.isEmpty()) return "-";
        let v = ts._keyIndex[_time_src];
        if (!v || v._rank == 0) return "-";

        DOM.__NumRecords = this.browser.records.reduce(
          (accumulator, rec: Record) => {
            if (rec.filteredOut) return accumulator;

            var ts = attrib.getRecordValue(rec);
            if (!ts || ts.isEmpty()) return accumulator;

            let _val = ts._keyIndex[_time_src];
            if (_val == null) return accumulator;

            return accumulator + 1;
          },
          0
        );

        return `<span class='rankValue'>${v._rank}</span><span class='rankOutOf'>${DOM.__NumRecords}</span>`;
      })
      .tooltip("")
      .on("mouseover", (event) => {
        var DOM = event.currentTarget;
        // TODO: consider only records that have valid values
        // need to process per each row/attribute -
        // of the ones that are active, do not consider those that do not have a value for the
        DOM.tippy.setContent(
          "Ranking among " +
            DOM.__NumRecords +
            (this.browser.isFiltered() ? " filtered " : " ") +
            this.browser.recordName
        );
      });

    var DOMdots = _table.selectAll(".recordTimeseriesDot");

    var refreshedCurrentKeyClass = (altKey) => {
      DOMdots.classed(
        "currentKey",
        (d) => d._time.getTime() === altKey._time.getTime()
      );
    };

    _table
      .selectAll(".recordTimeseriesDot")
      .classed(
        "currentKey",
        (d) => d._time.getTime() === timeKey._time.getTime()
      )
      .on("mouseover", (_event, x) => refreshedCurrentKeyClass(x))
      .on("mouseout", () => refreshedCurrentKeyClass(timeKey));

    refreshedCurrentKeyClass(timeKey);

    // Another project-specific customization that should be in the core in a different way
    this["updateFocusedTimeKey_custom"]?.();
  }

  getTimeKey_Index(timeKey) {
    return this.recordDetailTimeKeys.findIndex(
      (tK) => tK._time.getTime() == timeKey._time.getTime()
    );
  }

  /** next or previous */
  timeKey_Step(sequence) {
    if (!(sequence === "next" || sequence === "previous")) return null;
    var timeKeyPos = this.getTimeKey_Index(this.timeKeyInDetail);
    if (timeKeyPos < 0) return null;
    return (
      this.recordDetailTimeKeys[timeKeyPos + (sequence === "next" ? -1 : 1)] ||
      null
    );
  }

  exportConfig(): RecordDetailSpec {
    return {
      recordInDetail: this.recordInDetail?.id,
      recordDetailAttribs: this.recordDetailAttribs
        ? Array.from(this.recordDetailAttribs)
        : undefined,
    };
  }
}
