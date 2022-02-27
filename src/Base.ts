import "tippy.js/animations/scale.css";
import "tippy.js/dist/svg-arrow.css";
import "tippy.js/dist/tippy.css";

import "./assets/font-awesome/css/all.min.css";

import { CompareType, MeasureType, MetricFunc } from "./Types";

import "./keshif.less";
import { MapData } from "./MapData";
import { Browser } from "./Browser";
import { DataTable } from "./DataTable";


class kshfBase {
  // active browser
  browser: Browser = null;

  // all browsers in window
  browsers: { [key: string]: Browser } = {};

  // update to support google api loading
  gapi = {
    gKey: null,
    clientId: null,
    scope: null,
  };

  // point to where geojson files are hosted
  geoFileDir = "";
  geoFileExt = "topojson";

  // external service configuration parameters
  helpscoutBeacon: ""; // to set helpscout beacon ID

  // dt: any = [];
  // dt_id: any = {};

  // Number of maximum visible records (items)
  maxVisibleItems_Default = 100;
  // how many rows (records) to look at to auto-detect attributes
  autoDetect_RowCount = 10;

  // **************************************************************
  // BASIC CONFIGURATIONS

  timeKeyHeight = 35; //
  recordRankWidth = 45; //

  maxRecordPointSize = 30;
  defaultRecordPointSize = 4.5;

  // Categorical chart size settings
  height_CatBottom = 36; //
  defaultBarHeight = 32; //
  width_CatLabelMin = 110; //

  width_scatter_margin_left = 85;
  height_scatter_margin_bottom = 95; //

  // Interval chart size settings
  width_HistBarGap = 2; // Width (pixels) between neighboring histogram bars
  width_HistBinDefault = 45;
  width_measureDescrLabel = 20; //
  height_MaxRatioDefault = 0.3; //
  height_HistMin = 40; //
  height_HistBottomGap = 12; // Height (pixels) for histogram gap on top.
  height_Percentile = 34; // Height (pixels) of percentile chart

  // Other size settings
  width_PanelGap = 8; //
  width_ScrollBar = 19; // scroll bar width
  width_AttribPanelDefault = 250; //

  percentDecimal = true; // set to false to not use a decimal point when presenting % labels

  defaultDOM = "#kshfDashboard";

  Panel_List = ["left", "right", "middle", "bottom"];

  defaultMetricFuncs: MetricFunc[] = ["Sum", "Avg"];

  Compare_List: CompareType[] = [
    "Compare_A",
    "Compare_B",
    "Compare_C",
    "Compare_D",
    "Compare_E",
  ];

  maps = new Map<string, MapData>();

  tables = new Map<string, DataTable>();

  get Active_Compare_List(): MeasureType[] {
    let m: MeasureType[] = ["Active"];
    return m.concat(this.Compare_List);
  }

  get Total_Active_Compare_List(): MeasureType[] {
    let m: MeasureType[] = ["Total", "Active"];
    return m.concat(this.Compare_List);
  }

  map = {
    tileTemplate: "", // point to the tileserver
    leafConfig: {
      maxBoundsViscosity: 1,
      worldCopyJump: false,
      // zoom settings
      zoomControl: false,
      boxZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      maxZoom: 18,
      minZoom: 1,
      //crs: L.CRS.EPSG3857
      //crs: L.CRS.Simple
    },
    tileConfig: {
      attribution:
        '&copy; <a href="https://openstreetmap.org/about/" target="_blank">OpenStreetMap</a><br><a href="https://www.mapbox.com/about/maps/" target="_blank">Mapbox</a> &amp; <a href="https://keshif.me" target="_blank">Keshif</a>',
      subdomains: "abcd",
      id: "mapbox.light",
      //noWrap: true
    },
    flyConfig: {
      padding: [0, 0],
      pan: { animate: true, duration: 1.2 },
      zoom: { animate: true },
    },

    pinGlyphPath: `M-0.025 -18 C-4.106 -18 -7.427 -14.751 -7.427 -10.757 -7.427 -5.8 
      -0.803 1.476 -0.521 1.784 -0.256 2.072 0.207 2.072 0.471 1.784 0.753 1.476 7.377 -5.8 
      7.377 -10.757 7.377 -14.751 4.057 -18 -0.025 -18 Z M-0.025 -7.112 C-2.078 -7.112 -3.749 
      -8.747 -3.749 -10.757 -3.749 -12.766 -2.078 -14.401 -0.025 -14.401 2.029 -14.401 3.699 
      -12.766 3.699 -10.757 3.699 -8.747 2.029 -7.112 -0.025 -7.112 Z`,
  };

