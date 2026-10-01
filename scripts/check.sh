#!/usr/bin/env bash
# Одна команда обязательных проверок (PDF стр. 4).
# Шаги 1-3 идут в контейнере на закреплённом Node 24.14.0; шаги 4-7 на хосте,
# потому что в образе нет Python. Evaluator ходит в контейнер по HTTP на 8091.
# Первый же провал прерывает скрипт, код возврата доходит до вызывающего.
set -euo pipefail
cd "$(dirname "$0")/.."

echo '==> 1/7 сборка и запуск контейнера'
docker compose up -d --build --wait

echo '==> 2/7 типы TypeScript (в контейнере)'
docker compose exec -T agent npm run typecheck

echo '==> 3/7 тесты TypeScript (в контейнере)'
docker compose exec -T agent npm test

echo '==> 4/7 lint Python'
uv run --group dev ruff check .

echo '==> 5/7 типы Python'
uv run --group dev ty check scripts

echo '==> 6/7 тесты функций-проверок'
uv run --group dev python -m pytest -q

echo '==> 7/7 сценарии продуктового агента'
uv run python scripts/evaluate.py

echo
echo 'Все обязательные проверки пройдены.'
echo 'Контейнер оставлен запущенным для разбора; остановить: docker compose down'
