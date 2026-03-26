const ledgerBody = document.querySelector("#ledger-body");
const ledgerFeedback = document.querySelector("#ledger-feedback");
const refreshButton = document.querySelector("#refresh-ledger-btn");
const refreshLabel = document.querySelector("#refresh-ledger-label");
const refreshSpinner = document.querySelector("#refresh-ledger-spinner");
const nameInput = document.querySelector("#ledger-name");
const sortSelect = document.querySelector("#ledger-sort");
const directionSelect = document.querySelector("#ledger-direction");
const clearFilterButton = document.querySelector("#clear-ledger-filter-btn");
const exportAllLedgerButton = document.querySelector("#export-all-ledger-btn");
const exportAllLedgerLabel = document.querySelector("#export-all-ledger-label");
const exportAllLedgerSpinner = document.querySelector("#export-all-ledger-spinner");
const exportSelectedLedgerButton = document.querySelector("#export-selected-ledger-btn");
const exportSelectedLedgerLabel = document.querySelector("#export-selected-ledger-label");
const exportSelectedLedgerSpinner = document.querySelector("#export-selected-ledger-spinner");
const selectionSummary = document.querySelector("#selection-summary");
const selectAllLedgerCheckbox = document.querySelector("#select-all-ledger");

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

const buildQueryString = () => {
  const params = new URLSearchParams();
  if (nameInput.value.trim()) {
    params.set("name", nameInput.value.trim());
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
      selectionSummary.textContent = `전체 ${selectedTotalCount}개 선택됨, 현재 목록에서 ${selectedVisibleCount}개 보임`;
    } else {
      selectionSummary.textContent = `전체 ${selectedTotalCount}개 선택됨, 현재 검색 결과에는 보이지 않습니다.`;
    }
  } else if (!visibleIds.length) {
    selectionSummary.textContent = "현재 보이는 항목이 없습니다.";
  } else {
    selectionSummary.textContent = "현재 선택된 항목이 없습니다. 체크하면 선택 엑셀로 내보낼 수 있습니다.";
  }

  selectAllLedgerCheckbox.checked =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  selectAllLedgerCheckbox.indeterminate =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
};

const renderLedgerRows = (items) => {
  ledgerBody.innerHTML = "";

  if (!items.length) {
    ledgerBody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-cell">저장된 매입장 데이터가 없습니다.</td>
      </tr>
    `;
    updateSelectionSummary();
    return;
  }

  items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.id = String(item.id);

    if (editingId === item.id) {
      tr.innerHTML = `
        <td class="check-col">
          <input class="row-select" data-id="${item.id}" type="checkbox" ${
            selectedIds.has(item.id) ? "checked" : ""
          } />
        </td>
        <td>${item.id}</td>
        <td>${escapeHtml(item.created_date || "-")}</td>
        <td><input data-field="name" type="text" value="${escapeHtml(item.name || "")}" /></td>
        <td><input data-field="spec" type="text" value="${escapeHtml(item.spec || "")}" /></td>
        <td><input data-field="quantity" type="text" value="${escapeHtml(formatEditableValue(item.quantity))}" /></td>
        <td><input data-field="cost" type="text" value="${escapeHtml(formatEditableValue(item.cost))}" /></td>
        <td><input data-field="wholesale" type="text" value="${escapeHtml(formatEditableValue(item.wholesale))}" /></td>
        <td><input data-field="retail" type="text" value="${escapeHtml(formatEditableValue(item.retail))}" /></td>
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
          <input class="row-select" data-id="${item.id}" type="checkbox" ${
            selectedIds.has(item.id) ? "checked" : ""
          } />
        </td>
        <td>${item.id}</td>
        <td>${escapeHtml(item.created_date || "-")}</td>
        <td>${escapeHtml(item.name || "-")}</td>
        <td>${escapeHtml(item.spec || "-")}</td>
        <td>${item.quantity ?? "-"}</td>
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
  ledgerFeedback.textContent = "매입장 데이터를 불러오고 있습니다.";

  try {
    const response = await fetch(`/api/purchase-ledger${buildQueryString()}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "ledger fetch failed");
    }

    currentItems = result.items || [];

    if (editingId !== null && !currentItems.some((item) => item.id === editingId)) {
      editingId = null;
    }

    renderLedgerRows(currentItems);
    ledgerFeedback.textContent = `${result.count || 0}개의 저장 항목을 불러왔습니다.`;
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = "매입장 목록을 불러오지 못했습니다.";
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

const exportAllLedger = async () => {
  exportAllLedgerButton.disabled = true;
  exportAllLedgerSpinner.classList.remove("hidden");
  exportAllLedgerLabel.textContent = "내보내는 중...";
  ledgerFeedback.textContent = "매입장 전체 데이터를 엑셀로 내보내고 있습니다.";

  try {
    const response = await fetch("/api/purchase-ledger/export");
    if (!response.ok) {
      throw new Error("ledger export failed");
    }

    await downloadResponseAsFile(response, "purchase-ledger.xlsx");
    ledgerFeedback.textContent = "매입장 전체 엑셀 파일을 내려받았습니다.";
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = "매입장 전체 엑셀 내보내기에 실패했습니다.";
  } finally {
    exportAllLedgerButton.disabled = false;
    exportAllLedgerSpinner.classList.add("hidden");
    exportAllLedgerLabel.textContent = "전체 엑셀";
  }
};

const exportSelectedLedger = async () => {
  const selected = [...selectedIds];
  const exportIds = selected.length ? selected : getVisibleIds();

  if (!exportIds.length) {
    ledgerFeedback.textContent = "내보낼 항목이 없습니다.";
    return;
  }

  exportSelectedLedgerButton.disabled = true;
  exportSelectedLedgerSpinner.classList.remove("hidden");
  exportSelectedLedgerLabel.textContent = "내보내는 중...";
  ledgerFeedback.textContent =
    selected.length > 0
      ? `${selected.length}개 선택 항목을 엑셀로 내보내고 있습니다.`
      : "체크된 항목이 없어서 현재 검색된 목록 전체를 엑셀로 내보내고 있습니다.";

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
      selected.length > 0
        ? "선택한 항목을 엑셀로 내보냈습니다."
        : "현재 검색된 목록을 엑셀로 내보냈습니다.";
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = "선택 항목 엑셀 내보내기에 실패했습니다.";
  } finally {
    exportSelectedLedgerButton.disabled = false;
    exportSelectedLedgerSpinner.classList.add("hidden");
    exportSelectedLedgerLabel.textContent = "선택 엑셀";
  }
};

const updateEntry = async (entryId, payload) => {
  ledgerFeedback.textContent = "매입장 내역을 저장하고 있습니다.";

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
  ledgerFeedback.textContent = "매입장 내역을 수정했습니다.";
  await loadLedger();
};

const deleteEntry = async (entryId) => {
  const confirmed = window.confirm("이 매입장 내역을 삭제할까요?");
  if (!confirmed) {
    return;
  }

  ledgerFeedback.textContent = "매입장 내역을 삭제하고 있습니다.";

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
  ledgerFeedback.textContent = "매입장 내역을 삭제했습니다.";
  await loadLedger();
};

const collectRowPayload = (rowElement) => {
  const payload = {};
  rowElement.querySelectorAll("input[data-field]").forEach((input) => {
    payload[input.dataset.field] = input.value.trim();
  });
  return payload;
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

sortSelect.addEventListener("change", () => {
  loadLedger();
});

directionSelect.addEventListener("change", () => {
  loadLedger();
});

clearFilterButton.addEventListener("click", () => {
  nameInput.value = "";
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
