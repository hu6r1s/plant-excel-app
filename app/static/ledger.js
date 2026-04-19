const ledgerBody = document.querySelector("#ledger-body");
const ledgerFeedback = document.querySelector("#ledger-feedback");
const refreshButton = document.querySelector("#refresh-ledger-btn");
const refreshLabel = document.querySelector("#refresh-ledger-label");
const refreshSpinner = document.querySelector("#refresh-ledger-spinner");
const nameInput = document.querySelector("#ledger-name");
const categoryFilterSelect = document.querySelector("#ledger-category");
const sortSelect = document.querySelector("#ledger-sort");
const directionSelect = document.querySelector("#ledger-direction");
const clearFilterButton = document.querySelector("#clear-ledger-filter-btn");
const exportAllLedgerButton = document.querySelector("#export-all-ledger-btn");
const exportAllLedgerLabel = document.querySelector("#export-all-ledger-label");
const exportAllLedgerSpinner = document.querySelector("#export-all-ledger-spinner");
const exportSelectedLedgerButton = document.querySelector("#export-selected-ledger-btn");
const exportSelectedLedgerLabel = document.querySelector("#export-selected-ledger-label");
const exportSelectedLedgerSpinner = document.querySelector("#export-selected-ledger-spinner");
const exportSelectedLabelsButton = document.querySelector("#export-selected-labels-btn");
const exportSelectedLabelsLabel = document.querySelector("#export-selected-labels-label");
const exportSelectedLabelsSpinner = document.querySelector("#export-selected-labels-spinner");
const selectionSummary = document.querySelector("#selection-summary");
const selectAllLedgerCheckbox = document.querySelector("#select-all-ledger");

const PRICE_FIELDS = ["cost", "wholesale", "retail"];
const CATEGORY_LABELS = {
  plant: "\uC2DD\uBB3C",
  material: "\uC790\uC7AC",
};

let searchDebounceTimer = null;
let currentItems = [];
let editingId = null;
let selectedIds = new Set();

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatCurrency = (value) =>
  value === null || value === undefined || value === ""
    ? "-"
    : `${Number(value).toLocaleString("ko-KR")}원`;

const formatEditableValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    return String(value);
  }

  return Number.isInteger(numberValue) ? `${numberValue}` : `${numberValue}`;
};

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

const calculateRetailFromWholesale = (wholesale) =>
  Math.round(Number(wholesale || 0) * 2);

const calculateWholesaleFromCost = (cost) =>
  Math.round(Number(cost || 0) * 1.3);

const normalizeCategory = (value, fallback = "plant") => {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (candidate === "plant" || candidate === "material") {
    return candidate;
  }

  return fallback;
};

const getCategoryLabel = (value) => CATEGORY_LABELS[normalizeCategory(value)] || CATEGORY_LABELS.plant;

