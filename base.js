const { useMemo, useState } = React;

const DEFAULT_CORE_DIAMETER = 3.025;
const DEFAULT_CALIPER_MIL = 5.8;
const DEFAULT_CLEARANCE = 0.25;
const DEFAULT_EXTRA_PERCENT = 5;
const DEFAULT_LABEL_GAP = 0.25;
const DEFAULT_CORE_HEIGHT_OVERHANG = 0.5;
const DEFAULT_REPEAT_EDGE = "sideways";
const DEFAULT_PACKING_METHOD = "standard";

const REPEAT_EDGE_LABELS = {
  flat: "Flat",
  sideways: "Sideways",
};

const PACKING_METHOD_LABELS = {
  standard: "Standard grid",
  offset: "Hex / offset rows",
};

const BOXES = [
  [5, 5, 4],
  [7, 7, 5],
  [10, 5, 5],
  [16, 6, 4],
  [10, 10, 5],
  [8, 8, 8],
  [15, 10, 4],
  [15, 10, 8],
  [15, 12, 10],
  [24, 16, 8],
  [24, 16, 12],
].map(([l, w, h], index) => ({
  id: `${l}x${w}x${h}-${index}`,
  name: `${l} x ${w} x ${h}`,
  l,
  w,
  h,
  volume: l * w * h,
}));

const DEFAULT_SELECTED_BOX_IDS = BOXES.map((box) => box.id);

const SAMPLE_ROLLS = [
  { id: 1, width: 4, height: 3.396, rolls: 2, labelsPerRoll: 500 },
  { id: 2, width: 3, height: 2, rolls: 4, labelsPerRoll: 1000 },
  { id: 3, width: 6, height: 4, rolls: 1, labelsPerRoll: 250 },
];

const EMPTY_FORM = {
  width: "",
  height: "",
  rolls: "",
  labelsPerRoll: "",
};

const TEST_CASES = [
  {
    name: "Short edge orientation uses the opposite edge as repeat length",
    item: { width: 4, height: 3.396, rolls: 2, labelsPerRoll: 500 },
    expect: { repeat: 4, repeatPitch: 4.25, labelHeight: 3.396, rollHeight: 3.896, rolls: 2, labelsPerRoll: 500 },
  },
  {
    name: "Tall/narrow label uses the opposite edge from orientation",
    item: { width: 2, height: 3, rolls: 4, labelsPerRoll: 1000 },
    expect: { repeat: 3, repeatPitch: 3.25, labelHeight: 2, rollHeight: 2.5, rolls: 4, labelsPerRoll: 1000 },
  },
  {
    name: "Long edge orientation uses the short edge as repeat length",
    item: { width: 4, height: 3.396, rolls: 2, labelsPerRoll: 500 },
    repeatEdge: "flat",
    expect: { repeat: 3.396, repeatPitch: 3.646, labelHeight: 4, rollHeight: 4.5, rolls: 2, labelsPerRoll: 500 },
  },
  {
    name: "Rejects missing labels per roll",
    item: { width: 4, height: 6, rolls: 1, labelsPerRoll: "" },
    expectError: true,
  },
  {
    name: "Rejects zero rolls",
    item: { width: 4, height: 6, rolls: 0, labelsPerRoll: 500 },
    expectError: true,
  },
  {
    name: "Large order produces a multi-box plan",
    item: { width: 4, height: 3.396, rolls: 40, labelsPerRoll: 500 },
    expectPackingPlan: true,
  },
];

