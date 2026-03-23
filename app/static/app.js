const STORAGE_KEY = "plant-label-helper-rows";

const calculateWholesale = (cost) => Math.round(Number(cost || 0) * 1.3);
const calculateRetail = (cost) => calculateWholesale(cost) * 2;

const sampleRows = [
  {
    name: "몬스테라 델리시오사",
    spec: "12",
    cost: 10000,
    wholesale: 13000,
    retail: 26000,
    quantity: 3,
  },
  {
    name: "안스리움 베이치",
    spec: "3",
    cost: 3600,
    wholesale: 4680,
    retail: 9360,
    quantity: 5,
  },
];

const state = {
  rows: [],
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
const PRICE_FIELDS = ["cost", "wholesale", "retail"];

const formatCurrency = (value) =>
  `${Number(value || 0).toLocaleString("ko-KR")}원`;

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

const createEmptyRow = () => ({
  name: "",
  spec: "",
  cost: "",
  wholesale: "",
  retail: "",
  quantity: "",
});

const normalizeRow = (row = {}) => {
  const cost = row.cost ?? "";
  return {
    name: row.name ?? "",
    spec: row.spec ?? "",
    cost,
    wholesale: row.wholesale ?? (cost === "" ? "" : calculateWholesale(cost)),
    retail: row.retail ?? (cost === "" ? "" : calculateRetail(cost)),
    quantity:
      row.quantity === "" || row.quantity === null || row.quantity === undefined
        ? ""
        : Number(row.quantity),
  };
};

const saveRows = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.rows));
};

const loadRows = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved) && saved.length) {
      state.rows = saved.map(normalizeRow);
      return;
    }
  } catch (error) {
    console.error("Failed to parse saved rows", error);
  }
  state.rows = [createEmptyRow()];
};

const updateSummary = () => {
  return;
};

const updateRowInState = (index, field, value) => {
  if (field === "cost") {
    const cost = parsePriceInput(value);
    state.rows[index].cost = cost;
    state.rows[index].wholesale = cost === "" ? "" : calculateWholesale(cost);
    state.rows[index].retail = cost === "" ? "" : calculateRetail(cost);
    syncCalculatedFields(index);
  } else if (field === "wholesale") {
    state.rows[index].wholesale = parsePriceInput(value);
  } else if (field === "retail") {
    state.rows[index].retail = parsePriceInput(value);
  } else if (field === "quantity") {
    state.rows[index].quantity = value === "" ? "" : Number(value);
  } else {
    state.rows[index][field] = value;
  }

  saveRows();
  updateSummary();
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

const renderRows = () => {
  entryBody.innerHTML = "";

  state.rows.forEach((row, index) => {
    const fragment = rowTemplate.content.cloneNode(true);
    const inputs = fragment.querySelectorAll("input[data-field]");

    inputs.forEach((input) => {
      const field = input.dataset.field;
      if (PRICE_FIELDS.includes(field)) {
        input.value = formatPriceDisplay(row[field]);
      } else {
        input.value = row[field] ?? "";
      }

      input.addEventListener("input", (event) => {
        updateRowInState(index, field, event.target.value);
      });
      input.addEventListener("blur", (event) => {
        if (PRICE_FIELDS.includes(field)) {
          event.target.value = formatPriceDisplay(state.rows[index][field]);
        }
      });
      input.addEventListener("keydown", (event) => handleCellNavigation(event, index, field));
    });

    entryBody.appendChild(fragment);
  });

  updateSummary();
};

const handleCellNavigation = (event, rowIndex, field) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  const fieldOrder = ["name", "spec", "quantity", "cost", "wholesale", "retail"];
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

const addRow = (row = createEmptyRow()) => {
  state.rows.push(normalizeRow(row));
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
    state.rows = [createEmptyRow()];
  }
  saveRows();
  renderRows();
};

const fillSampleRows = () => {
  state.rows = sampleRows.map(normalizeRow);
  saveRows();
  renderRows();
};

const clearAllRows = () => {
  state.rows = [createEmptyRow()];
  saveRows();
  renderRows();
};

const appendImportedRows = (rows) => {
  const normalized = rows.map(normalizeRow).filter((row) => row.name.trim());
  if (!normalized.length) {
    return 0;
  }

  const hasOnlyEmptyStarter =
    state.rows.length === 1 &&
    !state.rows[0].name &&
    !state.rows[0].spec &&
    !state.rows[0].cost &&
    !state.rows[0].wholesale &&
    !state.rows[0].retail &&
    !state.rows[0].quantity;

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
  copyFeedback.textContent = "매입장에 저장하고 있습니다.";

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

    copyFeedback.textContent = `${result.message} 데이터 파일은 ${result.db_path} 입니다.`;
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
  } finally {
    exportButton.disabled = false;
    exportSpinner.classList.add("hidden");
    exportButtonLabel.textContent = "XLSX 다운로드";
  }
};

const copyTsv = async () => {
  const rows = state.rows.filter((row) => row.name.trim());
  const text = rows
    .map((row) => [row.name, row.spec, row.retail, row.quantity].join("\t"))
    .join("\n");

  if (!text) {
    copyFeedback.textContent = "복사할 데이터가 없습니다.";
    return;
  }

  await navigator.clipboard.writeText(text);
  copyFeedback.textContent = "엑셀에 바로 붙여넣을 수 있는 형식으로 복사했습니다.";
};

const requestOcrPreview = async () => {
  const fileInput = document.querySelector("#ocr-file-input");
  const file = fileInput.files?.[0];

  if (!file) {
    ocrFeedback.textContent = "먼저 PDF나 이미지를 선택하세요.";
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
  savePurchaseLedger().catch((error) => {
    console.error(error);
    copyFeedback.textContent = "매입장 저장에 실패했습니다.";
  });
});
document.querySelector("#export-xlsx-btn").addEventListener("click", () => {
  exportXlsx().catch(() => {
    copyFeedback.textContent = "XLSX 다운로드에 실패했습니다.";
  });
});
document.querySelector("#copy-tsv-btn").addEventListener("click", () => {
  copyTsv().catch(() => {
    copyFeedback.textContent = "클립보드 복사에 실패했습니다.";
  });
});
document.querySelector("#ocr-preview-btn").addEventListener("click", () => {
  requestOcrPreview();
});

loadRows();
renderRows();
