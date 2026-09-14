#!/usr/bin/env node
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const additionalData = Buffer.from('study-notebook:v1', 'utf8');

function contains(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

async function privateFile(path, projectRoot, label) {
  const absolute = resolve(path);
  if (contains(projectRoot, absolute)) throw new Error(`${label} must be outside the repository.`);
  let canonical;
  let canonicalParent;
  try {
    canonical = await realpath(absolute);
    canonicalParent = await realpath(dirname(absolute));
  } catch {
    throw new Error(`${label} could not be found.`);
  }
  if (contains(projectRoot, canonical) || contains(projectRoot, resolve(canonicalParent, basename(absolute)))) {
    throw new Error(`${label} must be outside the repository.`);
  }
  return canonical;
}

async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new Error(`${label} could not be read.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // JSON parser diagnostics can include private source or key fragments.
    throw new Error(`${label} is not valid JSON.`);
  }
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateSnapshot(snapshot) {
  if (
    !record(snapshot) || snapshot.schemaVersion !== 2 ||
    typeof snapshot.notebookId !== 'string' || !snapshot.notebookId.trim() ||
    typeof snapshot.snapshotId !== 'string' || !snapshot.snapshotId.trim() ||
    typeof snapshot.publishedAt !== 'string' || Number.isNaN(Date.parse(snapshot.publishedAt)) ||
    !record(snapshot.academic) || !Array.isArray(snapshot.academic.courses) || !snapshot.academic.courses.length ||
    !['assessments', 'excluded', 'finals', 'series'].every(key => Array.isArray(snapshot.academic[key])) ||
    !record(snapshot.state) || !['completed', 'tasks', 'grades'].every(key => Array.isArray(snapshot.state[key])) ||
    !record(snapshot.state.practice) || !record(snapshot.lectures) ||
    !record(snapshot.annotations) || !record(snapshot.files)
  ) throw new Error('The private notebook must be a complete schemaVersion 2 snapshot.');
}

export function readUnlockKey(document) {
  if (!record(document) || document.format !== 'study-notebook.key.v1' || typeof document.key !== 'string') {
    throw new Error('The unlock-key document has an unsupported format.');
  }
  const encoded = document.key;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) throw new Error('The unlock key must encode exactly 32 bytes.');
  const key = Buffer.from(encoded, 'base64');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== normalized) {
    throw new Error('The unlock key must encode exactly 32 bytes.');
  }
  return key;
}

export function encryptSnapshot(snapshot, key) {
  validateSnapshot(snapshot);
  if (!(key instanceof Uint8Array) || key.length !== 32) throw new Error('Encryption requires a 32-byte unlock key.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(additionalData);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(snapshot), 'utf8'), cipher.final()]);
  // Web Crypto appends the 16-byte authentication tag to the ciphertext.
  return {
    format: 'study-notebook.aes-gcm.v1',
    iv: iv.toString('base64'),
    data: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64'),
  };
}

export async function prepareNotebook({ source, key: keyPath, projectRoot = projectDirectory } = {}) {
  const repository = await realpath(projectRoot);
  const defaultPrivateDirectory = resolve(repository, '..', 'student-dashboard-private');
  const sourcePath = await privateFile(source || resolve(defaultPrivateDirectory, 'notebook.json'), repository, 'Private notebook');
  const unlockPath = await privateFile(keyPath || resolve(defaultPrivateDirectory, 'unlock-key.json'), repository, 'Unlock key');
  const snapshot = await readJson(sourcePath, 'Private notebook');
  const key = readUnlockKey(await readJson(unlockPath, 'Unlock key'));
  let envelope;
  try {
    envelope = encryptSnapshot(snapshot, key);
  } finally {
    key.fill(0);
  }
  const publicDirectory = resolve(repository, 'public');
  await mkdir(publicDirectory, { recursive: true });
  if (!contains(repository, await realpath(publicDirectory))) {
    throw new Error('The public output directory must be inside the repository.');
  }
  const output = resolve(publicDirectory, 'notebook.enc.json');
  const temporary = resolve(publicDirectory, `.notebook-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { flag: 'wx', mode: 0o644 });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return { output, bytes: Buffer.byteLength(JSON.stringify(envelope)) + 1 };
}

async function main() {
  const { values } = parseArgs({ options: { source: { type: 'string' }, key: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) {
    console.log('Usage: node scripts/prepare-notebook.mjs [--source /private/notebook.json] [--key /private/unlock-key.json]\nReads private files outside this repository and writes public/notebook.enc.json. Never prints the unlock key.');
    return;
  }
  const result = await prepareNotebook(values);
  console.log(`Prepared public/notebook.enc.json (${result.bytes} encrypted bytes). The unlock key remains private.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Avoid leaking private input through unexpected platform/parser diagnostics.
    console.error('Notebook preparation failed. Check the private file paths, schemaVersion 2 snapshot, and 32-byte unlock-key document. The previous encrypted output is preserved.');
    process.exitCode = 1;
  });
}
