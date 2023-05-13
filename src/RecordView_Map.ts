import { select, pointer } from "./d3_select";
import { easePoly, easePolyOut } from "d3-ease";
import { interpolate } from "d3-interpolate";
import { geoPath, geoTransform } from "d3-geo";
import { hsl } from "d3-color";
import { arc } from "d3-shape";

import { Attrib } from "./Attrib";
import { Aggregate_PointCluster } from "./Attrib_RecordGeo";
import { Base } from "./Base";
import { RecordVisCoding, CompareType } from "./Types";
import { RecordDisplay } from "./RecordDisplay";
import { RecordView } from "./RecordView";
import { Util } from "./Util";
import { Record } from "./Record";
import { Attrib_Interval } from "./Attrib_Interval";

const d3 = {
  select,
  pointer,
  geoPath,
  geoTransform,
  easePolyOut,
  easePoly,
  interpolate,
  hsl,
  arc,
};

declare let L: any;

export class RecordView_Map extends RecordView {
  extendRecordDOM(newRecords) {
    if (this.geoAttrib.geoType === "Point") {
      if (this.rd.config.mapUsePins) {
        newRecords
          .append("path")
          .attr("class", "glyph_Main")
          .attr("d", Base.map.pinGlyphPath)
          .attr("transform", "scale(0.0001)");
      } else {
        this.extendRecordDOM_Point(newRecords);
      }
    } else {
      newRecords.append("path").attr("class", "glyph_Main");
    }
  }

  mapConfig: any;

  recordGeoPath: any;

  /** -- */
  updateAfterFilter(how: any) {
    this.updateRecordVisibility();
    this.refreshRecordColors();
    if (this.geoAttrib.geoType === "Point") {
      this.refreshRecordVis();
    }
  }

  /** -- */
  refreshRecordSizes() {
    if (this.geoAttrib.geoType !== "Point") return;
    if (!this.DOM.recordGroup) return;

    var pathSelection = this.DOM.recordGroup
      .selectAll(".kshfRecord > path")
      .transition()
      .duration(700)
      .ease(d3.easePolyOut.exponent(3));

    if (!this.rd.config.mapUsePins) {
      pathSelection.attr("d", (record) => this.rd.recordDrawArc(record)());
      //
    } else {
      pathSelection.attr(
        "transform",
        `scale(${this.rd.getMaxSizeScaleRange() / 15})`
      );
    }

    this.DOM.recordGroup
      .selectAll(".kshfRecord > .sizeValueText")
      .html((record) => record.measure_Self);

    this.refreshPointClusterVis();
  }

  /** -- */
  async prepareAttribs() {
    if (!this.rd.codeBy.geo) {
      await this.rd.setAttrib("geo", this.rd.config.geoBy || 0);
    }
    if (!this.rd.codeBy.color && this.rd.config.colorBy) {
      await this.rd.setAttrib("color", this.rd.config.colorBy);
    }
    if (!this.rd.codeBy.size && this.rd.config.sizeBy) {
      await this.rd.setAttrib("size", this.rd.config.sizeBy);
    }
    return Promise.resolve(true);
  }

  initView() {
    if (!this.initialized) {
      this.zoomToFit();
    }

    if (this.geoAttrib.geoType === "Point") {
      this.refreshPointClusters();
    }
    this.refreshPointDOM();

    this.refreshRecordVis();
    this.refreshRecordColors();
    this.refreshRecordSizes();
    // width of color legend area may change, so refresh this
    this.rd.refreshColorLegend();
    this.rd.refreshSizeLegend(); // needed to reset usesSizeAttrib class
  }

