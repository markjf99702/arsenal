// Made by tools/league.mjs from Baseball Savant's Statcast search on 2026-11-01: the 2026 regular season.
// LEAGUE is every pitch; zone is the nine boxes of Statcast's strike zone. COUNTS and TYPES give shares of pitches:
// how many were in the zone, fastballs (four-seam, sinker, cutter), swung at, and missed per swing.
// PITCHERS: the arsenals you can pitch as. side is feet from the middle of the rubber at release, toward the arm side.
export const LEAGUE = {"pitches":714483,"pa":183849,"so":40700,"bb":16337,"hits":39849,"singles":26110,"doubles":7493,"triples":671,"hrs":5575,"swings":340741,"whiffs":85444,"takes":373742,"bip":124611,"hbp":2119,"called":115698,"balls":255886,"zone":{"pitches":339240,"swings":226357,"whiffs":36416,"called":105034}};
export const COUNTS = {
 "0-0": {
  "pitches": 183681,
  "zone": 0.52,
  "fastball": 0.6,
  "swing": 0.322,
  "whiff": 0.263
 },
 "0-1": {
  "pitches": 92035,
  "zone": 0.428,
  "fastball": 0.497,
  "swing": 0.493,
  "whiff": 0.276
 },
 "0-2": {
  "pitches": 48561,
  "zone": 0.299,
  "fastball": 0.426,
  "swing": 0.511,
  "whiff": 0.276
 },
 "1-0": {
  "pitches": 70251,
  "zone": 0.534,
  "fastball": 0.605,
  "swing": 0.427,
  "whiff": 0.249
 },
 "1-1": {
  "pitches": 71305,
  "zone": 0.477,
  "fastball": 0.504,
  "swing": 0.547,
  "whiff": 0.263
 },
 "1-2": {
  "pitches": 69561,
  "zone": 0.35,
  "fastball": 0.435,
  "swing": 0.575,
  "whiff": 0.265
 },
 "2-0": {
  "pitches": 23823,
  "zone": 0.573,
  "fastball": 0.713,
  "swing": 0.397,
  "whiff": 0.219
 },
 "2-1": {
  "pitches": 36868,
  "zone": 0.547,
  "fastball": 0.606,
  "swing": 0.573,
  "whiff": 0.227
 },
 "2-2": {
  "pitches": 59079,
  "zone": 0.439,
  "fastball": 0.481,
  "swing": 0.642,
  "whiff": 0.234
 },
 "3-0": {
  "pitches": 7652,
  "zone": 0.614,
  "fastball": 0.942,
  "swing": 0.073,
  "whiff": 0.151
 },
 "3-1": {
  "pitches": 15738,
  "zone": 0.592,
  "fastball": 0.776,
  "swing": 0.514,
  "whiff": 0.197
 },
 "3-2": {
  "pitches": 35929,
  "zone": 0.562,
  "fastball": 0.631,
  "swing": 0.7,
  "whiff": 0.19
 }
};
export const TYPES = {
 "FF": {
  "pitches": 219172,
  "zone": 0.526,
  "swing": 0.492,
  "whiff": 0.218,
  "zoneSwing": 0.684,
  "zoneWhiff": 0.172,
  "chaseSwing": 0.277,
  "chaseWhiff": 0.343
 },
 "SI": {
  "pitches": 118820,
  "zone": 0.559,
  "swing": 0.459,
  "whiff": 0.136,
  "zoneSwing": 0.618,
  "zoneWhiff": 0.099,
  "chaseSwing": 0.256,
  "chaseWhiff": 0.25
 },
 "FC": {
  "pitches": 57232,
  "zone": 0.512,
  "swing": 0.494,
  "whiff": 0.228,
  "zoneSwing": 0.688,
  "zoneWhiff": 0.159,
  "chaseSwing": 0.29,
  "chaseWhiff": 0.401
 },
 "SL": {
  "pitches": 93530,
  "zone": 0.435,
  "swing": 0.485,
  "whiff": 0.334,
  "zoneSwing": 0.675,
  "zoneWhiff": 0.18,
  "chaseSwing": 0.338,
  "chaseWhiff": 0.57
 },
 "ST": {
  "pitches": 59358,
  "zone": 0.427,
  "swing": 0.449,
  "whiff": 0.312,
  "zoneSwing": 0.624,
  "zoneWhiff": 0.167,
  "chaseSwing": 0.319,
  "chaseWhiff": 0.524
 },
 "CU": {
  "pitches": 45424,
  "zone": 0.401,
  "swing": 0.403,
  "whiff": 0.306,
  "zoneSwing": 0.556,
  "zoneWhiff": 0.139,
  "chaseSwing": 0.3,
  "chaseWhiff": 0.512
 },
 "KC": {
  "pitches": 11686,
  "zone": 0.388,
  "swing": 0.453,
  "whiff": 0.34,
  "zoneSwing": 0.615,
  "zoneWhiff": 0.144,
  "chaseSwing": 0.35,
  "chaseWhiff": 0.558
 },
 "SV": {
  "pitches": 3218,
  "zone": 0.395,
  "swing": 0.412,
  "whiff": 0.299,
  "zoneSwing": 0.576,
  "zoneWhiff": 0.122,
  "chaseSwing": 0.306,
  "chaseWhiff": 0.518
 },
 "CH": {
  "pitches": 79833,
  "zone": 0.363,
  "swing": 0.502,
  "whiff": 0.314,
  "zoneSwing": 0.764,
  "zoneWhiff": 0.211,
  "chaseSwing": 0.353,
  "chaseWhiff": 0.441
 },
 "FS": {
  "pitches": 23061,
  "zone": 0.351,
  "swing": 0.512,
  "whiff": 0.344,
  "zoneSwing": 0.787,
  "zoneWhiff": 0.208,
  "chaseSwing": 0.364,
  "chaseWhiff": 0.502
 },
 "FO": {
  "pitches": 456,
  "zone": 0.285,
  "swing": 0.434,
  "whiff": 0.424,
  "zoneSwing": 0.769,
  "zoneWhiff": 0.19,
  "chaseSwing": 0.301,
  "chaseWhiff": 0.663
 },
 "KN": {
  "pitches": 310,
  "zone": 0.403,
  "swing": 0.442,
  "whiff": 0.204,
  "zoneSwing": 0.72,
  "zoneWhiff": 0.122,
  "chaseSwing": 0.254,
  "chaseWhiff": 0.362
 }
};
export const PITCHERS = [
 {
  "key": "skenes",
  "line": "Six pitches, most of them hard.",
  "name": "Paul Skenes",
  "hand": "R",
  "pitches": [
   {
    "code": "FF",
    "share": 0.408,
    "mph": 96.8,
    "rpm": 2176,
    "rise": 13,
    "arm": 12.6,
    "height": 5.62,
    "side": 2.37,
    "extension": 6.77,
    "whiff": 0.297
   },
   {
    "code": "ST",
    "share": 0.159,
    "mph": 84.3,
    "rpm": 2333,
    "rise": 5.6,
    "arm": -10.2,
    "height": 5.53,
    "side": 2.52,
    "extension": 6.73,
    "whiff": 0.286
   },
   {
    "code": "CH",
    "share": 0.125,
    "mph": 88.7,
    "rpm": 1820,
    "rise": 6.5,
    "arm": 15.5,
    "height": 5.55,
    "side": 2.52,
    "extension": 6.72,
    "whiff": 0.374
   },
   {
    "code": "SI",
    "share": 0.118,
    "mph": 96.6,
    "rpm": 2154,
    "rise": 7.3,
    "arm": 17,
    "height": 5.59,
    "side": 2.57,
    "extension": 6.74,
    "whiff": 0.149
   },
   {
    "code": "FS",
    "share": 0.101,
    "mph": 93.2,
    "rpm": 1638,
    "rise": 1.7,
    "arm": 13.3,
    "height": 5.62,
    "side": 2.46,
    "extension": 6.74,
    "whiff": 0.177
   },
   {
    "code": "SL",
    "share": 0.086,
    "mph": 86.7,
    "rpm": 2317,
    "rise": 1.9,
    "arm": -3.2,
    "height": 5.57,
    "side": 2.43,
    "extension": 6.77,
    "whiff": 0.358
   }
  ]
 },
 {
  "key": "misiorowski",
  "line": "A four-seamer at 100 mph, and a curve at 88.",
  "name": "Jacob Misiorowski",
  "hand": "R",
  "pitches": [
   {
    "code": "FF",
    "share": 0.634,
    "mph": 100.6,
    "rpm": 2635,
    "rise": 15.4,
    "arm": 11.2,
    "height": 5.22,
    "side": 1.89,
    "extension": 7.57,
    "whiff": 0.402
   },
   {
    "code": "FC",
    "share": 0.14,
    "mph": 95.8,
    "rpm": 2581,
    "rise": 7.2,
    "arm": -1.4,
    "height": 5.04,
    "side": 2.01,
    "extension": 7.57,
    "whiff": 0.209
   },
   {
    "code": "SL",
    "share": 0.108,
    "mph": 91.9,
    "rpm": 2547,
    "rise": 1.8,
    "arm": -3.5,
    "height": 5.09,
    "side": 1.98,
    "extension": 7.49,
    "whiff": 0.353
   },
   {
    "code": "CU",
    "share": 0.107,
    "mph": 88,
    "rpm": 2219,
    "rise": -7.8,
    "arm": -5.6,
    "height": 5.38,
    "side": 1.78,
    "extension": 7.27,
    "whiff": 0.439
   }
  ]
 },
 {
  "key": "gausman",
  "line": "Four-seamer and splitter, out of the same tunnel.",
  "name": "Kevin Gausman",
  "hand": "R",
  "pitches": [
   {
    "code": "FF",
    "share": 0.506,
    "mph": 93.8,
    "rpm": 2293,
    "rise": 16.9,
    "arm": 10.6,
    "height": 5.84,
    "side": 2.38,
    "extension": 6.73,
    "whiff": 0.15
   },
   {
    "code": "FS",
    "share": 0.392,
    "mph": 84,
    "rpm": 1566,
    "rise": 4.3,
    "arm": 13.9,
    "height": 5.69,
    "side": 2.55,
    "extension": 6.77,
    "whiff": 0.429
   },
   {
    "code": "SL",
    "share": 0.081,
    "mph": 84.1,
    "rpm": 2266,
    "rise": 3.4,
    "arm": -1,
    "height": 5.7,
    "side": 2.49,
    "extension": 6.69,
    "whiff": 0.362
   }
  ]
 },
 {
  "key": "sanchez",
  "line": "A lefty’s sinker and changeup.",
  "name": "Cristopher Sánchez",
  "hand": "L",
  "pitches": [
   {
    "code": "SI",
    "share": 0.444,
    "mph": 95.1,
    "rpm": 2125,
    "rise": 4.3,
    "arm": 18.1,
    "height": 6.06,
    "side": 1.9,
    "extension": 6.88,
    "whiff": 0.119
   },
   {
    "code": "CH",
    "share": 0.371,
    "mph": 87,
    "rpm": 2046,
    "rise": -0.5,
    "arm": 16.9,
    "height": 6.03,
    "side": 2,
    "extension": 6.99,
    "whiff": 0.46
   },
   {
    "code": "SL",
    "share": 0.185,
    "mph": 86.3,
    "rpm": 2062,
    "rise": -3.6,
    "arm": -1.3,
    "height": 6.13,
    "side": 1.89,
    "extension": 6.82,
    "whiff": 0.431
   }
  ]
 },
 {
  "key": "sale",
  "line": "A lefty’s slider that sweeps a foot.",
  "name": "Chris Sale",
  "hand": "L",
  "pitches": [
   {
    "code": "FF",
    "share": 0.414,
    "mph": 96.1,
    "rpm": 2351,
    "rise": 10,
    "arm": 14.5,
    "height": 4.94,
    "side": 2.97,
    "extension": 6.61,
    "whiff": 0.275
   },
   {
    "code": "SL",
    "share": 0.399,
    "mph": 79.8,
    "rpm": 2529,
    "rise": -4.2,
    "arm": -12.6,
    "height": 4.81,
    "side": 2.97,
    "extension": 6.42,
    "whiff": 0.382
   },
   {
    "code": "CH",
    "share": 0.103,
    "mph": 88.5,
    "rpm": 1859,
    "rise": -0.1,
    "arm": 16.3,
    "height": 4.62,
    "side": 3.04,
    "extension": 6.67,
    "whiff": 0.303
   },
   {
    "code": "SI",
    "share": 0.084,
    "mph": 95.6,
    "rpm": 2211,
    "rise": 2.5,
    "arm": 18,
    "height": 4.8,
    "side": 3,
    "extension": 6.64,
    "whiff": 0.106
   }
  ]
 },
 {
  "key": "nola",
  "line": "Lives on the knuckle curve.",
  "name": "Aaron Nola",
  "hand": "R",
  "pitches": [
   {
    "code": "KC",
    "share": 0.333,
    "mph": 78.4,
    "rpm": 2629,
    "rise": -10.3,
    "arm": -14.8,
    "height": 5.1,
    "side": 1.84,
    "extension": 6.76,
    "whiff": 0.411
   },
   {
    "code": "FF",
    "share": 0.24,
    "mph": 92.3,
    "rpm": 2354,
    "rise": 14.6,
    "arm": 12.7,
    "height": 4.95,
    "side": 1.88,
    "extension": 6.94,
    "whiff": 0.141
   },
   {
    "code": "SI",
    "share": 0.182,
    "mph": 91.6,
    "rpm": 2271,
    "rise": 8.2,
    "arm": 17.4,
    "height": 4.92,
    "side": 1.86,
    "extension": 6.99,
    "whiff": 0.122
   },
   {
    "code": "CH",
    "share": 0.163,
    "mph": 85.6,
    "rpm": 1558,
    "rise": 3,
    "arm": 14.5,
    "height": 4.82,
    "side": 1.98,
    "extension": 6.9,
    "whiff": 0.256
   },
   {
    "code": "FC",
    "share": 0.076,
    "mph": 86.2,
    "rpm": 2300,
    "rise": 7.7,
    "arm": -0.7,
    "height": 4.98,
    "side": 1.9,
    "extension": 6.89,
    "whiff": 0.256
   }
  ]
 },
 {
  "key": "miller",
  "line": "A closer: 101 mph and a slider.",
  "name": "Mason Miller",
  "hand": "R",
  "pitches": [
   {
    "code": "SL",
    "share": 0.497,
    "mph": 88,
    "rpm": 2408,
    "rise": -4.1,
    "arm": -10,
    "height": 6.16,
    "side": 1.51,
    "extension": 6.78,
    "whiff": 0.563
   },
   {
    "code": "FF",
    "share": 0.483,
    "mph": 101.4,
    "rpm": 2509,
    "rise": 16.4,
    "arm": 6,
    "height": 6.29,
    "side": 1.41,
    "extension": 6.76,
    "whiff": 0.365
   }
  ]
 },
 {
  "key": "rogers",
  "line": "A submariner: an 83 mph sinker from below the knees.",
  "name": "Tyler Rogers",
  "hand": "R",
  "pitches": [
   {
    "code": "SI",
    "share": 0.759,
    "mph": 83.2,
    "rpm": 1979,
    "rise": -12.5,
    "arm": 1.8,
    "height": 1.25,
    "side": 3.84,
    "extension": 6.06,
    "whiff": 0.12
   },
   {
    "code": "SL",
    "share": 0.241,
    "mph": 73.5,
    "rpm": 2440,
    "rise": 13.6,
    "arm": -11.9,
    "height": 1.3,
    "side": 3.82,
    "extension": 6.05,
    "whiff": 0.234
   }
  ]
 },
 {
  "key": "waldron",
  "line": "A knuckleballer, with fastballs to keep hitters honest.",
  "name": "Matt Waldron",
  "hand": "R",
  "pitches": [
   {
    "code": "KN",
    "share": 0.301,
    "mph": 80.5,
    "rpm": 315,
    "rise": -2.2,
    "arm": 2.3,
    "height": 5.6,
    "side": 0.9,
    "extension": 6.41,
    "whiff": 0.21
   },
   {
    "code": "FC",
    "share": 0.21,
    "mph": 87.9,
    "rpm": 2134,
    "rise": 7.9,
    "arm": -2.4,
    "height": 5.48,
    "side": 1.16,
    "extension": 6.62,
    "whiff": 0.163
   },
   {
    "code": "FF",
    "share": 0.178,
    "mph": 92,
    "rpm": 2063,
    "rise": 14,
    "arm": 7.8,
    "height": 5.54,
    "side": 1.04,
    "extension": 6.67,
    "whiff": 0.2
   },
   {
    "code": "SI",
    "share": 0.164,
    "mph": 91.5,
    "rpm": 2006,
    "rise": 8.6,
    "arm": 15.2,
    "height": 5.42,
    "side": 1.15,
    "extension": 6.75,
    "whiff": 0.175
   },
   {
    "code": "ST",
    "share": 0.146,
    "mph": 80.9,
    "rpm": 2222,
    "rise": 4.4,
    "arm": -13.2,
    "height": 5.36,
    "side": 1.29,
    "extension": 6.69,
    "whiff": 0.1
   }
  ]
 }
];
