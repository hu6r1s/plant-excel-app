from io import BytesIO
from pathlib import Path
import re
import sqlite3
from typing import Any

from fastapi import FastAPI, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook
from openpyxl.styles import Font
import numpy as np
from paddleocr import PaddleOCR
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "plant_label_helper.db"

app = FastAPI(title="Plant Label Helper")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class PlantRow(BaseModel):
    name: str = ""
    spec: str = ""
    cost: int | float | str = ""
    wholesale: int | float | str = ""
    retail: int | float | str = ""
    quantity: int | float | str = ""


NUMERIC_WITH_COMMAS = re.compile(r"^\d{1,3}(,\d{3})+$")
NUMERIC_PLAIN_MONEY = re.compile(r"^\d{4,7}$")
PURE_NUMBER = re.compile(r"^\d+$")
SPEC_TOKEN = re.compile(r"^\d+(?:/\d+)?$")
OCR_ENGINE: PaddleOCR | None = None


def get_ocr_engine() -> PaddleOCR:
    global OCR_ENGINE
    if OCR_ENGINE is None:
        OCR_ENGINE = PaddleOCR(
            use_angle_cls=True,
            lang="korean",
            use_gpu=False,
            show_log=False,
        )
    return OCR_ENGINE


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS purchase_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                spec TEXT,
                quantity REAL,
                cost REAL,
                wholesale REAL,
                retail REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()


init_db()


def normalize_text(value: str) -> str:
    return (
        str(value)
        .replace("O", "0")
        .replace("o", "0")
        .replace("l", "1")
        .replace("|", "1")
        .strip()
    )


def parse_money_token(token: str) -> int | None:
    cleaned = normalize_text(token).replace(" ", "")
    if NUMERIC_WITH_COMMAS.match(cleaned):
        return int(cleaned.replace(",", ""))
    if NUMERIC_PLAIN_MONEY.match(cleaned):
        return int(cleaned)
    return None


def parse_quantity_token(token: str) -> int | None:
    cleaned = normalize_text(token)
    if not PURE_NUMBER.match(cleaned):
        return None
    if len(cleaned) > 3:
        return None
    return int(cleaned)


def is_name_token(token: str) -> bool:
    cleaned = normalize_text(token)
    if not cleaned:
        return False
    if SPEC_TOKEN.match(cleaned):
        return False
    if NUMERIC_WITH_COMMAS.match(cleaned):
        return False
    if PURE_NUMBER.match(cleaned):
        return False
    return bool(re.search(r"[가-힣A-Za-z]", cleaned))


def parse_spec_divisor(spec: str) -> int | None:
    cleaned = normalize_text(spec)
    match = re.match(r"^(\d+)(?:/\d+)?$", cleaned)
    if not match:
        return None
    value = int(match.group(1))
    return value if value > 0 else None


def parse_number(value: int | float | str) -> int | float | str:
    if isinstance(value, (int, float)):
        return value
    cleaned = normalize_text(value)
    if not cleaned:
        return ""
    return float(cleaned) if cleaned.replace(".", "", 1).isdigit() else value


def build_purchase_workbook(rows: list[dict[str, Any]]) -> BytesIO:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Plant Labels"

    header = ["식물 이름", "가격", "매수"]
    sheet.append(header)

    for cell in sheet[1]:
        cell.font = Font(bold=True)

    for row in rows:
        name = str(row.get("name", "")).strip()
        if not name:
            continue

        quantity = parse_number(row.get("quantity", ""))
        retail = parse_number(row.get("retail", ""))
        divisor = parse_spec_divisor(str(row.get("spec", "")))
        export_quantity: int | float | str = quantity
        if divisor and isinstance(quantity, (int, float)):
            export_quantity = int(round(quantity / divisor))
        elif isinstance(quantity, float):
            export_quantity = int(round(quantity))

        sheet.append([name, retail, export_quantity])

    sheet.column_dimensions["A"].width = 28
    sheet.column_dimensions["B"].width = 14
    sheet.column_dimensions["C"].width = 10

    for row in sheet.iter_rows(min_row=2, min_col=2, max_col=3):
        for cell in row:
            if isinstance(cell.value, (int, float)):
                if cell.column == 2:
                    cell.number_format = '#,##0"원"'
                else:
                    cell.number_format = "0"

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return buffer