const buildCategoryOptions = (selectedCategory) => {
  const normalized = normalizeCategory(selectedCategory);
  return Object.entries(CATEGORY_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === normalized ? "selected" : ""}>${label}</option>`
    )
    .join("");
};

const buildQueryString = () => {
  const params = new URLSearchParams();
  if (nameInput.value.trim()) {
    params.set("name", nameInput.value.trim());
  }

  if (categoryFilterSelect && categoryFilterSelect.value !== "all") {
    params.set("category", normalizeCategory(categoryFilterSelect.value));
  }

  params.set("sort", sortSelect.value || "date");
  params.set("direction", directionSelect.value || "desc");

  const query = params.toString();
  return query ? `?${query}` : "";
};

const getVisibleIds = () => currentItems.map((item) => Number(item.id));

const updateSelectionSummary = () => {
  const visibleIds = getVisibleIds();
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const selectedTotalCount = selectedIds.size;

  if (selectedTotalCount > 0) {
    if (selectedVisibleCount > 0) {
      selectionSummary.textContent = `전체 ${selectedTotalCount}개 선택 중 현재 목록에 ${selectedVisibleCount}개가 보입니다.`;
    } else {
      selectionSummary.textContent = `전체 ${selectedTotalCount}개를 선택했지만 현재 검색 결과에는 보이지 않습니다.`;
    }
  } else if (!visibleIds.length) {
    selectionSummary.textContent = "현재 보이는 항목이 없습니다.";
  } else {
    selectionSummary.textContent = "현재 선택된 항목이 없습니다.";
  }

  selectAllLedgerCheckbox.checked =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  selectAllLedgerCheckbox.indeterminate =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
};

const buildEditablePriceValue = (value) => formatPriceDisplay(parsePriceInput(value));

const renderLedgerRows = (items) => {
  ledgerBody.innerHTML = "";

  if (!items.length) {
    ledgerBody.innerHTML = `
      <tr>
        <td colspan="13" class="empty-cell">저장된 매입 데이터가 없습니다.</td>
      </tr>
    `;
    updateSelectionSummary();
    return;
  }

  items.forEach((item) => {
    const entryId = Number(item.id);
    const tr = document.createElement("tr");
    tr.dataset.id = String(entryId);

    if (editingId === entryId) {
      tr.innerHTML = `
        <td class="check-col">
          <input class="row-select" data-id="${entryId}" type="checkbox" ${
            selectedIds.has(entryId) ? "checked" : ""
          } />
        </td>
        <td>${entryId}</td>
        <td>
          <select data-field="category">
            ${buildCategoryOptions(item.category)}
          </select>
        </td>
        <td>${escapeHtml(item.created_date || "-")}</td>
        <td><input data-field="name" type="text" value="${escapeHtml(item.name || "")}" /></td>
        <td><input data-field="vendor" type="text" value="${escapeHtml(item.vendor || "")}" /></td>
        <td><input data-field="spec" type="text" value="${escapeHtml(item.spec || "")}" /></td>
        <td><input data-field="quantity" type="text" value="${escapeHtml(formatEditableValue(item.quantity))}" /></td>
        <td><input data-field="purchase_count" type="text" value="${escapeHtml(
          formatEditableValue(item.purchase_count)
        )}" /></td>
        <td><input data-field="cost" type="text" value="${escapeHtml(
          buildEditablePriceValue(item.cost)
        )}" /></td>
        <td><input data-field="wholesale" type="text" value="${escapeHtml(
          buildEditablePriceValue(item.wholesale)
        )}" /></td>
        <td><input data-field="retail" type="text" value="${escapeHtml(
          buildEditablePriceValue(item.retail)
        )}" /></td>
        <td>
          <div class="row-actions">
            <button class="btn primary btn-small" type="button" data-action="save">저장</button>
            <button class="btn btn-small" type="button" data-action="cancel">취소</button>
          </div>
        </td>
      `;
    } else {
      tr.innerHTML = `
        <td class="check-col">
          <input class="row-select" data-id="${entryId}" type="checkbox" ${
            selectedIds.has(entryId) ? "checked" : ""
          } />
        </td>
        <td>${entryId}</td>
        <td>${escapeHtml(getCategoryLabel(item.category))}</td>
        <td>${escapeHtml(item.created_date || "-")}</td>
        <td>${escapeHtml(item.name || "-")}</td>
        <td>${escapeHtml(item.vendor || "-")}</td>
        <td>${escapeHtml(item.spec || "-")}</td>
        <td>${item.quantity ?? "-"}</td>
        <td>${item.purchase_count ?? "-"}</td>
        <td>${formatCurrency(item.cost)}</td>
        <td>${formatCurrency(item.wholesale)}</td>
        <td>${formatCurrency(item.retail)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-small" type="button" data-action="edit">수정</button>
            <button class="btn danger btn-small" type="button" data-action="delete">삭제</button>
          </div>
        </td>
      `;
    }

    ledgerBody.appendChild(tr);
  });

  updateSelectionSummary();
};

const loadLedger = async () => {
  refreshButton.disabled = true;
  refreshSpinner.classList.remove("hidden");
  refreshLabel.textContent = "불러오는 중...";
  ledgerFeedback.textContent = "매입 데이터를 불러오고 있습니다.";

  try {
    const response = await fetch(`/api/purchase-ledger${buildQueryString()}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "ledger fetch failed");
    }

    currentItems = (result.items || []).map((item) => ({
      ...item,
      id: Number(item.id),
      category: normalizeCategory(item.category),
    }));

    if (editingId !== null && !currentItems.some((item) => item.id === editingId)) {
      editingId = null;
    }

    renderLedgerRows(currentItems);
    ledgerFeedback.textContent = `${result.count || 0}개의 항목을 불러왔습니다.`;
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = "매입 목록을 불러오지 못했습니다.";
  } finally {
    refreshButton.disabled = false;
    refreshSpinner.classList.add("hidden");
    refreshLabel.textContent = "새로고침";
  }
};

