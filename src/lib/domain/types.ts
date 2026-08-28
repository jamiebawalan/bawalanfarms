/**
 * The shape of the ledger as the reports see it.
 *
 * Reports are pure functions over these rows. At this farm's volume — roughly
 * two transactions a day, about 700 expense rows a year — reading the whole
 * ledger and computing in one place is both fast enough and far easier to
 * follow a year from now than a stack of SQL views. The invariants still live
 * in the database; only the arithmetic lives here.
 */

import type { Centavos } from "./money";

export type ISODate = string; // yyyy-mm-dd

export type ExpenseCategory =
  | "Labor"
  | "Farm Inputs"
  | "Farm Transport"
  | "Selling Transport"
  | "Machines"
  | "Miscellaneous";

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  "Labor",
  "Farm Inputs",
  "Farm Transport",
  "Selling Transport",
  "Machines",
  "Miscellaneous",
] as const;

export type Attribution = "direct" | "split" | "farm_wide" | "capital";
export type FarmWideReason = "vehicle" | "selling" | "general" | "animal_care";
export type LabourMode = "daily" | "pakyaw" | "kasama";

export const FARM_WIDE_REASONS: Record<FarmWideReason, string> = {
  vehicle: "Vehicle — repairs, parts, diesel for the farm truck",
  selling: "Selling — tollgates, hauling, market trips",
  general: "General — anything covering the whole farm",
  animal_care: "Animal care",
};

export const LABOUR_MODES: Record<LabourMode, string> = {
  daily: "Daily — per person, per day",
  pakyaw: "Pakyaw — contract price for the whole job",
  kasama: "Kasama — tenant sharecropper",
};

export type CycleStatus =
  | "planned"
  | "land_prep"
  | "planted"
  | "growing"
  | "harvesting"
  | "closed";

export const CYCLE_STATUSES: readonly CycleStatus[] = [
  "planned",
  "land_prep",
  "planted",
  "growing",
  "harvesting",
  "closed",
] as const;

export type Plot = {
  id: string;
  code: string;
  label: string;
  sharesOverhead: boolean;
  active: boolean;
  notes?: string | null;
};

export type PlotArea = {
  plotId: string;
  effectiveFrom: ISODate;
  areaSqm: number;
};

export type Cycle = {
  id: string;
  plotId: string;
  crop: string;
  status: CycleStatus;
  dateStarted: ISODate | null;
  datePlanted: ISODate | null;
  dateClosed: ISODate | null;
  kasamaSharePct: number | null;
  targetForcingDate: ISODate | null;
  targetHarvestDate: ISODate | null;
  plantingMaterialSource?: string | null;
  notes?: string | null;
};

export type Expense = {
  id: string;
  date: ISODate;
  category: ExpenseCategory;
  activity: string;
  activityOtherNote?: string | null;
  attribution: Attribution;
  farmWideReason: FarmWideReason | null;
  capitalAssetId: string | null;
  labourMode: LabourMode | null;
  unitPriceCentavos: Centavos | null;
  quantity: number | null;
  amountCentavos: Centavos;
  paidTo?: string | null;
  note?: string | null;
};

export type Allocation = {
  expenseId: string;
  plotId: string;
  cycleId: string | null;
  amountCentavos: Centavos;
};

export type InputPurchase = {
  id: string;
  date: ISODate;
  inputType: string;
  quantity: number;
  unit: string;
  unitCostCentavos: Centavos;
  totalCentavos: Centavos;
  supplier?: string | null;
};

export type InputDraw = {
  id: string;
  purchaseId: string;
  cycleId: string;
  date: ISODate;
  quantity: number;
  doseNote?: string | null;
};

export type Harvest = { id: string; cycleId: string; date: ISODate; note?: string | null };
export type HarvestLine = { harvestId: string; product: string; quantity: number };

export type Sale = {
  id: string;
  cycleId: string;
  buyerId: string;
  date: ISODate;
  note?: string | null;
};

export type SaleLine = {
  saleId: string;
  product: string;
  quantity: number;
  unitPriceCentavos: Centavos;
  totalCentavos: Centavos;
  isBulk: boolean;
};

export type CapitalAsset = {
  id: string;
  name: string;
  purchaseDate: ISODate;
  costCentavos: Centavos;
  usefulLifeMonths: number;
  disposedOn: ISODate | null;
  note?: string | null;
};

export type Buyer = { id: string; name: string };

export type LeafMeasurement = {
  cycleId: string;
  date: ISODate;
  avgLengthCm: number;
  sampleSize: number | null;
};

export type Task = {
  id: string;
  plotId: string | null;
  cycleId: string | null;
  title: string;
  activity: string | null;
  dueDate: ISODate;
  isCritical: boolean;
  doneAt: string | null;
};

/** Assumptions the reports rest on, kept as data so they can be corrected. */
export type FarmSettings = {
  maxPlantsPerSqm: number;
  pineappleMonthsToHarvest: number;
  /** D-leaf length at which the plants are big enough to force. */
  dleafForcingCm: number;
  /** Months from forcing to harvest. */
  monthsForcingToHarvest: number;
  dleafSampleSize: number;
};

export const DEFAULT_SETTINGS: FarmSettings = {
  maxPlantsPerSqm: 3.3,
  pineappleMonthsToHarvest: 18,
  dleafForcingCm: 100,
  monthsForcingToHarvest: 5,
  dleafSampleSize: 10,
};
export type Crop = { code: string; label: string };
export type Product = { code: string; label: string; sortOrder: number; isGrade: boolean };
export type Activity = {
  code: string;
  label: string;
  activityGroup: string;
  defaultCategory: ExpenseCategory | null;
};

/** Everything the reports read. Loaded once, reused across every cut. */
export type Ledger = {
  plots: Plot[];
  plotAreas: PlotArea[];
  cycles: Cycle[];
  expenses: Expense[];
  allocations: Allocation[];
  purchases: InputPurchase[];
  draws: InputDraw[];
  harvests: Harvest[];
  harvestLines: HarvestLine[];
  sales: Sale[];
  saleLines: SaleLine[];
  plantCounts: { cycleId: string; date: ISODate; count: number; note?: string | null }[];
  capitalAssets: CapitalAsset[];
  buyers: Buyer[];
  products: Product[];
  activities: Activity[];
  crops: Crop[];
  leafMeasurements: LeafMeasurement[];
  tasks: Task[];
  settings: FarmSettings;
};

export const EMPTY_LEDGER: Ledger = {
  plots: [], plotAreas: [], cycles: [], expenses: [], allocations: [],
  purchases: [], draws: [], harvests: [], harvestLines: [], sales: [],
  saleLines: [], plantCounts: [], capitalAssets: [], buyers: [], products: [],
  activities: [], crops: [], leafMeasurements: [], tasks: [],
  settings: DEFAULT_SETTINGS,
};
