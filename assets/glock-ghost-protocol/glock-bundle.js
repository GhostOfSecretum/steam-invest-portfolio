var GlockGhostProtocol = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // entry-notho.ts
  var entry_notho_exports = {};
  __export(entry_notho_exports, {
    createGlockGhostProtocolLookDevLights: () => createGlockGhostProtocolLookDevLights,
    createGlockGhostProtocolModel: () => createGlockGhostProtocolModel,
    makeGhostProtocolBackground: () => makeGhostProtocolBackground
  });

  // geo.json
  var geo_default = {
    meta: {
      item: "Glock-18 | Ghost Protocol (Well-Worn)",
      scale: 2e-3,
      xc: 1001,
      yc: 561,
      frame: "+X muzzle, +Y sights, Z across the gun; +Z face = FRONT reference, -Z face = BACK reference (mirrored into the same UV frame)",
      sourceViews: [
        "ref_front.png",
        "ref_back.png"
      ],
      silhouetteAgreementPx: {
        topEdgeMean: 1.56,
        bottomEdgeMean: 1.57
      },
      textureCrop: {
        x0: 136,
        x1: 1866,
        y0: 0,
        y1: 1125
      },
      totalLengthWorld: 3.42,
      totalHeightWorld: 2.22,
      splitYPx: 221,
      magSeamPx: [
        [
          240,
          920
        ],
        [
          660,
          950
        ]
      ]
    },
    parts: {
      slide: {
        outline: [
          [
            -1.528,
            1.052
          ],
          [
            -1.652,
            1.052
          ],
          [
            -1.67,
            1.046
          ],
          [
            -1.682,
            1.034
          ],
          [
            -1.69,
            1.002
          ],
          [
            -1.69,
            0.73
          ],
          [
            -1.684,
            0.724
          ],
          [
            -1.684,
            0.692
          ],
          [
            -1.676,
            0.686
          ],
          [
            -1.676,
            0.68
          ],
          [
            1.708,
            0.68
          ],
          [
            1.708,
            0.842
          ],
          [
            1.71,
            0.844
          ],
          [
            1.708,
            0.962
          ],
          [
            1.706,
            0.964
          ],
          [
            1.706,
            0.99
          ],
          [
            1.702,
            1.006
          ],
          [
            1.692,
            1.022
          ],
          [
            1.68,
            1.034
          ],
          [
            1.606,
            1.052
          ],
          [
            1.574,
            1.052
          ],
          [
            1.558,
            1.074
          ],
          [
            1.55,
            1.08
          ],
          [
            1.508,
            1.08
          ],
          [
            1.49,
            1.068
          ],
          [
            1.478,
            1.052
          ],
          [
            0.274,
            1.052
          ],
          [
            0.268,
            1.046
          ],
          [
            0.264,
            1.026
          ],
          [
            0.26,
            1.022
          ],
          [
            0.258,
            1.032
          ],
          [
            0.252,
            1.034
          ],
          [
            -0.184,
            1.034
          ],
          [
            -0.186,
            1.03
          ],
          [
            -0.198,
            1.03
          ],
          [
            -0.21,
            1.044
          ],
          [
            -0.224,
            1.052
          ],
          [
            -1.354,
            1.052
          ],
          [
            -1.364,
            1.06
          ],
          [
            -1.384,
            1.06
          ],
          [
            -1.392,
            1.082
          ],
          [
            -1.426,
            1.108
          ],
          [
            -1.488,
            1.108
          ]
        ]
      },
      frame: {
        outline: [
          [
            -1.676,
            0.68
          ],
          [
            -1.676,
            0.674
          ],
          [
            -1.68,
            0.666
          ],
          [
            -1.696,
            0.66
          ],
          [
            -1.704,
            0.65
          ],
          [
            -1.708,
            0.638
          ],
          [
            -1.71,
            0.612
          ],
          [
            -1.696,
            0.568
          ],
          [
            -1.668,
            0.538
          ],
          [
            -1.642,
            0.52
          ],
          [
            -1.622,
            0.514
          ],
          [
            -1.538,
            0.512
          ],
          [
            -1.522,
            0.508
          ],
          [
            -1.494,
            0.506
          ],
          [
            -1.47,
            0.498
          ],
          [
            -1.462,
            0.498
          ],
          [
            -1.416,
            0.478
          ],
          [
            -1.378,
            0.452
          ],
          [
            -1.342,
            0.416
          ],
          [
            -1.32,
            0.386
          ],
          [
            -1.304,
            0.354
          ],
          [
            -1.298,
            0.33
          ],
          [
            -1.294,
            0.324
          ],
          [
            -1.284,
            0.272
          ],
          [
            -1.282,
            0.226
          ],
          [
            -1.29,
            0.16
          ],
          [
            -1.3,
            0.126
          ],
          [
            -1.296,
            0.118
          ],
          [
            -1.296,
            0.11
          ],
          [
            -1.314,
            0.056
          ],
          [
            -1.346,
            -0.02
          ],
          [
            -1.384,
            -0.1
          ],
          [
            -1.43,
            -0.182
          ],
          [
            -1.5,
            -0.288
          ],
          [
            -1.538,
            -0.34
          ],
          [
            -1.588,
            -0.418
          ],
          [
            -1.618,
            -0.478
          ],
          [
            -1.628,
            -0.508
          ],
          [
            -1.638,
            -0.528
          ],
          [
            -1.64,
            -0.54
          ],
          [
            -1.654,
            -0.556
          ],
          [
            -1.658,
            -0.614
          ],
          [
            -1.654,
            -0.648
          ],
          [
            -1.644,
            -0.682
          ],
          [
            -1.63071,
            -0.71023
          ],
          [
            -0.67902,
            -0.77821
          ],
          [
            -0.672,
            -0.768
          ],
          [
            -0.668,
            -0.742
          ],
          [
            -0.684,
            -0.684
          ],
          [
            -0.59,
            -0.446
          ],
          [
            -0.584,
            -0.44
          ],
          [
            -0.55,
            -0.424
          ],
          [
            -0.54,
            -0.406
          ],
          [
            -0.544,
            -0.398
          ],
          [
            -0.554,
            -0.352
          ],
          [
            -0.496,
            -0.194
          ],
          [
            -0.476,
            -0.132
          ],
          [
            -0.462,
            -0.104
          ],
          [
            -0.446,
            -0.08
          ],
          [
            -0.408,
            -0.058
          ],
          [
            -0.402,
            -0.058
          ],
          [
            -0.384,
            -0.05
          ],
          [
            -0.354,
            -0.048
          ],
          [
            -0.324,
            -0.056
          ],
          [
            -0.312,
            -0.062
          ],
          [
            -0.28,
            -0.086
          ],
          [
            -0.252,
            -0.1
          ],
          [
            -0.222,
            -0.11
          ],
          [
            -0.176,
            -0.118
          ],
          [
            0.476,
            -0.118
          ],
          [
            0.49,
            -0.114
          ],
          [
            0.498,
            -0.108
          ],
          [
            0.508,
            -0.09
          ],
          [
            0.5,
            -0.06
          ],
          [
            0.488,
            -0.038
          ],
          [
            0.486,
            -0.02
          ],
          [
            0.478,
            -0.01
          ],
          [
            0.48,
            -2e-3
          ],
          [
            0.478,
            8e-3
          ],
          [
            0.47,
            0.02
          ],
          [
            0.472,
            0.034
          ],
          [
            0.47,
            0.042
          ],
          [
            0.464,
            0.048
          ],
          [
            0.468,
            0.056
          ],
          [
            0.466,
            0.07
          ],
          [
            0.46,
            0.076
          ],
          [
            0.464,
            0.082
          ],
          [
            0.464,
            0.098
          ],
          [
            0.458,
            0.104
          ],
          [
            0.462,
            0.11
          ],
          [
            0.462,
            0.128
          ],
          [
            0.458,
            0.134
          ],
          [
            0.462,
            0.138
          ],
          [
            0.462,
            0.158
          ],
          [
            0.458,
            0.162
          ],
          [
            0.464,
            0.17
          ],
          [
            0.464,
            0.184
          ],
          [
            0.46,
            0.192
          ],
          [
            0.466,
            0.204
          ],
          [
            0.464,
            0.222
          ],
          [
            0.468,
            0.224
          ],
          [
            0.47,
            0.23
          ],
          [
            0.468,
            0.25
          ],
          [
            0.474,
            0.256
          ],
          [
            0.476,
            0.274
          ],
          [
            0.486,
            0.298
          ],
          [
            0.486,
            0.304
          ],
          [
            0.508,
            0.34
          ],
          [
            0.516,
            0.346
          ],
          [
            0.526,
            0.348
          ],
          [
            0.53,
            0.352
          ],
          [
            0.556,
            0.362
          ],
          [
            0.724,
            0.362
          ],
          [
            0.726,
            0.364
          ],
          [
            0.808,
            0.364
          ],
          [
            0.81,
            0.366
          ],
          [
            0.82,
            0.364
          ],
          [
            0.822,
            0.366
          ],
          [
            1.506,
            0.366
          ],
          [
            1.554,
            0.376
          ],
          [
            1.618,
            0.408
          ],
          [
            1.644,
            0.424
          ],
          [
            1.668,
            0.452
          ],
          [
            1.678,
            0.476
          ],
          [
            1.684,
            0.502
          ],
          [
            1.684,
            0.514
          ],
          [
            1.698,
            0.56
          ],
          [
            1.704,
            0.606
          ],
          [
            1.704,
            0.672
          ],
          [
            1.708,
            0.676
          ],
          [
            1.708,
            0.68
          ]
        ],
        holes: [
          [
            [
              -0.312,
              0.384
            ],
            [
              -0.31,
              0.382
            ],
            [
              -0.052,
              0.38
            ],
            [
              -0.048,
              0.378
            ],
            [
              -0.05,
              0.364
            ],
            [
              -0.052,
              0.362
            ],
            [
              -0.052,
              0.352
            ],
            [
              -0.054,
              0.35
            ],
            [
              -0.052,
              0.346
            ],
            [
              0.02,
              0.348
            ],
            [
              0.022,
              0.35
            ],
            [
              0.056,
              0.35
            ],
            [
              0.058,
              0.352
            ],
            [
              0.064,
              0.35
            ],
            [
              0.066,
              0.352
            ],
            [
              0.1,
              0.352
            ],
            [
              0.102,
              0.354
            ],
            [
              0.15,
              0.354
            ],
            [
              0.152,
              0.356
            ],
            [
              0.218,
              0.354
            ],
            [
              0.246,
              0.342
            ],
            [
              0.252,
              0.342
            ],
            [
              0.274,
              0.332
            ],
            [
              0.296,
              0.326
            ],
            [
              0.326,
              0.298
            ],
            [
              0.328,
              0.292
            ],
            [
              0.34,
              0.276
            ],
            [
              0.354,
              0.244
            ],
            [
              0.354,
              0.236
            ],
            [
              0.358,
              0.226
            ],
            [
              0.36,
              0.186
            ],
            [
              0.362,
              0.184
            ],
            [
              0.36,
              0.182
            ],
            [
              0.362,
              0.18
            ],
            [
              0.362,
              0.106
            ],
            [
              0.36,
              0.104
            ],
            [
              0.36,
              0.09
            ],
            [
              0.352,
              0.066
            ],
            [
              0.352,
              0.06
            ],
            [
              0.336,
              0.028
            ],
            [
              0.32,
              8e-3
            ],
            [
              0.3,
              -0.01
            ],
            [
              0.274,
              -0.028
            ],
            [
              0.26,
              -0.034
            ],
            [
              0.242,
              -0.042
            ],
            [
              0.22,
              -0.044
            ],
            [
              0.218,
              -0.046
            ],
            [
              0.03,
              -0.046
            ],
            [
              0.028,
              -0.044
            ],
            [
              -0.15,
              -0.044
            ],
            [
              -0.152,
              -0.046
            ],
            [
              -0.154,
              -0.044
            ],
            [
              -0.17,
              -0.044
            ],
            [
              -0.18,
              -0.04
            ],
            [
              -0.192,
              -0.04
            ],
            [
              -0.194,
              -0.036
            ],
            [
              -0.196,
              -0.038
            ],
            [
              -0.204,
              -0.03
            ],
            [
              -0.212,
              -0.028
            ],
            [
              -0.238,
              -0.012
            ],
            [
              -0.254,
              2e-3
            ],
            [
              -0.258,
              -4e-3
            ],
            [
              -0.258,
              -0.01
            ],
            [
              -0.266,
              -0.034
            ],
            [
              -0.268,
              -0.032
            ],
            [
              -0.27,
              -0.036
            ],
            [
              -0.312,
              -0.036
            ],
            [
              -0.316,
              -0.034
            ],
            [
              -0.316,
              0.128
            ],
            [
              -0.318,
              0.13
            ],
            [
              -0.322,
              0.18
            ],
            [
              -0.324,
              0.182
            ],
            [
              -0.324,
              0.206
            ],
            [
              -0.316,
              0.232
            ],
            [
              -0.316,
              0.382
            ]
          ]
        ]
      },
      magazine: {
        outline: [
          [
            -1.63071,
            -0.71023
          ],
          [
            -1.628,
            -0.716
          ],
          [
            -1.612,
            -0.738
          ],
          [
            -1.586,
            -0.764
          ],
          [
            -1.574,
            -0.768
          ],
          [
            -1.57,
            -0.774
          ],
          [
            -1.562,
            -0.778
          ],
          [
            -1.542,
            -0.778
          ],
          [
            -1.524,
            -0.768
          ],
          [
            -1.512,
            -0.744
          ],
          [
            -1.504,
            -0.734
          ],
          [
            -1.502,
            -0.74
          ],
          [
            -1.512,
            -0.768
          ],
          [
            -1.514,
            -0.808
          ],
          [
            -1.504,
            -0.824
          ],
          [
            -1.488,
            -0.834
          ],
          [
            -1.196,
            -0.976
          ],
          [
            -1.136,
            -1.008
          ],
          [
            -1.07,
            -1.038
          ],
          [
            -1.006,
            -1.072
          ],
          [
            -0.946,
            -1.098
          ],
          [
            -0.92,
            -1.106
          ],
          [
            -0.884,
            -1.11
          ],
          [
            -0.836,
            -1.108
          ],
          [
            -0.814,
            -1.102
          ],
          [
            -0.796,
            -1.092
          ],
          [
            -0.786,
            -1.082
          ],
          [
            -0.764,
            -1.046
          ],
          [
            -0.762,
            -1.014
          ],
          [
            -0.766,
            -0.996
          ],
          [
            -0.78,
            -0.96
          ],
          [
            -0.772,
            -0.942
          ],
          [
            -0.772,
            -0.926
          ],
          [
            -0.766,
            -0.92
          ],
          [
            -0.76,
            -0.904
          ],
          [
            -0.762,
            -0.888
          ],
          [
            -0.756,
            -0.884
          ],
          [
            -0.752,
            -0.876
          ],
          [
            -0.748,
            -0.862
          ],
          [
            -0.75,
            -0.854
          ],
          [
            -0.738,
            -0.846
          ],
          [
            -0.718,
            -0.82
          ],
          [
            -0.694,
            -0.8
          ],
          [
            -0.67902,
            -0.77821
          ]
        ]
      },
      trigger: {
        outline: [
          [
            -0.312,
            -0.034
          ],
          [
            -0.27,
            -0.034
          ],
          [
            -0.258,
            6e-3
          ],
          [
            -0.234,
            0.042
          ],
          [
            -0.21,
            0.01
          ],
          [
            -0.192,
            -0.038
          ],
          [
            -0.152,
            -0.044
          ],
          [
            -0.11,
            -0.038
          ],
          [
            -0.078,
            -0.022
          ],
          [
            -0.066,
            -2e-3
          ],
          [
            -0.076,
            0.018
          ],
          [
            -0.092,
            0.042
          ],
          [
            -0.108,
            0.074
          ],
          [
            -0.12,
            0.106
          ],
          [
            -0.128,
            0.138
          ],
          [
            -0.134,
            0.17
          ],
          [
            -0.134,
            0.198
          ],
          [
            -0.122,
            0.226
          ],
          [
            -0.108,
            0.254
          ],
          [
            -0.092,
            0.282
          ],
          [
            -0.072,
            0.318
          ],
          [
            -0.058,
            0.346
          ],
          [
            -0.052,
            0.378
          ],
          [
            -0.312,
            0.382
          ]
        ]
      }
    },
    thickness: {
      slide: 0.41,
      frame: 0.386,
      gripPanelProud: 0.014,
      magazine: 0.462,
      trigger: 0.075,
      triggerSafety: 0.026,
      breechBlock: 0.3,
      barrelOuter: 0.232,
      confidence: 0.45,
      basis: "no supplied view resolves Z; widths are the published Glock-18 slide/frame/grip cross-sections (25.5 / 24.6 / 29.5 mm) scaled by the traced 138 mm height"
    },
    features: {
      rearSight: {
        xPx: [
          242,
          308
        ],
        topPx: 7,
        baseYPx: 35,
        confidence: 0.94,
        x: [
          -1.518,
          -1.386
        ],
        top: 1.108,
        base: 1.052
      },
      frontSight: {
        xPx: [
          1745,
          1782
        ],
        topPx: 21,
        baseYPx: 35,
        confidence: 0.92,
        x: [
          1.488,
          1.562
        ],
        top: 1.08,
        base: 1.052
      },
      ejectionPort: {
        xPx: [
          880,
          1145
        ],
        yPx: [
          40,
          132
        ],
        cornerRPx: 26,
        confidence: 0.95,
        note: "steel breech face visible through the port; 'G18' engraved at x 925..1045",
        x: [
          -0.242,
          0.288
        ],
        y: [
          0.858,
          1.042
        ],
        cornerR: 0.052
      },
      extractor: {
        xPx: [
          702,
          892
        ],
        yPx: [
          70,
          124
        ],
        confidence: 0.88,
        x: [
          -0.598,
          -0.218
        ],
        y: [
          0.874,
          0.982
        ]
      },
      rearSerrations: {
        xPx: [
          300,
          545
        ],
        yPx: [
          40,
          205
        ],
        count: 9,
        confidence: 0.9,
        x: [
          -1.402,
          -0.912
        ],
        y: [
          0.712,
          1.042
        ]
      },
      frontSerrations: {
        xPx: [
          1628,
          1790
        ],
        yPx: [
          45,
          200
        ],
        count: 7,
        confidence: 0.85,
        x: [
          1.254,
          1.578
        ],
        y: [
          0.722,
          1.032
        ]
      },
      railSlots: {
        xPx: [
          1552,
          1800
        ],
        yPx: [
          318,
          372
        ],
        count: 4,
        confidence: 0.8,
        x: [
          1.102,
          1.598
        ],
        y: [
          0.378,
          0.486
        ]
      },
      triggerPin: {
        cxPx: 925,
        cyPx: 255,
        rPx: 13,
        confidence: 0.9,
        cx: -0.152,
        cy: 0.612,
        r: 0.026
      },
      lockingBlockPin: {
        cxPx: 962,
        cyPx: 320,
        rPx: 17,
        confidence: 0.9,
        cx: -0.078,
        cy: 0.482,
        r: 0.034
      },
      slideStop: {
        xPx: [
          1148,
          1338
        ],
        yPx: [
          296,
          350
        ],
        confidence: 0.86,
        x: [
          0.294,
          0.674
        ],
        y: [
          0.422,
          0.53
        ]
      },
      magRelease: {
        xPx: [
          662,
          762
        ],
        yPx: [
          486,
          606
        ],
        confidence: 0.78,
        note: "partly read as a frame relief; the two views disagree on its rear edge",
        x: [
          -0.678,
          -0.478
        ],
        y: [
          -0.09,
          0.15
        ]
      },
      triggerSafety: {
        xPx: [
          878,
          906
        ],
        yPx: [
          382,
          566
        ],
        confidence: 0.62,
        note: "the blade split is only faintly resolved on the trigger face",
        x: [
          -0.246,
          -0.19
        ],
        y: [
          -0.01,
          0.358
        ]
      },
      gripPanel: {
        xPx: [
          352,
          700
        ],
        yPx: [
          300,
          900
        ],
        cornerRPx: 70,
        confidence: 0.8,
        x: [
          -1.298,
          -0.602
        ],
        y: [
          -0.678,
          0.522
        ],
        cornerR: 0.14
      },
      cyberModule: {
        xPx: [
          988,
          1142
        ],
        yPx: [
          238,
          300
        ],
        barXPx: [
          1035,
          1078
        ],
        barYPx: [
          244,
          322
        ],
        confidence: 0.72,
        note: "ribbon-cable module seen THROUGH the translucent frame; depth is inferred",
        x: [
          -0.026,
          0.282
        ],
        y: [
          0.522,
          0.646
        ],
        barX: [
          0.068,
          0.154
        ],
        barY: [
          0.478,
          0.634
        ]
      },
      magSerrations: {
        xPx: [
          578,
          648
        ],
        yPx: [
          956,
          1096
        ],
        count: 6,
        confidence: 0.85,
        x: [
          -0.846,
          -0.706
        ],
        y: [
          -1.07,
          -0.79
        ]
      },
      gripSerrations: {
        xPx: [
          592,
          660
        ],
        yPx: [
          812,
          940
        ],
        count: 5,
        confidence: 0.82,
        x: [
          -0.818,
          -0.682
        ],
        y: [
          -0.758,
          -0.502
        ]
      },
      wornMagwellLip: {
        xPx: [
          178,
          640
        ],
        yPx: [
          858,
          940
        ],
        confidence: 0.9,
        note: "Well-Worn: polymer worn through to bright metal along the magwell mouth",
        x: [
          -1.646,
          -0.722
        ],
        y: [
          -0.758,
          -0.594
        ]
      }
    },
    internals: {
      barrel: {
        xPx: [
          878,
          1856
        ],
        cyPx: 148,
        rPx: 56,
        confidence: 0.5,
        note: "OD from the published 14.5 mm barrel scaled by the traced height; the bore axis sits under the ejection-port floor, which the port opening confirms",
        x: [
          -0.246,
          1.71
        ],
        cy: 0.826,
        r: 0.112
      },
      recoilRod: {
        xPx: [
          962,
          1852
        ],
        cyPx: 200,
        rPx: 20,
        confidence: 0.35,
        x: [
          -0.078,
          1.702
        ],
        cy: 0.722,
        r: 0.04
      },
      breechFace: {
        xPx: [
          880,
          1150
        ],
        yPx: [
          42,
          208
        ],
        confidence: 0.6,
        x: [
          -0.242,
          0.298
        ],
        y: [
          0.706,
          1.038
        ]
      },
      magBody: {
        topPx: 300,
        confidence: 0.4,
        top: 0.522
      }
    },
    chamfer: {
      shellRollFrac: 0.09,
      basis: "the references show a thin bright edge line, not a wide bevel band; 9% of half-thickness keeps the roll shading continuous without drawing a chrome outline round the silhouette"
    }
  };

  // entry-notho.ts
  var frontAlbedoUrl = "/assets/glock-ghost-protocol/front-albedo.png";
  var backAlbedoUrl = "/assets/glock-ghost-protocol/back-albedo.png";
  var roughnessUrl = "/assets/glock-ghost-protocol/roughness.png";
  var metalnessUrl = "/assets/glock-ghost-protocol/metalness.png";
  var aoUrl = "/assets/glock-ghost-protocol/ao.png";
  var normalUrl = "/assets/glock-ghost-protocol/normal.png";
  var UV = (() => {
    const { scale, xc, yc, textureCrop: c } = geo_default.meta;
    return {
      x0: (c.x0 - xc) * scale,
      x1: (c.x1 - xc) * scale,
      y0: (yc - c.y1) * scale,
      y1: (yc - c.y0) * scale
    };
  })();
  var px = (v) => v * geo_default.meta.scale;
  var wx = (v) => (v - geo_default.meta.xc) * geo_default.meta.scale;
  var wy = (v) => (geo_default.meta.yc - v) * geo_default.meta.scale;
  var mix = (a, b, t) => a + (b - a) * t;
  var sq = (v) => v * v;
  function sstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function shapeFrom(outline, holes = []) {
    const s = new THREE.Shape();
    outline.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
    s.closePath();
    for (const h of holes) {
      const p = new THREE.Path();
      h.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y));
      p.closePath();
      s.holes.push(p);
    }
    return s;
  }
  function clipTop(pts, yMax) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const ain = a[1] <= yMax;
      if (ain) out.push(a);
      if (ain !== b[1] <= yMax) {
        const t = (yMax - a[1]) / (b[1] - a[1]);
        out.push([a[0] + (b[0] - a[0]) * t, yMax]);
      }
    }
    return out;
  }
  function offsetRing(ring, dAt) {
    const n = ring.length;
    const nrm = (a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      return new THREE.Vector2(-dy / l, dx / l);
    };
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = ring[i];
      const n1 = nrm(ring[(i - 1 + n) % n], p);
      const n2 = nrm(p, ring[(i + 1) % n]);
      const b = new THREE.Vector2(n1.x + n2.x, n1.y + n2.y);
      if (b.lengthSq() < 1e-12) {
        out.push(p.clone());
        continue;
      }
      b.normalize();
      const c = Math.max(0.45, b.dot(n1));
      const d = dAt(p) / c;
      out.push(new THREE.Vector2(p.x + b.x * d, p.y + b.y * d));
    }
    return out;
  }
  function subdivideCap(P, tris, t, zAt, rounds, interior) {
    const key = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
    for (let r = 0; r < rounds; r++) {
      const uses = /* @__PURE__ */ new Map();
      for (const [a, b, c] of tris)
        for (const [u, v] of [[a, b], [b, c], [c, a]])
          uses.set(key(u, v), (uses.get(key(u, v)) ?? 0) + 1);
      const mids = /* @__PURE__ */ new Map();
      const midOf = (a, b) => {
        const k = key(a, b);
        const hit = mids.get(k);
        if (hit !== void 0) return hit;
        const x = (P[a * 3] + P[b * 3]) / 2;
        const y = (P[a * 3 + 1] + P[b * 3 + 1]) / 2;
        const i = P.length / 3;
        const edge = uses.get(k) === 1;
        P.push(x, y, edge ? (P[a * 3 + 2] + P[b * 3 + 2]) / 2 : zAt(x, y, t));
        if (!edge) interior.push(i);
        mids.set(k, i);
        return i;
      };
      const next = [];
      for (const [a, b, c] of tris) {
        const ab = midOf(a, b);
        const bc = midOf(b, c);
        const ca = midOf(c, a);
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      }
      tris = next;
    }
    return tris;
  }
  function fieldNormals(g, zAt, t, interior) {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const e = 4e-3;
    const s = Math.sign(t);
    for (const i of interior) {
      const x = p.getX(i);
      const y = p.getY(i);
      const fx = (zAt(x + e, y, t) - zAt(x - e, y, t)) / (2 * e);
      const fy = (zAt(x, y + e, t) - zAt(x, y - e, t)) / (2 * e);
      const l = Math.hypot(fx, fy, 1);
      n.setXYZ(i, -s * fx / l, -s * fy / l, s / l);
    }
  }
  var LOFT_T = [-1, -0.986, -0.945, -0.87, -0.55, 0, 0.55, 0.87, 0.945, 0.986, 1];
  function lofted(shape, zAt, rollAt, holeRollAt = rollAt, subdiv = 2, openWall) {
    const raw = shape.extractPoints(12);
    const dedupe = (r) => r.length > 1 && r[0].distanceToSquared(r[r.length - 1]) < 1e-12 ? r.slice(0, -1) : r;
    const orient = (r, cw) => THREE.ShapeUtils.isClockWise(r) === cw ? r : r.slice().reverse();
    const contour = orient(dedupe(raw.shape), false);
    const holes = raw.holes.map((h) => orient(dedupe(h), true));
    const rings = [contour, ...holes];
    const perLayer = rings.reduce((a, r) => a + r.length, 0);
    const ringBase = [];
    rings.reduce((a, r) => (ringBase.push(a), a + r.length), 0);
    const capFaces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const P = [];
    for (const t of LOFT_T) {
      const k = 1 - Math.sqrt(Math.max(0, 1 - t * t));
      rings.forEach((ring, ri) => {
        const d = ri === 0 ? rollAt : holeRollAt;
        const off = offsetRing(ring, (p) => d(p.x, p.y) * k);
        for (let i = 0; i < ring.length; i++) {
          P.push(off[i].x, off[i].y, zAt(ring[i].x, ring[i].y, t));
        }
      });
    }
    const last = (LOFT_T.length - 1) * perLayer;
    const front = [];
    const back = [];
    const frontInner = [];
    const backInner = [];
    const shifted = capFaces.map(([a, b, c]) => [last + a, last + b, last + c]);
    for (const [a, b, c] of subdivideCap(P, shifted, 1, zAt, subdiv, frontInner)) front.push(a, b, c);
    for (const [a, b, c] of subdivideCap(P, capFaces, -1, zAt, subdiv, backInner)) back.push(c, b, a);
    const walls = [];
    for (let ti = 0; ti < LOFT_T.length - 1; ti++) {
      const lo = ti * perLayer;
      const hi = (ti + 1) * perLayer;
      rings.forEach((ring, ri) => {
        const o = ringBase[ri];
        for (let j = 0; j < ring.length; j++) {
          const k = (j + 1) % ring.length;
          if (openWall && ri === 0 && openWall((ring[j].x + ring[k].x) / 2, (ring[j].y + ring[k].y) / 2)) continue;
          const a = o + j;
          const b = o + k;
          walls.push(lo + a, lo + b, hi + a, lo + b, hi + b, hi + a);
        }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setIndex([...front, ...back, ...walls]);
    g.addGroup(0, front.length, 0);
    g.addGroup(front.length, back.length, 1);
    g.addGroup(front.length + back.length, walls.length, 2);
    g.computeVertexNormals();
    fieldNormals(g, zAt, 1, frontInner);
    fieldNormals(g, zAt, -1, backInner);
    planarUV(g);
    return g;
  }
  var sym = (half) => (x, y, t) => t * half(x, y);
  function planarUV(g) {
    const p = g.getAttribute("position");
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = (p.getX(i) - UV.x0) / (UV.x1 - UV.x0);
      uv[i * 2 + 1] = (p.getY(i) - UV.y0) / (UV.y1 - UV.y0);
    }
    const attr = new THREE.BufferAttribute(uv, 2);
    g.setAttribute("uv", attr);
    g.setAttribute("uv1", attr);
  }
  function pathOf(shape, divisions = 12) {
    const p = new THREE.Path();
    shape.getPoints(divisions).forEach((q, i) => i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y));
    return p;
  }
  function roundedRect(x0, y0, x1, y1, r) {
    const s = new THREE.Shape();
    s.moveTo(x0 + r, y0);
    s.lineTo(x1 - r, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + r);
    s.lineTo(x1, y1 - r);
    s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(x0 + r, y1);
    s.quadraticCurveTo(x0, y1, x0, y1 - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
  }
  function block(x, y, depth, zc = 0, r = 0) {
    if (r <= 0) {
      return new THREE.BoxGeometry(x[1] - x[0], y[1] - y[0], depth).translate(
        (x[0] + x[1]) / 2,
        (y[0] + y[1]) / 2,
        zc
      );
    }
    const bev = depth * 0.14;
    const g = new THREE.ExtrudeGeometry(roundedRect(x[0], y[0], x[1], y[1], r), {
      depth: depth - 2 * bev,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelThickness: bev,
      bevelSize: bev,
      bevelOffset: -bev,
      curveSegments: 6
    });
    g.translate(0, 0, zc - depth / 2 + bev);
    return g;
  }
  function cyl(x, cy, r, radial = 28) {
    const g = new THREE.CylinderGeometry(r, r, x[1] - x[0], radial, 1, false);
    g.rotateZ(Math.PI / 2);
    g.translate((x[0] + x[1]) / 2, cy, 0);
    return g;
  }
  var T = geo_default.thickness;
  var F = geo_default.features;
  var I = geo_default.internals;
  var SLIDE_TOP = F.rearSight.base;
  var slideHalf = (x, y) => {
    let h = T.slide / 2;
    h *= mix(1, 0.84, sstep(SLIDE_TOP - 0.03, SLIDE_TOP, y));
    h *= mix(1, 0.9, sstep(0.74, 0.68, y));
    h *= mix(1, 0.95, sstep(1.5, 1.71, x));
    h *= mix(1, 0.96, sstep(-1.55, -1.69, x));
    return h;
  };
  var GUARD = geo_default.parts.frame.holes[0].reduce(
    (b, [x, y]) => ({
      x0: Math.min(b.x0, x),
      x1: Math.max(b.x1, x),
      y0: Math.min(b.y0, y),
      y1: Math.max(b.y1, y)
    }),
    { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
  );
  var GP = F.gripPanel;
  var frameHalf = (x, y) => {
    let h = mix(0.196, 0.176, sstep(-0.55, 0.1, x));
    h = mix(h, 0.152, sstep(0.1, 0.95, x));
    h = mix(h, 0.142, sstep(0.95, 1.71, x));
    const dx = Math.max(GUARD.x0 - x, x - GUARD.x1, 0);
    const dy = Math.max(GUARD.y0 - y, y - GUARD.y1, 0);
    const bow = (1 - sstep(0.02, 0.34, Math.hypot(dx, dy))) * sstep(GUARD.y1 + 0.06, GUARD.y1 - 0.04, y);
    h = mix(h, 0.158, bow);
    const s = 1 - sq((x + 0.95) / 0.46) - sq((y + 0.02) / 0.74);
    if (s > 0) h += 0.034 * Math.sqrt(s);
    const px0 = Math.max(GP.x[0] + GP.cornerR - x, x - (GP.x[1] - GP.cornerR), 0);
    const py0 = Math.max(GP.y[0] + GP.cornerR - y, y - (GP.y[1] - GP.cornerR), 0);
    h += 0.015 * (1 - sstep(GP.cornerR * 0.35, GP.cornerR, Math.hypot(px0, py0)));
    return h;
  };
  var triggerHalf = (_x, y) => T.trigger / 2 * mix(1, 1.5, Math.max(0, 1 - sq((y - 0.16) / 0.26)));
  var SLIDE_WALL = px(30);
  var magHalf = (_x, y) => {
    let h = T.magazine / 2;
    h *= mix(1, 1.07, sstep(-1, -1.11, y));
    h *= mix(1, 0.93, sstep(-0.82, -0.71, y));
    return h;
  };
  var loader = new THREE.TextureLoader();
  function tex(url, srgb) {
    const t = loader.load(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 16;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  function loadMaps() {
    return {
      front: tex(frontAlbedoUrl, true),
      back: tex(backAlbedoUrl, true),
      rough: tex(roughnessUrl, false),
      metal: tex(metalnessUrl, false),
      ao: tex(aoUrl, false),
      normal: tex(normalUrl, false)
    };
  }
  function polymerFace(m, side, o) {
    return new THREE.MeshPhysicalMaterial({
      map: side === "front" ? m.front : m.back,
      roughnessMap: m.rough,
      metalnessMap: m.metal,
      aoMap: m.ao,
      aoMapIntensity: 0.65,
      normalMap: m.normal,
      // 0.42, not 0.85: the broadside review view barely shows the normal map, but as soon as the
      // demo rocks off-axis the micro-stipple and the grip stria read at a grazing angle and the
      // polymer turned into coarse leather. Solved at the rocked extreme, not at the flat view.
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 1,
      // scalar x map; both maps carry the authored per-pixel values
      metalness: 1,
      // clearcoat solved against the FRONT reference at the fixed review view: 0.62 washed a
      // specular veil over every zone (+13..+19 counts of red above the reference). At 0.40 the
      // FRONT mean lands at [69.8, 26.0, 32.1] against the reference's [74.6, 24.8, 30.7].
      clearcoat: 0.4,
      clearcoatRoughness: 0.22,
      transmission: o.transmission,
      thickness: o.thickness,
      ior: 1.52,
      // injection-moulded polymer
      attenuationColor: new THREE.Color(4851472),
      attenuationDistance: 0.55,
      specularIntensity: 1
    });
  }
  function polymerRim(o) {
    return new THREE.MeshPhysicalMaterial({
      color: 2885132,
      roughness: 0.56,
      metalness: 0,
      // The loft gives the rim real width where the section is slim, so it is now most of what
      // the trigger-guard bow shows: at the old 0x3a0710 the bow measured +15 luma over the
      // reference while the broad faces sat within 3.
      envMapIntensity: 0.6,
      // Duller than the faces on purpose: at clearcoat 0.4 the rolled rim blew out to a white
      // outline round the whole silhouette, where the references show a thin dark-red edge.
      clearcoat: 0.2,
      clearcoatRoughness: 0.5,
      transmission: o.transmission * 0.45,
      thickness: o.thickness,
      ior: 1.52,
      attenuationColor: new THREE.Color(3343625),
      attenuationDistance: 0.28
    });
  }
  var triggerPolymer = () => new THREE.MeshPhysicalMaterial({ color: 3487805, roughness: 0.7, metalness: 0.1 });
  var blackPolymer = () => new THREE.MeshPhysicalMaterial({ color: 657933, roughness: 0.44, metalness: 0.05, clearcoat: 0.4, clearcoatRoughness: 0.22 });
  function hardwareFace(m, tint) {
    return new THREE.MeshPhysicalMaterial({
      map: m.front,
      color: new THREE.Color(tint),
      roughnessMap: m.rough,
      normalMap: m.normal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 1,
      metalness: 0.08,
      clearcoat: 0.4,
      clearcoatRoughness: 0.26
    });
  }
  var steel = () => new THREE.MeshPhysicalMaterial({ color: 4015439, roughness: 0.46, metalness: 1 });
  var gunmetal = () => new THREE.MeshPhysicalMaterial({ color: 3948614, roughness: 0.42, metalness: 0.85 });
  function barrelGeometry() {
    const b = I.barrel;
    const L = b.x[1] - b.x[0];
    const R = b.r;
    const profile = [
      [0, 0],
      [0, R * 1.18],
      // breech face
      [0.3, R * 1.18],
      [0.4, R],
      // chamber, then the taper into the shank
      [L - 0.22, R],
      [L - 0.17, R * 0.93],
      [L, R * 0.93],
      [L, R * 0.58],
      // muzzle crown
      [L - 0.05, R * 0.54],
      [0.44, R * 0.54],
      // bore, back up the inside
      [0.34, R * 0.66],
      [0.02, R * 0.66],
      // chamber mouth
      [0.02, 0]
    ];
    const g = new THREE.LatheGeometry(profile.map(([a, r]) => new THREE.Vector2(r, a)), 32);
    g.rotateZ(-Math.PI / 2);
    g.translate(b.x[0], b.cy, 0);
    return g;
  }
  var RECOIL_CY = I.recoilRod.cy - px(10);
  var COIL_R = px(15);
  function springGeometry() {
    const rr = I.recoilRod;
    const turns = 21;
    const seg = turns * 14;
    const x0 = rr.x[0] + 0.1;
    const span = rr.x[1] - rr.x[0] - 0.22;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const a = u * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(x0 + u * span, RECOIL_CY + Math.sin(a) * COIL_R, Math.cos(a) * COIL_R));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, px(6), 6, false);
  }
  function createGlockGhostProtocolModel(o = {}) {
    const shadows = o.shadows ?? true;
    const transmission = o.transmission ?? 0.3;
    const m = loadMaps();
    const root = new THREE.Group();
    root.name = "glock18-ghost-protocol";
    const nodes = {};
    const add = (parent, name, g, mat) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      parent.add(mesh);
      nodes[name] = mesh;
      return mesh;
    };
    const integral = (o2) => {
      o2.userData.explodeWithParent = true;
      return o2;
    };
    const shell = (parent, name, shape, half, nominal, holeRollAt, openWall) => {
      const opt = { transmission, thickness: nominal };
      const roll = (x, y) => half(x, y) * geo_default.chamfer.shellRollFrac;
      const g = lofted(shape, sym(half), roll, holeRollAt, 2, openWall);
      return add(parent, name, g, [
        polymerFace(m, "front", opt),
        polymerFace(m, "back", opt),
        polymerRim(opt)
      ]);
    };
    const ribs = (parent, name, band, half, proud, mats) => {
      const g = new THREE.Group();
      g.name = name;
      const w = (band.x[1] - band.x[0]) / (band.count * 2 - 1);
      const cy = (band.y[0] + band.y[1]) / 2;
      for (let i = 0; i < band.count; i++) {
        const x0 = band.x[0] + i * 2 * w;
        for (const s of [0, 1]) {
          const bg = block(
            [x0, x0 + w],
            [band.y[0], band.y[1]],
            proud * 2,
            (s ? 1 : -1) * half(x0 + w / 2, cy),
            w * 0.34
          );
          planarUV(bg);
          const mesh = new THREE.Mesh(bg, mats[s]);
          mesh.castShadow = shadows;
          mesh.name = `${name}_${String(i).padStart(2, "0")}${s ? "f" : "b"}`;
          mesh.userData.explodeWithParent = true;
          g.add(mesh);
        }
      }
      parent.add(g);
      nodes[name] = g;
      return g;
    };
    const ribMats = ["back", "front"].map((side) => {
      const mm = polymerFace(m, side, { transmission: 0, thickness: 0 });
      mm.clearcoat = 0.16;
      mm.clearcoatRoughness = 0.42;
      mm.envMapIntensity = 0.45;
      return mm;
    });
    const projectedHardware = (parent, name, g, tint) => {
      planarUV(g);
      return add(parent, name, g, hardwareFace(m, tint));
    };
    const slideGrp = new THREE.Group();
    slideGrp.name = "slideAssembly";
    root.add(slideGrp);
    const ep = F.ejectionPort;
    const slideShape = shapeFrom(clipTop(geo_default.parts.slide.outline, SLIDE_TOP));
    slideShape.holes.push(pathOf(roundedRect(ep.x[0], ep.y[0], ep.x[1], ep.y[1], ep.cornerR)));
    const slideMesh = shell(
      slideGrp,
      "slide",
      slideShape,
      slideHalf,
      T.slide,
      () => 0,
      // Bottom: the U-channel. Nose: the barrel has to come OUT somewhere. Without this the slide's
      // muzzle-end wall capped the bore — exploded you could see straight down the barrel, assembled
      // the slide's solid nose sealed it, which is exactly the defect reported.
      (x, y) => y < 0.69 || x > 1.7 && y > 0.7 && y < 0.95
    );
    const raceway = lofted(
      roundedRect(wx(160), 0.655, wx(1852), 0.995, px(16)),
      sym((x, y) => Math.max(px(10), slideHalf(x, y) - SLIDE_WALL)),
      () => px(6),
      () => px(6),
      1
    );
    integral(add(
      slideMesh,
      "slideRaceway",
      raceway,
      new THREE.MeshPhysicalMaterial({ color: 3817801, roughness: 0.5, metalness: 0.8, side: THREE.BackSide })
    ));
    const noseH = slideHalf(1.705, 0.83);
    const noseShape = roundedRect(-noseH, 0.665, noseH, 0.975, px(22));
    const boreHole = new THREE.Path();
    boreHole.absarc(0, I.barrel.cy, I.barrel.r * 0.96, 0, Math.PI * 2, true);
    noseShape.holes.push(boreHole);
    const noseGeo = new THREE.ExtrudeGeometry(noseShape, { depth: px(26), bevelEnabled: false, curveSegments: 24 });
    noseGeo.rotateY(Math.PI / 2);
    noseGeo.translate(1.708 - px(26), 0, 0);
    planarUV(noseGeo);
    integral(add(slideMesh, "muzzleFace", noseGeo, polymerRim({ transmission, thickness: T.slide })));
    for (const sgn of [1, -1]) {
      const g = block(
        [wx(210), wx(1800)],
        [0.68, 0.68 + px(26)],
        SLIDE_WALL,
        sgn * (slideHalf(wx(900), 0.7) - SLIDE_WALL / 2),
        px(5)
      );
      const mesh = new THREE.Mesh(g, gunmetal());
      mesh.name = sgn > 0 ? "slideRailFront" : "slideRailBack";
      mesh.castShadow = shadows;
      slideMesh.add(mesh);
      nodes[mesh.name] = integral(mesh);
    }
    const floorMat = new THREE.MeshPhysicalMaterial({ color: 1316378, roughness: 0.55, metalness: 0.7 });
    const portFloor = lofted(
      roundedRect(ep.x[0], ep.y[0], ep.x[1], ep.y[1], ep.cornerR),
      (x, y, t) => -slideHalf(x, y) + (t + 1) / 2 * 0.078,
      () => 0,
      () => 0,
      0
    );
    integral(add(slideMesh, "portFloor", portFloor, [
      floorMat,
      polymerFace(m, "back", { transmission, thickness: T.slide }),
      floorMat
    ]));
    add(
      slideGrp,
      "breechFace",
      block(
        [ep.x[0] - px(4), ep.x[0] + px(52)],
        [I.breechFace.y[0], ep.y[1] - px(4)],
        T.slide * 0.6,
        0,
        px(12)
      ),
      steel()
    );
    add(
      slideGrp,
      "breechBody",
      block(
        [I.breechFace.x[0] - px(40), I.breechFace.x[0] + px(48)],
        [wy(220), I.breechFace.y[1] - px(20)],
        T.slide * 0.72,
        0
      ),
      gunmetal()
    );
    add(slideGrp, "striker", cyl([wx(240), ep.x[0] + px(10)], wy(190), px(22), 18), gunmetal());
    add(slideGrp, "strikerCollar", cyl([wx(560), wx(640)], wy(190), px(30), 18), steel());
    projectedHardware(
      slideGrp,
      "extractor",
      block(F.extractor.x, F.extractor.y, px(16), slideHalf(F.extractor.x[1], F.extractor.y[0]) - px(6), px(8)),
      11842748
    );
    const rs = F.rearSight;
    const rsHalf = px(60);
    const notch = px(18);
    const sightGrp = new THREE.Group();
    sightGrp.name = "rearSight";
    const rsMat = blackPolymer();
    sightGrp.add(integral(new THREE.Mesh(
      block([rs.x[0], rs.x[1]], [rs.base - px(6), rs.top - px(16)], rsHalf * 2, 0, px(4)),
      rsMat
    )));
    for (const s of [1, -1]) {
      sightGrp.add(integral(new THREE.Mesh(
        new THREE.BoxGeometry(rs.x[1] - rs.x[0], px(16), rsHalf - notch).translate((rs.x[0] + rs.x[1]) / 2, rs.top - px(8), s * (rsHalf + notch) / 2),
        rsMat
      )));
    }
    slideGrp.add(sightGrp);
    nodes.rearSight = sightGrp;
    const fs = F.frontSight;
    const fsHalf = px(22);
    const fsGrp = new THREE.Group();
    fsGrp.name = "frontSight";
    fsGrp.add(integral(new THREE.Mesh(
      block([fs.x[0], fs.x[1]], [fs.base - px(6), fs.top], fsHalf * 2, 0, px(3)),
      rsMat
    )));
    const dot = integral(new THREE.Mesh(
      cyl([fs.x[0] - px(3), fs.x[0] + px(1)], (fs.base + fs.top) / 2, px(9), 14),
      new THREE.MeshPhysicalMaterial({ color: 15922416, roughness: 0.35, metalness: 0 })
    ));
    fsGrp.add(dot);
    slideGrp.add(fsGrp);
    nodes.frontSight = fsGrp;
    add(slideGrp, "barrel", barrelGeometry(), steel());
    add(
      slideGrp,
      "barrelHood",
      block(
        [I.barrel.x[0] - px(6), I.barrel.x[0] + px(150)],
        [I.barrel.cy, I.barrel.cy + I.barrel.r * 1.15],
        I.barrel.r * 1.5,
        0,
        px(8)
      ),
      steel()
    );
    add(
      slideGrp,
      "lockingLug",
      block(
        [I.barrel.x[0] + px(220), I.barrel.x[0] + px(400)],
        [I.barrel.cy - I.barrel.r * 1.5, I.barrel.cy - I.barrel.r * 0.7],
        I.barrel.r * 1.2,
        0,
        px(6)
      ),
      gunmetal()
    );
    add(slideGrp, "recoilRod", cyl(I.recoilRod.x, RECOIL_CY, px(9), 18), steel());
    add(slideGrp, "recoilSpring", springGeometry(), gunmetal());
    ribs(slideMesh, "rearSerrations", F.rearSerrations, slideHalf, px(4), ribMats);
    ribs(slideMesh, "frontSerrations", F.frontSerrations, slideHalf, px(4), ribMats);
    const frameMesh = shell(
      root,
      "frame",
      shapeFrom(geo_default.parts.frame.outline, geo_default.parts.frame.holes),
      frameHalf,
      T.frame
    );
    ribs(frameMesh, "gripSerrations", F.gripSerrations, frameHalf, px(4), ribMats);
    const magGrp = new THREE.Group();
    magGrp.name = "magazineAssembly";
    root.add(magGrp);
    const magMesh = shell(magGrp, "magazine", shapeFrom(geo_default.parts.magazine.outline), magHalf, T.magazine);
    ribs(magMesh, "magSerrations", F.magSerrations, magHalf, px(4), ribMats);
    add(
      magGrp,
      "magBody",
      block([wx(470), wx(650)], [wy(980), I.magBody.top - px(40)], T.magazine * 0.56, 0, px(18)),
      gunmetal()
    );
    add(
      magGrp,
      "magSpine",
      block([wx(470), wx(496)], [wy(970), I.magBody.top - px(50)], T.magazine * 0.42, 0, px(8)),
      steel()
    );
    for (const s of [1, -1]) {
      const lip = block(
        [wx(470), wx(650)],
        [I.magBody.top - px(44), I.magBody.top],
        T.magazine * 0.1,
        s * T.magazine * 0.25,
        px(5)
      );
      const mesh = new THREE.Mesh(lip, steel());
      mesh.name = s > 0 ? "feedLipFront" : "feedLipBack";
      magGrp.add(mesh);
      nodes[mesh.name] = mesh;
    }
    add(
      magGrp,
      "follower",
      block(
        [wx(486), wx(634)],
        [I.magBody.top - px(110), I.magBody.top - px(46)],
        T.magazine * 0.44,
        0,
        px(8)
      ),
      new THREE.MeshPhysicalMaterial({ color: 12736284, roughness: 0.55, metalness: 0 })
    );
    const trigGrp = new THREE.Group();
    trigGrp.name = "triggerPivot";
    trigGrp.position.set(F.triggerPin.cx, F.triggerPin.cy, 0);
    root.add(trigGrp);
    const ts = F.triggerSafety;
    const SLOT = { x0: ts.x[0], x1: ts.x[1], y0: 6e-3, y1: 0.344 };
    const shoeShape = shapeFrom(geo_default.parts.trigger.outline);
    shoeShape.holes.push(pathOf(roundedRect(SLOT.x0, SLOT.y0, SLOT.x1, SLOT.y1, px(9))));
    const trigGeo = lofted(shoeShape, sym(triggerHalf), (x, y) => triggerHalf(x, y) * 0.4, () => 0);
    trigGeo.translate(-F.triggerPin.cx, -F.triggerPin.cy, 0);
    const shoe = add(trigGrp, "trigger", trigGeo, triggerPolymer());
    const bladeHalf = (x, y) => triggerHalf(x, y) * mix(0.5, 1.22, sstep(0.3, 0.03, y));
    const bladeGeo = lofted(
      roundedRect(SLOT.x0 + px(3), SLOT.y0 + px(3), SLOT.x1 - px(3), SLOT.y1 - px(3), px(7)),
      sym(bladeHalf),
      (x, y) => bladeHalf(x, y) * 0.35,
      void 0,
      1
    );
    bladeGeo.translate(-F.triggerPin.cx, -F.triggerPin.cy, 0);
    integral(add(shoe, "triggerSafety", bladeGeo, triggerPolymer()));
    const barMat = gunmetal();
    integral(add(
      shoe,
      "triggerBar",
      block(
        [wx(700) - F.triggerPin.cx, wx(960) - F.triggerPin.cx],
        [wy(390) - F.triggerPin.cy, wy(350) - F.triggerPin.cy],
        px(24),
        -px(28),
        px(6)
      ),
      barMat
    ));
    integral(add(
      shoe,
      "connector",
      block(
        [wx(620) - F.triggerPin.cx, wx(720) - F.triggerPin.cx],
        [wy(410) - F.triggerPin.cy, wy(270) - F.triggerPin.cy],
        px(20),
        -px(28),
        px(5)
      ),
      barMat
    ));
    for (const id of ["triggerPin", "lockingBlockPin"]) {
      const p = F[id];
      const g = new THREE.CylinderGeometry(p.r, p.r, frameHalf(p.cx, p.cy) * 2 + px(6), 20);
      g.rotateX(Math.PI / 2);
      g.translate(p.cx, p.cy, 0);
      add(root, id, g, gunmetal());
    }
    projectedHardware(
      root,
      "slideStop",
      block(
        F.slideStop.x,
        F.slideStop.y,
        px(14),
        frameHalf(F.slideStop.x[0], F.slideStop.y[0]) + px(3),
        px(12)
      ),
      11580604
    );
    projectedHardware(
      root,
      "magRelease",
      block(
        [F.magRelease.x[0] + px(16), F.magRelease.x[1] - px(2)],
        [F.magRelease.y[0] + px(6), F.magRelease.y[1] - px(6)],
        px(9),
        frameHalf(F.magRelease.x[0], F.magRelease.y[0]) + px(1),
        px(8)
      ),
      9475744
    );
    const cm = F.cyberModule;
    add(root, "cyberModule", block(cm.barX, cm.barY, px(34), 0, px(5)), blackPolymer());
    const ribbon = new THREE.MeshPhysicalMaterial({
      color: 1710624,
      roughness: 0.5,
      metalness: 0.2,
      emissive: new THREE.Color(16738846),
      emissiveIntensity: 0.55
    });
    const ribbonDark = blackPolymer();
    const rGrp = new THREE.Group();
    rGrp.name = "ribbonCables";
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const y = cm.y[0] + (i + 0.5) / rows * (cm.y[1] - cm.y[0]);
      const g = new THREE.BoxGeometry(cm.x[1] - cm.x[0], px(4), px(20));
      g.translate((cm.x[0] + cm.x[1]) / 2, y, 0);
      const cable = new THREE.Mesh(g, i % 2 ? ribbon : ribbonDark);
      cable.name = `ribbonCable_${String(i).padStart(2, "0")}`;
      rGrp.add(integral(cable));
    }
    root.add(rGrp);
    nodes.ribbonCables = rGrp;
    const bbox = new THREE.Box3().setFromObject(root);
    root.userData.sculptRuntime = {
      nodes,
      pivots: { trigger: trigGrp, slide: slideGrp, magazine: magGrp },
      sockets: {
        muzzle: new THREE.Vector3(wx(1856), I.barrel.cy, 0),
        grip: new THREE.Vector3(wx(450), wy(620), 0),
        accessoryRail: new THREE.Vector3(wx(1676), wy(372), 0),
        magWell: new THREE.Vector3(wx(430), wy(930), 0),
        ejectionPort: new THREE.Vector3(wx(1012), wy(86), T.slide / 2)
      },
      colliders: [{ type: "box", min: bbox.min.clone(), max: bbox.max.clone() }],
      destructionGroups: {
        slide: [
          "slide",
          "slideRaceway",
          "muzzleFace",
          "slideRailFront",
          "slideRailBack",
          "portFloor",
          "breechFace",
          "breechBody",
          "striker",
          "strikerCollar",
          "extractor",
          "rearSight",
          "frontSight",
          "rearSerrations",
          "frontSerrations",
          "barrel",
          "barrelHood",
          "lockingLug",
          "recoilRod",
          "recoilSpring"
        ],
        frame: ["frame", "gripSerrations", "slideStop", "magRelease", "triggerPin", "lockingBlockPin"],
        magazine: [
          "magazine",
          "magSerrations",
          "magBody",
          "magSpine",
          "feedLipFront",
          "feedLipBack",
          "follower"
        ],
        fireControl: ["trigger", "triggerSafety", "triggerBar", "connector", "cyberModule", "ribbonCables"]
      },
      provenance: {
        route: "reference-projection",
        exactnessTier: "image-only",
        familyAdapter: "pistol/glock-18",
        thicknessConfidence: T.confidence,
        inferred: [
          "z-thickness and every cross-section profile",
          "barrel & recoil-rod depth",
          "magazine internals",
          "trigger linkage",
          "rim colour"
        ]
      }
    };
    return root;
  }
  function createGlockGhostProtocolLookDevLights() {
    const g = new THREE.Group();
    g.name = "glockGhostProtocolLights";
    const key = new THREE.DirectionalLight(16773870, 2.35);
    key.position.set(1.9, 3.4, 4.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    key.shadow.bias = -6e-4;
    g.add(key);
    const fill = new THREE.DirectionalLight(8038655, 0.58);
    fill.position.set(-3.4, 0.8, 3);
    g.add(fill);
    const backKey = new THREE.DirectionalLight(16774384, 3.05);
    backKey.position.set(-1.9, 3.4, -4.6);
    g.add(backKey);
    const backFill = new THREE.DirectionalLight(8038655, 0.78);
    backFill.position.set(3.4, 0.8, -3);
    g.add(backFill);
    const kick = new THREE.DirectionalLight(16736109, 0.62);
    kick.position.set(-1.2, -1.9, -3.2);
    g.add(kick);
    g.add(new THREE.AmbientLight(2367530, 0.26));
    return g;
  }
  function makeGhostProtocolBackground() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const ctx = cv.getContext("2d");
    const grd = ctx.createRadialGradient(256, 232, 24, 256, 256, 340);
    grd.addColorStop(0, "#241017");
    grd.addColorStop(0.55, "#12080c");
    grd.addColorStop(1, "#070507");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    const tex2 = new THREE.CanvasTexture(cv);
    tex2.colorSpace = THREE.SRGBColorSpace;
    tex2.mapping = THREE.EquirectangularReflectionMapping;
    return tex2;
  }
  return __toCommonJS(entry_notho_exports);
})();