function formatNumber(n, digits = 2) {
  if (!Number.isFinite(n)) return "--";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function Panel({ children, className = "" }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function Badge({ children, good = false, warn = false }) {
  let className = "bg-slate-100 text-slate-700";
  if (good) className = "bg-emerald-100 text-emerald-800";
  if (warn) className = "bg-amber-100 text-amber-800";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function NumberField({ label, value, onChange, step = "0.001" }) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500"
      >
        {children}
      </select>
    </label>
  );
}

function normalizeRollInput(item, repeatEdgeChoice = item.repeatEdge || DEFAULT_REPEAT_EDGE) {
  const width = Number(item.width);
  const height = Number(item.height);
  const rolls = Number(item.rolls);
  const labelsPerRoll = Number(String(item.labelsPerRoll).replace(/,/g, ""));
  const repeatEdge = repeatEdgeChoice === "flat" || repeatEdgeChoice === "long" ? "flat" : "sideways";

  if (!Number.isFinite(width) || width <= 0) {
    return { raw: item, error: "Width must be a positive number." };
  }

  if (!Number.isFinite(height) || height <= 0) {
    return { raw: item, error: "Height must be a positive number." };
  }

  if (!Number.isFinite(rolls) || rolls <= 0) {
    return { raw: item, error: "Number of rolls must be a positive number." };
  }

  if (!Number.isFinite(labelsPerRoll) || labelsPerRoll <= 0) {
    return { raw: item, error: "Label quantity per roll must be a positive number." };
  }

  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  const labelHeight = repeatEdge === "flat" ? longEdge : shortEdge;
  const repeat = repeatEdge === "flat" ? shortEdge : longEdge;
  const rollHeight = labelHeight + DEFAULT_CORE_HEIGHT_OVERHANG;
  const repeatPitch = repeat + DEFAULT_LABEL_GAP;

  return {
    id: item.id,
    width,
    height,
    dimA: width,
    dimB: height,
    repeatEdge,
    repeatEdgeLabel: REPEAT_EDGE_LABELS[repeatEdge],
    repeat,
    repeatPitch,
    labelGap: DEFAULT_LABEL_GAP,
    labelHeight,
    coreHeightOverhang: DEFAULT_CORE_HEIGHT_OVERHANG,
    rollHeight,
    rolls,
    labelsPerRoll,
    description: `${formatNumber(width)} x ${formatNumber(height)} - ${REPEAT_EDGE_LABELS[repeatEdge].toLowerCase()} orientation, ${rolls} roll${rolls === 1 ? "" : "s"}, ${labelsPerRoll.toLocaleString()} labels/roll`,
  };
}

function calculateRoll(item, coreDiameter, caliperMil, clearance, extraPercent = DEFAULT_EXTRA_PERCENT) {
  const safeCoreDiameter = Math.max(Number(coreDiameter) || DEFAULT_CORE_DIAMETER, 0.001);
  const safeCaliperMil = Math.max(Number(caliperMil) || DEFAULT_CALIPER_MIL, 0.001);
  const safeClearance = Math.max(Number(clearance) || 0, 0);
  const safeExtraPercent = Math.max(Number(extraPercent) || 0, 0);
  const caliperInches = safeCaliperMil / 1000;
  const repeatPitch = item.repeatPitch || item.repeat + DEFAULT_LABEL_GAP;
  const effectiveLabelsPerRoll = item.labelsPerRoll * (1 + safeExtraPercent / 100);
  const woundLength = repeatPitch * effectiveLabelsPerRoll;
  const outerDiameter = Math.sqrt(safeCoreDiameter ** 2 + (4 * woundLength * caliperInches) / Math.PI);
  const effectiveDiameter = outerDiameter + safeClearance;
  const effectiveHeight = item.rollHeight + safeClearance;
  const cylinderVolume = Math.PI * (outerDiameter / 2) ** 2 * item.rollHeight;
  const boundingVolume = effectiveDiameter * effectiveDiameter * effectiveHeight;

  return {
    ...item,
    woundLength,
    effectiveLabelsPerRoll,
    extraPercent: safeExtraPercent,
    outerDiameter,
    effectiveDiameter,
    effectiveHeight,
    cylinderVolume,
    boundingVolume,
    totalCylinderVolume: cylinderVolume * item.rolls,
    totalBoundingVolume: boundingVolume * item.rolls,
  };
}

function getRollLabel(groupIndex) {
  return `${groupIndex + 1}`;
}

function getRollLabelRange(groupIndex) {
  return getRollLabel(groupIndex);
}

function expandRollInstances(rollGroups) {
  const instances = [];
  rollGroups.forEach((group, groupIndex) => {
    for (let i = 0; i < group.rolls; i += 1) {
      instances.push({
        id: `${group.id || groupIndex}-${i}`,
        groupId: group.id || groupIndex,
        groupIndex,
        label: getRollLabel(groupIndex, i),
        diameter: group.effectiveDiameter,
        actualDiameter: group.outerDiameter,
        height: group.effectiveHeight,
      });
    }
  });
  return instances.sort((a, b) => b.diameter - a.diameter);
}

function packLayerStandard(instances, orientation, remainingHeight) {
  const placed = [];
  const placedIds = new Set();
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const roll of instances) {
    const d = roll.diameter;
    if (roll.height > remainingHeight || d > orientation.L || d > orientation.W) continue;

    if (cursorX + d > orientation.L) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    if (cursorY + d <= orientation.W) {
      placed.push({
        ...roll,
        x: cursorX + d / 2,
        y: cursorY + d / 2,
        r: d / 2,
      });
      placedIds.add(roll.id);
      cursorX += d;
      rowHeight = Math.max(rowHeight, d);
    }
  }

  const remaining = instances.filter((roll) => !placedIds.has(roll.id));
  const layerHeight = placed.length ? Math.max(...placed.map((roll) => roll.height)) : 0;
  return { placed, remaining, layerHeight };
}

