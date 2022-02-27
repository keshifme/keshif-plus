import { DataTable } from "../DataTable";

export class DataLoader_FetchURL {
  accepts(dt: DataTable) {
    return dt.fileExt;
  }

  // can be extended by sub-classes to customize http request headers
  defaultFetchConfig() {
    return {
      credentials: "same-origin",
      method: "GET",
    };
  }

  async load(dt: DataTable) {
    // Lets Papaparse handle the streaming data loading
    if (dt.isCSV && dt.stream) {
      return dt.parseData_CSV(dt.sourceURL);
    }

    return fetch(
      dt.sourceURL,
      Object.assign({}, this.defaultFetchConfig(), dt.fetchConfig)
    )
      .then((response) => response.text())
      .then((data: any) => {
        if (data.error) {
          return Promise.reject(data.error);
        }
        return dt.parseData(data);
      });
  }
}