  async initView_DOM() {
    // Do not initialize twice
    if (this.DOM.recordBase_Map) {
      this.DOM.recordGroup = this.DOM.recordMap_SVG.select(".recordGroup");
      this.DOM.kshfRecords = this.DOM.recordGroup.selectAll(".kshfRecord");
      this.DOM.kshfRecords_Path = this.DOM.recordGroup.selectAll(
        ".kshfRecord > path.glyph_Main"
      );

      this.leafletRecordMap.invalidateSize(); // chart area may have changed
      return;
    }

    if (!(window as any).L) {
      await import("leaflet");
    }

    var me = this;

    this.DOM.recordBase_Map = this.rd.DOM.recordDisplayWrapper
      .append("div")
      .attr("class", "recordBase_Map");

    this.mapConfig = Util.mergeConfig(Base.map, this.rd.config.mapConfig || {});

    function resetPointSizes() {
      if (this.geoAttrib.geoType === "Point") {
        if (!this.rd.config.mapUsePins) {
          this.DOM.recordGroup
            .selectAll(".kshfRecord > path")
            .attr("d", Util.getCirclePath());
        } else {
          this.DOM.recordGroup
            .selectAll(".kshfRecord > path")
            .attr("transform", "scale(0.0001)");
        }
      }
    }

    this.leafletRecordMap = L.map(
      this.DOM.recordBase_Map.node(),
      this.mapConfig.leafConfig
    )
      .on("viewreset", function () {
        if (!this._zoomInit_) return;
        this._zoomInit_ = null;
        me.rd.DOM.recordDisplayWrapper.classed("dragging", false);
        me.refreshRecordVis();
      })
      .on("movestart", function () {
        me.rd.DOM.recordDisplayWrapper.classed("dragging", true);
        me.browser.DOM.root.classed("noPointerEvents", true);
        resetPointSizes.call(me);
        this._zoomInit_ = this.getZoom();
      })
      .on("moveend", function () {
        me.rd.DOM.recordDisplayWrapper.classed("dragging", false);
        me.browser.DOM.root.classed("noPointerEvents", false);
        me.rd.refreshViz_Compare_All();
        me.rd.refreshRecordVis();
        this._zoomInit_ = null;
      })
      // When zoom is triggered by fly, the leaflet-zoom-anim is not set.
      .on("zoomstart", () => {
        resetPointSizes.call(this);
        d3.select(this.leafletRecordMap.getPane("mapPane"))
          .classed("leaflet-zoom-anim", true);
      })
      .on("zoomend", () => {
        d3.select(this.leafletRecordMap.getPane("mapPane"))
          .classed("leaflet-zoom-anim", false);
      });

    if (!this.mapConfig.tileConfig.disabled) {
      this.leafletRecordMap.addLayer(new L.TileLayer(
        this.mapConfig.tileTemplate,
        this.mapConfig.tileConfig
      ));
    }

    this.leafletRecordMap.attributionControl.setPosition("topright");

    this.recordGeoPath = d3.geoPath().projection(
      d3.geoTransform({
        point: function (x: number, y: number) {
          var point = me.leafletRecordMap.latLngToLayerPoint(
            new L.latLng(y, x)
          );
          this.stream.point(point.x, point.y);
        },
      })
    );

    this.recordGeoPath.pointRadius(this.rd.recordPointSize.get());

    this.DOM.recordBase_Map.select(".leaflet-tile-pane");

    this.DOM.recordMap_SVG = d3
      .select(this.leafletRecordMap.getPanes().overlayPane)
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("class", "recordMap_SVG");

    var _defs = this.DOM.recordMap_SVG.append("defs");

    _defs
      .append("filter")
      .attr("id", "pointDropShadow")
      .attr("height", "200%")
      .attr("width", "200%")
      .call((filter) => {
        filter
          .append("feGaussianBlur")
          .attr("in", "SourceAlpha")
          .attr("stdDeviation", 3);
        filter
          .append("feOffset")
          .attr("dx", 2)
          .attr("dy", 2)
          .attr("result", "offsetblur");
        filter
          .append("feComponentTransfer")
          .append("feFuncA")
          .attr("type", "linear")
          .attr("slope", 0.5);
        filter.append("feMerge").call((merge) => {
          merge.append("feMergeNode");
          merge.append("feMergeNode").attr("in", "SourceGraphic");
        });
      });

    // The fill pattern definition in SVG, used to denote geo-objects with no data.
    // http://stackoverflow.com/questions/17776641/fill-rect-with-pattern
    _defs
      .append("pattern")
      .attr("id", "diagonalHatch")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 4)
      .attr("height", 4)
      .append("path")
      .attr("d", "M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2")
      .attr("stroke", "gray")
      .attr("stroke-width", 1);

    this.DOM.clusterGroup = this.DOM.recordMap_SVG
      .append("g")
      .attr("class", "leaflet-zoom-hide clusterGroup");

