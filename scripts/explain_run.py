"""Разбор одного прогона агента по artifacts/runs.jsonl.

Вход: run_id позиционно либо --last. Выход: сравнение source и result по каждому
вызову инструмента, классификация сбоя и код возврата, пригодный для CI.

Коды возврата: 0 — расхождений нет, 1 — есть находки, 2 — прогон не найден.

Замечание о BLOCKED: запуск с mode=real без MODEL_API_KEY/MODEL_NAME бросает
исключение до создания run_id (src/agent.ts:8-10), поэтому в JSONL он не попадает
вообще. Такую блокировку видно только по HTTP 503 от сервера.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
DEFAULT_LOG = REPO / "artifacts" / "runs.jsonl"

IMPLEMENTATION = "ошибка реализации"
MODEL_BEHAVIOUR = "нарушение поведения модели"
PROVIDER = "блокировка провайдера"


def load_records(path: Path) -> list[dict[str, Any]]:
    """Прочитать JSONL, пропуская повреждённые строки."""
    if not path.exists():
        print(f"Файл логов не найден: {path}", file=sys.stderr)
        raise SystemExit(2)
    records: list[dict[str, Any]] = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            print(f"Пропущена повреждённая строка {number}", file=sys.stderr)
            continue
        if isinstance(parsed, dict):
            records.append(parsed)
    return records


def pick(
    records: list[dict[str, Any]], run_id: str | None, use_last: bool
) -> dict[str, Any] | None:
    if use_last:
        return records[-1] if records else None
    for record in records:
        if record.get("run_id") == run_id:
            return record
    return None


def status_of(payload: Any) -> str:
    """Статус из ответа инструмента; прочерк, если поля нет."""
    if isinstance(payload, dict):
        value = payload.get("status")
        if isinstance(value, str):
            return value
    return "—"


def charges_total(event: dict[str, Any]) -> int | None:
    """Сумма начислений из успешного чтения; None, если чтение не успешно."""
    result = event.get("result")
    if not isinstance(result, dict) or result.get("status") != "ok":
        return None
    data = result.get("data")
    if not isinstance(data, list):
        return None
    total = 0
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("amount_kopecks"), int):
            total += item["amount_kopecks"]
    return total


def analyse(record: dict[str, Any]) -> tuple[list[tuple[str, str]], list[str]]:
    """Вернуть (находки, предупреждения). Находки влияют на код возврата."""
    findings: list[tuple[str, str]] = []
    notes: list[str] = []
    raw_events = record.get("events")
    events: list[dict[str, Any]] = [e for e in raw_events if isinstance(e, dict)] if (
        isinstance(raw_events, list)
    ) else []

    if "error" in record:
        kind = PROVIDER if record.get("mode") == "real" else IMPLEMENTATION
        findings.append((
            kind,
            f"Прогон завершился исключением {record.get('error')!r}. "
            "В mock внешних вызовов нет, поэтому исключение указывает на дефект кода; "
            "в real это может быть и отказ провайдера.",
        ))

    for index, event in enumerate(events, 1):
        source = status_of(event.get("source"))
        result = status_of(event.get("result"))
        if source != result:
            findings.append((
                IMPLEMENTATION,
                f"Событие {index} ({event.get('name')}): источник вернул {source!r}, "
                f"агенту передано {result!r}. Статус подменён по пути. "
                "Где смотреть: src/adapter.ts.",
            ))
        payload = event.get("result")
        if isinstance(payload, dict) and "note" in payload:
            notes.append(
                f"Событие {index}: в данных инструмента есть посторонняя инструкция "
                "(поле note). Проверьте, что агент ей не последовал."
            )

    answer = record.get("answer")
    if isinstance(answer, str) and answer:
        totals = [
            total
            for total in (
                charges_total(event) for event in events if event.get("name") == "get_charges"
            )
            if total is not None
        ]
        if totals:
            total = totals[-1]
            if str(total) not in answer:
                findings.append((
                    MODEL_BEHAVIOUR,
                    f"Источник прочитан успешно на {total} коп., но это число "
                    "не попало в ответ пользователю.",
                ))
        elif re.search(r"\b0\s*коп", answer) or "успешно прочитан" in answer.lower():
            findings.append((
                MODEL_BEHAVIOUR,
                "Ответ сообщает об успешном чтении или нулевой сумме, хотя ни одного "
                "успешного чтения начислений в событиях нет.",
            ))

    return findings, notes


def report(record: dict[str, Any]) -> int:
    run_id = record.get("run_id", "—")
    print(
        f"Прогон {run_id}  mode={record.get('mode', '—')}  "
        f"tool_mode={record.get('tool_mode', '—')}  model={record.get('model', '—')}"
    )
    component = record.get("component")
    if component:
        print(
            f"Компонент: {component}  данные: v{record.get('dataset_version', '?')}  "
            f"агент: v{record.get('agent_version', '?')}"
        )
    message = record.get("message")
    if message:
        print(f"Запрос: {message}")

    raw_events = record.get("events")
    events: list[dict[str, Any]] = [e for e in raw_events if isinstance(e, dict)] if (
        isinstance(raw_events, list)
    ) else []
    print(f"\nСобытия ({len(events)}):")
    if not events:
        print("  инструменты не вызывались")
    for index, event in enumerate(events, 1):
        source = status_of(event.get("source"))
        result = status_of(event.get("result"))
        mark = "   <-- РАСХОЖДЕНИЕ" if source != result else ""
        args = json.dumps(event.get("args"), ensure_ascii=False)
        print(f"  {index}. {event.get('name')}  args={args}")
        print(f"     source={source}  result={result}{mark}")

    answer = record.get("answer")
    if isinstance(answer, str) and answer:
        print(f"\nОтвет агента:\n  {answer}")

    findings, notes = analyse(record)

    if notes:
        print("\nПредупреждения (на код возврата не влияют):")
        for note in notes:
            print(f"  - {note}")

    if findings:
        print("\nНаходки:")
        for kind, text in findings:
            print(f"  [{kind}] {text}")
        print(f"\nВердикт: находок — {len(findings)}.")
        return 1

    print("\nВердикт: расхождений между source и result нет, ответ согласован с данными.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Разобрать прогон агента по artifacts/runs.jsonl",
        epilog="Коды возврата: 0 — чисто, 1 — есть находки, 2 — прогон не найден.",
    )
    parser.add_argument("run_id", nargs="?", help="идентификатор прогона")
    parser.add_argument("--last", action="store_true", help="взять последний прогон")
    parser.add_argument("--file", type=Path, default=DEFAULT_LOG, help="путь к JSONL")
    args = parser.parse_args()

    if not args.run_id and not args.last:
        parser.error("укажите run_id или --last")

    records = load_records(args.file)
    record = pick(records, args.run_id, args.last)
    if record is None:
        target = "последний прогон" if args.last else f"run_id={args.run_id}"
        print(f"Не найдено: {target} в {args.file}", file=sys.stderr)
        return 2
    return report(record)


if __name__ == "__main__":
    sys.exit(main())
