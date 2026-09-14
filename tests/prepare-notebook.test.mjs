import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { decrypt, importKey } from '../lib/notebook-model.ts';
import { encryptSnapshot, prepareNotebook, readUnlockKey } from '../scripts/prepare-notebook.mjs';

const snapshot = () => ({
  schemaVersion: 2, notebookId: 'test-notebook', snapshotId: 'test-snapshot', publishedAt: '2026-09-14T16:00:00Z',
  academic: { courses: [{ id: 'TEST1000', name: 'Unicode: λ → résumé' }], assessments: [], excluded: [], finals: [], series: [] },
  state: { completed: [], tasks: [], grades: [], practice: {} }, lectures: {}, annotations: {}, files: {},
});

test('Node encryption decrypts with the browser model, including Unicode', async () => {
  const raw = randomBytes(32);
  const key = await importKey(raw.toString('base64url'));
  const value = snapshot();
  const envelope = encryptSnapshot(value, raw);
  assert.equal(envelope.format, 'study-notebook.aes-gcm.v1');
  assert.equal(Buffer.from(envelope.iv, 'base64').length, 12);
  assert.equal(Buffer.from(envelope.data, 'base64').length, Buffer.byteLength(JSON.stringify(value)) + 16);
  assert.deepEqual(await decrypt(envelope, key), value);
  const other = encryptSnapshot(value, raw);
  assert.notEqual(envelope.iv, other.iv);
  assert.notEqual(envelope.data, other.data);
  const changed = Buffer.from(envelope.data, 'base64');
  changed[0] ^= 1;
  await assert.rejects(decrypt({ ...envelope, data: changed.toString('base64') }, key));
  await assert.rejects(decrypt(envelope, await importKey(randomBytes(32).toString('base64'))));
});

test('preparation reads private files outside the repository and preserves output on invalid input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prepare-notebook-test-'));
  try {
    const projectRoot = join(directory, 'repository');
    const privateDirectory = join(directory, 'private');
    await mkdir(projectRoot);
    await mkdir(privateDirectory);
    const source = join(privateDirectory, 'notebook.json');
    const key = join(privateDirectory, 'unlock-key.json');
    const raw = randomBytes(32);
    await writeFile(source, JSON.stringify(snapshot()));
    await writeFile(key, JSON.stringify({ format: 'study-notebook.key.v1', key: raw.toString('base64url') }));
    const result = await prepareNotebook({ source, key, projectRoot });
    const text = await readFile(result.output, 'utf8');
    assert.deepEqual(await decrypt(JSON.parse(text), await importKey(raw.toString('base64'))), snapshot());
    assert.equal(text.includes('TEST1000'), false);
    assert.equal(text.includes(raw.toString('base64url')), false);

    await writeFile(source, JSON.stringify({ ...snapshot(), schemaVersion: 1 }));
    await assert.rejects(prepareNotebook({ source, key, projectRoot }), /schemaVersion 2/);
    assert.equal(await readFile(result.output, 'utf8'), text);

    const inside = join(projectRoot, 'notebook.json');
    await writeFile(inside, JSON.stringify(snapshot()));
    await assert.rejects(prepareNotebook({ source: inside, key, projectRoot }), /outside the repository/);
    const outsideLink = join(privateDirectory, 'linked-notebook.json');
    await symlink(inside, outsideLink);
    await assert.rejects(prepareNotebook({ source: outsideLink, key, projectRoot }), /outside the repository/);
    const insideLink = join(projectRoot, 'linked-notebook.json');
    await symlink(source, insideLink);
    await assert.rejects(prepareNotebook({ source: insideLink, key, projectRoot }), /outside the repository/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid key formats and lengths are rejected without reflecting their contents', () => {
  for (const key of ['secret-input', '!', randomBytes(16).toString('base64')]) {
    assert.throws(() => readUnlockKey({ format: 'study-notebook.key.v1', key }), error => !error.message.includes(key));
  }
  const raw = randomBytes(32);
  assert.deepEqual(readUnlockKey({ format: 'study-notebook.key.v1', key: raw.toString('base64') }), raw);
});