def build_purchase_ledger_workbook(rows: list[dict[str, Any]]) -> BytesIO:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Purchase Ledger"

    header = ["ID", "저장날짜", "식물 이름", "규격", "수량", "단가", "도매가", "소매가"]
    sheet.append(header)

    for cell in sheet[1]:
        cell.font = Font(bold=True)

    for row in rows:
        sheet.append(
            [
                row.get("id", ""),
                row.get("created_date", ""),
                row.get("name", ""),
                row.get("spec", ""),
                parse_number(row.get("quantity", "")),
                parse_number(row.get("cost", "")),
                parse_number(row.get("wholesale", "")),
                parse_number(row.get("retail", "")),
            ]
        )

    sheet.column_dimensions["A"].width = 10
    sheet.column_dimensions["B"].width = 14
    sheet.column_dimensions["C"].width = 28
    sheet.column_dimensions["D"].width = 10
    sheet.column_dimensions["E"].width = 10
    sheet.column_dimensions["F"].width = 14
    sheet.column_dimensions["G"].width = 14
    sheet.column_dimensions["H"].width = 14

    for row in sheet.iter_rows(min_row=2, min_col=5, max_col=8):
        for cell in row:
            if isinstance(cell.value, (int, float)):
                if cell.column == 5:
                    cell.number_format = "0"
                else:
                    cell.number_format = '#,##0"원"'

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return buffer


def parse_ocr_rows(lines: list[dict[str, Any]]) -> list[dict[str, int | str]]:
    items: list[dict[str, int | str]] = []
    seen: set[tuple[str, int, int]] = set()

    for line in lines:
        tokens = [normalize_text(token) for token in line["tokens"]]
        tokens = [token for token in tokens if token]
        if len(tokens) < 4:
            continue

        money_positions = [
            (idx, parse_money_token(token))
            for idx, token in enumerate(tokens)
            if parse_money_token(token) is not None
        ]
        if len(money_positions) < 2:
            continue

        first_money_index, unit_price = money_positions[0]
        if unit_price is None:
            continue

        quantity = None
        quantity_index = None
        for idx in range(first_money_index - 1, -1, -1):
            candidate = parse_quantity_token(tokens[idx])
            if candidate is not None:
                quantity = candidate
                quantity_index = idx
                break

        if quantity is None or quantity_index is None:
            continue

        spec = ""
        name_parts: list[str] = []
        for token in tokens[:quantity_index]:
            if SPEC_TOKEN.match(token):
                spec = token
                break
            if is_name_token(token):
                name_parts.append(token)

        name = " ".join(name_parts).strip()
        if not name:
            continue

        if len(name) <= 1:
            continue

        row_key = (name, unit_price, quantity)
        if row_key in seen:
            continue
        seen.add(row_key)

        items.append(
            {
                "name": name,
                "spec": spec,
                "cost": unit_price,
                "wholesale": round(unit_price * 1.3),
                "retail": round(unit_price * 1.3) * 2,
                "quantity": quantity,
            }
        )

    return items


