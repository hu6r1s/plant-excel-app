const STORAGE_KEY = "plant-label-helper-rows";
const MODE_STORAGE_KEY = "plant-label-helper-mode";
const PRICE_FIELDS = ["cost", "wholesale", "retail"];
const CATEGORY_LABELS = {
  plant: "\uC2DD\uBB3C",
  material: "\uC790\uC7AC",
};

const calculateRetailFromWholesale = (wholesale) =>
  Math.round(Number(wholesale || 0) * 2);

const calculateWholesaleFromCost = (cost) =>
  Math.round(Number(cost || 0) * 1.3);

const sampleRows = [
  {
    name: "몬스테라 델리시오사",
    vendor: "양재시장",
    spec: "12",
    quantity: 3,
    purchase_count: 3,
    cost: 10000,
    wholesale: 10000,
    retail: 20000,
  },
  {
    name: "안스리움 베이치",
    vendor: "청계화훼",
    spec: "3",
    quantity: 5,
    purchase_count: 5,
    cost: 3600,
    wholesale: 3600,
    retail: 7200,
  },
];

const state = {
  currentMode: "plant",
  rows: [],
  vendorSuggestions: [],
};

const entryBody = document.querySelector("#entry-body");
const rowTemplate = document.querySelector("#row-template");
const copyFeedback = document.querySelector("#copy-feedback");
const ocrFeedback = document.querySelector("#ocr-feedback");
const saveLedgerButton = document.querySelector("#save-ledger-btn");
const saveLedgerLabel = document.querySelector("#save-ledger-label");
const saveLedgerSpinner = document.querySelector("#save-ledger-spinner");
const exportButton = document.querySelector("#export-xlsx-btn");
const exportButtonLabel = document.querySelector("#export-btn-label");
const exportSpinner = document.querySelector("#export-spinner");
const ocrButton = document.querySelector("#ocr-preview-btn");
const ocrButtonLabel = document.querySelector("#ocr-btn-label");
const ocrSpinner = document.querySelector("#ocr-spinner");
const modePlantButton = document.querySelector("#mode-plant-btn");
const modeMaterialButton = document.querySelector("#mode-material-btn");
const entryModeLabel = document.querySelector("#entry-mode-label");
const vendorSuggestionList = document.querySelector("#vendor-suggestions");

const parsePriceInput = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const cleaned = String(value).replaceAll(",", "").replaceAll("원", "").trim();
  if (!cleaned) {
    return "";
  }

  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) {
    return "";
  }

  if (cleaned.includes(".") || Math.abs(parsed) < 1000) {
    return Math.round(parsed * 1000);
  }

  return Math.round(parsed);
};

const formatPriceDisplay = (value) =>
  value === "" ? "" : Number(value).toLocaleString("ko-KR");

const normalizeCountValue = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const cleaned = String(value).replaceAll(",", "").trim();
  if (!cleaned) {
    return "";
  }

  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? "" : parsed;
};

const normalizeCategory = (value, fallback = "plant") => {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (candidate === "plant" || candidate === "material") {
    return candidate;
  }

  return fallback;
};

const isRowBlank = (row = {}) =>
  !String(row.name ?? "").trim() &&
  !String(row.vendor ?? "").trim() &&
  !String(row.spec ?? "").trim() &&
  [row.quantity, row.purchase_count, row.cost, row.wholesale, row.retail].every(
    (value) => value === "" || value === null || value === undefined
  );

const createEmptyRow = (category = state.currentMode) => ({
  category: normalizeCategory(category, state.currentMode),
  name: "",
  vendor: "",
  spec: "",
  quantity: "",
  purchase_count: "",
  cost: "",
  wholesale: "",
  retail: "",
});

const normalizeRow = (row = {}, fallbackCategory = "plant") => {
  const cost = parsePriceInput(row.cost ?? "");
  const wholesale =
    row.wholesale === "" || row.wholesale === null || row.wholesale === undefined
      ? cost === ""
        ? ""
        : calculateWholesaleFromCost(cost)
      : parsePriceInput(row.wholesale);
  const purchaseCount = row.purchase_count ?? row.quantity ?? "";

  return {
    category: normalizeCategory(row.category, fallbackCategory),
    name: row.name ?? "",
    vendor: row.vendor ?? "",
    spec: row.spec ?? "",
    quantity: normalizeCountValue(row.quantity),
    purchase_count: normalizeCountValue(purchaseCount),
    cost,
    wholesale,
    retail:
      row.retail === "" || row.retail === null || row.retail === undefined
        ? wholesale === ""
          ? ""
          : calculateRetailFromWholesale(wholesale)
        : parsePriceInput(row.retail),
  };
};

