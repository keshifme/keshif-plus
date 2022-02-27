import { Base } from "../Base";
import { DataTable } from "../DataTable";

export class DataLoader_GoogleSheets {
  constructor() {}

  accepts(dt: DataTable) {
    return dt.type === "GoogleSheets";
  }

  async load(dt: DataTable) {

    await import("https://apis.google.com/js/platform.js");
    
    var gapi = (window as any).gapi;

    await new Promise((resolve, reject) => {
      gapi.load("client", () => {
        gapi.client
          .init({
            discoveryDocs: [
              "https://sheets.googleapis.com/$discovery/rest?version=v4",
              "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
            ],
            apiKey: Base.gapi.gKey,
            clientId: Base.gapi.clientId,
            scope: 'profile email',
          })
          .then(
            () => {
              console.log("✓ gapi.client.init");
              resolve(true);
            },
            (error) => {
              console.log(error);
              reject();
            }
          );
      });
    });

    // Supporting custom data loading proxy
    gapi.client.setToken(null);

    return new Promise((resolve, reject) => {
      gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: dt.gdocId,
        range: dt.name + "!" + (dt.range ? dt.range : "1:300000"),
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "SERIAL_NUMBER", // vs. "FORMATTED_STRING"
      }).then(
        (response) => {
          if (!response.result && response.data) {
            // node API returns a different structure
            response.result = { values: response.data.data.values };
          }

          var header = response.result.values[0];
          var hasIDcolumn =
            header.filter((columnName) => columnName === dt.id).length > 0;

          for (var row = 1; row < response.result.values.length; row++) {
            var c = {};
            for (var col = 0; col < header.length; col++) {
              c[header[col]] = response.result.values[row][col];
            }
            if (!hasIDcolumn) c[dt.id] = "" + (row - 1);
            dt.createRecord(c);
          }

          dt.processHeaderHierarchy(header);
          resolve(true);
        },
        (err) => {
          reject(err);
        }
      );
    });
  }
}