def paddle_result_to_lines(result: Any) -> list[dict[str, Any]]:
    raw_lines: list[Any]
    if isinstance(result, list) and result and isinstance(result[0], list):
        raw_lines = result[0]
    elif isinstance(result, list):
        raw_lines = result
    else:
        raw_lines = []

    processed: list[dict[str, Any]] = []
    for entry in raw_lines:
        if not isinstance(entry, list) or len(entry) < 2:
            continue

        box, rec = entry[0], entry[1]
        if not isinstance(rec, (list, tuple)) or len(rec) < 2:
            continue

        text = normalize_text(str(rec[0]))
        score = float(rec[1])
        if not text or score < 0.35:
            continue

        if not isinstance(box, list) or len(box) < 4:
            continue

        xs = [int(point[0]) for point in box if isinstance(point, list) and len(point) >= 2]
        ys = [int(point[1]) for point in box if isinstance(point, list) and len(point) >= 2]
        if not xs or not ys:
            continue

        processed.append(
            {
                "text": text,
                "left": min(xs),
                "right": max(xs),
                "top": min(ys),
                "bottom": max(ys),
                "center_y": (min(ys) + max(ys)) // 2,
            }
        )

    processed.sort(key=lambda item: (item["center_y"], item["left"]))

    lines: list[dict[str, Any]] = []
    for item in processed:
        if not lines or abs(item["center_y"] - lines[-1]["center_y"]) > 28:
            lines.append({"center_y": item["center_y"], "tokens": [item["text"]]})
        else:
            lines[-1]["tokens"].append(item["text"])

    return lines


def build_ocr_variants(image: Image.Image) -> list[Image.Image]:
    rgb = image.convert("RGB")
    gray = ImageOps.autocontrast(image.convert("L"))
    threshold = gray.point(lambda value: 255 if value > 180 else 0)
    sharpened = gray.filter(ImageFilter.SHARPEN)
    return [
        rgb,
        ImageOps.autocontrast(rgb),
        ImageOps.colorize(gray, black="black", white="white").convert("RGB"),
        ImageOps.colorize(sharpened, black="black", white="white").convert("RGB"),
        ImageOps.colorize(threshold, black="black", white="white").convert("RGB"),
    ]


def extract_invoice_items(image: Image.Image) -> tuple[list[dict[str, int | str]], int]:
    base = ImageOps.exif_transpose(image)
    rotations = [
        (0, base),
        (90, base.rotate(90, expand=True)),
        (270, base.rotate(270, expand=True)),
        (180, base.rotate(180, expand=True)),
    ]

    best_items: list[dict[str, int | str]] = []
    best_rotation = 0
    best_score = (-1, -1)
    ocr = get_ocr_engine()

    for rotation, rotated_image in rotations:
        for candidate in build_ocr_variants(rotated_image):
            result = ocr.ocr(np.array(candidate), cls=True)
            lines = paddle_result_to_lines(result)
            items = parse_ocr_rows(lines)
            score = (len(items), sum(len(str(item["name"])) for item in items))
            if score > best_score:
                best_items = items
                best_rotation = rotation
                best_score = score

    return best_items, best_rotation


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/ledger")
async def ledger_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "ledger.html")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/ocr/preview")
async def ocr_preview(file: UploadFile) -> JSONResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix == ".pdf":
        return JSONResponse(
            {
                "filename": file.filename,
                "message": "현재는 이미지 OCR만 지원합니다. PDF 지원은 다음 단계에서 추가할 수 있습니다.",
                "items": [],
            },
            status_code=400,
        )

    try:
        image = Image.open(BytesIO(await file.read()))
    except UnidentifiedImageError:
        return JSONResponse(
            {
                "filename": file.filename,
                "message": "이미지 파일을 읽지 못했습니다.",
                "items": [],
            },
            status_code=400,
        )

    try:
        items, rotation = extract_invoice_items(image)
    except Exception as error:
        return JSONResponse(
            {
                "filename": file.filename,
                "message": f"PaddleOCR 실행에 실패했습니다: {error}",
                "items": [],
            },
            status_code=500,
        )

    message = (
        f"{len(items)}개 품목을 인식했습니다. "
        f"품목명, 단가, 수량만 가져왔고 회전 보정은 {rotation}도로 적용했습니다."
        if items
        else "품목명을 충분히 읽지 못했습니다. 사진을 반듯하게 촬영하거나 대비를 높여 다시 시도해 보세요."
    )

    return JSONResponse(
        {
            "filename": file.filename,
            "message": message,
            "items": items,
        }
    )