const buildVendorSuggestionValues = (vendors = []) =>
  [...new Set(vendors.map((vendor) => String(vendor ?? "").trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "ko-KR", { sensitivity: "base", numeric: true })
  );

const updateVendorSuggestions = (vendors) => {
  state.vendorSuggestions = buildVendorSuggestionValues(vendors);

  if (!vendorSuggestionList) {
    return;
  }

  vendorSuggestionList.innerHTML = "";
  state.vendorSuggestions.forEach((vendor) => {
    const option = document.createElement("option");
    option.value = vendor;
    vendorSuggestionList.appendChild(option);
  });
};

const mergeVendorSuggestionsFromRows = () => {
  updateVendorSuggestions([
    ...state.vendorSuggestions,
    ...state.rows.map((row) => row.vendor),
  ]);
};

const loadVendorSuggestions = async () => {
  mergeVendorSuggestionsFromRows();

  try {
    const response = await fetch("/api/purchase-ledger/vendors");
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "vendor suggestion fetch failed");
    }

    updateVendorSuggestions([
      ...(result.items || []),
      ...state.rows.map((row) => row.vendor),
    ]);
  } catch (error) {
    console.error(error);
  }
};

const saveCurrentMode = () => {
  localStorage.setItem(MODE_STORAGE_KEY, state.currentMode);
};

const loadCurrentMode = () => {
  try {
    state.currentMode = normalizeCategory(localStorage.getItem(MODE_STORAGE_KEY), "plant");
  } catch (error) {
    console.error("Failed to parse saved mode", error);
    state.currentMode = "plant";
  }
};

const applyCurrentModeToBlankRows = () => {
  state.rows = state.rows.map((row) =>
    isRowBlank(row) ? { ...row, category: state.currentMode } : row
  );
};

const updateModeControls = () => {
  const isPlantMode = state.currentMode === "plant";

  modePlantButton?.classList.toggle("is-active", isPlantMode);
  modeMaterialButton?.classList.toggle("is-active", !isPlantMode);
  modePlantButton?.setAttribute("aria-pressed", String(isPlantMode));
  modeMaterialButton?.setAttribute("aria-pressed", String(!isPlantMode));

  if (entryModeLabel) {
    entryModeLabel.textContent = `\uC0C8 \uD589 \uAE30\uBCF8\uAC12: ${CATEGORY_LABELS[state.currentMode]}`;
  }
};

const setCurrentMode = (mode) => {
  state.currentMode = normalizeCategory(mode, state.currentMode);
  applyCurrentModeToBlankRows();
  saveCurrentMode();
  saveRows();
  updateModeControls();
  renderRows();
};

const saveRows = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.rows));
};

const loadRows = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved) && saved.length) {
      state.rows = saved.map((row) => normalizeRow(row, "plant"));
      applyCurrentModeToBlankRows();
      return;
    }
  } catch (error) {
    console.error("Failed to parse saved rows", error);
  }

  state.rows = [createEmptyRow(state.currentMode)];
};

const updateSummary = () => {
  return;
};

const syncCalculatedFields = (index) => {
  const tr = entryBody.querySelectorAll("tr")[index];
  if (!tr) {
    return;
  }

  const wholesaleInput = tr.querySelector('[data-field="wholesale"]');
  const retailInput = tr.querySelector('[data-field="retail"]');

  if (wholesaleInput && document.activeElement !== wholesaleInput) {
    wholesaleInput.value = formatPriceDisplay(state.rows[index].wholesale);
  }

  if (retailInput && document.activeElement !== retailInput) {
    retailInput.value = formatPriceDisplay(state.rows[index].retail);
  }
};

const updateRowInState = (index, field, value) => {
  if (field === "cost") {
    const cost = parsePriceInput(value);
    const wholesale = cost === "" ? "" : calculateWholesaleFromCost(cost);
    state.rows[index].cost = cost;
    state.rows[index].wholesale = wholesale;
    state.rows[index].retail =
      wholesale === "" ? "" : calculateRetailFromWholesale(wholesale);
    syncCalculatedFields(index);
  } else if (field === "wholesale") {
    const wholesale = parsePriceInput(value);
    state.rows[index].wholesale = wholesale;
    state.rows[index].retail =
      wholesale === "" ? "" : calculateRetailFromWholesale(wholesale);
    syncCalculatedFields(index);
  } else if (field === "retail") {
    state.rows[index].retail = parsePriceInput(value);
  } else if (field === "quantity" || field === "purchase_count") {
    state.rows[index][field] = normalizeCountValue(value);
  } else {
    state.rows[index][field] = value;
  }

  saveRows();
  updateSummary();
};