function packLayerOffset(instances, orientation, remainingHeight) {
  const eligible = instances.filter((roll) => roll.height <= remainingHeight && roll.diameter <= orientation.L && roll.diameter <= orientation.W);
  if (!eligible.length) return { placed: [], remaining: instances, layerHeight: 0 };

  const placed = [];
  const placedIds = new Set();
  const slotD = Math.max(...eligible.map((roll) => roll.diameter));
  const rowStep = slotD * Math.sqrt(3) / 2;
  let rowIndex = 0;
  let centerY = slotD / 2;

  while (centerY + slotD / 2 <= orientation.W + 1e-9) {
    let centerX = slotD / 2 + (rowIndex % 2 ? slotD / 2 : 0);
    while (centerX + slotD / 2 <= orientation.L + 1e-9) {
      const roll = eligible.find((candidate) => !placedIds.has(candidate.id));
      if (roll) {
        placed.push({
          ...roll,
          x: centerX,
          y: centerY,
          r: roll.diameter / 2,
        });
        placedIds.add(roll.id);
      }
      centerX += slotD;
    }
    rowIndex += 1;
    centerY = slotD / 2 + rowIndex * rowStep;
  }

  const remaining = instances.filter((roll) => !placedIds.has(roll.id));
  const layerHeight = placed.length ? Math.max(...placed.map((roll) => roll.height)) : 0;
  return { placed, remaining, layerHeight };
}

function packLayer(instances, orientation, remainingHeight, packingMethod = DEFAULT_PACKING_METHOD) {
  return packingMethod === "offset"
    ? packLayerOffset(instances, orientation, remainingHeight)
    : packLayerStandard(instances, orientation, remainingHeight);
}

function packBox(instances, orientation, packingMethod = DEFAULT_PACKING_METHOD) {
  let remaining = [...instances];
  let remainingHeight = orientation.H;
  const layers = [];

  while (remaining.length > 0 && remainingHeight > 0) {
    const layer = packLayer(remaining, orientation, remainingHeight, packingMethod);
    if (!layer.placed.length || layer.layerHeight <= 0 || layer.layerHeight > remainingHeight) break;
    layers.push(layer);
    remaining = layer.remaining;
    remainingHeight -= layer.layerHeight;
  }

  const placedCount = layers.reduce((sum, layer) => sum + layer.placed.length, 0);
  return {
    orientation,
    layers,
    placedCount,
    remaining,
    topViewPlaced: layers[0]?.placed || [],
    packingMethod,
  };
}

function chooseBestBoxForRemaining(instances, availableBoxes = BOXES, packingMethod = DEFAULT_PACKING_METHOD) {
  if (!instances.length) return null;
  let best = null;

  for (const box of availableBoxes) {
    const orientation = { L: box.l, W: box.w, H: box.h, box };
    const packed = packBox(instances, orientation, packingMethod);
    if (packed.placedCount === 0) continue;

    const candidate = {
      box,
      boxName: box.name,
      orientation,
      layers: packed.layers,
      topViewPlaced: packed.topViewPlaced,
      placedCount: packed.placedCount,
      fillsAllRemaining: packed.placedCount === instances.length,
      remaining: packed.remaining,
      packingMethod: packed.packingMethod,
    };

    if (!best) {
      best = candidate;
      continue;
    }

    const better =
      (candidate.fillsAllRemaining && !best.fillsAllRemaining) ||
      candidate.placedCount > best.placedCount ||
      (candidate.placedCount === best.placedCount && candidate.box.volume < best.box.volume);

    if (better) best = candidate;
  }

  return best;
}

function buildMultiBoxPlan(rollGroups, availableBoxes = BOXES, packingMethod = DEFAULT_PACKING_METHOD) {
  let remaining = expandRollInstances(rollGroups);
  const boxes = [];
  let guard = 0;

  while (remaining.length > 0 && guard < 200) {
    guard += 1;
    const best = chooseBestBoxForRemaining(remaining, availableBoxes, packingMethod);

    if (!best || best.placedCount === 0) {
      return { boxes, unpacked: remaining };
    }

    boxes.push({
      boxName: best.boxName,
      box: best.box,
      orientation: best.orientation,
      layers: best.layers,
      topViewPlaced: best.topViewPlaced,
      placedCount: best.placedCount,
      packingMethod: best.packingMethod,
    });

    remaining = best.remaining;
  }

  return { boxes, unpacked: remaining };
}

