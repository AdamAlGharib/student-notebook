#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { addLecture, emptyOverlay, mergeLectures, validateSnapshot } from '../lib/notebook-model.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
class UpdateError extends Error {}
function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}
async function privatePath(path) {
  const root = await realpath(repository);
  const absolute = resolve(path);
  if (inside(repository, absolute) || inside(root, absolute)) throw new UpdateError('Input and master files must be outside the repository.');
  let canonical, parent;
  try { canonical = await realpath(absolute); parent = await realpath(dirname(absolute)); }
  catch { throw new UpdateError('An input or master file could not be found.'); }
  if (inside(root, canonical) || inside(root, resolve(parent, basename(absolute)))) throw new UpdateError('Input and master files must be outside the repository.');
  return canonical;
}
function parse(text) {
  try { return JSON.parse(text); }
  catch { throw new UpdateError('An input or master file is not valid JSON.'); }
}
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function checkSnapshot(value) {
  try {
    validateSnapshot(value);
    if (!record(value.lectures) || !record(value.annotations) || !record(value.files)) throw new Error();
    for (const annotation of Object.values(value.annotations)) {
      if (!record(annotation) || typeof annotation.text !== 'string' || !Number.isInteger(annotation.revision) || annotation.revision < 0) throw new Error();
    }
    for (const file of Object.values(value.files)) {
      if (!record(file) || !['noteId', 'name', 'type', 'data'].every(key => typeof file[key] === 'string')) throw new Error();
    }
    for (const entry of Object.values(value.lectures)) {
      const first = entry.versions[0].lecture;
      for (const version of entry.versions) {
        if (!Number.isInteger(version.version) || version.version < 1 || Number.isNaN(Date.parse(version.updatedAt)) || version.lecture.course !== first.course || version.lecture.date !== first.date) throw new Error();
      }
    }
  } catch { throw new UpdateError('The notebook snapshot is incomplete or contains invalid study records.'); }
}

function checkedAcademic(previous, next) {
  if (!record(next) || !Array.isArray(next.courses) || !['assessments', 'excluded', 'finals', 'series'].every(key => Array.isArray(next[key]))) {
    throw new UpdateError('Provide a complete merged academic snapshot, preserving data from unavailable sources.');
  }
  const known = new Set(next.courses.map(course => course.id));
  if (previous.courses.some(course => !known.has(course.id))) throw new UpdateError('A review must preserve existing courses.');
  // Missing/failed source checks must not erase a course's last good records.
  for (const key of ['assessments', 'excluded', 'finals', 'series']) {
    const oldCourses = new Set(previous[key].map(item => item.course));
    for (const course of oldCourses) {
      if (!next[key].some(item => item.course === course)) throw new UpdateError('A review cannot blank existing course records. Supply a merged snapshot.');
    }
  }
  if (typeof next.reviewedOn !== 'string' || typeof next.sourceStatus !== 'string') throw new UpdateError('Academic snapshots require review date and source status.');
  return next;
}