const handleCellNavigation = (event, rowIndex, field) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();

  const fieldOrder = [
    "name",
    "vendor",
    "spec",
    "quantity",
    "purchase_count",
    "cost",
    "wholesale",
    "retail",
  ];

  const currentIndex = fieldOrder.indexOf(field);
  const nextField = fieldOrder[currentIndex + 1];

  if (nextField) {
    renderRows();
    const nextInput = entryBody
      .querySelectorAll("tr")
      [rowIndex]?.querySelector(`[data-field="${nextField}"]`);
    nextInput?.focus();
    return;
  }

  if (rowIndex === state.rows.length - 1) {
    state.rows.push(createEmptyRow());
    saveRows();
    renderRows();
  }

  const firstInputNextRow = entryBody
    .querySelectorAll("tr")
    [rowIndex + 1]?.querySelector('[data-field="name"]');
  firstInputNextRow?.focus();
};

const renderRows = () => {
  entryBody.innerHTML = "";

  state.rows.forEach((row, index) => {
    const fragment = rowTemplate.content.cloneNode(true);
    const rowElement = fragment.querySelector("tr");
    rowElement.dataset.category = row.category;
    const inputs = fragment.querySelectorAll("input[data-field]");

    inputs.forEach((input) => {
      const field = input.dataset.field;
      input.value = PRICE_FIELDS.includes(field)
        ? formatPriceDisplay(row[field])
        : row[field] ?? "";

      input.addEventListener("input", (event) => {
        updateRowInState(index, field, event.target.value);
      });

      input.addEventListener("blur", (event) => {
        if (PRICE_FIELDS.includes(field)) {
          event.target.value = formatPriceDisplay(state.rows[index][field]);
        }
      });

      input.addEventListener("keydown", (event) => {
        handleCellNavigation(event, index, field);
      });
    });

    entryBody.appendChild(fragment);
  });

  updateSummary();
};

const addRow = (row = createEmptyRow(state.currentMode)) => {
  state.rows.push(normalizeRow(row, state.currentMode));
  saveRows();
  renderRows();
};

const getSelectedIndexes = () =>
  [...document.querySelectorAll(".row-select")]
    .map((checkbox, index) => (checkbox.checked ? index : -1))
    .filter((index) => index >= 0);

const duplicateSelectedRows = () => {
  const selected = getSelectedIndexes();
  if (!selected.length) {
    return;
  }

  const clones = selected.map((index) => ({ ...state.rows[index] }));
  state.rows.splice(selected[selected.length - 1] + 1, 0, ...clones);
  saveRows();
  renderRows();
};

const deleteSelectedRows = () => {
  const selected = getSelectedIndexes();
  if (!selected.length) {
    return;
  }

  state.rows = state.rows.filter((_, index) => !selected.includes(index));
  if (!state.rows.length) {
    state.rows = [createEmptyRow(state.currentMode)];
  }

  saveRows();
  renderRows();
};

const fillSampleRows = () => {
  state.rows = sampleRows.map((row) => normalizeRow(row, state.currentMode));
  saveRows();
  renderRows();
};

const clearAllRows = () => {
  state.rows = [createEmptyRow(state.currentMode)];
  saveRows();
  renderRows();
};

const appendImportedRows = (rows) => {
  const normalized = rows
    .map((row) => normalizeRow(row, state.currentMode))
    .filter((row) => row.name.trim());
  if (!normalized.length) {
    return 0;
  }

  const hasOnlyEmptyStarter = state.rows.length === 1 && isRowBlank(state.rows[0]);

  state.rows = hasOnlyEmptyStarter ? normalized : [...state.rows, ...normalized];
  saveRows();
  renderRows();
  return normalized.length;
};

const savePurchaseLedger = async () => {
  const rows = state.rows.filter((row) => row.name.trim());
  if (!rows.length) {
    copyFeedback.textContent = "저장할 데이터가 없습니다.";
    return;
  }

  saveLedgerButton.disabled = true;
  saveLedgerSpinner.classList.remove("hidden");
  saveLedgerLabel.textContent = "저장 중...";
  copyFeedback.textContent = "매입 내역에 저장하고 있습니다.";

  try {
    const response = await fetch("/api/purchase-ledger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rows),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "purchase ledger save failed");
    }

    await loadVendorSuggestions();
    const storageLabel = result.storage_label || result.db_path || "";
    copyFeedback.textContent = storageLabel
      ? `${result.message} 저장 위치: ${storageLabel}`
      : result.message;
  } catch (error) {
    console.error(error);
    copyFeedback.textContent = "매입 내역 저장에 실패했습니다.";
  } finally {
    saveLedgerButton.disabled = false;
    saveLedgerSpinner.classList.add("hidden");
    saveLedgerLabel.textContent = "매입장 추가";
  }
};

