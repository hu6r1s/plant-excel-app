# Plant Label Helper

로컬에서만 사용하는 식물 라벨 데이터 입력 도구입니다.

## 왜 Python + FastAPI인가

- 로컬 실행이 간단합니다.
- 이후 OCR 기능을 붙일 때 Python 생태계가 가장 유리합니다.
- 브라우저 UI는 그대로 두고 서버 쪽에 OCR, PDF 파싱, 엑셀 생성 기능을 점진적으로 추가할 수 있습니다.

## 현재 기능

- 표 형태의 빠른 대량 입력
- 행 추가, 복제, 삭제
- 벌크 붙여넣기
- 축약 단가 입력 지원
- 도매가/소매가 자동 계산
- XLSX 다운로드
- 입력 내용 로컬 저장
- 향후 OCR 업로드 자리 확보

## 실행 방법

```bash
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

브라우저에서 `http://127.0.0.1:8000` 으로 접속합니다.

`py` 명령도 없다면 Windows에 Python 3.11 이상이 설치되지 않은 상태일 가능성이 큽니다.

## 쉬운 실행 방법

컴퓨터를 잘 모르는 사용자는 아래 파일만 더블클릭하면 됩니다.

- 처음 실행: `install_and_run.bat`
- 그 다음부터: `run_plant_label_helper.bat`

첫 실행 시에는 필요한 패키지를 설치하므로 시간이 조금 걸릴 수 있습니다.
실행하면 작은 실행 창이 뜨고, 서버가 자동으로 켜진 뒤 브라우저가 자동으로 열립니다.
작업을 마치면 실행 창에서 `프로그램 종료` 버튼만 누르면 됩니다.

## EXE 만들기

윈도우 실행 파일로 만들려면 아래 파일을 실행합니다.

- `build_exe.bat`

완료되면 아래 경로에 실행 파일이 생성됩니다.

```text
dist\PlantLabelHelper\PlantLabelHelper.exe
```

## OCR 확장 방향

향후 아래 방식으로 확장하기 좋습니다.

1. 계산서 PDF/이미지 업로드
2. Python 서버에서 OCR 실행
3. 추출된 텍스트를 식물명/가격/매수일 구조로 정규화
4. 검수용 미리보기 후 표에 자동 반영

추천 OCR 후보:

- `PaddleOCR`: 한글 문서 대응이 비교적 좋음
- `EasyOCR`: 도입이 단순함
- `Tesseract`: 무료이지만 전처리 품질 영향이 큼
- 클라우드 OCR: 정확도는 좋지만 로컬 전용 요구와는 덜 맞음

## 폴더 구조

```text
app/
  main.py
  static/
    index.html
    styles.css
    app.js
```
