import { createGameCustomRaceLab } from "../src/adapters/browser/game-custom-race-lab.ts";
import { createGameTerraformLab } from "../src/adapters/browser/game-terraform-lab.ts";
import {
  CUSTOM_RACE_LAB_CONTROL_ID,
  CUSTOM_RACE_LAB_STRAND_ID,
} from "../src/ports/game-custom-race-lab.ts";
import {
  CELESTIAL_LAB_CONTROL_ID,
  CELESTIAL_LAB_PANEL_SELECTOR,
} from "../src/ports/game-celestial-lab.ts";

export const DEADSPACE_GENOME_TEXT = Object.freeze({
  name: "Saved",
  desc: "A saved race",
  entity: "bipeds",
  home: "Home",
  red: "Red",
  hell: "Hell",
  gas: "Gas",
  gas_moon: "Moon",
  dwarf: "Dwarf",
  titan: "Titan",
  enceladus: "Moon 2",
  triton: "Moon 3",
  makemake: "Dwarf 2",
  eris: "Dwarf 3",
});

const FIXTURE_TEXT_LIMITS = Object.freeze({
  name: 20,
  desc: 255,
  entity: 40,
  home: 20,
  red: 20,
  hell: 20,
  gas: 20,
  gas_moon: 20,
  dwarf: 20,
  titan: 20,
  enceladus: 20,
  triton: 20,
  makemake: 20,
  eris: 20,
});

export class DeadSpaceFile {
  constructor(parts, name, options) {
    this.contents = parts.join("");
    this.name = name;
    this.type = options.type;
  }
}

export class DeadSpaceDataTransfer {
  constructor() {
    this.filesValue = [];
    this.items = { add: (file) => this.filesValue.push(file) };
  }

  get files() {
    return this.filesValue;
  }
}

function makeSavedRace({ hybrid = false } = {}) {
  return {
    ...DEADSPACE_GENOME_TEXT,
    genus: hybrid ? "hybrid" : "humanoid",
    ...(hybrid ? { hybrid: ["avian", "small"] } : {}),
    traits: ["smart", "tough"],
    ranks: { smart: 1.05, tough: 1 },
    fanaticism: false,
    v: 2,
    slots: { smart: 2, tough: 7 },
    recessive: 2,
    span: 24,
  };
}

function makeGenome(savedRace, { hybrid = false } = {}) {
  return {
    ...DEADSPACE_GENOME_TEXT,
    ...Object.fromEntries(
      Object.keys(DEADSPACE_GENOME_TEXT).map((field) => [
        field,
        savedRace[field] ?? DEADSPACE_GENOME_TEXT[field],
      ]),
    ),
    genus: hybrid ? "hybrid" : "humanoid",
    ...(hybrid ? { hybrid: [...savedRace.hybrid] } : {}),
    traitlist: [...savedRace.traits],
    ranks: { ...savedRace.ranks },
    slots: { ...savedRace.slots },
    recessive: savedRace.recessive,
    span: savedRace.span,
    fanaticism: false,
    genes: 10,
  };
}

