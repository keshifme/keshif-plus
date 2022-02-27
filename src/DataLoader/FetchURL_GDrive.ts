import { DataLoader_FetchURL } from "./FetchURL";

export class DataLoader_FetchURL_GDrive extends DataLoader_FetchURL {
  gapi: any;

  constructor(gapi){
    super();
    this.gapi = gapi;
  }

  accepts(dataDescr) {
    return (
      dataDescr.fileExt &&
      dataDescr.isGoogleFile &&
      this.gapi?.client?.getToken() // must be authenticated on gapi
    );
  }

  defaultFetchConfig() {
    return {
      credentials: "same-origin",
      method: "GET",
      Authorization: "Bearer " + this.gapi.client.getToken().access_token,
    };
  }
}