  DOM: any = {};
  popupInstance: any; // temp

  custom_icons = {
    trails: `<svg class="custom_icon custom_icon_trails" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 500" xml:space="preserve">
        <g>
          <path d="M489.2,65.25c0-35.7-28.5-65.2-64.2-65.2s-64.2,29.6-64.2,65.2c0,28.1,17.7,52.3,42.6,61.4l-28.2,232.3
            c-6.6,0.5-12.9,2-18.7,4.4l-97.1-99.6c1.6-5.8,2.5-11.8,2.5-18.1c0-35.7-28.5-65.2-64.2-65.2s-64.2,29.6-64.2,65.2
            c0,15.6,5.4,29.9,14.5,41.2l-62.3,75.7c-6.7-2.4-14-3.8-21.5-3.8c-35.7,0-64.2,29.6-64.2,65.2c0,35.7,28.5,65.2,64.2,65.2
            c36.7,0,64.2-29.6,64.2-65.2c0-13.3-4-25.8-10.9-36.2l64.8-78.8c4.9,1.2,10,1.9,15.3,1.9c14.5,0,27.8-4.9,38.5-13.1l89.4,91.8
            c-6.2,10-9.7,21.8-9.7,34.4c0,35.7,28.5,65.2,64.2,65.2s64.2-29.6,64.2-65.2c0-23.1-12-43.6-30.1-55.2l29.5-241
            C470.1,119.55,489.2,94.45,489.2,65.25z M425,40.85c12.2,0,23.4,11.2,23.4,24.5s-11.2,24.5-23.4,24.5s-23.4-11.2-23.4-24.5
            S411.7,40.85,425,40.85z M64.2,448.45c-12.2,0-23.4-11.2-23.4-24.5c0-13.2,10.2-24.5,23.4-24.5s23.4,11.2,23.4,24.5
            C87.7,437.25,76.4,448.45,64.2,448.45z M197.7,270.15c-12.2,0-23.4-11.2-23.4-24.5c0-13.2,10.2-24.5,23.4-24.5
            s23.4,11.2,23.4,24.5C221.2,258.95,209.9,270.15,197.7,270.15z M380.1,448.45c-12.2,0-23.4-11.2-23.4-24.5
            c0-13.2,10.2-24.5,23.4-24.5c13.2,0,23.4,11.2,23.4,24.5C403.6,437.25,392.4,448.45,380.1,448.45z"/>
        </g>
      </svg>`,
  };

  reloadWithNewConfig(dashboard: Browser, newConfig) {
    this.tables.delete(dashboard.primaryTableName);
    return new Browser(newConfig);
  };

  WebFontConfig = {
    google: {
      families: [
        "Roboto:100,300,400,500,700:latin",
        "Roboto+Slab:300,400,700",
        "Roboto+Condensed:300,400",
      ],
    },
  };

  loadResources = async function () {
    if (this._resourcesLoaded === true) return;

    // Load common fonts
    window["WebFontConfig"] = this.WebFontConfig;
    await import(
      "https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js"
    );
    //window.WebFont.load(this.WebFontConfig); // or, after loading the script

    window.addEventListener(
      "resize",
      () => {
        for (var id in this.browsers) {
          this.browsers[id].setNoAnim(true);
          this.browsers[id].updateLayout();
        }
        if (this._resizeTimeout) {
          window.clearTimeout(this._resizeTimeout);
        }
        this._resizeTimeout = window.setTimeout(() => {
          for (var id in this.browsers) this.browsers[id].setNoAnim(false);
        }, 500);
      },
      false
    );

    this._resourcesLoaded = true;

    return true;
  };
}

export var Base = new kshfBase();

window["kshf"] = Base;

