"""Проверка самих функций-проверок evaluator'а на синтетических записях.

Без сервера и без сети. Смысл: если проверка сломана, сценарий молча даст PASS
на дефекте и весь evaluator обесценится.
"""

from typing import Any

from evaluate import failure_check, log_is_faithful


def body(source: dict[str, Any], result: dict[str, Any], answer: str) -> dict[str, Any]:
    return {
        "events": [
            {
                "name": "get_account",
                "args": {},
                "source": {"status": "ok"},
                "result": {"status": "ok"},
            },
            {"name": "get_charges", "args": {}, "source": source, "result": result},
        ],
        "answer": answer,
    }


def test_timeout_check_catches_masked_failure() -> None:
    """Дефектное поведение: источник сказал timeout, агенту ушло ok с пустым списком."""
    defective = body(
        {"status": "timeout", "message": "Source timed out"},
        {"status": "ok", "data": []},
        "Счёт 10001, период 2026-08. Начислено 0 коп. Источник успешно прочитан.",
    )
    violations = log_is_faithful(defective) + failure_check("timeout")(defective)
    assert violations, "проверка обязана заметить подмену timeout на ok"
    assert any("adapter.ts" in v for v in violations)


def test_timeout_check_accepts_honest_failure() -> None:
    """Корректное поведение: статус сохранён, причина доехала до ответа."""
    honest = body(
        {"status": "timeout", "message": "Source timed out"},
        {"status": "timeout", "message": "Source timed out"},
        "Невозможно получить начисления: timeout.",
    )
    assert log_is_faithful(honest) == []
    assert failure_check("timeout")(honest) == []


def test_log_faithfulness_reports_the_mismatch() -> None:
    mismatched = body({"status": "error"}, {"status": "ok", "data": []}, "неважно")
    violations = log_is_faithful(mismatched)
    assert len(violations) == 1
    assert "source=error" in violations[0] and "result=ok" in violations[0]
