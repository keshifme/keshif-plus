export class DataLoader_File {
  accepts(dataDescr) {
    return dataDescr.type === "file";
  }

  async load(dataDescr) {
    return new Promise(async (resolve, reject) => {
      var reader = new FileReader();
      reader.onload = async (e) => {
        await dataDescr.parseData();
        resolve(true);
      };
      reader.onerror = (e) => {
        reader.abort();
      };
      reader.onabort = (e) => {
        reject(e);
      };
      reader.readAsText(dataDescr);
    });
  }
}
