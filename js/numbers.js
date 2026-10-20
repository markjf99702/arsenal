// Made by tools/statcast.mjs from Baseball Savant's Statcast search on 2026-10-20.
// Every pitch of the 2026 regular season, by pitch type. Averages weight each pitcher by how many they threw.
// The knuckleball's count only pitchers who threw at least 100 of them, which leaves out position players' lobs.
// rise and arm are spin-induced movement in inches (arm < 0 means toward the glove side); drop includes gravity.
// low and high: the middle 80% of pitches by speed, or null when the average comes from one pitcher.
export const SEASON = 2026;
export const TOTAL = 713311;
export const NUMBERS = {
  FF: {
    pitches: 219169,
    share: 30.73,
    pitchers: 775,
    mph: 94.8,
    low: 92,
    high: 97.6,
    rpm: 2314,
    active: 91,
    rise: 15.6,
    arm: 7.8,
    drop: 14.9,
    height: 5.77,
    extension: 6.51,
    whiff: 21.8,
    most: {
      name: "Jacob Misiorowski",
      pitches: 1677
    },
    hardest: {
      name: "Mason Miller",
      mph: 101.4,
      pitches: 555
    }
  },
  SI: {
    pitches: 118806,
    share: 16.66,
    pitchers: 623,
    mph: 94.1,
    low: 91.1,
    high: 97.3,
    rpm: 2200,
    active: 86,
    rise: 7.6,
    arm: 15.1,
    drop: 23.4,
    height: 5.61,
    extension: 6.42,
    whiff: 13.6,
    most: {
      name: "Brady Singer",
      pitches: 1416
    },
    hardest: {
      name: "Edgardo Henriquez",
      mph: 100.9,
      pitches: 241
    }
  },
  FC: {
    pitches: 57245,
    share: 8.03,
    pitchers: 382,
    mph: 89.8,
    low: 86.5,
    high: 92.9,
    rpm: 2390,
    active: 47,
    rise: 8,
    arm: -2.1,
    drop: 25.9,
    height: 5.73,
    extension: 6.42,
    whiff: 22.8,
    most: {
      name: "Foster Griffin",
      pitches: 921
    },
    hardest: {
      name: "Camilo Doval",
      mph: 98.8,
      pitches: 275
    }
  },
  SL: {
    pitches: 93541,
    share: 13.11,
    pitchers: 567,
    mph: 86.3,
    low: 83.1,
    high: 89.4,
    rpm: 2434,
    active: 31,
    rise: 1.4,
    arm: -3.9,
    drop: 35.3,
    height: 5.82,
    extension: 6.39,
    whiff: 33.4,
    most: {
      name: "Chris Sale",
      pitches: 1027
    },
    hardest: {
      name: "Jacob Misiorowski",
      mph: 91.9,
      pitches: 286
    }
  },
  ST: {
    pitches: 59341,
    share: 8.32,
    pitchers: 385,
    mph: 82.8,
    low: 79.2,
    high: 86.3,
    rpm: 2595,
    active: 50,
    rise: 1,
    arm: -13.6,
    drop: 39.2,
    height: 5.46,
    extension: 6.34,
    whiff: 31.2,
    most: {
      name: "Jesús Luzardo",
      pitches: 1093
    },
    hardest: {
      name: "Max Meyer",
      mph: 89,
      pitches: 533
    }
  },
  CU: {
    pitches: 45416,
    share: 6.37,
    pitchers: 385,
    mph: 80.3,
    low: 75.9,
    high: 84.9,
    rpm: 2605,
    active: 72,
    rise: -10.3,
    arm: -9.1,
    drop: 53.2,
    height: 5.88,
    extension: 6.35,
    whiff: 30.6,
    most: {
      name: "Joey Cantillo",
      pitches: 843
    },
    hardest: {
      name: "Jacob Misiorowski",
      mph: 88,
      pitches: 283
    }
  },
  KC: {
    pitches: 11687,
    share: 1.64,
    pitchers: 50,
    mph: 82.6,
    low: 78.4,
    high: 86.6,
    rpm: 2517,
    active: 68,
    rise: -10,
    arm: -7.4,
    drop: 50.4,
    height: 5.86,
    extension: 6.47,
    whiff: 34,
    most: {
      name: "Aaron Nola",
      pitches: 980
    },
    hardest: {
      name: "Trevor Megill",
      mph: 88,
      pitches: 309
    }
  },
  SV: {
    pitches: 3218,
    share: 0.45,
    pitchers: 25,
    mph: 82.2,
    low: 80,
    high: 85.6,
    rpm: 2549,
    active: 55,
    rise: -5.4,
    arm: -11.7,
    drop: 46.1,
    height: 5.47,
    extension: 6.12,
    whiff: 29.9,
    most: {
      name: "Kyle Harrison",
      pitches: 678
    },
    hardest: {
      name: "Cionel Pérez",
      mph: 85.6,
      pitches: 261
    }
  },
  CS: {
    pitches: 136,
    share: 0.02,
    pitchers: 12,
    mph: 70.5,
    low: 60.7,
    high: 80.3,
    rpm: 2379,
    active: null,
    rise: -5.6,
    arm: -12,
    drop: 62.3,
    height: 5.35,
    extension: 5.95,
    whiff: 32.8,
    most: {
      name: "Seth Lugo",
      pitches: 64
    },
    hardest: null
  },
  CH: {
    pitches: 79833,
    share: 11.19,
    pitchers: 553,
    mph: 86,
    low: 81.1,
    high: 90.2,
    rpm: 1754,
    active: 88,
    rise: 4.2,
    arm: 14.1,
    drop: 33,
    height: 5.68,
    extension: 6.44,
    whiff: 31.4,
    most: {
      name: "Cristopher Sánchez",
      pitches: 1171
    },
    hardest: {
      name: "Edward Cabrera",
      mph: 93.1,
      pitches: 414
    }
  },
  FS: {
    pitches: 23077,
    share: 3.24,
    pitchers: 153,
    mph: 86.6,
    low: 82.8,
    high: 91.5,
    rpm: 1369,
    active: 81,
    rise: 3.1,
    arm: 11,
    drop: 33.6,
    height: 5.81,
    extension: 6.56,
    whiff: 34.3,
    most: {
      name: "Kevin Gausman",
      pitches: 1177
    },
    hardest: {
      name: "Jhoan Duran",
      mph: 97.6,
      pitches: 445
    }
  },
  FO: {
    pitches: 456,
    share: 0.06,
    pitchers: 3,
    mph: 83.9,
    low: 83.3,
    high: 85.3,
    rpm: 988,
    active: null,
    rise: -0.4,
    arm: 8.5,
    drop: 39.5,
    height: 6.07,
    extension: 6.56,
    whiff: 42.4,
    most: {
      name: "Kodai Senga",
      pitches: 302
    },
    hardest: {
      name: "Kodai Senga",
      mph: 83.3,
      pitches: 302
    }
  },
  KN: {
    pitches: 310,
    share: 0.04,
    pitchers: 5,
    mph: 80.5,
    low: null,
    high: null,
    rpm: 315,
    active: null,
    rise: -2.2,
    arm: 2.3,
    drop: 44.9,
    height: 5.6,
    extension: 6.41,
    whiff: 21,
    most: {
      name: "Matt Waldron",
      pitches: 208
    },
    hardest: {
      name: "Matt Waldron",
      mph: 80.5,
      pitches: 208
    }
  },
  EP: {
    pitches: 1076,
    share: 0.15,
    pitchers: 45,
    mph: 45.3,
    low: 38.3,
    high: 51.8,
    rpm: 1143,
    active: null,
    rise: 17.1,
    arm: 0.1,
    drop: 130.8,
    height: 6.86,
    extension: 4.14,
    whiff: 3.6,
    most: {
      name: "Tyler Tolbert",
      pitches: 106
    },
    hardest: null
  }
};
