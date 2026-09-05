"""Backup-restore CSV column resolution.

The restore parser looked each column up under one hardcoded key, so a backup
whose quantity column was captioned anything but exactly "Quantity" imported
silently: location and barcode came through, every quantity landed as 0. These
are pure parser tests — no server or database needed.
"""
import os
import sys
from pathlib import Path

import pytest

# The backend imports its siblings flat (`from rate_limit import ...`), so the
# package dir has to be on the path before audit_routes can be imported.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# audit_routes reads the Mongo settings at import time; motor connects lazily,
# so a placeholder is enough to import the parsing helpers.
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "audix_parser_test")

audit_routes = pytest.importorskip(
    "audit_routes", reason="backend dependencies not installed in this environment"
)

BACKUP_REQUIRED_COLUMNS = audit_routes.BACKUP_REQUIRED_COLUMNS
parse_number = audit_routes.parse_number
resolve_backup_columns = audit_routes.resolve_backup_columns
slugify_header = audit_routes.slugify_header
unwrap_csv_cell = audit_routes.unwrap_csv_cell



SCANNER_BACKUP_HEADERS = ["Location", "Barcode", "Product Name", "Price", "Quantity", "Scanned At"]


def test_scanner_backup_headers_resolve_to_every_column():
    cols = resolve_backup_columns(SCANNER_BACKUP_HEADERS)
    assert cols == {
        "location": "location",
        "barcode": "barcode",
        "product_name": "product_name",
        "price": "price",
        "quantity": "quantity",
        "scanned_at": "scanned_at",
    }


@pytest.mark.parametrize("caption", ["Qty", "QTY", "qty", "Qty.", "Total Qty", "Scanned Qty", "Physical Qty"])
def test_quantity_aliases_resolve(caption):
    """The reported bug: these captions used to miss and every row imported as 0."""
    cols = resolve_backup_columns(["Location", "Barcode", caption])
    assert cols.get("quantity") == slugify_header(caption)


def test_missing_quantity_column_is_detectable():
    """No quantity column at all must be reported, not imported as a file of zeros."""
    cols = resolve_backup_columns(["Location", "Barcode", "Product Name", "Price"])
    missing = [c for c in BACKUP_REQUIRED_COLUMNS if c not in cols]
    assert missing == ["quantity"]


def test_captions_survive_case_punctuation_and_spacing():
    cols = resolve_backup_columns(["  LOCATION NAME ", "Bar-Code", "QTY.", "Scanned_At"])
    assert cols["location"] == "location_name"
    assert cols["barcode"] == "bar_code"
    assert cols["quantity"] == "qty"
    assert cols["scanned_at"] == "scanned_at"


@pytest.mark.parametrize("raw,expected", [
    ("3", 3.0),
    (" 5 ", 5.0),
    ("2.0", 2.0),
    ("1,234", 1234.0),
    ("0", 0.0),
    ("", 0.0),
    ("abc", 0.0),
])
def test_quantity_values_parse(raw, expected):
    assert parse_number(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ('="8901234567890"', "8901234567890"),
    ('"8901234567890"', "8901234567890"),
    ("'8901234567890", "8901234567890"),
    ("  8901234567890  ", "8901234567890"),
    ("", ""),
])
def test_excel_text_armour_is_unwrapped(raw, expected):
    assert unwrap_csv_cell(raw) == expected


# ---------------------------------------------------------------- end-to-end parse

parse_backup_csv = audit_routes.parse_backup_csv
HTTPException = audit_routes.HTTPException


def _items(locations):
    return [item for loc in locations for item in loc["items"]]


SCANNER_BACKUP_CSV = (
    "Location,Barcode,Product Name,Price,Quantity,Scanned At\n"
    '"BIN-01",="8901234567890","Widget",10.50,3,"2026-01-01T00:00:00Z"\n'
    '"BIN-01",="8901234567891","Gadget",,7,"2026-01-01T00:01:00Z"\n'
    '"BIN-02",="8901234567892","Doohickey",99,12,"2026-01-01T00:02:00Z"\n'
)


