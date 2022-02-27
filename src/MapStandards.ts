import { Attrib } from "./Attrib";
import { Attrib_Categorical } from "./Attrib_Categorical";
import { Base } from "./Base";
import { MapData } from "./MapData";

var mapStandardsMenuOpts = {
  id: "cat_addMap",
  name: "Add map",
  iconClass: "far fa-globe",
  when: (attrib: Attrib) => attrib instanceof Attrib_Categorical && !attrib.catGeo,
  do: (attrib, action, path) => {
    path = path.slice(path[1] === "World" ? 1 : 2);
    var mapIndex =
      "Map_" +
      path.map((_) => _.replace(/ /g, "").replace(/-/g, "")).join("_") +
      "_" +
      action.level;
    attrib.setCatGeo_(mapIndex + "[UPPERCASE(*)]");
  },
  options: [
    {
      name: "World",
      options: [
        {
          name: "Country",
          value: {
            level: "Adm2",
            indexedProps: [
              "ISO3166-1:alpha2",
              "ISO3166-1:alpha3",
              "ISO3166-1:numeric",
            ],
            alternatives: {
              "BOSNIA AND HERZEGOVINA": ["BOSNIA-HERZEGOVINA"],
              BRUNEI: ["BRUNEI DARUSSALAM"],
              BOLIVIA: [
                "BOLIVARIAN REPUBLIC OF VENEZUELA",
                "BOLIVIA, PLURINATIONAL STATE OF",
              ],
              BAHAMAS: ["BAHAMAS, THE", "THE BAHAMAS"],
              "DEMOCRATIC REPUBLIC OF THE CONGO": [
                "CONGO, DEM. REP.",
                "CONGO, THE DEMOCRATIC REPUBLIC OF THE",
                "CONGO, DEMOCRATIC REPUBLIC",
              ],
              CONGO: ["CONGO, REP.", "CONGO, REPUBLIC OF"],
              "CÔTE D'IVOIRE": ["COTE D'IVOIRE", "IVORY COAST"],
              CHINA: ["CHINA, PEOPLE'S REPUBLIC OF"],
              "CABO VERDE": ["CAPE VERGE"],
              EGYPT: ["EGYPT, ARAB REP."],
              "SAHRAWI ARAB DEMOCRATIC REPUBLIC": [
                "WESTERN SAHARA",
                "Saharawi",
                "Sahrawi Republic",
              ],
              MICRONESIA: [
                "MICRONESIA, FEDERATED STATES OF",
                "MICRONESIA, FED. STS.",
              ],
              "UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND": [
                "UNITED KINGDOM",
                "BRITAIN",
              ],
              GAMBIA: ["GAMBIA, THE", "THE GAMBIA"],
              IRAN: ["IRAN, ISLAMIC REPUBLIC OF", "IRAN, ISLAMIC REP."],
              KOSOVO: ["XKX", "XXK"],
              KYRGYZSTAN: ["KYRGYZ REPUBLIC"],
              "SAINT KITTS AND NEVIS": ["ST. KITTS AND NEVIS"],
              "NORTH KOREA": [
                "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF",
                "KOREA, NORTH",
              ],
              "SOUTH KOREA": [
                "KOREA, REPUBLIC OF",
                "KOREA, REP.",
                "KOREA, SOUTH",
              ],
              "LAO PEOPLE'S DEMOCRATIC REPUBLIC": ["LAOS", "LAO PDR"],
              "SAINT LUCIA": ["ST. LUCIA"],
              MOLDOVA: ["MOLDOVA, REPUBLIC OF"],
              MACEDONIA: [
                "MACEDONIA, THE FORMER YUGOSLAV REPUBLIC OF",
                "NORTH MACEDONIA",
                "REPUBLIC OF MACEDONIA",
                "MACEDONIA, FYR",
              ],
              MYANMAR: ["BURMA"],
              "PALESTINIAN TERRITORIES": [
                "PALESTINE",
                "PALESTINE, STATE OF",
                "WEST BANK AND GAZA",
              ],
              REUNION: ["RÉUNION"],
              "RUSSIAN FEDERATION": ["RUSSIA"],
              SLOVAKIA: ["SLOVAK REPUBLIC"],
              "SOUTH SUDAN": ["REPUBLIC OF SOUTH SUDAN"],
              "SÃO TOMÉ AND PRÍNCIPE": ["SAO TOME AND PRINCIPE"],
              "SYRIAN ARAB REPUBLIC": ["SYRIA"],
              ESWATINI: ["SWAZILAND"],
              TAIWAN: ["TAIWAN, PROVINCE OF CHINA", "TAIWAN (POC)"],
              TANZANIA: ["TANZANIA, UNITED REPUBLIC OF"],
              "UNITED STATES OF AMERICA": ["USA", "UNITED STATES"],
              VATIKAN: ["HOLY SEE (VATIKAN)", "HOLY SEE"],
              "SAINT VINCENT AND THE GRENADINES": [
                "ST. VINCENT AND GRENADINES",
                "ST. VINCENT AND THE GRENADINES",
              ],
              VIETNAM: ["VIET NAM"],
              YEMEN: ["YEMEN, REP.", "REPUBLIC OF YEMEN", "YEMEN, REPUBLIC OF"],
              VENEZUELA: ["BOLIVARIAN REPUBLIC OF VENEZUELA", "VENEZUELA, RB"],
            },
            featureCb: (feature) => {
              var wrap, adj = 9;
              switch (feature.properties["ISO3166-1"]) {
                case "RU":
                case "NZ":
                case "FJ":
                  wrap = (x) => x < 0;
                  adj = 360;
                  break;
                case "US":
                  wrap = (x) => x > 0;
                  adj = -360;
                  break;
              }
              if (wrap) {
                feature.geometry.coordinates.forEach((a, i1) => {
                  a.forEach((b, i2) => {
                    b.forEach((c, i3) => {
                      if (wrap(c[0]))
                        feature.geometry.coordinates[i1][i2][i3][0] = c[0] +=
                          adj;
                    });
                  });
                });
              }
              return feature;
            },
          },
        },
      ],
    },
    {
      name: "Central America and the Caribbean",
      options: [
        {
          name: "Belize",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Costa Rica",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "Canton", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Cuba",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Dominican Republic",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "El Salvador",
          options: [{ name: "Department", value: { level: "Adm4" } }],
        },
        {
          name: "Guatemala",
          options: [
            { name: "Department", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Haiti",
          options: [
            { name: "Department", value: { level: "Adm4" } },
            { name: "Arrondissement", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Honduras",
          options: [{ name: "Department", value: { level: "Adm4" } }],
        },
        {
          name: "Jamaica",
          options: [{ name: "Parish", value: { level: "Adm6" } }],
        },
        {
          name: "Nicaragua",
          options: [
            { name: "Department", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Panama",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Puerto Rico",
          options: [{ name: "Municipality", value: { level: "Adm6" } }],
        },
      ],
    },
    {
      name: "Central Asia",
      options: [
        {
          name: "Armenia",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "Azerbaijan",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Cyprus",
          options: [{ name: "District", value: { level: "Adm6" } }],
        },
        {
          name: "Georgia",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Municipality / District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Kazakhstan",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Kyrgyzstan",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Russia",
          options: [{ name: "Oblast", value: { level: "Adm4" } }],
        },
        {
          name: "Tajikistan",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Turkmenistan",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Uzbekistan",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
      ],
    },
    {
      name: "East Asia and Pacific",
      options: [
        {
          name: "Australia",
          options: [
            { name: "State", value: { level: "Adm4" } },
            { name: "LGA", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Brunei",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Cambodia",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "China",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "Cities", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Indonesia",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "Japan",
          options: [
            { name: "Prefecture", value: { level: "Adm4" } },
            { name: "Subprefecture", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Laos",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Malaysia",
          options: [{ name: "State_Territory", value: { level: "Adm4" } }],
        },
        {
          name: "Mongolia",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Myanmar",
          options: [
            { name: "Region / State", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "New Zealand",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "North Korea",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "City", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Papua New Guinea",
          options: [
            { name: "Region", value: { level: "Adm3" } },
            { name: "Province", value: { level: "Adm4" } },
          ],
        },
        {
          name: "Philippines",
          options: [
            { name: "Region", value: { level: "Adm3" } },
            { name: "Province", value: { level: "Adm4" } },
          ],
        },
        {
          name: "Singapore",
          options: [{ name: "CDC", value: { level: "Adm6" } }],
        },
        {
          name: "South Korea",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "City", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Thailand",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "Vietnam",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "City", value: { level: "Adm6" } },
          ],
        },
      ],
    },
    {
      name: "Europe",
      options: [
        {
          name: "Albania",
          options: [
            { name: "Counties", value: { level: "Adm6" } },
            { name: "Municipality", value: { level: "Adm7" } },
          ],
        },
        {
          name: "Austria",
          options: [
            { name: "State", value: { level: "Adm4" } },
            { name: "District &amp; S. Cities", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Belarus",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Belgium",
          options: [
            { name: "Regions", value: { level: "Adm4" } },
            { name: "Province", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Bosnia-Herzegovina",
          options: [
            { name: "District", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Bulgaria",
          options: [
            { name: "Province", value: { level: "Adm6" } },
            { name: "Municipality", value: { level: "Adm8" } },
          ],
        },
        {
          name: "Croatia",
          options: [
            { name: "County", value: { level: "Adm6" } },
            { name: "Municipality", value: { level: "Adm7" } },
          ],
        },
        {
          name: "Czech Republic",
          options: [
            { name: "Regions", value: { level: "Adm6" } },
            { name: "District", value: { level: "Adm7" } },
          ],
        },
        {
          name: "Denmark",
          options: [{ name: "Regions", value: { level: "Adm4" } }],
        },
        {
          name: "Estonia",
          options: [
            { name: "County", value: { level: "Adm6" } },
            { name: "Municipality", value: { level: "Adm7" } },
          ],
        },
        {
          name: "Finland",
          options: [
            { name: "Region", value: { level: "Adm6" } },
            { name: "Subregion", value: { level: "Adm7" } },
          ],
        },
        {
          name: "France",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Department", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Germany",
          options: [
            { name: "State", value: { level: "Adm4" } },
            {
              name: "District",
              value: {
                level: "Adm6",
                indexedProps: "de:regionalschluessel",
                alternatives: { expand: [{ from: /LANDKREIS /g }] },
              },
            },
          ],
        },
        {
          name: "Greece",
          options: [
            { name: "Region", value: { level: "Adm5" } },
            { name: "Regional Unit", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Hungary",
          options: [
            { name: "County", value: { level: "Adm6" } },
            { name: "District", value: { level: "Adm7" } },
          ],
        },
        {
          name: "Iceland",
          options: [
            { name: "Region", value: { level: "Adm5" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Ireland",
          options: [
            { name: "County", value: { level: "Adm6" } },
            { name: "District", value: { level: "Adm8" } },
          ],
        },
        {
          name: "Italy",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Province", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Kosovo",
          options: [
            {
              name: "District",
              value: {
                level: "Adm4",
                alternatives: {
                  PRISHTINA: ["PRISHTINË", "PRISTINA"],
                  PEJA: ["PEĆ", "PEJE", "PEJË"],
                  GJAKOVA: ["GJAKOVË"],
                  expand: [
                    { from: / \(\d+\)/g, replace: true },
                    { from: "District of ", replace: true },
                    { from: "Region of ", replace: true },
                  ],
                },
              },
            },
            {
              name: "Municipality",
              value: {
                level: "Adm6",
                alternatives: {
                  DEÇAN: ["DEČANI"],
                  DRAGASH: ["DRAGAŠ"],
                  FERIZAJ: ["UROŠEVAC"],
                  "FUSHË KOSOVË": ["KOSOVO POLJE"],
                  GJAKOVË: ["GJAKOVA", "ĐAKOVICA"],
                  GJILAN: ["GNJILANE"],
                  GLLOGOVC: ["DRENAS", "GLOGOVAC", "GLLOGOC"],
                  GRACANICË: ["GRAČANICA", "GRAÇANICË", "GRACANICA"],
                  "HANI I ELEZIT": ["ELEZ HAN"],
                  ISTOG: ["BURIM", "ISTOK"],
                  KAÇANIK: ["KAČANIK"],
                  KAMENICA: ["DARDANË", "KOSOVSKA KAMENICA", "KAMENICË"],
                  KLINA: ["KLINË"],
                  KLOKOT: ["KLLOKOT", "KLLOKOTI"],
                  LEPOSAVIQ: ["LEPOSAVIĆ"],
                  LIPJAN: ["LIPLJAN"],
                  MALISHEVË: ["MALIŠEVO"],
                  MAMUSHË: ["MAMUŠA", "MAMUSH"],
                  MITROVICA: ["MITROVICË", "KOSOVSKA MITROVICA"],
                  "MITROVICA E VERIUT": [
                    "MITROVICA VERIORE",
                    "NORTH MITROVICA",
                    "SEVERNA KOSOVSKA MITROVICA",
                    "SEVERNA MITROVICA",
                  ],
                  "NOVO BRDO": ["NOVOBËRDË", "NOVOBERDE"],
                  OBILIQ: ["KASTRIOT", "OBILIĆ", "OBILIC"],
                  PARTESH: ["PARTEŠ", "PARTES"],
                  PEJË: ["PEĆ"],
                  PODUJEVË: ["BESIANË", "PODUJEVO"],
                  PRISHTINË: ["PRISHTINA", "PRISHTINE", "PRISTINA", "PRIŠTINA"],
                  RAHOVEC: ["ORAHOVAC"],
                  RANILLUG: ["RANILUG", "RANILLUK"],
                  SHTËRPCE: ["SHTËRPCË", "ŠTRPCE"],
                  SHTIME: ["ŠTIMLJE"],
                  SKENDERAJ: ["SKËNDERAJ", "SRBICA"],
                  "SUHA REKË": ["SUHAREKË", "THERANDË", "SUVA REKA"],
                  VITI: ["VITINA", "VITIA"],
                  VUSHTRRI: ["VUČITRN"],
                  "ZUBIN POTOK": ["ZUBIN POTOKU", "ZUBİN POTOK"],
                  ZVEÇAN: ["ZVEČAN"],
                  expand: [
                    { from: / \(\d+\)/g, replace: true },
                    { from: "Municipality of ", replace: true },
                    { from: "Region of ", replace: true },
                  ],
                },
              },
            },
          ],
        },
        {
          name: "Latvia",
          options: [{ name: "Municipality", value: { level: "Adm6" } }],
        },
        {
          name: "Lithuania",
          options: [
            { name: "County", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Macedonia",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            {
              name: "Municipality",
              value: {
                level: "Adm7",
                alternatives: { expand: [{ from: /MUNICIPALITY OF /g }] },
              },
            },
          ],
        },
        {
          name: "Moldova",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Montenegro",
          options: [{ name: "Municipality", value: { level: "Adm4" } }],
        },
        {
          name: "Netherlands",
          options: [
            { name: "State", value: { level: "Adm3" } },
            { name: "Province", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm8" } },
          ],
        },
        {
          name: "Norway",
          options: [
            { name: "County", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm7" } },
          ],
        },
        {
          name: "Poland",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "County", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Portugal",
          options: [
            { name: "District", value: { level: "Adm6" } },
            { name: "Municipality", value: { level: "Adm7" } },
          ],
        },
        {
          name: "Romania",
          options: [{ name: "County", value: { level: "Adm4" } }],
        },
        {
          name: "Serbia",
          options: [
            { name: "District", value: { level: "Adm6" } },
            { name: "Municipality_City", value: { level: "Adm8" } },
          ],
        },
        {
          name: "Slovakia",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm8" } },
          ],
        },
        {
          name: "Slovenia",
          options: [
            { name: "Region", value: { level: "Adm5" } },
            { name: "Municipality", value: { level: "Adm8" } },
          ],
        },
        {
          name: "Spain",
          options: [
            { name: "Autonomous Community", value: { level: "Adm4" } },
            { name: "Province", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Sweden",
          options: [
            { name: "County", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm7" } },
          ],
        },
        {
          name: "Switzerland",
          options: [
            { name: "Canton", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Turkey",
          options: [
            { name: "Region", value: { level: "Adm3" } },
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Ukraine",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Raion", value: { level: "Adm6" } },
          ],
        },
        {
          name: "United Kingdom",
          options: [
            { name: "Country", value: { level: "Adm4" } },
            { name: "County / Unitary authorities", value: { level: "Adm6" } },
          ],
        },
      ],
    },
    {
      name: "Middle East and North Africa",
      options: [
        {
          name: "Algeria", // NOT READY
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
            // { "name": "Municipality", "value": { "level": "Adm8"} }, // Not OSM-based
          ],
        },
        {
          name: "Bahrain",
          options: [{ name: "Governorate", value: { level: "Adm4" } }],
        },
        {
          name: "Egypt",
          options: [{ name: "Governorate", value: { level: "Adm4" } }],
        },
        {
          name: "Iraq",
          options: [{ name: "Governorate", value: { level: "Adm4" } }],
        },
        {
          name: "Iran",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "County", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Israel",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Jordan",
          options: [{ name: "Governorate", value: { level: "Adm4" } }],
        },
        {
          name: "Kuwait",
          options: [{ name: "Governorate", value: { level: "Adm4" } }],
        },
        {
          name: "Lebanon",
          options: [
            { name: "Governorate", value: { level: "Adm3" } },
            { name: "District", value: { level: "Adm4" } },
          ],
        },
        {
          name: "Libya",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Morocco",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Profecture / Province", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Oman",
          options: [{ name: "Governorate", value: { level: "Adm4" } }],
        },
        {
          name: "Palestine",
          options: [
            { name: "Territory", value: { level: "Adm3" } },
            { name: "Governorate", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Qatar",
          options: [{ name: "Municipality", value: { level: "Adm4" } }],
        },
        {
          name: "Saudi Arabia",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Syria",
          options: [
            {
              name: "Governorate",
              value: { level: "Adm4", indexedProps: ["PCODE"] },
            },
          ],
        },
        {
          name: "Tunisia",
          options: [
            { name: "Governorate", value: { level: "Adm4" } },
            { name: "Delegation", value: { level: "Adm5" } },
          ],
        },
        {
          name: "United Arab Emirates",
          options: [{ name: "Emirate", value: { level: "Adm4" } }],
        },
        {
          name: "Yemen",
          options: [
            {
              name: "Governorate",
              value: {
                level: "Adm4",
                alternatives: { expand: [{ from: / GOVERNORATE/g }] },
              },
            },
          ],
        },
      ],
    },
    {
      name: "North Ameria",
      options: [
        {
          name: "Canada",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "Mexico",
          options: [
            { name: "State", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "United States",
          options: [
            {
              name: "States",
              value: {
                level: "Adm4",
                indexedProps: ["ISO3166_2"],
                alternatives: {
                  expand: [{ from: "US-", replace: true }],
                  // fips codes
                  ALABAMA: [1, "01"],
                  ALASKA: [2, "02"],
                  ARIZONA: [4, "04"],
                  ARKANSAS: [5, "05"],
                  CALIFORNIA: [6, "06"],
                  COLORADO: [8, "08"],
                  CONNECTICUT: [9, "09"],
                  DELAWARE: [10],
                  "DISTRICT OF COLUMBIA": [11],
                  FLORIDA: [12],
                  GEORGIA: [13],
                  HAWAII: [15],
                  IDAHO: [16],
                  ILLINOIS: [17],
                  INDIANA: [18],
                  IOWA: [19],
                  KANSAS: [20],
                  KENTUCKY: [21],
                  LOUISIANA: [22],
                  MAINE: [23],
                  MARYLAND: [24],
                  MASSACHUSETTS: [25],
                  MICHIGAN: [26],
                  MINNESOTA: [27],
                  MISSISSIPPI: [28],
                  MISSOURI: [29],
                  MONTANA: [30],
                  NEBRASKA: [31],
                  NEVADA: [32],
                  "NEW HAMPSHIRE": [33],
                  "NEW JERSEY": [34],
                  "NEW MEXICO": [35],
                  "NEW YORK": [36],
                  "NORTH CAROLINA": [37],
                  "NORTH DAKOTA": [38],
                  OHIO: [39],
                  OKLAHOMA: [40],
                  OREGON: [41],
                  PENNSYLVANIA: [42],
                  "RHODE ISLAND": [44],
                  "SOUTH CAROLINA": [45],
                  "SOUTH DAKOTA": [46],
                  TENNESSEE: [47],
                  TEXAS: [48],
                  UTAH: [49],
                  VERMONT: [50],
                  VIRGINIA: [51],
                  WASHINGTON: [53],
                  "WEST VIRGINIA": [54],
                  WISCONSIN: [55],
                  WYOMING: [56],
                  "AMERICAN SAMOA": [60],
                  GUAM: [14, 66],
                  "NORTHERN MARIANA ISLANDS": [69],
                  "PUERTO RICO": [72],
                  "VIRGIN ISLANDS": [78],
                },
                featureCb: (feature) => {
                  var wrap = null,
                    adj = 9;
                  switch (feature.properties.name) {
                    case 2:
                    case "AK":
                    case "Alaska":
                    case "Northern Mariana Islands":
                    case "Guam":
                      wrap = (x) => x > 0;
                      adj = -360;
                      break;
                  }
                  if (wrap) {
                    if (feature.geometry.coordinates[0][0][0][0]) {
                      feature.geometry.coordinates.forEach((a, i1) => {
                        a.forEach((b, i2) => {
                          b.forEach((c, i3) => {
                            if (wrap(c[0])) {
                              feature.geometry.coordinates[i1][i2][i3][0] =
                                c[0] += adj;
                            }
                          });
                        });
                      });
                    } else {
                      feature.geometry.coordinates.forEach((a, i1) => {
                        a.forEach((b, i2) => {
                          if (wrap(b[0])) {
                            feature.geometry.coordinates[i1][i2][0] = b[0] +=
                              adj;
                          }
                        });
                      });
                    }
                  }
                  return feature;
                },
              },
            },
            {
              name: "Counties",
              value: {
                level: "Adm6",
                indexedProps: ["GEO_ID"],
                alternatives: {
                  expand: [{ from: "0500000US", replace: true }],
                },
              },
            },
            {
              name: "Congressional Districts",
              options: [
                {
                  name: "115th",
                  value: {
                    level: "CD115",
                    featureCb: (feature) => {
                      var wrap = null,
                        adj = 9;
                      switch (feature.properties.id.substr(0, 2)) {
                        case "AK":
                          wrap = (x) => x > 0;
                          adj = -360;
                          break;
                      }
                      if (wrap) {
                        feature.geometry.coordinates.forEach((a, i1) => {
                          a.forEach((b, i2) => {
                            b.forEach((c, i3) => {
                              if (wrap(c[0]))
                                feature.geometry.coordinates[i1][i2][i3][0] =
                                  c[0] += adj;
                            });
                          });
                        });
                      }
                      return feature;
                    },
                  },
                },
                {
                  name: "115th-Hexagon",
                  value: {
                    level: "CD115HEX",
                    indexedProps: ["GEO_ID"],
                    featureCb: (feature) => {
                      feature.properties.GEO_ID =
                        feature.properties.STATEAB +
                        "-" +
                        feature.properties.CDLABEL.padStart(2, "0");
                      return feature;
                    },
                  },
                },
              ],
            },
            {
              name: "DC",
              options: [
                {
                  name: "Wards (2012)",
                  value: { level: "Wards2012", indexedProps: ["WARD"] },
                },
                {
                  name: "ANCs (2013)",
                  value: { level: "ANC2013", indexedProps: ["ANC_ID"] },
                },
                {
                  name: "Neighborhoods",
                  value: { level: "Neighborhoods", indexedProps: ["subhood"] },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "South America",
      options: [
        {
          name: "Argentina",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "Department", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Bolivia",
          options: [
            { name: "Department", value: { level: "Adm4" } },
            { name: "Province", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Brazil",
          options: [{ name: "State", value: { level: "Adm4" } }],
        },
        {
          name: "Chile",
          options: [
            { name: "Regions", value: { level: "Adm4" } },
            { name: "Province", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Colombia",
          options: [
            { name: "Department", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Ecuador",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "Cantons", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Guyana",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Paraguay",
          options: [
            { name: "Department", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm8" } },
          ],
        },
        {
          name: "Peru",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Suriname",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Uruguay",
          options: [{ name: "Department", value: { level: "Adm4" } }],
        },
        {
          name: "Venezuela",
          options: [{ name: "State", value: { level: "Adm4" } }],
        },
      ],
    },
    {
      name: "South Asia",
      options: [
        {
          name: "Afghanistan",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Bangladesh",
          options: [
            {
              name: "Divisions",
              value: { level: "Adm4", indexedProps: "Division" },
            },
            {
              name: "District",
              value: {
                level: "Adm5",
                indexedProps: "District",
                alternatives: {
                  NETRAKONA: ["NETROKONA"],
                  BRAHAMANBARIA: ["BRAHMANBARIA"],
                  NAWABGANJ: ["CHAPAI NAWABGANJ"],
                },
              },
            },
            {
              name: "Upazilas",
              value: {
                level: "Adm6",
                indexedProps: "Upazila",
                alternatives: {
                  NETRAKONA: ["NETROKONA"],
                  BRAHAMANBARIA: ["BRAHMANBARIA"],
                  NAWABGANJ: ["CHAPAI NAWABGANJ"],
                },
              },
            },
          ],
        },
        {
          name: "Bhutan",
          options: [
            { name: "District", value: { level: "Adm4" } },
            { name: "Gewogs", value: { level: "Adm6" } },
          ],
        },
        {
          name: "India",
          options: [
            { name: "State_Union_Territory", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Nepal",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Zone", value: { level: "Adm5" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Pakistan",
          options: [{ name: "Province", value: { level: "Adm3" } }],
        },
        {
          name: "Sri Lanka",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm5" } },
          ],
        },
      ],
    },
    {
      name: "Sub-Saharan Africa",
      options: [
        {
          name: "Angola",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Benin",
          options: [
            { name: "Department", value: { level: "Adm4" } },
            { name: "Communes", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Botswana",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Burkina Faso",
          options: [
            { name: "Regions", value: { level: "Adm4" } },
            { name: "Province", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Burundi",
          options: [{ name: "Provices", value: { level: "Adm4" } }],
        },
        {
          name: "Cameroon",
          options: [
            { name: "Regions", value: { level: "Adm4" } },
            { name: "Department", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Central African Republic",
          options: [{ name: "Prefectures", value: { level: "Adm4" } }],
        },
        {
          name: "Chad",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Congo",
          options: [{ name: "Department", value: { level: "Adm4" } }],
        },
        {
          name: "Djibouti",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "DR-Congo",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "Eritrea",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Ethiopia",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Zone", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Gabon",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "Ghana",
          options: [{ name: "Governorate", value: { level: "Adm4" } }],
        },
        {
          name: "Gambia",
          options: [
            { name: "Regions", value: { level: "Adm4" } },
            { name: "LGAs", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Guinea",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Ivory Coast",
          options: [
            { name: "District", value: { level: "Adm4" } },
            { name: "Region", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Kenya",
          options: [{ name: "County", value: { level: "Adm4" } }],
        },
        {
          name: "Lesotho",
          options: [{ name: "District", value: { level: "Adm5" } }],
        },
        {
          name: "Liberia",
          options: [
            { name: "County", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Madagascar",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Malawi",
          options: [
            { name: "Region", value: { level: "Adm3" } },
            { name: "District", value: { level: "Adm4" } },
          ],
        },
        {
          name: "Mali",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Cercle", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Mauritania",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Mozambique",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "Namibia",
          options: [{ name: "Region", value: { level: "Adm4" } }],
        },
        {
          name: "Niger",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Department", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Nigeria",
          options: [
            { name: "State", value: { level: "Adm4" } },
            { name: "LGA", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Rwanda",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Senegal",
          options: [{ name: "Region", value: { level: "Adm3" } }],
        },
        {
          name: "Somalia",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Sierra Leone",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm5" } },
          ],
        },
        {
          name: "South Africa",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "Municipality", value: { level: "Adm6" } },
          ],
        },
        {
          name: "South Sudan",
          options: [
            { name: "State", value: { level: "Adm4" } },
            {
              name: "County",
              value: { level: "Adm6", indexedProps: ["ADM2_EN", "ADM2_PCODE"] },
            },
          ],
        },
        {
          name: "Sudan",
          options: [
            { name: "State", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Swaziland",
          options: [
            { name: "District", value: { level: "Adm4" } },
            { name: "Inkhundla", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Tanzania",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm5" } },
          ],
        },
        {
          name: "Togo",
          options: [
            { name: "Region", value: { level: "Adm4" } },
            { name: "Prefecture", value: { level: "Adm6" } },
          ],
        },
        {
          name: "Uganda",
          options: [{ name: "District", value: { level: "Adm4" } }],
        },
        {
          name: "Zambia",
          options: [{ name: "Province", value: { level: "Adm4" } }],
        },
        {
          name: "Zimbabwe",
          options: [
            { name: "Province", value: { level: "Adm4" } },
            { name: "District", value: { level: "Adm6" } },
          ],
        },
      ],
    },
  ],
};

var _mapShapesLoaded = false;

/** -- */
function loadMapStandards() {
  if (_mapShapesLoaded) return;

  // recursive call
  function addMapIndex(obj, path) {
    if (obj.value) {
      var level = obj.value.level;
      if (path[0] !== "World" && path[0] !== "Custom") path = path.slice(1);
      var mapIndex = `Map_${path.map((_) => _.replace(/ /g, "").replace(/-/g, "")).join("_")}_${level}`;
      Base.maps.set(
        mapIndex,
        new MapData(
          mapIndex,
          `${Base.geoFileDir}${path.concat(level).join("/")}.${
            Base.geoFileExt
          }`,
          obj.value
        )
      );
    } else if (obj.options) {
      path = path.concat([obj.name]);
      obj.options.forEach((_) => addMapIndex(_, path));
    }
  }

  mapStandardsMenuOpts.options.forEach((region) => addMapIndex(region, []));

  _mapShapesLoaded = true;
}

export { mapStandardsMenuOpts, loadMapStandards };