const downloadResponseAsFile = async (response, filename) => {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getLedgerExportIds = () => {
  const selected = [...selectedIds];
  return {
    selectedCount: selected.length,
    exportIds: selected.length ? selected : getVisibleIds(),
  };
};

const exportAllLedger = async () => {
  exportAllLedgerButton.disabled = true;
  exportAllLedgerSpinner.classList.remove("hidden");
  exportAllLedgerLabel.textContent = "내보내는 중...";
  ledgerFeedback.textContent = "매입 내역 전체를 엑셀로 내보내고 있습니다.";

  try {
    const response = await fetch("/api/purchase-ledger/export");
    if (!response.ok) {
      throw new Error("ledger export failed");
    }

    await downloadResponseAsFile(response, "purchase-ledger.xlsx");
    ledgerFeedback.textContent = "매입 내역 전체를 엑셀로 내보냈습니다.";
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = "전체 엑셀 내보내기에 실패했습니다.";
  } finally {
    exportAllLedgerButton.disabled = false;
    exportAllLedgerSpinner.classList.add("hidden");
    exportAllLedgerLabel.textContent = "전체 엑셀";
  }
};

const exportSelectedLedger = async () => {
  const { selectedCount, exportIds } = getLedgerExportIds();

  if (!exportIds.length) {
    ledgerFeedback.textContent = "내보낼 항목이 없습니다.";
    return;
  }

  exportSelectedLedgerButton.disabled = true;
  exportSelectedLedgerSpinner.classList.remove("hidden");
  exportSelectedLedgerLabel.textContent = "내보내는 중...";
  ledgerFeedback.textContent =
    selectedCount > 0
      ? `${selectedCount}개 선택 항목을 엑셀로 내보내고 있습니다.`
      : "현재 검색된 목록 전체를 엑셀로 내보내고 있습니다.";

  try {
    const response = await fetch("/api/purchase-ledger/export/selected", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: exportIds }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "selected ledger export failed");
    }

    await downloadResponseAsFile(response, "purchase-ledger-selection.xlsx");
    ledgerFeedback.textContent =
      selectedCount > 0
        ? "선택한 항목을 엑셀로 내보냈습니다."
        : "현재 검색된 목록을 엑셀로 내보냈습니다.";
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = "선택 엑셀 내보내기에 실패했습니다.";
  } finally {
    exportSelectedLedgerButton.disabled = false;
    exportSelectedLedgerSpinner.classList.add("hidden");
    exportSelectedLedgerLabel.textContent = "선택 엑셀";
  }
};

const exportSelectedLabels = async () => {
  const { selectedCount, exportIds } = getLedgerExportIds();

  if (!exportIds.length) {
    ledgerFeedback.textContent = "라벨용으로 내보낼 항목이 없습니다.";
    return;
  }

  exportSelectedLabelsButton.disabled = true;
  exportSelectedLabelsSpinner.classList.remove("hidden");
  exportSelectedLabelsLabel.textContent = "내보내는 중...";
  ledgerFeedback.textContent =
    selectedCount > 0
      ? `${selectedCount}개 선택 항목을 라벨용 엑셀로 내보내고 있습니다.`
      : "현재 검색된 목록 전체를 라벨용 엑셀로 내보내고 있습니다.";

  try {
    const response = await fetch("/api/purchase-ledger/export/selected-labels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: exportIds }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "selected label export failed");
    }

    await downloadResponseAsFile(response, "plant-labels-selection.xlsx");
    ledgerFeedback.textContent =
      selectedCount > 0
        ? "선택 항목을 라벨용 엑셀로 내보냈습니다."
        : "현재 검색된 목록을 라벨용 엑셀로 내보냈습니다.";
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = "라벨용 엑셀 내보내기에 실패했습니다.";
  } finally {
    exportSelectedLabelsButton.disabled = false;
    exportSelectedLabelsSpinner.classList.add("hidden");
    exportSelectedLabelsLabel.textContent = "선택 라벨 엑셀";
  }
};