export function createDeadSpaceCustomLabFixture({
  root: initialRoot,
  hybrid = false,
  saved = true,
  open = true,
  behavior = {},
  onSetRace = () => undefined,
} = {}) {
  let root = initialRoot;
  const slot = hybrid ? "race1" : "race0";
  const savedRace = saved ? makeSavedRace({ hybrid }) : undefined;
  if (savedRace !== undefined) {
    root.custom ??= {};
    root.custom[slot] = savedRace;
  }
  const fallback = {
    ...makeSavedRace(),
    name: "Zombie",
    desc: "Undead",
    entity: "undead",
    home: "Grave",
    genus: hybrid ? "hybrid" : "humanoid",
    ...(hybrid ? { hybrid: ["avian", "small"] } : {}),
    traits: [],
    ranks: {},
    slots: {},
    recessive: 0,
    fanaticism: false,
  };
  const genome = makeGenome(savedRace ?? fallback, { hybrid });
  let tRanks = genome.ranks;
  let mainGeneration = 1;
  let strandGeneration = 1;
  let strandSurface = {};
  let queuedReprice = false;
  let isOpen = open;
  let panelPresent = true;
  const nativeCalls = [];
  const error = { msg: "" };
  const mainData = { g: genome, err: error };
  const fileInput = { files: null };

  function mainHandle() {
    return {
      elementId: CUSTOM_RACE_LAB_CONTROL_ID,
      generation: mainGeneration,
      methods: ["reset", "customImport", "geneEdit", "setRace"],
      data: mainData,
    };
  }

  function strandHandle() {
    return {
      elementId: CUSTOM_RACE_LAB_STRAND_ID,
      generation: strandGeneration,
      methods: [],
      data: { g: genome, t: tRanks },
    };
  }

  const controls = {
    resolve(id) {
      if (!isOpen || !panelPresent) return undefined;
      if (id === CUSTOM_RACE_LAB_CONTROL_ID) return mainHandle();
      if (id === CUSTOM_RACE_LAB_STRAND_ID) return strandHandle();
      return undefined;
    },
    invoke(handle, method) {
      const current = this.resolve(handle.elementId);
      if (current === undefined)
        return { ok: false, reason: "unknown-control" };
      if (current.generation !== handle.generation) {
        return { ok: false, reason: "stale-control" };
      }
      nativeCalls.push(method);
      if (handle.elementId !== CUSTOM_RACE_LAB_CONTROL_ID) {
        return { ok: false, reason: "unknown-method" };
      }
      // Native reset clears the draft synchronously, then reprices it on the next tick.
      if (method === "reset") {
        for (const field of ["name", "desc", "entity", "home"]) {
          genome[field] = "";
        }
        for (const field of [
          "red",
          "hell",
          "gas",
          "gas_moon",
          "dwarf",
          "titan",
          "enceladus",
          "triton",
          "makemake",
          "eris",
        ]) {
          genome[field] = fallback[field] ?? "";
        }
        genome.traitlist = [];
        genome.ranks = {};
        genome.slots = {};
        genome.recessive = 0;
        genome.span = 24;
        genome.fanaticism = false;
        queuedReprice = true;
        return { ok: true, value: undefined };
      }
      if (method === "customImport") {
        const file = fileInput.files?.[0];
        if (file === undefined || behavior.ignoreImport === true) {
          return { ok: true, value: undefined };
        }
        let imported;
        try {
          imported = JSON.parse(file.contents);
        } catch {
          error.msg = "invalid import";
          return { ok: true, value: undefined };
        }
        // Upstream customImport() assigns only truthy values; zero must leave the reset value in place.
        for (const [field, value] of Object.entries(imported)) {
          if (Object.hasOwn(genome, field) && value) genome[field] = value;
        }
        for (const [field, limit] of Object.entries(FIXTURE_TEXT_LIMITS)) {
          if (typeof genome[field] === "string") {
            genome[field] = genome[field].slice(0, limit);
          }
        }
        if (Array.isArray(imported.traitlist)) {
          genome.traitlist = imported.traitlist.filter(
            (trait, index, all) =>
              ["smart", "tough", "resilient"].includes(trait) &&
              all.indexOf(trait) === index,
          );
        }
        if (imported.genus === "hybrid" && hybrid) {
          genome.genus = "hybrid";
        } else if (hybrid && typeof imported.genus === "string") {
          genome.hybrid = [
            imported.genus,
            imported.genus === "humanoid" ? "small" : "humanoid",
          ];
          genome.genus = "hybrid";
        } else if (typeof imported.genus === "string") {
          genome.genus = imported.genus;
        }
        genome.ranks = {};
        tRanks = { ...(imported.ranks ?? {}) };
        if (imported.rankVersion !== 2) {
          for (const [trait, rank] of Object.entries(tRanks)) {
            tRanks[trait] = { 2: 1.33, 3: 1.67, 4: 2 }[rank] || rank;
          }
        }
        if (!Object.hasOwn(imported, "slotSpan")) {
          genome.slots = {};
          genome.span = 12;
        }
        if (typeof imported.slotSpan === "number" && imported.slotSpan >= 12) {
          genome.span = imported.slotSpan;
        }
        genome.fanaticism = Object.hasOwn(imported, "fanaticism")
          ? imported.fanaticism
          : false;
        error.msg = "";
        return { ok: true, value: undefined };
      }
      if (method === "geneEdit") {
        if (behavior.rejectGeneEdit === true) {
          return { ok: false, reason: "threw", detail: "geneEdit failed" };
        }
        if (behavior.noOpReprice !== true) queuedReprice = true;
        return { ok: true, value: undefined };
      }
      if (method === "setRace") {
        if (behavior.rejectSubmission === true) {
          return { ok: true, value: false };
        }
        onSetRace({ root, genome, slot });
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds() {
      return [CUSTOM_RACE_LAB_CONTROL_ID, CUSTOM_RACE_LAB_STRAND_ID];
    },
  };

  const document = {
    defaultView: { File: DeadSpaceFile, DataTransfer: DeadSpaceDataTransfer },
    querySelector(selector) {
      if (!isOpen || !panelPresent) return null;
      if (selector === CELESTIAL_LAB_PANEL_SELECTOR) return {};
      if (selector === "#celestialLab .create button") return {};
      if (selector === "#traitSlots .labStrand") return strandSurface;
      return null;
    },
    getElementById(id) {
      return isOpen && panelPresent && id === "customFile" ? fileInput : null;
    },
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const port = createGameCustomRaceLab({
    rootState,
    controls,
    getDocument: () => document,
  });

  return {
    port,
    controls,
    rootState,
    root,
    genome,
    nativeCalls,
    fileInput,
    savedSlot: slot,
    setRoot(next) {
      root = next;
    },
    setOpen(value) {
      isOpen = value;
    },
    setPanelPresent(value) {
      panelPresent = value;
    },
    redrawMain() {
      mainGeneration += 1;
    },
    reloadMountedLabFromSavedRace() {
      const stored = root.custom?.[slot];
      const source =
        stored === undefined
          ? fallback
          : {
              ...stored,
              traits: Array.isArray(stored.traits)
                ? stored.traits
                : (stored.traitlist ?? []),
            };
      const restored = makeGenome(source, {
        hybrid: Array.isArray(source.hybrid),
      });
      for (const key of Object.keys(genome)) delete genome[key];
      Object.assign(genome, restored);
      tRanks = genome.ranks;
      mainGeneration += 1;
      strandGeneration += 1;
      strandSurface = {};
      queuedReprice = false;
    },
    redrawStrand() {
      strandGeneration += 1;
      strandSurface = {};
    },
    finishNativeReprice() {
      if (!queuedReprice) return false;
      queuedReprice = false;
      const next = {};
      for (const trait of genome.traitlist) {
        next[trait] = tRanks[trait] || 1;
      }
      tRanks = next;
      genome.ranks = tRanks;
      for (const [index, trait] of genome.traitlist.entries()) {
        if (!Object.hasOwn(genome.slots, trait)) genome.slots[trait] = index;
      }
      this.redrawStrand();
      return true;
    },
  };
}

export function createDeadSpaceTerraformLabFixture({
  root,
  open = true,
  score = 0,
  scoreAfterEdit = score,
  onSetPlanet = () => undefined,
  rejectSubmission = false,
} = {}) {
  let generation = 1;
  let isOpen = open;
  let panelPresent = true;
  const nativeCalls = [];
  const planet = { pts: score, biome: "forest", traitlist: [], geology: {} };
  const data = { p: planet, w: {} };
  const controls = {
    resolve(id) {
      return isOpen && panelPresent && id === CELESTIAL_LAB_CONTROL_ID
        ? {
            elementId: CELESTIAL_LAB_CONTROL_ID,
            generation,
            methods: ["pEdit", "setPlanet"],
            data,
          }
        : undefined;
    },
    invoke(handle, method) {
      const current = this.resolve(handle.elementId);
      if (current === undefined)
        return { ok: false, reason: "unknown-control" };
      if (current.generation !== handle.generation) {
        return { ok: false, reason: "stale-control" };
      }
      nativeCalls.push(method);
      if (method === "pEdit") {
        planet.pts = scoreAfterEdit;
        return { ok: true, value: undefined };
      }
      if (method === "setPlanet") {
        if (rejectSubmission) return { ok: true, value: false };
        if (planet.pts < 0) return { ok: true, value: undefined };
        onSetPlanet({ root, planet });
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => [CELESTIAL_LAB_CONTROL_ID],
  };
  const document = {
    querySelector(selector) {
      if (!isOpen || !panelPresent) return null;
      if (
        selector === CELESTIAL_LAB_PANEL_SELECTOR ||
        selector === "#celestialLab .create button"
      )
        return {};
      return null;
    },
  };
  const port = createGameTerraformLab({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
    },
    controls,
    getDocument: () => document,
  });
  return {
    port,
    controls,
    planet,
    nativeCalls,
    setOpen(value) {
      isOpen = value;
    },
    setPanelPresent(value) {
      panelPresent = value;
    },
    redraw() {
      generation += 1;
    },
    setScoreAfterEdit(value) {
      scoreAfterEdit = value;
    },
  };
}