function summarizeBoxMix(boxes) {
  const counts = new Map();
  boxes.forEach((boxSetup) => {
    counts.set(boxSetup.boxName, (counts.get(boxSetup.boxName) || 0) + 1);
  });

  return Array.from(counts.entries()).map(([boxName, count]) => ({ boxName, count }));
}

function summarizeLayerRollLabels(rolls) {
  const counts = new Map();
  rolls.forEach((roll) => {
    counts.set(roll.label, (counts.get(roll.label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => (count === 1 ? label : `${label} (${count})`))
    .join(", ");
}

function runTests() {
  return TEST_CASES.map((test) => {
    const parsed = normalizeRollInput(test.item, test.repeatEdge);

    if (test.expectError) {
      return {
        name: test.name,
        passed: Boolean(parsed && parsed.error),
        details: parsed?.error || "Expected an error but parsed successfully.",
      };
    }

    if (test.expectPackingPlan) {
      if (!parsed || parsed.error) {
        return { name: test.name, passed: false, details: parsed?.error || "Could not parse test row." };
      }
      const calculated = calculateRoll(parsed, DEFAULT_CORE_DIAMETER, DEFAULT_CALIPER_MIL, DEFAULT_CLEARANCE, DEFAULT_EXTRA_PERCENT);
      const plan = buildMultiBoxPlan([calculated], BOXES, DEFAULT_PACKING_METHOD);
      return {
        name: test.name,
        passed: plan.boxes.length > 0 && plan.unpacked.length === 0,
        details: plan.boxes.length > 0 ? `${plan.boxes.length} box(es), ${plan.unpacked.length} unpacked` : "No plan produced",
      };
    }

    const expectedEntries = Object.entries(test.expect || {});
    const passed =
      parsed &&
      !parsed.error &&
      expectedEntries.every(([key, expected]) => {
        const actual = parsed[key];
        if (typeof actual === "number" && typeof expected === "number") {
          return Math.abs(actual - expected) < 0.000001;
        }
        return actual === expected;
      });

    return {
      name: test.name,
      passed: Boolean(passed),
      details: passed ? "OK" : `Expected ${JSON.stringify(test.expect)}, got ${JSON.stringify(parsed)}`,
    };
  });
}

function MultiBoxPackingDiagram({ packingPlan }) {
  const [boxIndex, setBoxIndex] = useState(0);

  if (!packingPlan || !packingPlan.boxes || packingPlan.boxes.length === 0) {
    return (
      <Panel className="p-5">
        <h2 className="mb-2 text-lg font-semibold">2D packing view</h2>
        <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">Add rolls to see the scaled top-view packing plan.</div>
      </Panel>
    );
  }

  const safeIndex = Math.min(boxIndex, packingPlan.boxes.length - 1);
  const current = packingPlan.boxes[safeIndex];
  const boxDims = current.orientation;
  const placed = current.topViewPlaced || [];
  const viewW = 820;
  const viewH = Math.max(260, Math.round((boxDims.W / boxDims.L) * viewW));
  const scale = Math.min(viewW / boxDims.L, viewH / boxDims.W);
  const svgW = boxDims.L * scale;
  const svgH = boxDims.W * scale;
  const layerViewW = 170;
  const layerViewH = 220;
  const layerScaleY = layerViewH / boxDims.H;
  const packingLabel = PACKING_METHOD_LABELS[current.packingMethod || DEFAULT_PACKING_METHOD] || PACKING_METHOD_LABELS[DEFAULT_PACKING_METHOD];
  const usesPadSeparator =
    current?.box?.l === 24 && current?.box?.w === 16 && (current?.box?.h === 8 || current?.box?.h === 12);

  return (
    <Panel className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">2D packing view</h2>
          <p className="text-xs text-slate-600">Use the arrows to view each box setup. Dashed outlines show clearance; solid circles show the actual rolls.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBoxIndex((i) => Math.max(0, i - 1))}
            disabled={safeIndex === 0}
            className="rounded-xl border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Prev
          </button>
          <Badge good>Box {safeIndex + 1} of {packingPlan.boxes.length}</Badge>
          <button
            type="button"
            onClick={() => setBoxIndex((i) => Math.min(packingPlan.boxes.length - 1, i + 1))}
            disabled={safeIndex === packingPlan.boxes.length - 1}
            className="rounded-xl border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <div className="mb-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl bg-slate-100 px-3 py-2">Box: <span className="font-semibold">{current.boxName}</span></div>
        <div className="rounded-xl bg-slate-100 px-3 py-2">Top view: {boxDims.L} x {boxDims.W}</div>
        <div className="rounded-xl bg-slate-100 px-3 py-2">Height: {boxDims.H}</div>
        <div className="rounded-xl bg-slate-100 px-3 py-2">Rolls in box: {current.placedCount}</div>
        <div className="rounded-xl bg-slate-100 px-3 py-2">Packing: {packingLabel}</div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_230px]">
        <div className="flex min-h-0 flex-col">
          <div className="mb-1 text-sm font-medium text-slate-700">Layer 1 overhead view</div>
          <div className="flex min-h-[260px] flex-1 items-stretch gap-2">
            <div className="flex items-center justify-center text-xs font-semibold text-slate-500 [writing-mode:vertical-rl] rotate-180">
              {formatNumber(boxDims.W)}&quot;
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-[260px] flex-1 overflow-hidden rounded-2xl border bg-slate-50 p-2">
                <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" className="bg-white">
                  <rect x="0" y="0" width={svgW} height={svgH} fill="white" stroke="currentColor" strokeWidth="2" className="text-slate-800" />
                  {placed.map((roll) => {
                    const cx = roll.x * scale;
                    const cy = roll.y * scale;
                    const clearanceR = roll.r * scale;
                    const actualR = (roll.actualDiameter / 2) * scale;
                    const labelFontSize = Math.max(10, Math.min(18, actualR * 0.6));
                    return (
                      <g key={roll.id}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={clearanceR}
                          fill="rgb(248 250 252)"
                          stroke="rgb(203 213 225)"
                          strokeWidth="1"
                          strokeDasharray="4 3"
                        />
                        <circle cx={cx} cy={cy} r={actualR} fill="rgb(226 232 240)" stroke="rgb(51 65 85)" strokeWidth="1.35" />
                        <circle cx={cx} cy={cy} r={Math.max(2, (DEFAULT_CORE_DIAMETER / 2) * scale)} fill="white" stroke="rgb(100 116 139)" strokeWidth="2.2" />
                        <text
                          x={cx}
                          y={cy + labelFontSize * 0.32}
                          textAnchor="middle"
                          fontSize={labelFontSize}
                          className="fill-slate-700 font-semibold"
                        >
                          {roll.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="pt-1 text-center text-xs font-semibold text-slate-500">{formatNumber(boxDims.L)}&quot;</div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Layer view</div>
          <div className="flex items-center gap-2 rounded-2xl border bg-slate-50 p-3">
            <div className="flex items-center justify-center text-xs font-semibold text-slate-500 [writing-mode:vertical-rl] rotate-180">
              {formatNumber(boxDims.H)}&quot;
            </div>
            <div className="min-w-0 flex-1">
              <svg width={layerViewW} height={layerViewH} viewBox={`0 0 ${layerViewW} ${layerViewH}`} className="mx-auto bg-white">
                <rect x="0" y="0" width={layerViewW} height={layerViewH} fill="white" stroke="currentColor" strokeWidth="2" className="text-slate-800" />
                {current.layers.map((layer, index) => {
                  const layerHeight = Math.max(layer.layerHeight * layerScaleY, 6);
                  const y = layerViewH - current.layers.slice(0, index + 1).reduce((sum, l) => sum + l.layerHeight * layerScaleY, 0);
                  const rollCount = layer.placed.length;
                  const laneWidth = layerViewW - 16;
                  const maxCols = Math.max(1, Math.floor(laneWidth / 14));
                  const rows = Math.max(1, Math.ceil(rollCount / maxCols));
                  const colGap = laneWidth / Math.max(1, Math.min(rollCount, maxCols));
                  const rowGap = layerHeight / rows;
                  const circleRadius = Math.max(2.5, Math.min(6, Math.min(colGap, rowGap) * 0.35));
                  return (
                    <g key={index}>
                      <rect
                        x="8"
                        y={Math.max(0, y)}
                        width={layerViewW - 16}
                        height={layerHeight}
                        fill="rgb(226 232 240)"
                        stroke="rgb(51 65 85)"
                        strokeWidth="1"
                      />
                      {Array.from({ length: rollCount }).map((_, rollIndex) => {
                        const col = rollIndex % maxCols;
                        const row = Math.floor(rollIndex / maxCols);
                        const cx = 8 + (col + 0.5) * colGap;
                        const cy = Math.max(0, y) + (row + 0.5) * rowGap;
                        return (
                          <circle
                            key={`${index}-${rollIndex}`}
                            cx={cx}
                            cy={cy}
                            r={circleRadius}
                            fill="white"
                            stroke="rgb(51 65 85)"
                            strokeWidth="1"
                          />
                        );
                      })}
                      <text x={layerViewW / 2} y={Math.max(12, y + layerHeight / 2 + 4)} textAnchor="middle" className="fill-slate-700 text-[10px] font-semibold">
                        Layer {index + 1}: {layer.placed.length} roll{layer.placed.length === 1 ? "" : "s"}
                      </text>
                      {usesPadSeparator && index < current.layers.length - 1 && (
                        <line x1="8" y1={Math.max(0, y)} x2={layerViewW - 8} y2={Math.max(0, y)} stroke="black" strokeWidth="2" />
                      )}
                    </g>
                  );
                })}
              </svg>
              <div className="mt-2 text-center text-xs text-slate-600">Side view of stacked layers.</div>
            </div>
          </div>
        </div>
      </div>

      {packingPlan.unpacked.length > 0 && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {packingPlan.unpacked.length} roll(s) could not be packed into the available box list.
        </div>
      )}
    </Panel>
  );
}

function RollCalculationsTable({ rolls, onRemove }) {
  if (rolls.length === 0) {
    return <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">No roll rows yet. Add one above to begin.</div>;
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden rounded-2xl border bg-white">
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-3">Roll IDs</th>
            <th className="p-3">Width</th>
            <th className="p-3">Height</th>
            <th className="p-3">Rolls</th>
            <th className="p-3">Labels / roll</th>
            <th className="p-3">Orientation</th>
            <th className="p-3">Diameter</th>
            <th className="p-3">Eff. size</th>
            <th className="p-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rolls.map((roll, groupIndex) => (
            <tr key={roll.id} className="border-t align-top">
              <td className="break-words p-3 font-semibold text-slate-700">{getRollLabelRange(groupIndex, roll.rolls)}</td>
              <td className="p-3">{formatNumber(roll.width)}&quot;</td>
              <td className="p-3">{formatNumber(roll.height)}&quot;</td>
              <td className="p-3">{roll.rolls}</td>
              <td className="break-words p-3">{roll.labelsPerRoll.toLocaleString()}</td>
              <td className="break-words p-3">{roll.repeatEdgeLabel}</td>
              <td className="p-3 font-semibold">{formatNumber(roll.outerDiameter)}&quot;</td>
              <td className="break-words p-3">{formatNumber(roll.effectiveDiameter)} x {formatNumber(roll.effectiveHeight)}</td>
              <td className="p-3">
                <button
                  type="button"
                  onClick={() => onRemove(roll.id)}
                  className="rounded-xl border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoxSummary({ packingPlan }) {
  if (!packingPlan || packingPlan.boxes.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
        Box summary will appear after you add at least one roll group and select at least one box size.
      </div>
    );
  }

  return (
    <div className="max-h-[380px] overflow-y-auto pr-1">
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {packingPlan.boxes.map((boxSetup, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">Box {i + 1}: {boxSetup.boxName}</div>
              <Badge good>{boxSetup.placedCount} roll(s)</Badge>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Box size: {boxSetup.orientation.L} x {boxSetup.orientation.W} x {boxSetup.orientation.H}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Packing: {PACKING_METHOD_LABELS[boxSetup.packingMethod || DEFAULT_PACKING_METHOD]}
            </div>
            <div className="mt-1 text-xs text-slate-500">Layers used: {boxSetup.layers.length}</div>
            <div className="mt-2 space-y-1">
              {boxSetup.layers.map((layer, layerIndex) => (
                <div key={layerIndex} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Layer {layerIndex + 1}:</span> {summarizeLayerRollLabels(layer.placed)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LabelRollBoxCalculator() {
  const [rollItems, setRollItems] = useState(SAMPLE_ROLLS);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nextId, setNextId] = useState(4);
  const [coreDiameter, setCoreDiameter] = useState(DEFAULT_CORE_DIAMETER);
  const [caliperMil, setCaliperMil] = useState(DEFAULT_CALIPER_MIL);
  const [clearance, setClearance] = useState(DEFAULT_CLEARANCE);
  const [extraPercent, setExtraPercent] = useState(DEFAULT_EXTRA_PERCENT);
  const [packingMethod, setPackingMethod] = useState(DEFAULT_PACKING_METHOD);
  const [repeatEdge, setRepeatEdge] = useState(DEFAULT_REPEAT_EDGE);
  const [selectedBoxIds, setSelectedBoxIds] = useState(DEFAULT_SELECTED_BOX_IDS);
  const [activeTab, setActiveTab] = useState("rolls");
  const [formError, setFormError] = useState("");

  const result = useMemo(() => {
    const availableBoxes = BOXES.filter((box) => selectedBoxIds.includes(box.id));
    const parsed = rollItems.map((item) => normalizeRollInput(item, repeatEdge)).filter(Boolean);
    const errors = parsed.filter((p) => p.error);
    const valid = parsed
      .filter((p) => !p.error)
      .map((p) => calculateRoll(p, Number(coreDiameter), Number(caliperMil), Number(clearance), Number(extraPercent)));
    const packingPlan = valid.length ? buildMultiBoxPlan(valid, availableBoxes, packingMethod) : { boxes: [], unpacked: [] };
    const boxMix = summarizeBoxMix(packingPlan.boxes);
    const totalRolls = valid.reduce((sum, r) => sum + r.rolls, 0);
    const totalCylinderVolume = valid.reduce((sum, r) => sum + r.totalCylinderVolume, 0);
    const totalBoundingVolume = valid.reduce((sum, r) => sum + r.totalBoundingVolume, 0);

    return {
      parsed,
      errors,
      valid,
      packingPlan,
      boxMix,
      availableBoxes,
      totalRolls,
      totalCylinderVolume,
      totalBoundingVolume,
    };
  }, [rollItems, coreDiameter, caliperMil, clearance, extraPercent, packingMethod, repeatEdge, selectedBoxIds]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError("");
  }

  function addRollItem() {
    const item = { id: nextId, ...form };
    const normalized = normalizeRollInput(item, repeatEdge);
    if (normalized.error) {
      setFormError(normalized.error);
      return;
    }

    setRollItems((current) => [...current, item]);
    setNextId((id) => id + 1);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function removeRollItem(id) {
    setRollItems((current) => current.filter((item) => item.id !== id));
  }

  function clearRollItems() {
    setRollItems([]);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function toggleBoxSelection(boxId) {
    setSelectedBoxIds((current) => {
      if (current.includes(boxId)) {
        return current.filter((id) => id !== boxId);
      }
      return [...current, boxId];
    });
  }

  function selectAllBoxes() {
    setSelectedBoxIds(DEFAULT_SELECTED_BOX_IDS);
  }

  function clearBoxSelection() {
    setSelectedBoxIds([]);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-2 text-slate-900 md:p-3">
      <div className="mx-auto max-w-none space-y-3">
        <header className="rounded-2xl bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-500">Label Roll Box Calculator v1</div>
              <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Find the practical box plan for label rolls</h1>
            </div>
            <p className="max-w-3xl text-xs text-slate-600 md:text-right">
              Add roll groups, calculate diameters, then build a multi-box packing plan.
            </p>
          </div>
        </header>

        <div className="grid gap-3 xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.25fr)]">
          <div className="grid gap-3 xl:grid-rows-[350px_minmax(0,1fr)] xl:[height:min(68vh,720px)]">
            <Panel className="p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Add roll group</h2>
                <button
                  type="button"
                  onClick={clearRollItems}
                  className="rounded-2xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Clear rolls
                </button>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <NumberField label="Width, in" value={form.width} onChange={(v) => updateForm("width", v)} />
                <NumberField label="Height, in" value={form.height} onChange={(v) => updateForm("height", v)} />
                <NumberField label="# of rolls" value={form.rolls} onChange={(v) => updateForm("rolls", v)} step="1" />
                <NumberField label="Labels / roll" value={form.labelsPerRoll} onChange={(v) => updateForm("labelsPerRoll", v)} step="1" />
                <SelectField label="Orientation" value={repeatEdge} onChange={setRepeatEdge}>
                  <option value="flat">Flat</option>
                  <option value="sideways">Sideways</option>
                </SelectField>
              </div>

              {formError && <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{formError}</div>}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addRollItem}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Add roll group
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setFormError("");
                  }}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
                >
                  Clear entry fields
                </button>
              </div>
            </Panel>

            <Panel className="flex min-h-0 flex-col p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("rolls")}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === "rolls" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
                  >
                    Roll calculations
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("settings")}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === "settings" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}
                  >
                    Settings
                  </button>
                </div>
              </div>

              {activeTab === "rolls" ? (
                <div className="flex min-h-0 flex-1 flex-col space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">Roll calculations</h2>
                    {result.valid.length > 0 && <Badge good>{result.valid.length} group{result.valid.length === 1 ? "" : "s"}</Badge>}
                  </div>
                  <div className="min-h-0 flex-1">
                    <RollCalculationsTable rolls={result.valid} onRemove={removeRollItem} />
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-lg font-semibold">Settings</h2>
                      <p className="mt-1 text-sm text-slate-600">These values apply to every roll group in the current order.</p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                      <NumberField label="Core diameter, in" value={coreDiameter} onChange={setCoreDiameter} step="0.001" />
                      <NumberField label="Total caliper, mil" value={caliperMil} onChange={setCaliperMil} step="0.1" />
                      <NumberField label="Clearance, in" value={clearance} onChange={setClearance} step="0.05" />
                      <NumberField label="Extra amount, %" value={extraPercent} onChange={setExtraPercent} step="0.1" />
                      <SelectField label="Packing method" value={packingMethod} onChange={setPackingMethod}>
                        <option value="standard">Standard grid</option>
                        <option value="offset">Hex / offset rows</option>
                      </SelectField>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">Allowed box sizes</h3>
                          <p className="mt-1 text-sm text-slate-600">Select one or more box sizes the order can use.</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={selectAllBoxes} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Select all</button>
                          <button type="button" onClick={clearBoxSelection} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Clear</button>
                        </div>
                      </div>
                      <div className="max-h-[280px] overflow-y-auto rounded-2xl border bg-white p-3">
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {BOXES.map((box) => (
                            <label key={box.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                              <span>{box.name}</span>
                              <input
                                type="checkbox"
                                checked={selectedBoxIds.includes(box.id)}
                                onChange={() => toggleBoxSelection(box.id)}
                                className="h-4 w-4 accent-slate-900"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="min-w-0 xl:[height:min(68vh,720px)]">
            <MultiBoxPackingDiagram packingPlan={result.packingPlan} />
          </div>
        </div>

        <Panel className="space-y-3 p-3">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span>Shipment plan</span>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Fix these roll rows</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.errors.map((e, i) => (
                  <li key={`${i}-${e.error}`}>{e.error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-3">
              {result.valid.length === 0 ? (
                <div className="rounded-2xl bg-slate-100 p-4 text-slate-600">Add at least one valid roll group.</div>
              ) : result.availableBoxes.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                  <div className="font-semibold">Select at least one box size.</div>
                  <div className="mt-2 text-sm">Open Settings and choose the box sizes this order can use.</div>
                </div>
              ) : result.packingPlan.boxes.length > 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-emerald-800">Recommended shipment plan</div>
                  <div className="mt-2 text-4xl font-bold tracking-tight text-emerald-950">
                    {result.packingPlan.boxes.length} box{result.packingPlan.boxes.length === 1 ? "" : "es"}
                  </div>
                  <div className="mt-2 text-sm text-emerald-900">
                    Box mix: {result.boxMix.map((item) => `${item.count} x ${item.boxName}`).join(", ")}
                  </div>
                  {result.packingPlan.unpacked.length > 0 && (
                    <div className="mt-2 text-sm text-amber-800">
                      {result.packingPlan.unpacked.length} roll(s) could not be packed with the current box list.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
                  <div className="font-semibold">No workable packing plan found.</div>
                  <div className="mt-2 text-sm">Try adding a larger box size or splitting the order manually.</div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-slate-50 p-3 shadow-sm">
                  <div className="text-xs text-slate-500">Rolls</div>
                  <div className="text-xl font-semibold">{result.totalRolls}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 shadow-sm">
                  <div className="text-xs text-slate-500">Roll volume</div>
                  <div className="text-xl font-semibold">{formatNumber(result.totalCylinderVolume, 0)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 shadow-sm">
                  <div className="text-xs text-slate-500">Packed est.</div>
                  <div className="text-xl font-semibold">{formatNumber(result.totalBoundingVolume, 0)}</div>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Box summary</h2>
                {result.packingPlan.boxes.length > 0 && <Badge good>{result.packingPlan.boxes.length} box{result.packingPlan.boxes.length === 1 ? "" : "es"}</Badge>}
              </div>
              <BoxSummary packingPlan={result.packingPlan} />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.createRoot(rootElement).render(<LabelRollBoxCalculator />);
