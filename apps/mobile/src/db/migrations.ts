/**
 * Планировщик миграций схемы.
 *
 * До этого миграции были только `CREATE TABLE IF NOT EXISTS` — новых колонок
 * в существующую таблицу добавить было нечем, и любое расширение словаря
 * означало бы потерю данных у тех, кто уже пользуется приложением.
 *
 * Здесь только чистая функция (никакого expo-sqlite), поэтому она покрыта
 * тестами: цена ошибки — снесённый словарь на телефоне.
 */

/** Описание колонки: SQL-тип с ограничениями, как в ALTER TABLE. */
export type ColumnSpec = Record<string, string>;

/**
 * Возвращает `ALTER TABLE … ADD COLUMN` только для отсутствующих колонок.
 *
 * Намеренно не умеет DROP и не меняет типы: единственная безопасная операция
 * в SQLite без пересоздания таблицы — добавление колонки.
 */
export function planColumnMigrations(
  table: string,
  existingColumns: string[],
  desired: ColumnSpec,
): string[] {
  const have = new Set(existingColumns);
  const out: string[] = [];

  for (const [name, definition] of Object.entries(desired)) {
    if (have.has(name)) continue;
    assertSafeIdentifier(table);
    assertSafeIdentifier(name);
    assertSafeDefinition(name, definition);
    out.push(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition};`);
  }

  return out;
}

function assertSafeIdentifier(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
}

/**
 * SQLite не умеет добавлять NOT NULL колонку без DEFAULT — существующие строки
 * нечем заполнить. Ловим это на этапе разработки, а не на телефоне юзера.
 */
function assertSafeDefinition(name: string, definition: string): void {
  if (definition.includes(";")) {
    throw new Error(`Unsafe column definition for ${name}: ${definition}`);
  }
  const isNotNull = /\bNOT\s+NULL\b/i.test(definition);
  const hasDefault = /\bDEFAULT\b/i.test(definition);
  if (isNotNull && !hasDefault) {
    throw new Error(
      `Column ${name} is NOT NULL without DEFAULT — SQLite cannot add it to an existing table`,
    );
  }
}

/** Колонки, добавленные к `vocabulary` после MVP. */
export const VOCABULARY_COLUMNS: ColumnSpec = {
  // Что за карточка: фраза (выделение) или весь чанк целиком.
  kind: "TEXT NOT NULL DEFAULT 'phrase'",
  // Английское определение — для режима карточек «толковый словарь».
  definition_en: "TEXT",
  // Дословный перевод — показываем, только когда он расходится с обычным.
  literal: "TEXT",
  // Пояснение про идиому.
  note: "TEXT",
  // Тайминги исходного чанка → «▶ Послушать» прыгает в нужное место видео.
  start_sec: "REAL",
  end_sec: "REAL",
  chunk_idx: "INTEGER",
  // SRS: когда последний раз повторяли и сколько раз забывали.
  last_reviewed_at: "INTEGER",
  lapses: "INTEGER NOT NULL DEFAULT 0",
};