@app.post("/api/export/xlsx")
async def export_xlsx(rows: list[PlantRow]) -> Response:
    buffer = build_purchase_workbook([row.model_dump() for row in rows])

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="plant-labels.xlsx"'
        },
    )


@app.post("/api/purchase-ledger")
async def save_purchase_ledger(rows: list[PlantRow]) -> JSONResponse:
    normalized_rows: list[tuple[str, str, float | None, float | None, float | None, float | None]] = []

    for row in rows:
        if not row.name.strip():
            continue

        quantity = parse_number(row.quantity)
        cost = parse_number(row.cost)
        wholesale = parse_number(row.wholesale)
        retail = parse_number(row.retail)

        normalized_rows.append(
            (
                row.name.strip(),
                normalize_text(row.spec),
                float(quantity) if isinstance(quantity, (int, float)) else None,
                float(cost) if isinstance(cost, (int, float)) else None,
                float(wholesale) if isinstance(wholesale, (int, float)) else None,
                float(retail) if isinstance(retail, (int, float)) else None,
            )
        )

    if not normalized_rows:
        return JSONResponse(
            {"message": "저장할 데이터가 없습니다.", "saved_count": 0},
            status_code=400,
        )

    with sqlite3.connect(DB_PATH) as connection:
        connection.executemany(
            """
            INSERT INTO purchase_entries (name, spec, quantity, cost, wholesale, retail)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            normalized_rows,
        )
        connection.commit()

    return JSONResponse(
        {
            "message": f"{len(normalized_rows)}개 항목을 매입장에 저장했습니다.",
            "saved_count": len(normalized_rows),
            "db_path": str(DB_PATH),
        }
    )


def build_purchase_ledger_query(
    name: str | None, sort: str | None, direction: str | None
) -> tuple[str, list[str]]:
    where_clauses: list[str] = []
    params: list[str] = []

    if name:
        where_clauses.append("name LIKE ?")
        params.append(f"%{name.strip()}%")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    sort_key = (sort or "date").lower()
    sort_direction = "ASC" if (direction or "desc").lower() == "asc" else "DESC"

    if sort_key == "id":
        order_sql = f"ORDER BY id {sort_direction}"
    elif sort_key == "name":
        order_sql = f"ORDER BY name COLLATE NOCASE {sort_direction}, id DESC"
    else:
        order_sql = f"ORDER BY created_at {sort_direction}, id DESC"

    query = (
        """
        SELECT id, name, spec, quantity, cost, wholesale, retail,
               date(datetime(created_at, '+9 hours')) AS created_date
        FROM purchase_entries
        """
        + where_sql
        + " "
        + order_sql
    )
    return query, params


@app.get("/api/purchase-ledger")
async def get_purchase_ledger(
    name: str | None = None, sort: str | None = None, direction: str | None = None
) -> JSONResponse:
    query, params = build_purchase_ledger_query(name, sort, direction)

    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(query, params).fetchall()

    return JSONResponse(
        {
            "items": [dict(row) for row in rows],
            "count": len(rows),
        }
    )


@app.get("/api/purchase-ledger/export")
async def export_purchase_ledger(
    name: str | None = None, sort: str | None = None, direction: str | None = None
) -> Response:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT id,
                   date(datetime(created_at, '+9 hours')) AS created_date,
                   name,
                   spec,
                   quantity,
                   cost,
                   wholesale,
                   retail
            FROM purchase_entries
            ORDER BY id DESC
            """
        ).fetchall()

    buffer = build_purchase_ledger_workbook([dict(row) for row in rows])

    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="purchase-ledger.xlsx"'
        },
    )
