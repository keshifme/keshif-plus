export class MapData {
  // name of the mapdata object
  public readonly name: string;

  // cache for filename
  private readonly fileName: string;

  // cache for loaded state
  private _geoLoaded = false;

  private featureCb?: Function;
  private alternatives: { [index: string]: any[] };
  private defaultIndexedProps: string[];

  private features: { [index: string]: any } = {};
  // main external access to geometric feature (polygon, etc.) given an indexed key
  getFeature(key: string) {
    return this.features[key];
  }

  /** -- */
  constructor(name: string, fileName: string, processCfg) {
    this.name = name;

    this.fileName = fileName + "?ma";

    processCfg = processCfg || {};
    this.featureCb = processCfg.featureCb;
    this.alternatives = processCfg.alternatives || {};

    this.defaultIndexedProps = ["id", "ISO3166-2", "ISO3166-1"];
    if (processCfg.indexedProps) {
      if (!Array.isArray(processCfg.indexedProps)) {
        processCfg.indexedProps = [processCfg.indexedProps];
      }
      this.defaultIndexedProps = this.defaultIndexedProps.concat(
        processCfg.indexedProps
      );
    }

    this._processAlternatives(); // calling this to register the names for boost-detection
  }

  /** -- */
  get geoLoaded() {
    return this._geoLoaded;
  }

  /** -- */
  _processAlternatives() {
    for (var _from in this.alternatives) {
      var _target = this.alternatives[_from];

      if (_from === "expand") {
        for (var name in this.features) {
          _target.forEach((expander: {from: string, to:string, replace:boolean}) => {
            var _newKey = name.replace(expander.from, expander.to || "");
            if (_newKey === name || this.features[_newKey]) {
              return; // same, or key exists
            }
            this.features[_newKey] = this.features[name];
            if (expander.replace) {
              delete this.features[name];
            }
          });
        }
      } else if (Array.isArray(_target)) {
        _target
          .filter((_to) => typeof _to === "string")
          .forEach((_to) => {
            this.features[_to] =
              this.features[_to] || this.features[_from] || null;
          });
      }
    }
  }

  /** -- */
  async loadGeo() {
    if (this._geoLoaded) return true;

    return (
      fetch(this.fileName, { credentials: "same-origin" })
        .then((response) => response.json())

        // if topojson format, load library and parse to geojson
        .then(async (data) => {
          if (!data.objects) return data;
          await import("topojson-client");
          return (window as any).topojson.feature(data, data.objects.regions);
        })

        .then((geojsonData) => {
          geojsonData.features.forEach((feature) => {
            // move features from .properties.alltags to the .properties so they can be indexed
            if (feature.properties.alltags) {
              for (var k in feature.properties.alltags)
                feature.properties[k] = feature.properties.alltags[k];
              delete feature.properties.alltags;
            }

            if (this.featureCb) feature = this.featureCb(feature);

            feature.properties.id = feature.properties.id || feature.id;

            // detect all properties that include "name", but not "fix" + indexed properties
            this.defaultIndexedProps
              .concat(
                Object.keys(feature.properties).filter(
                  (x) =>
                    x.toUpperCase().includes("NAME") &&
                    !x.toUpperCase().includes("FIX")
                )
              )
              .forEach((indexProp) => {
                var _index = feature.properties[indexProp];
                if (!_index) return;
                _index = "" + _index;
                this.features[_index.toUpperCase()] = feature;
                // index version with "-" replaced with " "
                if (_index.includes("-")){
                  this.features[_index.replace(/-/g, " ").toUpperCase()] = feature;
                }
              });
          });

          this._geoLoaded = true;
          this._processAlternatives();
        })
    );
  }
}