const exportXlsx = async () => {
  const rows = state.rows.filter((row) => row.name.trim());
  if (!rows.length) {
    copyFeedback.textContent = "다운로드할 데이터가 없습니다.";
    return;
  }

  exportButton.disabled = true;
  exportSpinner.classList.remove("hidden");
  exportButtonLabel.textContent = "다운로드 준비 중...";
  copyFeedback.textContent = "엑셀 파일을 생성하고 있습니다.";

  try {
    const response = await fetch("/api/export/xlsx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "xlsx export failed");
    }

    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plant-labels.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    copyFeedback.textContent = "XLSX 파일을 다운로드했습니다.";
  } catch (error) {
    console.error(error);
    copyFeedback.textContent = "XLSX 다운로드에 실패했습니다.";
  } finally {
    exportButton.disabled = false;
    exportSpinner.classList.add("hidden");
    exportButtonLabel.textContent = "XLSX 다운로드";
  }
};

const getExportCount = (row) =>
  row.purchase_count === "" || row.purchase_count === null || row.purchase_count === undefined
    ? row.quantity
    : row.purchase_count;

const copyTsv = async () => {
  const rows = state.rows.filter((row) => row.name.trim());
  const text = rows
    .map((row) => [row.name, row.spec, row.retail, getExportCount(row)].join("\t"))
    .join("\n");

  if (!text) {
    copyFeedback.textContent = "복사할 데이터가 없습니다.";
    return;
  }

  await navigator.clipboard.writeText(text);
  copyFeedback.textContent = "붙여넣기 가능한 형식으로 복사했습니다.";
};

const requestOcrPreview = async () => {
  const fileInput = document.querySelector("#ocr-file-input");
  const file = fileInput.files?.[0];

  if (!file) {
    ocrFeedback.textContent = "먼저 PDF 또는 이미지를 선택해 주세요.";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  ocrButton.disabled = true;
  ocrSpinner.classList.remove("hidden");
  ocrButtonLabel.textContent = "가져오는 중...";
  ocrFeedback.textContent = "이미지에서 글자를 분석하고 있습니다.";

  try {
    const response = await fetch("/api/ocr/preview", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    const imported = appendImportedRows(result.items || []);
    ocrFeedback.textContent =
      imported > 0
        ? `${result.filename}: ${result.message} ${imported}개 행을 입력 테이블에 추가했습니다.`
        : `${result.filename}: ${result.message}`;
  } catch (error) {
    console.error(error);
    ocrFeedback.textContent = "OCR 미리보기 요청에 실패했습니다.";
  } finally {
    ocrButton.disabled = false;
    ocrSpinner.classList.add("hidden");
    ocrButtonLabel.textContent = "글자 가져오기";
  }
};

document.querySelector("#add-row-btn").addEventListener("click", () => addRow());
document.querySelector("#duplicate-row-btn").addEventListener("click", duplicateSelectedRows);
document.querySelector("#delete-row-btn").addEventListener("click", deleteSelectedRows);
document.querySelector("#clear-all-table-btn").addEventListener("click", clearAllRows);
document.querySelector("#fill-sample-btn").addEventListener("click", fillSampleRows);
document.querySelector("#save-ledger-btn").addEventListener("click", () => {
  savePurchaseLedger();
});
document.querySelector("#export-xlsx-btn").addEventListener("click", () => {
  exportXlsx();
});
document.querySelector("#copy-tsv-btn").addEventListener("click", () => {
  copyTsv().catch((error) => {
    console.error(error);
    copyFeedback.textContent = "클립보드 복사에 실패했습니다.";
  });
});
document.querySelector("#ocr-preview-btn").addEventListener("click", () => {
  requestOcrPreview();
});
modePlantButton?.addEventListener("click", () => {
  setCurrentMode("plant");
});
modeMaterialButton?.addEventListener("click", () => {
  setCurrentMode("material");
});

loadCurrentMode();
loadRows();
mergeVendorSuggestionsFromRows();
updateModeControls();
renderRows();
loadVendorSuggestions();
