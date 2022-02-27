import { DataLoader_FetchURL } from "./FetchURL";

export class DataLoader_FetchURL_SaaS extends DataLoader_FetchURL {
  account: any; // saas account

  constructor(account){
    super();
    this.account = account;
  }

  accepts(dataDescr) {
    return (
      dataDescr.fileExt &&
      dataDescr.sourceURL.startsWith("/api/data/") &&
      this.account
    );
  }

  defaultFetchConfig() {
    return {
      credentials: "same-origin",
      method: "GET",
      Authorization: "Bearer " + this.account.token,
    };
  }
}