export async function updatedSnapshot(master, command, input, { stateFromBackup = false } = {}) {
  checkSnapshot(master);
  const next = structuredClone(master);
  let unchanged = false;
  if (command === 'lecture') {
    const overlay = emptyOverlay();
    let result;
    try { result = await addLecture(next, overlay, input); }
    catch { throw new UpdateError('The lecture is invalid, changes recording identity, or predates the saved source.'); }
    next.lectures = mergeLectures(next.lectures, overlay.lectures);
    unchanged = result.unchanged;
  } else if (command === 'backup') {
    checkSnapshot(input);
    if (input.notebookId !== master.notebookId) throw new UpdateError('The backup belongs to a different notebook.');
    for (const [id, entry] of Object.entries(input.lectures)) {
      const existing = master.lectures[id]?.versions[0]?.lecture;
      if (existing && entry.versions.some(v => v.lecture.course !== existing.course || v.lecture.date !== existing.date)) throw new UpdateError('A backup changes an existing recording identity.');
    }
    next.lectures = mergeLectures(master.lectures, input.lectures);
    for (const [id, file] of Object.entries(input.files)) {
      if (master.files[id] && JSON.stringify(master.files[id]) !== JSON.stringify(file)) throw new UpdateError('An attachment identity conflicts with the private master.');
      next.files[id] = file;
    }
    for (const [id, annotation] of Object.entries(input.annotations)) {
      if (!next.annotations[id] || annotation.revision > next.annotations[id].revision) next.annotations[id] = annotation;
    }
    if (stateFromBackup) next.state = structuredClone(input.state);
    // The school's academic snapshot always comes from the current private master.
    unchanged = JSON.stringify(next) === JSON.stringify(master);
  } else if (command === 'academic') {
    next.academic = checkedAcademic(master.academic, input);
    unchanged = JSON.stringify(next.academic) === JSON.stringify(master.academic);
  } else throw new UpdateError('Use lecture, backup, or academic followed by an input JSON path.');
  checkSnapshot(next);
  if (!unchanged) { next.snapshotId = randomUUID(); next.publishedAt = new Date().toISOString(); }
  return { snapshot: next, unchanged };
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    master: { type: 'string' }, 'state-from-backup': { type: 'boolean' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Usage: node --experimental-strip-types scripts/update-notebook.mjs <lecture|backup|academic> /private/input.json [--master /private/notebook.json] [--dry-run] [--state-from-backup]\nBackup imports retain current school data and state; --state-from-backup explicitly replaces study state. Academic input must already merge each source with its last successful records. Nothing is published or encrypted by this command.');
    return;
  }
  if (positionals.length !== 2 || !['lecture', 'backup', 'academic'].includes(positionals[0])) throw new UpdateError('Provide lecture, backup, or academic and one input JSON path.');
  if (values['state-from-backup'] && positionals[0] !== 'backup') throw new UpdateError('--state-from-backup applies only to backup imports.');
  const master = await privatePath(values.master || resolve(repository, '..', 'student-dashboard-private', 'notebook.json'));
  const inputPath = await privatePath(positionals[1]);
  if (master === inputPath) throw new UpdateError('The input must be a different file from the private master.');
  const lock = `${master}.update.lock`;
  let locked = false;
  let temporary;
  try {
    if (!values['dry-run']) {
      try { await writeFile(lock, '', { flag: 'wx', mode: 0o600 }); locked = true; }
      catch { throw new UpdateError('Another update may be running; the private master was not changed.'); }
    }
    const original = await readFile(master, 'utf8');
    const result = await updatedSnapshot(parse(original), positionals[0], parse(await readFile(inputPath, 'utf8')), { stateFromBackup: !!values['state-from-backup'] });
    const count = Object.keys(result.snapshot.lectures).length;
    const versions = Object.values(result.snapshot.lectures).reduce((total, entry) => total + entry.versions.length, 0);
    if (result.unchanged || values['dry-run']) {
      console.log(`${values['dry-run'] ? 'Dry run' : 'Unchanged'}: ${count} lectures, ${versions} versions, ${Object.keys(result.snapshot.files).length} files. No files changed.`);
      return;
    }
    if (await readFile(master, 'utf8') !== original) throw new UpdateError('The private master changed during this update. Retry with the current version.');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = resolve(dirname(master), `notebook.backup-${stamp}-${randomUUID()}.json`);
    await writeFile(backup, original, { flag: 'wx', mode: 0o600 });
    temporary = resolve(dirname(master), `.notebook-update-${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(result.snapshot, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, master);
    console.log(`Updated private master: ${count} lectures, ${versions} versions, ${Object.keys(result.snapshot.files).length} files. Original backed up privately. No publication performed.`);
  } finally {
    if (temporary) await rm(temporary, { force: true });
    if (locked) await rm(lock, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof UpdateError ? error.message : 'The private update failed. Check the input files and permissions; no private content is printed.');
    process.exitCode = 1;
  });
}
