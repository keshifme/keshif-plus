export var config = {
  source: [
    {
      name: "Homicides",
      id: "id",
      onLoad: function () {
        return fetch(
          "https://storage.googleapis.com/asset.keshif.me/data/dc_homicides.json"
        )
          .then((response) => response.json())
          .then((data) => {
            data.objects.forEach((d) => {
              d.id = 1 * d.id;
              d.incident_date = new Date(
                Date.UTC(...d.incident_date.split("-").map((_) => 1 * _))
              );
              // there are some homicied pre-1999. Don't display them, not the point of the dataset
              if (d.incident_date.getFullYear() > 1999) {
                this.createRecord(d);
              }
            });
          });
      },
    },
  ],
  description:
    "<a href='http://apps.washingtonpost.com/investigative/homicides/' target='_blank'>Data</a> was curated by the Washington Post. Neighborhood map data from <a href='http://opendatadc.org/dataset/neighborhood-boundaries-217-neighborhoods-washpost-justgrimes' target='_blank'>opendatadc.gov</a>",
  onLoad: {
    "motive->slug": "DELETE()",
    "police_status->slug": "DELETE()",
    "nbhd->quadrant": "DELETE()",
    "manner->slug": "DELETE()",
    "nbhd->id": "DELETE()",
    ccn: "DELETE()",
  },
  selections: {
    summary: "Victim's Sex",
    Compare_A: { id: "f" },
    Compare_B: { id: "m" },
  },
  summaries: [
    {
      name: "Victim's Sex",
      value: "sex",
      barHeight: 30,
      catLabel: {
        m: "Male <i class='fa fa-male'></i>",
        f: "Female <i class='fa fa-female'></i>",
      },
      panel: "left",
    },
    { name: "Victim's Race", value: "race", panel: "left" },
    {
      name: "Victim's Age",
      value: "age",
      showPercentiles: true,
      metricFuncs: ["Avg"],
      panel: "left",
    },
    {
      name: "Neighborhood",
      value: "nbhd->subhood",
      panel: "middle",
      catGeo: "Map_UnitedStates_DC_Neighborhoods",
      viewAs: "map",
    },
    {
      name: "Status",
      panel: "left",
      barHeight: 18,
      value: function () {
        var r = [];
        r.push("Police Status: " + this.police_status.name);
        if (this.jury_trial) r.push("Had jury trial");
        return r;
      },
    },
    { name: "Motive", value: "motive->name", panel: "right" },
    { name: "Manner", value: "manner->name", panel: "right" },
    {
      name: "<span class='fa fa-th-large'></span> Quadrant",
      panel: "right",
      value: "quadrant",
      catLabel: {
        SE: "South-East",
        SW: "South-West",
        NE: "North-East",
        NW: "North-West",
      },
      barHeight: 18,
    },
    {
      name: "Date",
      value: "incident_date",
      panel: "middle",
      maxHeightRatio: 0.15,
    },
    {
      name: "Victim's Name",
      value: function () {
        return `${this.last_name}, ${this.first_name}`;
      },
    },
  ],
  recordDisplay: {
    viewAs: "list",
    sortBy: "Date",
    list_sortColWidth: 130,
    textBy: "Victim's Name",
  },
};
