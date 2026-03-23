const ledgerBody = document.querySelector("#ledger-body");
const ledgerFeedback = document.querySelector("#ledger-feedback");
const refreshButton = document.querySelector("#refresh-ledger-btn");
const refreshLabel = document.querySelector("#refresh-ledger-label");
const refreshSpinner = document.querySelector("#refresh-ledger-spinner");
const nameInput = document.querySelector("#ledger-name");
const sortSelect = document.querySelector("#ledger-sort");
const directionSelect = document.querySelector("#ledger-direction");
const clearFilterButton = document.querySelector("#clear-ledger-filter-btn");
const exportLedgerButton = document.querySelector("#export-ledger-btn");
const exportLedgerLabel = document.querySelector("#export-ledger-label");
const exportLedgerSpinner = document.querySelector("#export-ledger-spinner");
let searchDebounceTimer = null;

const formatCurrency = (value) =>
  value === null || value === undefined || value === ""
    ? "-"
    : `${Number(value).toLocaleString("ko-KR")}원`;

const renderLedgerRows = (items) => {
  ledgerBody.innerHTML = "";

  if (!items.length) {
    ledgerBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">저장된 매입장 데이터가 없습니다.</td>
      </tr>
    `;
    return;
  }

  items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.created_date || "-"}</td>
      <td>${item.name || "-"}</td>
      <td>${item.spec || "-"}</td>
      <td>${item.quantity ?? "-"}</td>
      <td>${formatCurrency(item.cost)}</td>
      <td>${formatCurrency(item.wholesale)}</td>
      <td>${formatCurrency(item.retail)}</td>
    `;
    ledgerBody.appendChild(tr);
  });
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

const loadLedger = async () => {
  refreshButton.disabled = true;
  refreshSpinner.classList.remove("hidden");
  refreshLabel.textContent = "불러오는 중...";
  ledgerFeedback.textContent = "매입장 데이터를 불러오고 있습니다.";

  try {
    const response = await fetch(`/api/purchase-ledger${buildQueryString()}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error("ledger fetch failed");
    }

    renderLedgerRows(result.items || []);
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

const exportLedger = async () => {
  exportLedgerButton.disabled = true;
  exportLedgerSpinner.classList.remove("hidden");
  exportLedgerLabel.textContent = "내보내는 중...";
  ledgerFeedback.textContent = "조회 결과를 엑셀로 내보내고 있습니다.";

  try {
    const response = await fetch(`/api/purchase-ledger/export${buildQueryString()}`);
    if (!response.ok) {
      throw new Error("ledger export failed");
    }

    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "purchase-ledger.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    ledgerFeedback.textContent = "매입장 엑셀 파일을 다운로드했습니다.";
  } catch (error) {
    console.error(error);
    ledgerFeedback.textContent = "매입장 엑셀 내보내기에 실패했습니다.";
  } finally {
    exportLedgerButton.disabled = false;
    exportLedgerSpinner.classList.add("hidden");
    exportLedgerLabel.textContent = "엑셀로 내보내기";
  }
};

refreshButton.addEventListener("click", () => {
  loadLedger();
});

const scheduleLedgerReload = () => {
  window.clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    loadLedger();
  }, 180);
};

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
  loadLedger();
});

exportLedgerButton.addEventListener("click", () => {
  exportLedger();
});

loadLedger();