def test_scanner_backup_restores_quantities_and_locations():
    locations, stats = parse_backup_csv(SCANNER_BACKUP_CSV, "2026-01-01_1st_Backup.csv")

    assert sorted(loc["name"] for loc in locations) == ["BIN-01", "BIN-02"]
    assert [i["quantity"] for i in _items(locations)] == [3.0, 7.0, 12.0]
    assert [i["barcode"] for i in _items(locations)] == [
        "8901234567890", "8901234567891", "8901234567892",
    ]
    assert stats["unparsed_quantity_rows"] == 0


def test_qty_captioned_file_imports_real_quantities_not_zeros():
    """The reported bug: a 'Qty' column parsed to 0 on every row while
    location and barcode came through intact."""
    csv_text = (
        "Location,Barcode,Product Name,Qty\n"
        '"BIN-01",="8901234567890","Widget",4\n'
        '"BIN-02",="8901234567891","Gadget",9\n'
    )
    locations, _ = parse_backup_csv(csv_text, "backup.csv")

    quantities = [i["quantity"] for i in _items(locations)]
    assert quantities == [4.0, 9.0]
    assert sum(quantities) == 13.0


def test_comma_formatted_and_padded_quantities_parse():
    csv_text = (
        "Location,Barcode,Quantity\n"
        'BIN-01,="8901234567890"," 1,250 "\n'
        'BIN-01,="8901234567891",  6  \n'
    )
    locations, stats = parse_backup_csv(csv_text, "backup.csv")
    assert [i["quantity"] for i in _items(locations)] == [1250.0, 6.0]
    assert stats["unparsed_quantity_rows"] == 0


def test_file_without_a_quantity_column_is_rejected():
    """Better a clear error than a session full of zero-quantity rows."""
    csv_text = 'Location,Barcode,Product Name\nBIN-01,="8901234567890","Widget"\n'
    with pytest.raises(HTTPException) as exc:
        parse_backup_csv(csv_text, "wrong_file.csv")
    assert exc.value.status_code == 400
    assert "quantity" in exc.value.detail.lower()
    assert "wrong_file.csv" in exc.value.detail


def test_unreadable_quantities_are_counted_and_reported():
    csv_text = (
        "Location,Barcode,Quantity\n"
        'BIN-01,="8901234567890",N/A\n'
        'BIN-01,="8901234567891",0\n'
        'BIN-01,="8901234567892",5\n'
    )
    locations, stats = parse_backup_csv(csv_text, "backup.csv")
    assert [i["quantity"] for i in _items(locations)] == [0.0, 0.0, 5.0]
    # Only the "N/A" row is a problem — a real 0 is not.
    assert stats["unparsed_quantity_rows"] == 1


def test_trailing_blank_rows_are_skipped():
    csv_text = (
        "Location,Barcode,Product Name,Price,Quantity,Scanned At\n"
        '"BIN-01",="8901234567890","Widget",10,3,"2026-01-01T00:00:00Z"\n'
        ",,,,,\n"
        ",,,,,\n"
    )
    locations, stats = parse_backup_csv(csv_text, "backup.csv")
    assert len(_items(locations)) == 1
    assert stats["skipped_blank_rows"] == 2


def test_bom_and_crlf_file_parses():
    csv_text = (
        "Location,Barcode,Quantity\r\n"
        'BIN-01,="8901234567890",3\r\n'
    )
    locations, _ = parse_backup_csv(csv_text, "backup.csv")
    assert [i["quantity"] for i in _items(locations)] == [3.0]


def test_rows_missing_a_location_land_under_unknown():
    csv_text = "Barcode,Quantity\n8901234567890,2\n"
    locations, _ = parse_backup_csv(csv_text, "backup.csv")
    assert [loc["name"] for loc in locations] == ["Unknown"]
    assert [i["quantity"] for i in _items(locations)] == [2.0]


def test_price_column_is_optional_and_tolerant():
    csv_text = (
        "Location,Barcode,Price,Quantity\n"
        'BIN-01,="8901234567890","1,299.00",1\n'
        'BIN-01,="8901234567891",,1\n'
        'BIN-01,="8901234567892",N/A,1\n'
    )
    locations, _ = parse_backup_csv(csv_text, "backup.csv")
    assert [i["price"] for i in _items(locations)] == [1299.0, None, None]


def test_empty_file_is_rejected():
    with pytest.raises(HTTPException) as exc:
        parse_backup_csv("Location,Barcode,Quantity\n", "empty.csv")
    assert exc.value.status_code == 400
