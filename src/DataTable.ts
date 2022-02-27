import { TableSpec } from "./Types";
import { Record } from "./Record";
import { Base } from "./Base";

// Static data loader
var DataLoaderRegistry = [];

/** -- */
export class DataTable {
  readonly name: string;

  // ********************************************************************
  // Records
  // ********************************************************************

  records: Record[] = [];

  private _byKey: { [index: string]: Record } = {};

  getRecord(key: string): Record {
    return this._byKey[key];
  }

  // ********************************************************************
  // Loading data
  // ********************************************************************

  onLoad = null;

  private _isLoaded: boolean = false;
  get isLoaded() {
    return this._isLoaded;
  }
  async load() {
    if (this._isLoaded) return;

    if (this.onLoad) return this.onLoad();

    // check loaders, and if loader accepts descriptor, try to load with the loader
    for (const loader of DataLoaderRegistry) {
      if (loader.accepts(this)) {
        var result = await loader.load(this);
        if (result) {
          this._isLoaded = true;
          return;
        }
      }
    }

    return Promise.reject("Cannot find data loader");
  }

  createRecord(_data: any) {
    var record = new Record(_data, this.id);
    this.records.push(record);
    this._byKey[record.id] = record;
  }

  /** -- */
  static registerLoader(loader) {
    DataLoaderRegistry.push(loader);
  }

  type: "file" | "GoogleSheets" | any;

  // name of the ID column in dataset
  id?: string;

  file?: File;

  gdocId?: string;
  range?: null; // used by google sheet

  dirPath?: string;
  fullURL?: string;

  // CSV parsin settings with defaults
  header: boolean = true;
  fastMode: boolean = false;
  dynamicTyping: boolean = true;
  download: boolean = false;
  stream: boolean = false;

  // fetch configuration
  fetchConfig?: any;

  /** -- */
  constructor(dataDescr: TableSpec) {
    if (dataDescr instanceof File) {
      this.type = "file";
      this.name = dataDescr.name;
      this.file = dataDescr;
      return;
    }
    if (typeof dataDescr === "string") {
      dataDescr = { name: dataDescr };
    }

    dataDescr = Object.assign({}, dataDescr);

    for (var x in dataDescr) {
      this[x] = dataDescr[x];
    }

    if (this.gdocId) {
      this.type = "GoogleSheets";
    }

    this.id = this.id ?? "id";

    Base.tables.set(this.name, this);
  }

  fileType?: "csv" | "tsv" | "json";

  get fileExt() {
    return this.fileType ? "." + this.fileType.toLowerCase() : "";
  }
  get isCSV() {
    return this.fileExt === ".csv" || this.fileExt === ".tsv";
  }

  get isGoogleFile() {
    return (
      this.dirPath === "GoogleDrive" ||
      this.dirPath === "https://drive.google.com/file/d/"
    );
  }

  get sourceURL() {
    if (this.fullURL) return this.fullURL;
    if (this.isGoogleFile)
      return `https://www.googleapis.com/drive/v3/files/${this.name}?alt=media&key=${Base.gapi.gKey}`;
    return (this.dirPath || "") + this.name + this.fileExt;
  }

  get linkToData() {
    if (this.gdocId) {
      return "https://docs.google.com/spreadsheets/d/" + this.gdocId;
    }
    return this.sourceURL;
  }

  /** -- */
  async parseData(rawData) {
    if (this.isCSV) {
      return await this.parseData_CSV(rawData);
    } else {
      return await this.parseData_JSON(rawData);
    }
  }

  /** -- */
  async parseData_JSON(data) {
    if (typeof data === "string") {
      data = JSON.parse(data);
    }

    var idColumn = this.id;

    data.forEach((_d, i) => {
      if (_d[idColumn] === undefined) _d[idColumn] = "" + i;
      this.createRecord(_d);
    });

    return true;
  }

  /** -- */
  async parseData_CSV(data) {
    let Papa = (window as any).Papa;
    if (!Papa) {
      // Sets window.Papa / Not a proper ES6 module
      await import("papaparse");
      Papa = (window as any).Papa;
    }

    return new Promise((resolve, reject) => {
      let _i = 0;

      Papa.parse(data, {
        header: this.header === false ? false : true,

        fastMode: this.fastMode !== undefined ? this.fastMode : false,

        dynamicTyping:
          this.dynamicTyping !== undefined ? this.dynamicTyping : true, // true unless disabled

        download: this.stream === true,

        chunk: (_rows) => {
          _rows.data.forEach((row) => {
            if (row[this.id] === undefined) {
              row[this.id] = "" + _i++;
            }
            this.createRecord(row);
          });
        },

        complete: () => {
          this.processHeaderHierarchy();
          resolve?.(true);
        },

        error: (error) => {
          console.log(error);
          reject?.("CSV parsing error.");
        },
      });
    });
  }

  /** Helper function to process column name header hierarchies (..->..->..) */
  processHeaderHierarchy(columns: any = null) {
    if (!columns) {
      columns = Object.keys(this.records[0].data);
    }

    columns.forEach((flatColName) => {
      if (typeof flatColName !== "string") return;
      var keys = flatColName.split("->");
      if (keys.length === 1) {
        return; // no hierarchy
      }
      keys = keys.map((_) => _.trim()); // trim keys
      var lastKey = keys.pop();
      this.records.forEach((rec) => {
        var _data = rec.data;
        var _value = _data[flatColName];
        if (_value != null) {
          keys.forEach((key) => {
            _data = _data[key] = _data[key] || {};
          });
          _data[lastKey] = _value;
        }
        delete rec.data[flatColName];
      });
    });
  }
}
