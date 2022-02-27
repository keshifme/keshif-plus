import { DataTable } from "../DataTable";
import { DataLoader_File } from "./File";

export class DataLoader_FirebaseFile {
  accepts(dt: DataTable) {
    return dt.type === "GoogleFirebaseStorage";
  }

  async load(dt: DataTable) {
    if (!(window as any).firebase) {
      return Promise.reject(
        "Cannot load firebase file link because firebase library is not loaded."
      );
    }

    dt.fullURL = await (window as any).firebase
      .storage()
      .ref(dt.sourceURL)
      .getDownloadURL();

    delete dt.type;

    // continue loading data description as a regular file
    return new DataLoader_File().load(dt);
  }
}