const updateEntry = async (entryId, payload) => {
  ledgerFeedback.textContent = "매입 내역을 저장하고 있습니다.";

  const response = await fetch(`/api/purchase-ledger/${entryId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "update failed");
  }

  editingId = null;
  ledgerFeedback.textContent = "매입 내역을 수정했습니다.";
  await loadLedger();
};

const deleteEntry = async (entryId) => {
  const confirmed = window.confirm("이 매입 내역을 삭제할까요?");
  if (!confirmed) {
    return;
  }

  ledgerFeedback.textContent = "매입 내역을 삭제하고 있습니다.";

  const response = await fetch(`/api/purchase-ledger/${entryId}`, {
    method: "DELETE",
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "delete failed");
  }

  selectedIds.delete(entryId);
  if (editingId === entryId) {
    editingId = null;
  }

  ledgerFeedback.textContent = "매입 내역을 삭제했습니다.";
  await loadLedger();
};

const collectRowPayload = (rowElement) => {
  const payload = {};
  rowElement.querySelectorAll("[data-field]").forEach((field) => {
    payload[field.dataset.field] = String(field.value ?? "").trim();
  });
  return payload;
};

const setFormattedPrice = (input, value) => {
  if (!input) {
    return;
  }

  input.value = value === "" ? "" : formatPriceDisplay(value);
};

const syncLedgerPriceFields = (rowElement, sourceField) => {
  const costInput = rowElement.querySelector('[data-field="cost"]');
  const wholesaleInput = rowElement.querySelector('[data-field="wholesale"]');
  const retailInput = rowElement.querySelector('[data-field="retail"]');

  if (sourceField === "cost" && costInput) {
    const cost = parsePriceInput(costInput.value);
    const wholesale = cost === "" ? "" : calculateWholesaleFromCost(cost);
    setFormattedPrice(wholesaleInput, wholesale);
    setFormattedPrice(
      retailInput,
      wholesale === "" ? "" : calculateRetailFromWholesale(wholesale)
    );
    return;
  }

  if (sourceField === "wholesale" && wholesaleInput) {
    const wholesale = parsePriceInput(wholesaleInput.value);
    setFormattedPrice(
      retailInput,
      wholesale === "" ? "" : calculateRetailFromWholesale(wholesale)
    );
  }
};

const scheduleLedgerReload = () => {
  window.clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    loadLedger();
  }, 180);
};

refreshButton.addEventListener("click", () => {
  loadLedger();
});

nameInput.addEventListener("input", () => {
  scheduleLedgerReload();
});

categoryFilterSelect?.addEventListener("change", () => {
  loadLedger();
});

sortSelect.addEventListener("change", () => {
  loadLedger();
});

directionSelect.addEventListener("change", () => {
  loadLedger();
});

clearFilterButton.addEventListener("click", () => {
  nameInput.value = "";
  if (categoryFilterSelect) {
    categoryFilterSelect.value = "all";
  }
  sortSelect.value = "date";
  directionSelect.value = "desc";
  editingId = null;
  loadLedger();
});

exportAllLedgerButton.addEventListener("click", () => {
  exportAllLedger();
});

exportSelectedLedgerButton.addEventListener("click", () => {
  exportSelectedLedger();
});

exportSelectedLabelsButton.addEventListener("click", () => {
  exportSelectedLabels();
});

selectAllLedgerCheckbox.addEventListener("change", () => {
  const visibleIds = getVisibleIds();
  if (selectAllLedgerCheckbox.checked) {
    visibleIds.forEach((id) => selectedIds.add(id));
  } else {
    visibleIds.forEach((id) => selectedIds.delete(id));
  }

  renderLedgerRows(currentItems);
});

ledgerBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".row-select");
  if (!checkbox) {
    return;
  }

  const entryId = Number(checkbox.dataset.id);
  if (checkbox.checked) {
    selectedIds.add(entryId);
  } else {
    selectedIds.delete(entryId);
  }

  updateSelectionSummary();
});

ledgerBody.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-field]");
  if (!input) {
    return;
  }

  const rowElement = input.closest("tr[data-id]");
  if (!rowElement) {
    return;
  }

  if (input.dataset.field === "cost" || input.dataset.field === "wholesale") {
    syncLedgerPriceFields(rowElement, input.dataset.field);
  }
});

ledgerBody.addEventListener(
  "blur",
  (event) => {
    const input = event.target.closest("input[data-field]");
    if (!input || !PRICE_FIELDS.includes(input.dataset.field)) {
      return;
    }

    input.value = formatPriceDisplay(parsePriceInput(input.value));
  },
  true
);

ledgerBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const rowElement = button.closest("tr[data-id]");
  if (!rowElement) {
    return;
  }

  const entryId = Number(rowElement.dataset.id);
  const action = button.dataset.action;

  try {
    if (action === "edit") {
      editingId = entryId;
      renderLedgerRows(currentItems);
      return;
    }

    if (action === "cancel") {
      editingId = null;
      renderLedgerRows(currentItems);
      ledgerFeedback.textContent = "수정을 취소했습니다.";
      return;
    }

    if (action === "save") {
      await updateEntry(entryId, collectRowPayload(rowElement));
      return;
    }

    if (action === "delete") {
      await deleteEntry(entryId);
    }
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = error.message || "작업을 처리하지 못했습니다.";
  }
});

loadLedger();
