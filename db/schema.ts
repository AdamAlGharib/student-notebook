import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const records = sqliteTable(
  'records',
  {
    owner: text('owner').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    revision: integer('revision').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.key] })],
);
export const notes = sqliteTable(
  'notes',
  {
    owner: text('owner').notNull(),
    id: text('id').notNull(),
    course: text('course').notNull(),
    date: text('date').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    version: integer('version').notNull(),
    sourceHash: text('source_hash').notNull(),
    packageHash: text('package_hash').notNull(),
    objectKey: text('object_key').notNull(),
    excerpt: text('excerpt').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.id] })],
);
export const revisions = sqliteTable(
  'note_revisions',
  {
    owner: text('owner').notNull(),
    noteId: text('note_id').notNull(),
    version: integer('version').notNull(),
    objectKey: text('object_key').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.noteId, t.version] })],
);
export const files = sqliteTable(
  'files',
  {
    owner: text('owner').notNull(),
    id: text('id').notNull(),
    noteId: text('note_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    objectKey: text('object_key').notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.id] })],
);
