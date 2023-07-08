import { geoBounds } from "d3-geo";

import { Aggregate } from "./Aggregate.js";
import { Attrib } from "./Attrib.js";
import { AttribTemplate } from "./AttribTemplate.js";
import { Base } from "./Base.js";
import { Browser } from "./Browser.js";
import {
  BlockSpec,
  RecordVisCoding,
  SummaryConfig,
  SummarySpec,
} from "./Types.js";
import { Filter_Spatial as Filter_Geo } from "./Filter_Geo.js";
import { i18n } from "./i18n.js";
import { MapData } from "./MapData.js";
import { Record } from "./Record.js";
import Supercluster from "supercluster";

const d3 = { geoBounds };

declare let L: any;

/** -- */
export class Aggregate_PointCluster extends Aggregate {
  // cluster structure is returned by Supercluster library
  cluster: any;

  _glyphOrder: any; // TODO

  /** -- */
  constructor(attrib: Attrib_RecordGeo, _cluster) {
    super(attrib);
    this.cluster = _cluster;
  }
  get tooltipTitle() {
    return i18n["Cluster"];
  }
  get label(): string {
    return "";
  }
}

export type RecordGeoData = {
  geoFeat: any;
  _bounds: any;
};

/** Can be a point object, or polygon objects */
export class Attrib_RecordGeo extends Attrib {
  public _aggrs: Aggregate_PointCluster[] = [];

  private recordGeoMap: MapData;

  public geoType:
    | "Point"
    | "MultiPoint"
    | "LineString"
    | "MultiLineString"
    | "Polygon"
    | "MultiPolygon"
    | "GeometryCollection"
    | "Feature"
    | "FeatureCollection";

  constructor(browser: Browser, name: string, template: AttribTemplate) {
    super(browser, name, template, "recordGeo", "", "far fa-map-marker");

    this.createSummaryFilter();
  }

  getRecordValue(record: Record): RecordGeoData {
    return record.getValue(this);
  }

  /** Only supports "geo" encoding */
  supportsRecordEncoding(coding: RecordVisCoding): boolean {
    return coding === "geo";
  }

  get measureRangeMax(): number {
    return this.geoType === "Point" ? this._pointClusterRadius : 1;
  }

  // ********************************************************************
  // Filtering
  // ********************************************************************

  public summaryFilter: Filter_Geo | null = null;

  createSummaryFilter(): void {
    this.summaryFilter = new Filter_Geo(this.browser, this);
  }

  // ********************************************************************
  // Aggregates / geo-cache
  // ********************************************************************

  async loadGeo(): Promise<void> {
    if (this.recordGeoMap) {
      await this.recordGeoMap.loadGeo();
    }

    this.browser.records.forEach((record) => {
      var feature = this.template.func.call(record.data, record);
      if (typeof feature === "string" && this.recordGeoMap) {
        feature = this.recordGeoMap.getFeature(feature.toUpperCase());
      }
      if (feature) {
        var g: RecordGeoData = {
          geoFeat: feature,
          _bounds: d3.geoBounds(feature),
        };
        this.geoType = feature.type;
        record.setValue(this, g);
      } else {
        record.setValue(this, null);
        this.noValueAggr.addRecord(record);
      }
    });
  }

  initializeAggregates(): void {
    if (this.aggr_initialized) return;

    this.aggr_initialized = true;
  }

  async applyConfig(blockCfg: SummarySpec): Promise<void> {
    super.applyConfig(blockCfg);

    if (blockCfg.recordGeo) {
      this.recordGeoMap = Base.maps.get(blockCfg.recordGeo);
      if (!this.recordGeoMap) {
        this.recordGeoMap = null;
      }
    }
  }

