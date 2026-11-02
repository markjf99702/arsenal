// Made by tools/league.mjs from Baseball Savant's Statcast search on 2026-11-02: the 2026 regular season.
// LEAGUE is every pitch; zone is the nine boxes of Statcast's strike zone, and tips the foul tips among its whiffs.
// sz is the zone's average top and bottom (feet), and woba what Statcast's wOBA counts each way of reaching base as,
// both from every sixth day's pitches. COUNTS and TYPES give shares of pitches: how many were in the zone, fastballs
// (four-seam, sinker, cutter), swung at, and missed per swing; COUNTS also the share of contact fouled off, and of
// pitches taken that were called strikes, in the zone and out of it. TYPES also: sd, how far a pitcher's speed strays
// from his average pitch to pitch (mph). after, in LEAGUE and each of TYPES, from every sixth day: lor, how much likelier
// a swing missed right after a pitch at least 6 mph faster or slower than right after the same kind of pitch (the log
// of the odds ratio, within the same pitcher, kind of pitch, count and height; 0 is no different), and the swings
// compared. ZONES: each Statcast zone, and in each, breaking2: breaking balls (SL, ST, CU, KC, SV) with two strikes, and
// the strikeouts on them (so). platoon, in LEAGUE: each hand of pitcher to each side of the plate (RL, a
// right-hander to left-handed batters); mix, in each of TYPES: the share of right-handers' pitches to right-handed (R)
// and left-handed (L) batters that were that kind.
// PITCHERS: the arsenals you can pitch as, with their season's plate appearances (paBy: to right- and left-handed
// batters), strikeouts, walks, batters hit by a pitch, balls in play, and singles, doubles, triples and home runs
// against them. side is feet from the middle of the rubber at release, toward the arm side; sd as TYPES's, from all of
// his pitches; zone, the share of the pitch that crossed in the zone; bip, hits and hrs, its balls in play, and the hits
// and home runs among them; mix, its share of his pitches to right-handed (R) and left-handed (L) batters.
// HITTERS: the season's qualified hitters (all, with at least qualified plate appearances), and the quarters of them
// the hitter types are tuned to: free swingers (who chased most out of the zone), patient (chased least), contact
// (missed least per swing) and power (most isolated power, extra bases per at-bat), each pooled, with the range of what
// picked them (from, to). zone is pitches seen in the zone, and zoneSwings and zoneWhiffs the swings and misses at them.
export const LEAGUE = {"pitches":714483,"pa":183849,"so":40700,"bb":16337,"hits":39849,"singles":26110,"doubles":7493,"triples":671,"hrs":5575,"swings":340741,"whiffs":85444,"takes":373742,"bip":124611,"hbp":2119,"called":115698,"balls":255886,"tips":7514,"zone":{"pitches":339240,"swings":226357,"whiffs":36416,"called":105034},"platoon":{"RR":{"pitches":221988,"pa":57947,"so":13043,"bb":4486,"bip":39563,"singles":8377,"doubles":2258,"triples":132,"hrs":1735,"swings":106741,"whiffs":27501,"hbp":824,"zone":{"pitches":105973,"swings":70321,"whiffs":11305}},"RL":{"pitches":278149,"pa":70795,"so":15262,"bb":7046,"bip":47809,"singles":9854,"doubles":2962,"triples":322,"hrs":2287,"swings":131741,"whiffs":32205,"hbp":644,"zone":{"pitches":130876,"swings":88027,"whiffs":13922}},"LR":{"pitches":142135,"pa":36244,"so":7975,"bb":3315,"bip":24572,"singles":5093,"doubles":1613,"triples":114,"hrs":1108,"swings":68159,"whiffs":16971,"hbp":369,"zone":{"pitches":66653,"swings":44929,"whiffs":7295}},"LL":{"pitches":72211,"pa":18863,"so":4420,"bb":1490,"bip":12667,"singles":2786,"doubles":660,"triples":103,"hrs":445,"swings":34100,"whiffs":8767,"hbp":282,"zone":{"pitches":35738,"swings":23080,"whiffs":3894}}},"after":{"lor":-0.175,"apart":8877,"same":8330},"woba":{"BB":0.7,"HBP":0.7,"1B":0.9,"2B":1.25,"3B":1.6,"HR":2},"sz":{"top":3.215,"bottom":1.622,"days":32,"pitches":121091}};
export const COUNTS = {
 "0-0": {
  "pitches": 183681,
  "zone": 0.52,
  "fastball": 0.6,
  "swing": 0.322,
  "whiff": 0.263,
  "foul": 0.521,
  "calledZone": 0.942,
  "calledOut": 0.068
 },
 "0-1": {
  "pitches": 92035,
  "zone": 0.428,
  "fastball": 0.497,
  "swing": 0.493,
  "whiff": 0.276,
  "foul": 0.513,
  "calledZone": 0.885,
  "calledOut": 0.023
 },
 "0-2": {
  "pitches": 48561,
  "zone": 0.299,
  "fastball": 0.426,
  "swing": 0.511,
  "whiff": 0.276,
  "foul": 0.525,
  "calledZone": 0.859,
  "calledOut": 0.006
 },
 "1-0": {
  "pitches": 70251,
  "zone": 0.534,
  "fastball": 0.605,
  "swing": 0.427,
  "whiff": 0.249,
  "foul": 0.499,
  "calledZone": 0.946,
  "calledOut": 0.066
 },
 "1-1": {
  "pitches": 71305,
  "zone": 0.477,
  "fastball": 0.504,
  "swing": 0.547,
  "whiff": 0.263,
  "foul": 0.51,
  "calledZone": 0.896,
  "calledOut": 0.031
 },
 "1-2": {
  "pitches": 69561,
  "zone": 0.35,
  "fastball": 0.435,
  "swing": 0.575,
  "whiff": 0.265,
  "foul": 0.521,
  "calledZone": 0.881,
  "calledOut": 0.011
 },
 "2-0": {
  "pitches": 23823,
  "zone": 0.573,
  "fastball": 0.713,
  "swing": 0.397,
  "whiff": 0.219,
  "foul": 0.506,
  "calledZone": 0.954,
  "calledOut": 0.078
 },
 "2-1": {
  "pitches": 36868,
  "zone": 0.547,
  "fastball": 0.606,
  "swing": 0.573,
  "whiff": 0.227,
  "foul": 0.501,
  "calledZone": 0.922,
  "calledOut": 0.04
 },
 "2-2": {
  "pitches": 59079,
  "zone": 0.439,
  "fastball": 0.481,
  "swing": 0.642,
  "whiff": 0.234,
  "foul": 0.514,
  "calledZone": 0.902,
  "calledOut": 0.013
 },
 "3-0": {
  "pitches": 7652,
  "zone": 0.614,
  "fastball": 0.942,
  "swing": 0.073,
  "whiff": 0.151,
  "foul": 0.486,
  "calledZone": 0.971,
  "calledOut": 0.125
 },
 "3-1": {
  "pitches": 15738,
  "zone": 0.592,
  "fastball": 0.776,
  "swing": 0.514,
  "whiff": 0.197,
  "foul": 0.497,
  "calledZone": 0.929,
  "calledOut": 0.05
 },
 "3-2": {
  "pitches": 35929,
  "zone": 0.562,
  "fastball": 0.631,
  "swing": 0.7,
  "whiff": 0.19,
  "foul": 0.496,
  "calledZone": 0.927,
  "calledOut": 0.017
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
  "chaseWhiff": 0.343,
  "mix": {
   "R": 0.273,
   "L": 0.3393
  },
  "sd": 0.94,
  "after": {
   "lor": -0.193,
   "apart": 3647,
   "same": 3720
  }
 },
 "SI": {
  "pitches": 118820,
  "zone": 0.559,
  "swing": 0.459,
  "whiff": 0.136,
  "zoneSwing": 0.618,
  "zoneWhiff": 0.099,
  "chaseSwing": 0.256,
  "chaseWhiff": 0.25,
  "mix": {
   "R": 0.2201,
   "L": 0.1114
  },
  "sd": 0.9,
  "after": {
   "lor": 0.122,
   "apart": 1094,
   "same": 1115
  }
 },
 "FC": {
  "pitches": 57232,
  "zone": 0.512,
  "swing": 0.494,
  "whiff": 0.228,
  "zoneSwing": 0.688,
  "zoneWhiff": 0.159,
  "chaseSwing": 0.29,
  "chaseWhiff": 0.401,
  "mix": {
   "R": 0.0819,
   "L": 0.0886
  },
  "sd": 1.06,
  "after": {
   "lor": 0.183,
   "apart": 337,
   "same": 295
  }
 },
 "SL": {
  "pitches": 93530,
  "zone": 0.435,
  "swing": 0.485,
  "whiff": 0.334,
  "zoneSwing": 0.675,
  "zoneWhiff": 0.18,
  "chaseSwing": 0.338,
  "chaseWhiff": 0.57,
  "mix": {
   "R": 0.1649,
   "L": 0.0994
  },
  "sd": 1.12,
  "after": {
   "lor": -0.269,
   "apart": 1091,
   "same": 911
  }
 },
 "ST": {
  "pitches": 59358,
  "zone": 0.427,
  "swing": 0.449,
  "whiff": 0.312,
  "zoneSwing": 0.624,
  "zoneWhiff": 0.167,
  "chaseSwing": 0.319,
  "chaseWhiff": 0.524,
  "mix": {
   "R": 0.1202,
   "L": 0.0574
  },
  "sd": 1.09,
  "after": {
   "lor": -0.194,
   "apart": 738,
   "same": 670
  }
 },
 "CU": {
  "pitches": 45424,
  "zone": 0.401,
  "swing": 0.403,
  "whiff": 0.306,
  "zoneSwing": 0.556,
  "zoneWhiff": 0.139,
  "chaseSwing": 0.3,
  "chaseWhiff": 0.512,
  "mix": {
   "R": 0.0401,
   "L": 0.0757
  },
  "sd": 1.15,
  "after": {
   "lor": -0.411,
   "apart": 368,
   "same": 270
  }
 },
 "KC": {
  "pitches": 11686,
  "zone": 0.388,
  "swing": 0.453,
  "whiff": 0.34,
  "zoneSwing": 0.615,
  "zoneWhiff": 0.144,
  "chaseSwing": 0.35,
  "chaseWhiff": 0.558,
  "mix": {
   "R": 0.0168,
   "L": 0.0238
  },
  "sd": 1.17,
  "after": {
   "lor": -1.106,
   "apart": 134,
   "same": 97
  }
 },
 "SV": {
  "pitches": 3218,
  "zone": 0.395,
  "swing": 0.412,
  "whiff": 0.299,
  "zoneSwing": 0.576,
  "zoneWhiff": 0.122,
  "chaseSwing": 0.306,
  "chaseWhiff": 0.518,
  "mix": {
   "R": 0.0029,
   "L": 0.0025
  },
  "sd": 1.02,
  "after": {
   "lor": 0.286,
   "apart": 37,
   "same": 28
  }
 },
 "CH": {
  "pitches": 79833,
  "zone": 0.363,
  "swing": 0.502,
  "whiff": 0.314,
  "zoneSwing": 0.764,
  "zoneWhiff": 0.211,
  "chaseSwing": 0.353,
  "chaseWhiff": 0.441,
  "mix": {
   "R": 0.0469,
   "L": 0.1435
  },
  "sd": 1.01,
  "after": {
   "lor": -0.113,
   "apart": 1099,
   "same": 905
  }
 },
 "FS": {
  "pitches": 23061,
  "zone": 0.351,
  "swing": 0.512,
  "whiff": 0.344,
  "zoneSwing": 0.787,
  "zoneWhiff": 0.208,
  "chaseSwing": 0.364,
  "chaseWhiff": 0.502,
  "mix": {
   "R": 0.0266,
   "L": 0.0533
  },
  "sd": 1,
  "after": {
   "lor": -0.248,
   "apart": 321,
   "same": 308
  }
 },
 "FO": {
  "pitches": 456,
  "zone": 0.285,
  "swing": 0.434,
  "whiff": 0.424,
  "zoneSwing": 0.769,
  "zoneWhiff": 0.19,
  "chaseSwing": 0.301,
  "chaseWhiff": 0.663,
  "mix": {
   "R": 0.0008,
   "L": 0.001
  },
  "sd": 1.18,
  "after": {
   "lor": null,
   "apart": 8,
   "same": 8
  }
 },
 "KN": {
  "pitches": 310,
  "zone": 0.403,
  "swing": 0.442,
  "whiff": 0.204,
  "zoneSwing": 0.72,
  "zoneWhiff": 0.122,
  "chaseSwing": 0.254,
  "chaseWhiff": 0.362,
  "mix": {
   "R": 0.0006,
   "L": 0.0006
  },
  "sd": 3.41,
  "after": {
   "lor": null,
   "apart": 3,
   "same": 3
  }
 }
};
export const ZONES = {
 "1": {
  "pitches": 31021,
  "swings": 19308,
  "whiffs": 3899,
  "bip": 6759,
  "singles": 1354,
  "doubles": 364,
  "triples": 30,
  "hrs": 287,
  "breaking2": {
   "pitches": 1246,
   "swings": 890,
   "whiffs": 161,
   "so": 448
  }
 },
 "2": {
  "pitches": 37924,
  "swings": 27863,
  "whiffs": 5510,
  "bip": 9902,
  "singles": 1933,
  "doubles": 591,
  "triples": 58,
  "hrs": 661,
  "breaking2": {
   "pitches": 1524,
   "swings": 1318,
   "whiffs": 223,
   "so": 413
  }
 },
 "3": {
  "pitches": 27394,
  "swings": 17828,
  "whiffs": 3650,
  "bip": 6236,
  "singles": 1292,
  "doubles": 304,
  "triples": 40,
  "hrs": 320,
  "breaking2": {
   "pitches": 1268,
   "swings": 1006,
   "whiffs": 177,
   "so": 398
  }
 },
 "4": {
  "pitches": 39930,
  "swings": 26348,
  "whiffs": 3167,
  "bip": 12375,
  "singles": 2584,
  "doubles": 748,
  "triples": 56,
  "hrs": 578,
  "breaking2": {
   "pitches": 2667,
   "swings": 2292,
   "whiffs": 226,
   "so": 577
  }
 },
 "5": {
  "pitches": 51154,
  "swings": 38320,
  "whiffs": 4220,
  "bip": 18542,
  "singles": 3781,
  "doubles": 1397,
  "triples": 130,
  "hrs": 1253,
  "breaking2": {
   "pitches": 3484,
   "swings": 3312,
   "whiffs": 291,
   "so": 464
  }
 },
 "6": {
  "pitches": 39859,
  "swings": 26704,
  "whiffs": 3472,
  "bip": 12196,
  "singles": 2512,
  "doubles": 768,
  "triples": 90,
  "hrs": 590,
  "breaking2": {
   "pitches": 2876,
   "swings": 2655,
   "whiffs": 300,
   "so": 508
  }
 },
 "7": {
  "pitches": 32377,
  "swings": 19292,
  "whiffs": 3629,
  "bip": 8563,
  "singles": 1817,
  "doubles": 508,
  "triples": 25,
  "hrs": 303,
  "breaking2": {
   "pitches": 3158,
   "swings": 2709,
   "whiffs": 442,
   "so": 828
  }
 },
 "8": {
  "pitches": 43595,
  "swings": 29312,
  "whiffs": 4611,
  "bip": 14124,
  "singles": 3043,
  "doubles": 1078,
  "triples": 95,
  "hrs": 717,
  "breaking2": {
   "pitches": 4565,
   "swings": 4293,
   "whiffs": 543,
   "so": 796
  }
 },
 "9": {
  "pitches": 35986,
  "swings": 21382,
  "whiffs": 4258,
  "bip": 9018,
  "singles": 1996,
  "doubles": 527,
  "triples": 48,
  "hrs": 364,
  "breaking2": {
   "pitches": 4147,
   "swings": 3723,
   "whiffs": 621,
   "so": 980
  }
 },
 "11": {
  "pitches": 86709,
  "swings": 22454,
  "whiffs": 7201,
  "bip": 5570,
  "singles": 1062,
  "doubles": 265,
  "triples": 13,
  "hrs": 122,
  "breaking2": {
   "pitches": 3157,
   "swings": 897,
   "whiffs": 228,
   "so": 246
  }
 },
 "12": {
  "pitches": 65973,
  "swings": 20315,
  "whiffs": 6440,
  "bip": 5116,
  "singles": 1073,
  "doubles": 195,
  "triples": 29,
  "hrs": 138,
  "breaking2": {
   "pitches": 2898,
   "swings": 1227,
   "whiffs": 329,
   "so": 386
  }
 },
 "13": {
  "pitches": 94541,
  "swings": 31427,
  "whiffs": 14367,
  "bip": 7655,
  "singles": 1656,
  "doubles": 392,
  "triples": 16,
  "hrs": 116,
  "breaking2": {
   "pitches": 15606,
   "swings": 6899,
   "whiffs": 3271,
   "so": 3341
  }
 },
 "14": {
  "pitches": 127653,
  "swings": 40020,
  "whiffs": 20977,
  "bip": 8495,
  "singles": 1995,
  "doubles": 354,
  "triples": 41,
  "hrs": 121,
  "breaking2": {
   "pitches": 26876,
   "swings": 11359,
   "whiffs": 5770,
   "so": 5861
  }
 }
};
export const PITCHERS = [
 {
  "key": "skenes",
  "line": "Six pitches, most of them hard.",
  "tag": "six pitches",
  "name": "Paul Skenes",
  "hand": "R",
  "pa": 712,
  "paBy": {
   "R": 297,
   "L": 415
  },
  "so": 200,
  "bb": 49,
  "hbp": 11,
  "bip": 451,
  "singles": 90,
  "doubles": 34,
  "triples": 2,
  "hrs": 20,
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
    "whiff": 0.297,
    "zone": 0.525,
    "mix": {
     "R": 0.346,
     "L": 0.452
    },
    "bip": 175,
    "hits": 58,
    "hrs": 13,
    "sd": 0.71
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
    "whiff": 0.286,
    "zone": 0.517,
    "mix": {
     "R": 0.272,
     "L": 0.08
    },
    "bip": 51,
    "hits": 12,
    "hrs": 3,
    "sd": 0.94
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
    "whiff": 0.374,
    "zone": 0.236,
    "mix": {
     "R": 0.06,
     "L": 0.17
    },
    "bip": 55,
    "hits": 20,
    "hrs": 1,
    "sd": 0.74
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
    "whiff": 0.149,
    "zone": 0.532,
    "mix": {
     "R": 0.176,
     "L": 0.077
    },
    "bip": 70,
    "hits": 25,
    "hrs": 2,
    "sd": 0.73
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
    "whiff": 0.177,
    "zone": 0.43,
    "mix": {
     "R": 0.057,
     "L": 0.131
    },
    "bip": 59,
    "hits": 21,
    "hrs": 0,
    "sd": 0.68
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
    "whiff": 0.358,
    "zone": 0.406,
    "mix": {
     "R": 0.09,
     "L": 0.084
    },
    "bip": 40,
    "hits": 10,
    "hrs": 1,
    "sd": 1.02
   }
  ]
 },
 {
  "key": "misiorowski",
  "line": "A four-seamer at 101 mph, and a curve at 88.",
  "tag": "power arm",
  "name": "Jacob Misiorowski",
  "hand": "R",
  "pa": 665,
  "paBy": {
   "R": 299,
   "L": 366
  },
  "so": 252,
  "bb": 44,
  "hbp": 9,
  "bip": 360,
  "singles": 72,
  "doubles": 8,
  "triples": 2,
  "hrs": 14,
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
    "whiff": 0.402,
    "zone": 0.532,
    "mix": {
     "R": 0.626,
     "L": 0.639
    },
    "bip": 180,
    "hits": 60,
    "hrs": 8,
    "sd": 1.32
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
    "whiff": 0.209,
    "zone": 0.503,
    "mix": {
     "R": 0.129,
     "L": 0.148
    },
    "bip": 70,
    "hits": 11,
    "hrs": 3,
    "sd": 1.22
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
    "whiff": 0.353,
    "zone": 0.483,
    "mix": {
     "R": 0.172,
     "L": 0.059
    },
    "bip": 63,
    "hits": 17,
    "hrs": 3,
    "sd": 1.53
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
    "whiff": 0.439,
    "zone": 0.371,
    "mix": {
     "R": 0.07,
     "L": 0.136
    },
    "bip": 42,
    "hits": 8,
    "hrs": 0,
    "sd": 1.03
   }
  ]
 },
 {
  "key": "gausman",
  "line": "Four-seamer and splitter that look alike until late.",
  "tag": "splitter",
  "name": "Kevin Gausman",
  "hand": "R",
  "pa": 750,
  "paBy": {
   "R": 326,
   "L": 424
  },
  "so": 184,
  "bb": 47,
  "hbp": 1,
  "bip": 518,
  "singles": 123,
  "doubles": 27,
  "triples": 3,
  "hrs": 26,
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
    "whiff": 0.15,
    "zone": 0.638,
    "mix": {
     "R": 0.496,
     "L": 0.515
    },
    "bip": 306,
    "hits": 110,
    "hrs": 13,
    "sd": 1.25
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
    "whiff": 0.429,
    "zone": 0.261,
    "mix": {
     "R": 0.322,
     "L": 0.445
    },
    "bip": 178,
    "hits": 55,
    "hrs": 8,
    "sd": 1.07
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
    "whiff": 0.362,
    "zone": 0.299,
    "mix": {
     "R": 0.158,
     "L": 0.024
    },
    "bip": 28,
    "hits": 12,
    "hrs": 5,
    "sd": 1.3
   }
  ]
 },
 {
  "key": "sanchez",
  "line": "A lefty’s sinker and changeup.",
  "tag": "lefty",
  "name": "Cristopher Sánchez",
  "hand": "L",
  "pa": 857,
  "paBy": {
   "R": 665,
   "L": 192
  },
  "so": 231,
  "bb": 45,
  "hbp": 6,
  "bip": 574,
  "singles": 150,
  "doubles": 35,
  "triples": 0,
  "hrs": 19,
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
    "whiff": 0.119,
    "zone": 0.601,
    "mix": {
     "R": 0.407,
     "L": 0.586
    },
    "bip": 310,
    "hits": 119,
    "hrs": 12,
    "sd": 0.83
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
    "whiff": 0.46,
    "zone": 0.326,
    "mix": {
     "R": 0.434,
     "L": 0.129
    },
    "bip": 180,
    "hits": 54,
    "hrs": 4,
    "sd": 0.91
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
    "whiff": 0.431,
    "zone": 0.446,
    "mix": {
     "R": 0.159,
     "L": 0.285
    },
    "bip": 84,
    "hits": 31,
    "hrs": 3,
    "sd": 1.1
   }
  ]
 },
 {
  "key": "sale",
  "line": "A lefty’s slider that sweeps a foot.",
  "tag": "lefty, big slider",
  "name": "Chris Sale",
  "hand": "L",
  "pa": 648,
  "paBy": {
   "R": 486,
   "L": 162
  },
  "so": 200,
  "bb": 31,
  "hbp": 15,
  "bip": 402,
  "singles": 96,
  "doubles": 22,
  "triples": 1,
  "hrs": 10,
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
    "whiff": 0.275,
    "zone": 0.557,
    "mix": {
     "R": 0.459,
     "L": 0.272
    },
    "bip": 157,
    "hits": 51,
    "hrs": 9,
    "sd": 1.41
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
    "whiff": 0.382,
    "zone": 0.427,
    "mix": {
     "R": 0.403,
     "L": 0.387
    },
    "bip": 134,
    "hits": 46,
    "hrs": 0,
    "sd": 1.73
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
    "whiff": 0.303,
    "zone": 0.426,
    "mix": {
     "R": 0.133,
     "L": 0.011
    },
    "bip": 65,
    "hits": 19,
    "hrs": 1,
    "sd": 1.44
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
    "whiff": 0.106,
    "zone": 0.594,
    "mix": {
     "R": 0.005,
     "L": 0.33
    },
    "bip": 46,
    "hits": 13,
    "hrs": 0,
    "sd": 1.41
   }
  ]
 },
 {
  "key": "nola",
  "line": "Lives on the knuckle curve.",
  "tag": "knuckle curve",
  "name": "Aaron Nola",
  "hand": "R",
  "pa": 744,
  "paBy": {
   "R": 286,
   "L": 458
  },
  "so": 177,
  "bb": 59,
  "hbp": 2,
  "bip": 506,
  "singles": 105,
  "doubles": 32,
  "triples": 3,
  "hrs": 37,
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
    "whiff": 0.411,
    "zone": 0.38,
    "mix": {
     "R": 0.359,
     "L": 0.318
    },
    "bip": 148,
    "hits": 44,
    "hrs": 10,
    "sd": 0.82
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
    "whiff": 0.141,
    "zone": 0.528,
    "mix": {
     "R": 0.185,
     "L": 0.27
    },
    "bip": 111,
    "hits": 44,
    "hrs": 11,
    "sd": 1.03
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
    "whiff": 0.122,
    "zone": 0.533,
    "mix": {
     "R": 0.268,
     "L": 0.133
    },
    "bip": 109,
    "hits": 46,
    "hrs": 12,
    "sd": 1.08
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
    "whiff": 0.256,
    "zone": 0.339,
    "mix": {
     "R": 0.071,
     "L": 0.216
    },
    "bip": 88,
    "hits": 20,
    "hrs": 1,
    "sd": 0.9
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
    "whiff": 0.256,
    "zone": 0.43,
    "mix": {
     "R": 0.098,
     "L": 0.063
    },
    "bip": 43,
    "hits": 21,
    "hrs": 2,
    "sd": 0.91
   }
  ]
 },
 {
  "key": "miller",
  "line": "A closer: 101 mph and a slider.",
  "tag": "closer, slider",
  "name": "Mason Miller",
  "hand": "R",
  "pa": 272,
  "paBy": {
   "R": 122,
   "L": 150
  },
  "so": 129,
  "bb": 26,
  "hbp": 2,
  "bip": 115,
  "singles": 31,
  "doubles": 3,
  "triples": 0,
  "hrs": 3,
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
    "whiff": 0.563,
    "zone": 0.457,
    "mix": {
     "R": 0.502,
     "L": 0.493
    },
    "bip": 46,
    "hits": 17,
    "hrs": 1,
    "sd": 0.77
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
    "whiff": 0.365,
    "zone": 0.458,
    "mix": {
     "R": 0.496,
     "L": 0.473
    },
    "bip": 67,
    "hits": 19,
    "hrs": 1,
    "sd": 0.8
   }
  ]
 },
 {
  "key": "rogers",
  "line": "A submariner: an 83 mph sinker from below the knees.",
  "tag": "submariner",
  "name": "Tyler Rogers",
  "hand": "R",
  "pa": 294,
  "paBy": {
   "R": 131,
   "L": 163
  },
  "so": 40,
  "bb": 22,
  "hbp": 2,
  "bip": 228,
  "singles": 52,
  "doubles": 6,
  "triples": 1,
  "hrs": 2,
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
    "whiff": 0.12,
    "zone": 0.595,
    "mix": {
     "R": 0.636,
     "L": 0.862
    },
    "bip": 179,
    "hits": 50,
    "hrs": 2,
    "sd": 0.64
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
    "whiff": 0.234,
    "zone": 0.437,
    "mix": {
     "R": 0.364,
     "L": 0.138
    },
    "bip": 49,
    "hits": 11,
    "hrs": 0,
    "sd": 0.69
   }
  ]
 },
 {
  "key": "waldron",
  "line": "A knuckleballer, with fastballs to keep hitters honest.",
  "tag": "knuckleball",
  "name": "Matt Waldron",
  "hand": "R",
  "pa": 194,
  "paBy": {
   "R": 87,
   "L": 107
  },
  "so": 33,
  "bb": 11,
  "hbp": 2,
  "bip": 148,
  "singles": 38,
  "doubles": 10,
  "triples": 2,
  "hrs": 7,
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
    "whiff": 0.21,
    "zone": 0.495,
    "mix": {
     "R": 0.266,
     "L": 0.327
    },
    "bip": 43,
    "hits": 17,
    "hrs": 2,
    "sd": 2.4
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
    "whiff": 0.163,
    "zone": 0.462,
    "mix": {
     "R": 0.154,
     "L": 0.25
    },
    "bip": 31,
    "hits": 11,
    "hrs": 0,
    "sd": 0.85
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
    "whiff": 0.2,
    "zone": 0.463,
    "mix": {
     "R": 0.178,
     "L": 0.178
    },
    "bip": 24,
    "hits": 10,
    "hrs": 2,
    "sd": 0.73
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
    "whiff": 0.175,
    "zone": 0.611,
    "mix": {
     "R": 0.238,
     "L": 0.111
    },
    "bip": 30,
    "hits": 13,
    "hrs": 1,
    "sd": 0.78
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
    "whiff": 0.1,
    "zone": 0.535,
    "mix": {
     "R": 0.164,
     "L": 0.134
    },
    "bip": 20,
    "hits": 6,
    "hrs": 2,
    "sd": 0.94
   }
  ]
 }
];
export const HITTERS = {
 "qualified": 502,
 "all": {
  "hitters": 135,
  "pa": 83215,
  "pitches": 323685,
  "swings": 153424,
  "whiffs": 36939,
  "so": 17191,
  "bb": 7914,
  "bip": 57103,
  "singles": 12142,
  "doubles": 3538,
  "triples": 340,
  "hrs": 2841,
  "abs": 73551,
  "zone": 152435,
  "zoneSwings": 101814,
  "zoneWhiffs": 15695
 },
 "free": {
  "hitters": 34,
  "from": 0.344,
  "to": 0.452,
  "pa": 20722,
  "pitches": 76640,
  "swings": 41001,
  "whiffs": 10336,
  "so": 4338,
  "bb": 1389,
  "bip": 14783,
  "singles": 3126,
  "doubles": 894,
  "triples": 83,
  "hrs": 707,
  "abs": 18940,
  "zone": 34953,
  "zoneSwings": 25084,
  "zoneWhiffs": 3833
 },
 "patient": {
  "hitters": 34,
  "from": 0.149,
  "to": 0.251,
  "pa": 20801,
  "pitches": 84141,
  "swings": 35390,
  "whiffs": 8286,
  "so": 4478,
  "bb": 2604,
  "bip": 13469,
  "singles": 2872,
  "doubles": 855,
  "triples": 93,
  "hrs": 652,
  "abs": 17782,
  "zone": 40709,
  "zoneSwings": 25639,
  "zoneWhiffs": 3937
 },
 "contact": {
  "hitters": 34,
  "from": 0.071,
  "to": 0.199,
  "pa": 21178,
  "pitches": 80551,
  "swings": 36351,
  "whiffs": 5722,
  "so": 2872,
  "bb": 1962,
  "bip": 16064,
  "singles": 3602,
  "doubles": 903,
  "triples": 100,
  "hrs": 476,
  "abs": 18693,
  "zone": 38891,
  "zoneSwings": 24610,
  "zoneWhiffs": 2299
 },
 "power": {
  "hitters": 34,
  "from": 0.203,
  "to": 0.291,
  "pa": 21131,
  "pitches": 84302,
  "swings": 39050,
  "whiffs": 11256,
  "so": 5358,
  "bb": 2351,
  "bip": 13169,
  "singles": 2609,
  "doubles": 923,
  "triples": 92,
  "hrs": 1085,
  "abs": 18385,
  "zone": 38921,
  "zoneSwings": 25808,
  "zoneWhiffs": 4941
 }
};