    this.DOM.recordGroup = this.DOM.recordMap_SVG
      .append("g")
      .attr("class", "leaflet-zoom-hide recordGroup");
  }

  async finishSetAttrib(t: RecordVisCoding) {
    if (t === "color") {
      this.refreshRecordColors();
      //
    } else if (t === "geo") {
      this.rd.config.geo = this.geoAttrib.attribName;

      this.DOM.root.attr("data-geotype", this.geoAttrib.geoType);

      this.DOM.root.select(".mapView-UnmatchedData")
        .classed("active", this.geoAttrib.noValueAggr.records.length > 0);

      if (this.geoAttrib.geoType === "Point") {
        this.geoAttrib.setPointClusterRadius(this.rd.config.pointClusterRadius, this.leafletRecordMap);

        // size
        if (!this.rd.codeBy.size && this.rd.config.sizeBy) {
          await this.rd.setAttrib("size", this.rd.config.sizeBy);

        } else {
          this.rd.refreshAttribOptions("size");
        }
        // color
        this.rd.refreshAttribOptions("color");
        // prapare color cache
        await this.geoAttrib.prepPointCluster(this.leafletRecordMap);
      }
    }
  }

  refreshSelect_Compare(cT: CompareType = null, status: boolean = false) {
    if (!this.isComparable()) return;

    // update rendering of point clusters
    if (this.rd.hasAggregates()) {

      // compute "offset" for each aggregate
      this.geoAttrib._aggrs.forEach((aggr: Aggregate_PointCluster) => {
        let _offset = 0;
        aggr._glyphOrder = {};
        // re-order the comparisons so that the larger ones come first
        this.browser.activeComparisons
          .slice()
          .sort((a: CompareType, b: CompareType) => aggr.measure(b) - aggr.measure(a))
          .forEach((cT2, i_cT: number) => {
            aggr._glyphOrder[cT2] = i_cT;
            aggr.setOffset(cT2, _offset);
            _offset += aggr.measure(cT2);
          });
      });

      const sideBySide = this.browser.stackedCompare.is(false);
      const numComparisons = this.browser.activeComparisonsCount;
      this.browser.activeComparisons.forEach((cT2) => {
        this.DOM["clusterGlyphs_" + cT2]
          .style("stroke-width", (aggr) => {
            if (!sideBySide) return 0;
            return aggr.cluster._radius / numComparisons;
          })
          .transition()
          .ease(d3.easePoly.exponent(3))
          .duration(700)
          .attrTween("d", (aggr, i, nodes) => {
            const DOM = nodes[i];
            const offset = sideBySide
              ? 0
              : aggr.offset(cT2) / (aggr.measure("Active") || 1);
              const angleInterp = d3.interpolate(
                DOM._currentPreviewAngle,
                aggr.ratioToActive(cT2)
              );
            let r = aggr.cluster._radius;
            if (sideBySide) {
              r -=
                (aggr._glyphOrder[cT2] + 0.5) *
                (aggr.cluster._radius / numComparisons);
            }
            return (t: number) => {
              const newAngle = angleInterp(t);
              DOM._currentPreviewAngle = newAngle;
              return Util.getPieSVGPath(offset, newAngle, r - 1, sideBySide);
            };
          });
      });
    }

    // normal comparison rendering
    super.refreshSelect_Compare(cT, status);
  }
  // map / point

  leafletRecordMap: L.Map;

  constructor(rd: RecordDisplay, _config) {
    super(rd);
  }

  refreshQueryBox_Filter(bounds = null) {
    if (this.rd.collapsed) return;
    let isVisible: boolean = false;

    if (typeof L === "undefined") {
      throw Error("Leaflet not initialized");
    }

    let north_west: L.Point, south_east: L.Point;
    if (bounds === null) {
      isVisible = this.geoAttrib.isFiltered();
      if (!isVisible) return;
      north_west = this.leafletRecordMap.latLngToLayerPoint(
        this.geoAttrib.summaryFilter.bounds.getNorthWest()
      );
      south_east = this.leafletRecordMap.latLngToLayerPoint(
        this.geoAttrib.summaryFilter.bounds.getSouthEast()
      );
    } else if (!(bounds instanceof L.LatLngBounds)) {
      north_west = this.leafletRecordMap.latLngToLayerPoint(
        bounds.getNorthWest()
      );
      south_east = this.leafletRecordMap.latLngToLayerPoint(
        bounds.getSouthEast()
      );
    } else {
      throw Error("Invalud value");
    }

    let _left = north_west.x;
    let _right = south_east.x;
    let _top = north_west.y;
    let _bottom = south_east.y;

    this.rd.DOM.recordDisplayWrapper
      .select(".recordBase_Map  .spatialQueryBox_Filter")
      .classed("active", bounds || isVisible)
      .style("left", _left + "px")
      .style("top", _top + "px")
      .style("width", Math.abs(_right - _left) + "px")
      .style("height", Math.abs(_bottom - _top) + "px");
  }

  /** -- */
  refreshViewSize(delayMs = 500) {
    this.rd.refreshColorLegendTicks();
    setTimeout(() => this.leafletRecordMap.invalidateSize(), delayMs);
  }

  /** -- */
  refreshAttribUnitName(_attrib: Attrib) {
    this.rd.refreshColorLegendTicks();
  }

  zoomedBefore = false;
  /** -- */
  zoomIn(): void {
    this.leafletRecordMap.zoomIn();
  }
  /** -- */
  zoomOut(): void {
    this.leafletRecordMap.zoomOut();
  }
  /** -- */
  zoomToFit(): void {
    if (!this.zoomedBefore) {
      if (this.rd.config.mapInitView) {
        var _c = this.rd.config.mapInitView;
        if (_c[3] === undefined || _c[3] === false) {
          this.zoomedBefore = true;
        }
        this.leafletRecordMap.setView(L.latLng(_c[0], _c[1]), _c[2]);
        return;
      }
    }
    this.zoomToBounds(
      Util.addMarginToBounds(this.geoAttrib.getRecordBounds(true))
    );
  }
  /** -- */
  zoomToBounds(bounds) {
    this.rd.DOM.recordDisplayWrapper.classed("dragging", true);
    this.leafletRecordMap.fitBounds(bounds);
  }
  /** -- */
  setMaxBounds(): void {
    if (this.rd.config.map_NoFitBounds) return;
    this.leafletRecordMap.setMaxBounds(
      Util.addMarginToBounds(this.geoAttrib.getRecordBounds(false))
    );
  }

  translate_glyph(v: [number, number]): string {
    let point = this.leafletRecordMap.latLngToLayerPoint(
      new L.latLng(v[1], v[0])
    );
    return `translate(${point.x},${point.y})`;
  }

  /** -- */
  refreshPointClusters(): void {
    if (!this.geoAttrib) return;
    if (this.geoAttrib?.geoType !== "Point") return;
    if (!this.geoAttrib.PointCluster) return;

    this.geoAttrib.updateClusters(
      this.leafletRecordMap.getBounds(),
      this.leafletRecordMap.getZoom()
    );

    this.DOM.clusterGlyphs = this.DOM.clusterGroup
      .selectAll(".clusterGlyph")
      .data(this.geoAttrib._aggrs)
      .enter()
      .append("g")
      .attr("class", "clusterGlyph aggrGlyph")
      .each((aggr: Aggregate_PointCluster, i, nodes) => {
        aggr.setAggrGlyph(nodes[i]);
      })
      .tooltip((aggr: Aggregate_PointCluster) => aggr.getTooltipHTML(), {
        theme: "dark kshf-tooltip kshf-record",
        placement: "right",
        animation: "fade",
        followCursor: true,
        offset: [0, 5],
      })
      .attr("transform", (aggr) =>
        this.translate_glyph(aggr.cluster.geometry.coordinates)
      )
      //.on("mouseenter", aggr => this.browser.setSelect_Compare(aggr) )
      //.on("mouseleave", aggr => this.browser.clearSelect_Compare() )
      .on("click", (event, aggr) => {
        if (event.shiftKey) {
          // filter - TODO needs to have its own filter logic
          return;
        }
        let latlong = aggr.cluster.geometry.coordinates;
        this.leafletRecordMap.setZoomAround(
          new L.latLng(latlong[1], latlong[0]),
          this.leafletRecordMap.getZoom() + 1
        );
      })
      .call((clusterGlyph) => {
        clusterGlyph
          .append("g")
          .attr("class", "measureGroup")
          .call((measureGroup) => {
            ["Active"].concat(Base.Compare_List).forEach((cT) => {
              this.DOM["clusterGlyphs_" + cT] = measureGroup
                .append("path")
                .attr("class", "measure_" + cT)
                .each((aggr, i, nodes) => {
                  nodes[i]._currentPreviewAngle = 0;
                });
            });
          });
        clusterGlyph
          .append("text")
          .attr("class", "sizeValueText")
          .html((aggr) => "" + aggr.Active.measure);
      });

    // reset circle size
    this.DOM.clusterGlyphs_Active.attr("d", Util.getCirclePath());
  }

  /** -- */
  private refreshPointDOM(): void {
    this.rd.refreshRecordDOM();
    this.rd.updateRecordSizeScale();
    this.rd.updateRecordColorScale();
  }

  /** --  */
  refreshRecordVis(): void {
    if (!this.geoAttrib) return;

    if (this.geoAttrib.geoType === "Point") {
      // POINT MAPS
      this.refreshPointClusters();
      this.refreshPointDOM();

      this.DOM.kshfRecords?.attr("transform", (record: Record) =>
        this.translate_glyph(
          this.geoAttrib.getRecordValue(record).geoFeat.coordinates
        )
      );
      this.DOM.clusterGlyphs?.attr(
        "transform",
        (aggr: Aggregate_PointCluster) =>
          this.translate_glyph(aggr.cluster.geometry.coordinates)
      );
    } else {
      // POLYGON MAPS
      this.DOM.kshfRecords_Path?.attr("d", (record) =>
        this.recordGeoPath(this.geoAttrib.getRecordValue(record).geoFeat)
      );
    }
  }

  /** -- */
  refreshPointClusterVis(): void {
    if (!this.rd.hasAggregates()) return;
    if (!this.rd.recordRadiusScale) return;

    let clusterArc = d3
      .arc()
      .innerRadius(0)
      .startAngle(0)
      .endAngle(2 * Math.PI);
    let circleDraw = (aggr) => clusterArc.outerRadius(aggr.cluster._radius)(null);

    this.DOM.clusterGlyphs
      .each((aggr) => {
        aggr.cluster._radius = this.rd.recordRadiusScale(aggr.Active.measure);
      })
      .classed("tinyCluster", (aggr) => aggr.cluster._radius < 8)
      .classed(
        "clampedCluster",
        (aggr) => aggr.cluster._radius >= Base.maxRecordPointSize
      );

    this.DOM.clusterGlyphs_Active
      .transition()
      .duration(700)
      .ease(d3.easePolyOut.exponent(3))
      .attr("d", circleDraw);

    // update fill color of clusters
    if (!this.colorAttrib) {
      this.DOM.clusterGlyphs_Active.style("fill", null);
      this.DOM.clusterGlyphs.classed("darkBg", false);
      //
    } else {
      this.DOM.clusterGlyphs_Active.each((cluster, i, nodes) => {
        let v = cluster.Active.measure;
        let _fill =
          v != null ? this.rd.recordColorScale(v) : "url(#diagonalHatch)";
        let darkBg = v != null ? d3.hsl(_fill).l < 0.6 : false;

        nodes[i].style.fill = _fill;

        // to adjust text color by background luminance
        nodes[i].parentNode.parentNode.classList[darkBg ? "add" : "remove"](
          "darkBg"
        );
      });
    }

    this.refreshSelect_Compare();
  }

  /**
   * Returns the records that fit/intersect within the bounds (if point) or has geofeat (if polygon)
   */
  getRecordsForDOM(): Record[] {
    let bounds = this.leafletRecordMap.getBounds();
    return this.browser.records.filter((record) => {
      var _feat = this.geoAttrib.getRecordValue(record)?.geoFeat;
      if (!_feat) return false;
      // not in a cluster - not rendered separately
      if (_feat.type==="Point" && _feat.coordinates) {
        if(record._view.inCluster) return false;
        return bounds.contains(L.latLng(_feat.coordinates.slice().reverse()));
      }
      return true;
    });
  }

  /** -- */
  refreshRecordColors() {
    if (!this.DOM.kshfRecords_Path) return;

    if (this.colorAttrib) {
      if (!this.rd.recordColorScale) return;

      let s_f;
      let s_log = false;
      let s_ts = (_record) => false;

      if (this.colorAttrib instanceof Attrib_Interval) {
        s_f = this.colorAttrib.template.func;
        s_log = this.colorAttrib.isValueScale_Log;
        if (this.colorAttrib.hasTimeSeriesParent()) {
          let f_ps = this.colorAttrib.timeseriesParent.template.func;
          s_ts = function (record) {
            let _ = f_ps.call(this, record);
            if (!_ || !_._timeseries_) return false;
            return _._timeseries_.length === 0;
          };
        }
      } else if (this.colorAttrib === "_measure_") {
        s_f = (record) => record.measure_Self;
      } else {
        console.log("IMPOSSIBLE");
      }

      this.DOM.kshfRecords_Path.each((record, i, nodes) => {
        if (record.filteredOut) return;
        let DOM = nodes[i];
        let _fill = "url(#diagonalHatch)";
        let _stroke = "#111111";
        let darkBg = false;

        let v = s_f.call(record.data, record);

        if (v === "" || v == null || typeof v !== "number" || (s_log && v <= 0))
          v = null;

        if (v != null) {
          _fill = this.rd.recordColorScale(v);
          darkBg = d3.hsl(_fill).l < 0.6;
          _stroke = darkBg ? "#EEEEEE" : "#111111";
        }

        if (record.isSelected()) {
          _stroke = null;
        }

        DOM.style.fill = _fill;
        DOM.style.stroke = _stroke;
        DOM.parentNode.classList[darkBg ? "add" : "remove"]("darkBg");
        DOM.classList[s_ts.call(record.data, record) ? "add" : "remove"](
          "noData"
        );
      });
    } else {
      this.DOM.kshfRecords_Path
        .style("fill", null)
        .style("stroke", null)
        .classed("noData", false);
    }

    this.refreshPointClusterVis();
  }
}