  /** -- */
  getRecordBounds(onlyIncluded: boolean): L.LatLngBounds {
    let bs = [];
    this.browser.records.forEach((record) => {
      if (onlyIncluded && record.filteredOut) return;

      let v = this.getRecordValue(record);
      if (!v) return;
      if (!v._bounds) return;

      let b = v._bounds;
      if (isNaN(b[0][0])) return;

      let p1 = L.latLng(b[0][1], b[0][0]);
      let p2 = L.latLng(b[1][1], b[1][0]);
      bs.push(p1);
      bs.push(p2);
    });
    return new L.latLngBounds(bs);
  }

  // ********************************************************************
  // Point cluster management
  // ********************************************************************

  readonly maxNodeRecordSize = 1000;

  public PointCluster: Supercluster;

  async prepPointCluster(leafletMap: L.Map) {
    if (this.pointClusterRadius === 0) {
      return;
    }

    this.PointCluster = new Supercluster({
      radius: this.pointClusterRadius, // in pixels
      maxZoom: leafletMap.getMaxZoom() - 1,
      minZoom: leafletMap.getMinZoom(),
      //map: (props) => ({data: props.data}),
    });

    let points = [];
    this.records.forEach((record) => {
      let value = this.getRecordValue(record);
      if (value) {
        points.push({
          type: "Feature",
          properties: record,
          geometry: value.geoFeat,
        });
      }
    });

    this.PointCluster.load(points);
  }

  updateClusters(_bounds: L.LatLngBounds, zoom: number): void {
    this.deletePointClusters();

    let _clusters = this.PointCluster.getClusters(
      [
        _bounds.getWest(),
        _bounds.getSouth(),
        _bounds.getEast(),
        _bounds.getNorth(),
      ],
      Math.floor(zoom)
    );

    _clusters.forEach((cluster) => {
      if (!cluster.id) {
        // single record
        let record: Record = <Record> cluster.properties;
        record._view.inCluster = false;
        //
      } else {
        let clusterMembers = this.PointCluster.getLeaves(
          <number>cluster.id,
          this.maxNodeRecordSize
        );

        let clusterAggr = new Aggregate_PointCluster(this, cluster);

        clusterMembers.forEach((member) => {
          let record: Record = <Record> member.properties;
          record._view.inCluster = true;
          if (record.isIncluded) {
            clusterAggr.addRecord(record);
          }
        });

        if (clusterAggr.records.length === 0) return;

        if (clusterAggr.records.length === 1) {
          // remove individual record from cluster
          let record: Record = clusterAggr.records[0];
          record._view.inCluster = false;
          clusterAggr.clearRecords();
          return;
        }

        this._aggrs.push(clusterAggr);
        this.browser.allAggregates.push(clusterAggr);
      }
    });

    // sort aggregates by active measure size
    this._aggrs.sort((c1, c2) => c2.measure("Active") - c1.measure("Active"));
  }

  /** -- */
  private deletePointClusters() {
    // delete all clusters
    this._aggrs.forEach((clusterAggr: Aggregate_PointCluster) => {
      clusterAggr.clearRecords(); // removes cluster aggregate from record's aggregate index
      clusterAggr.DOM.aggrGlyph.remove(); // removes the DOM item
      this.browser.allAggregates.splice(
        this.browser.allAggregates.indexOf(clusterAggr),
        1
      );
    });
    this.records.forEach((record: Record) => {
      record._view.inCluster = false;
    });
    this._aggrs = [];
  }

  // ********************************************************************
  // Cluster radius management
  // ********************************************************************

  private _pointClusterRadius: number = 50;
  public get pointClusterRadius(): number {
    return this._pointClusterRadius;
  }

  async setPointClusterRadius(radius: number, leafletRecordMap: L.Map) {
    // must be positive integer
    this._pointClusterRadius = Math.round(Math.max(0, radius));
    if (this.pointClusterRadius === 0) {
      this.deletePointClusters();
      return;
    }
    return await this.prepPointCluster(leafletRecordMap);
  }

  // ********************************************************************
  // Export / import config
  // ********************************************************************

  exportConfig(): BlockSpec & SummaryConfig {
    return {
      pointClusterRadius: this._pointClusterRadius,
    } as any;
  }
}
