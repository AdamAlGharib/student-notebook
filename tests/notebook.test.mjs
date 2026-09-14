import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLecture,
  base64,
  decrypt,
  emptyOverlay,
  encrypt,
  importKey,
  mergeLectures,
  mergedState,
  patchState,
  unbase64,
  validateSnapshot,
  validateState,
} from '../lib/notebook-model.ts';

// These fixtures are fictional. No private notebook content or unlock key is
// needed to run the public repository's tests.
const course = {
  id: 'TEST101',
  code: 'TEST 101',
  name: 'Example course',
  color: '#445566',
  gradeCategories: [
    { id: 'assignment', label: 'Assignment', weight: 50 },
    { id: 'exam', label: 'Exam', weight: 50 },
    { id: 'quiz', label: 'Quizzes', weight: 45, countBest: 3, totalItems: 4, countedItemWeight: 15 },
  ],
  gradeCaveats: [],
};

function academic() {
  return {
    courses: [structuredClone(course), { ...structuredClone(course), id: 'TEST102' }],
    assessments: ['first', 'second', 'third'].map((id) => ({
      id, course: course.id, title: `Example ${id}`, date: '2026-09-18',
      time: null, status: 'Confirmed', source: 'Synthetic test fixture',
    })),
    excluded: [], finals: [], series: [],
    reviewedOn: '2026-09-14', sourceStatus: 'Synthetic test fixture',
  };
}

function state() {
  return { completed: [], tasks: [], grades: [], practice: {} };
}

function snapshot() {
  return {
    schemaVersion: 2, notebookId: 'test-notebook', snapshotId: 'test-snapshot',
    publishedAt: '2026-09-14T12:00:00.000Z', academic: academic(), state: state(),
    lectures: {}, annotations: {}, files: {},
  };
}

function task(id, title = id) {
  return { id, course: course.id, title, reason: 'Synthetic study task', done: false, date: '2026-09-16' };
}

function grade(category, score) {
  return { course: course.id, category, score, feedback: '' };
}

function lecture(changes = {}) {
  return {
    meetingId: 'example-recording', course: course.id, date: '2026-09-15',
    title: 'Synthetic lecture', transcript: 'A fictional source statement.',
    quickNotes: 'Original summary.', detailedNotes: 'Original explanation. [Source](#source-L1)',
    questions: [{ question: 'Example question?', answer: 'Example answer.', source: '#source-L1' }],
    sourceUrl: 'https://example.com/recording', sourceModifiedAt: '2026-09-15T14:00:00.000Z',
    captureStatus: 'complete', uncertainties: [], figures: [], ...changes,
  };
}

async function key(fill = 7) {
  return importKey(base64(new Uint8Array(32).fill(fill)));
}

test('encrypted snapshots round-trip all private data with a non-extractable key', async () => {
  const original = snapshot();
  original.annotations['wispr-example-recording'] = { text: 'Private Unicode note: café 日本語', revision: 2 };
  original.files['example-file'] = {
    noteId: 'wispr-example-recording', name: 'example.txt', type: 'text/plain',
    data: base64(new TextEncoder().encode('Example attachment contents')),
  };
  const unlockKey = await key();
  const encrypted = await encrypt(original, unlockKey);
  assert.equal(unlockKey.extractable, false);
  assert.deepEqual(Object.keys(encrypted).sort(), ['data', 'format', 'iv']);
  assert.equal(encrypted.format, 'study-notebook.aes-gcm.v1');
  assert.equal(unbase64(encrypted.iv).length, 12);
  assert.deepEqual(await decrypt(encrypted, unlockKey), original);
  assert.deepEqual(original.annotations['wispr-example-recording'], {
    text: 'Private Unicode note: café 日本語', revision: 2,
  });
});

test('each encryption uses a fresh IV even for the same content and key', async () => {
  const unlockKey = await key();
  const encrypted = await Promise.all(Array.from({ length: 20 }, () => encrypt({ text: 'Same content' }, unlockKey)));
  assert.equal(new Set(encrypted.map((value) => value.iv)).size, encrypted.length);
  assert.equal(new Set(encrypted.map((value) => value.data)).size, encrypted.length);
});

test('wrong keys and altered ciphertext cannot produce a plaintext snapshot', async () => {
  const unlockKey = await key();
  const encrypted = await encrypt(snapshot(), unlockKey);
  await assert.rejects(decrypt(encrypted, await key(9)), /could not unlock|damaged/i);
  const damaged = unbase64(encrypted.data);
  damaged[0] ^= 1;
  await assert.rejects(decrypt({ ...encrypted, data: base64(damaged) }, unlockKey), /could not unlock|damaged/i);
  const alteredIv = unbase64(encrypted.iv);
  alteredIv[0] ^= 1;
  await assert.rejects(decrypt({ ...encrypted, iv: base64(alteredIv) }, unlockKey), /could not unlock|damaged/i);
  await assert.rejects(decrypt({ ...encrypted, iv: base64(new Uint8Array(11)) }, unlockKey), /unsupported format/i);
  await assert.rejects(decrypt({ ...encrypted, format: 'unknown' }, unlockKey), /unsupported format/i);
});

test('unlock keys accept base64url and reject the wrong byte length', async () => {
  const bytes = new Uint8Array(32).fill(255);
  const encoded = base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unlockKey = await importKey(encoded);
  const encrypted = await encrypt({ text: 'URL-safe key' }, unlockKey);
  assert.deepEqual(await decrypt(encrypted, await importKey(base64(bytes))), { text: 'URL-safe key' });
  await assert.rejects(importKey(base64(new Uint8Array(31))), /not a notebook unlock key/i);
});

test('a new published snapshot preserves local edits while adopting untouched remote changes', () => {
  const original = {
    completed: ['first'],
    tasks: [task('edited'), task('deleted'), task('untouched')],
    grades: [grade('assignment', 70), grade('exam', null)],
    practice: { questionA: { correct: 1, attempts: 2 } },
  };
  const next = structuredClone(original);
  next.completed = ['second'];
  next.tasks = [task('edited', 'Changed on this device'), task('untouched'), task('local-new')];
  next.grades[0] = grade('assignment', 85);
  next.practice.questionA = { correct: 2, attempts: 3 };
  const overlay = emptyOverlay();
  patchState(original, next, overlay);
  assert.equal(overlay.tasks.deleted, null);
  assert.equal(Object.hasOwn(overlay.tasks, 'untouched'), false);
  assert.equal(Object.hasOwn(overlay.grades, 'TEST101:exam'), false);

  const published = {
    completed: ['first', 'third'],
    tasks: [task('edited', 'Remote edit'), task('deleted', 'Remote edit'), task('untouched', 'New published title'), task('remote-new')],
    grades: [grade('assignment', 75), grade('exam', 92)],
    practice: { questionA: { correct: 1, attempts: 4 }, questionB: { correct: 1, attempts: 1 } },
  };
  const publishedBefore = structuredClone(published);
  const result = mergedState(published, overlay);
  assert.deepEqual(new Set(result.completed), new Set(['second', 'third']));
  assert.deepEqual(new Map(result.tasks.map((item) => [item.id, item.title])), new Map([
    ['edited', 'Changed on this device'], ['untouched', 'New published title'],
    ['remote-new', 'remote-new'], ['local-new', 'local-new'],
  ]));
  assert.equal(result.grades.find((item) => item.category === 'assignment').score, 85);
  assert.equal(result.grades.find((item) => item.category === 'exam').score, 92);
  assert.deepEqual(result.practice, {
    questionA: { correct: 2, attempts: 3 }, questionB: { correct: 1, attempts: 1 },
  });
  assert.deepEqual(published, publishedBefore, 'overlay merging must not mutate the published snapshot');
  validateState(result, academic());
});

test('saving a second local edit and deleting a grade preserve earlier overlay changes', () => {
  const published = { ...state(), tasks: [task('first-task')], grades: [grade('assignment', 70)] };
  const overlay = emptyOverlay();
  const firstEdit = { ...structuredClone(published), completed: ['first'] };
  patchState(published, firstEdit, overlay);
  const current = mergedState(published, overlay);
  const secondEdit = structuredClone(current);
  secondEdit.tasks[0].done = true;
  secondEdit.grades = [];
  patchState(current, secondEdit, overlay);
  assert.deepEqual(mergedState(published, overlay), secondEdit);
  assert.equal(overlay.grades['TEST101:assignment'], null);
});

test('blank and zero marks stay distinct and malformed grade records are rejected', () => {
  const valid = {
    ...state(), grades: [
      grade('assignment', null), grade('exam', 0),
      { ...grade('quiz', null), scores: [0, null, 85, null] },
    ],
  };
  assert.doesNotThrow(() => validateState(valid, academic()));
  for (const badScore of [-1, 101, NaN, undefined, '85']) {
    assert.throws(() => validateState({ ...state(), grades: [grade('exam', badScore)] }, academic()), /Grades must be 0–100/i);
  }
  assert.throws(() => validateState({ ...state(), grades: [{ ...grade('quiz', null), scores: [70, 80, 90] }] }, academic()), /ungraded quizzes blank/i);
  assert.throws(() => validateState({ ...state(), grades: [grade('exam', 80), grade('exam', 85)] }, academic()), /Invalid grade record/i);
});

test('identical lecture packages deduplicate, while note corrections retain source history', async () => {
  const published = snapshot();
  const overlay = emptyOverlay();
  const original = lecture();
  const first = await addLecture(published, overlay, original);
  assert.deepEqual(first, { id: 'wispr-example-recording', version: 1, unchanged: false });
  const before = structuredClone(overlay);
  assert.deepEqual(await addLecture(published, overlay, structuredClone(original)), { ...first, unchanged: true });
  assert.deepEqual(overlay, before);

  const corrected = lecture({ quickNotes: 'A corrected summary of the same source.' });
  assert.deepEqual(await addLecture(published, overlay, corrected), { ...first, version: 2 });
  assert.equal(overlay.lectures[first.id].versions.length, 2);
  assert.deepEqual(overlay.lectures[first.id].versions[0].lecture, original);
  assert.deepEqual(overlay.lectures[first.id].versions[1].lecture, corrected);
});

test('deduplication covers generated notes, questions, review flags, and figures', async (t) => {
  const corrections = {
    detailedNotes: 'A corrected explanation. [Source](#source-L1)',
    questions: [{ question: 'Corrected question?', answer: 'Corrected answer.', source: '#source-L1' }],
    uncertainties: ['A phrase needs review.'],
    figures: [{ title: 'Example sketch', description: 'A textual description of the sketch.' }],
    captureStatus: 'partial',
  };
  for (const [field, value] of Object.entries(corrections)) {
    await t.test(field, async () => {
      const published = snapshot();
      const overlay = emptyOverlay();
      await addLecture(published, overlay, lecture());
      const result = await addLecture(published, overlay, lecture({ [field]: value }));
      assert.equal(result.unchanged, false);
      assert.equal(result.version, 2);
      assert.equal(overlay.lectures[result.id].versions[0].lecture.transcript,
        overlay.lectures[result.id].versions[1].lecture.transcript);
    });
  }
});

test('stale source imports and recording identity collisions leave saved versions intact', async () => {
  const published = snapshot();
  const overlay = emptyOverlay();
  await addLecture(published, overlay, lecture());
  await addLecture(published, overlay, lecture({ transcript: 'A corrected source.', sourceModifiedAt: '2026-09-15T15:00:00.000Z' }));
  const before = structuredClone(overlay);
  await assert.rejects(addLecture(published, overlay, lecture({ transcript: 'Outdated source.' })), /older than the saved source/i);
  const noTimestamp = lecture({ transcript: 'Undated source.' });
  delete noTimestamp.sourceModifiedAt;
  await assert.rejects(addLecture(published, overlay, noTimestamp), /older than the saved source/i);
  await assert.rejects(addLecture(published, overlay, lecture({ course: 'TEST102' })), /another course or date/i);
  await assert.rejects(addLecture(published, overlay, lecture({ date: '2026-09-16' })), /another course or date/i);
  assert.deepEqual(overlay, before);
});

test('published and local lecture histories merge without losing versions or duplicating the common source', () => {
  const first = lecture();
  const second = lecture({ transcript: 'Second source revision.', sourceModifiedAt: '2026-09-15T15:00:00.000Z' });
  const third = lecture({ transcript: 'Third source revision.', sourceModifiedAt: '2026-09-15T16:00:00.000Z' });
  const version = (number, source) => ({ version: number, updatedAt: source.sourceModifiedAt, lecture: source });
  const published = { 'wispr-example-recording': { versions: [version(1, first), version(2, third)] } };
  const local = { 'wispr-example-recording': { versions: [version(1, first), version(2, second)] } };
  const publishedBefore = structuredClone(published);
  const localBefore = structuredClone(local);
  const result = mergeLectures(published, local);
  assert.deepEqual(result['wispr-example-recording'].versions.map((item) => item.lecture), [first, second, third]);
  assert.deepEqual(result['wispr-example-recording'].versions.map((item) => item.version), [1, 2, 3]);
  assert.deepEqual(published, publishedBefore);
  assert.deepEqual(local, localBefore);
});

test('snapshot validation checks historical lecture versions as well as the current source', () => {
  const data = snapshot();
  data.lectures['wispr-example-recording'] = {
    versions: [
      { version: 1, updatedAt: '2026-09-15T14:00:00.000Z', lecture: lecture() },
      { version: 2, updatedAt: '2026-09-15T15:00:00.000Z', lecture: lecture({ quickNotes: 'Updated summary.' }) },
    ],
  };
  assert.doesNotThrow(() => validateSnapshot(data));
  data.lectures['wispr-example-recording'].versions[0].lecture.date = '2026-09-31';
  assert.throws(() => validateSnapshot(data), /valid Fall 2026 lecture date/i);
});

test('malformed backup annotations, attachments, revision metadata, and figures are rejected', async (t) => {
  const valid = snapshot();
  valid.lectures['wispr-example-recording'] = { versions: [{
    version: 1, updatedAt: '2026-09-15T14:00:00.000Z', lecture: lecture(),
  }] };
  valid.annotations['wispr-example-recording'] = { text: 'Synthetic personal note', revision: 1 };
  valid.files.attachment = {
    noteId: 'wispr-example-recording', name: 'example.txt', type: 'text/plain',
    data: base64(new TextEncoder().encode('Synthetic attachment')),
  };
  assert.doesNotThrow(() => validateSnapshot(valid));
  const cases = [
    ['annotation object', s => { s.annotations['wispr-example-recording'].text = { broken: true }; }],
    ['annotation revision', s => { s.annotations['wispr-example-recording'].revision = '1'; }],
    ['orphan annotation', s => { s.annotations.orphan = { text: 'Missing lecture', revision: 0 }; }],
    ['HTML attachment', s => { s.files.attachment.type = 'text/html'; }],
    ['invalid attachment bytes', s => { s.files.attachment.data = '%%%'; }],
    ['orphan attachment', s => { s.files.attachment.noteId = 'missing'; }],
    ['negative version', s => { s.lectures['wispr-example-recording'].versions[0].version = -1; }],
    ['invalid version date', s => { s.lectures['wispr-example-recording'].versions[0].updatedAt = 'broken'; }],
    ['invalid figure', s => { s.lectures['wispr-example-recording'].versions[0].lecture.figures = [null]; }],
    ['invalid question', s => { s.lectures['wispr-example-recording'].versions[0].lecture.questions = [null]; }],
    ['incomplete course', s => { delete s.academic.courses[0].gradeCategories; }],
    ['invalid schedule period', s => { s.academic.series = [{ course: 'TEST101', start_time: '12:00', end_time: '13:00', location: 'Example', periods: [{ start: '2026-09-31', end_inclusive: '2026-12-01', days: ['MO'] }] }]; }],
    ['unsafe record key', s => { s.annotations = JSON.parse('{"__proto__":{"text":"Example","revision":1}}'); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const malformed = structuredClone(valid);
    mutate(malformed);
    assert.throws(() => validateSnapshot(malformed));
  });
});

test('source history cannot change the recording identity within one lecture', () => {
  const data = snapshot();
  data.lectures['wispr-example-recording'] = { versions: [
    { version: 1, updatedAt: '2026-09-15T14:00:00.000Z', lecture: lecture() },
    { version: 2, updatedAt: '2026-09-15T15:00:00.000Z', lecture: lecture({ course: 'TEST102' }) },
  ] };
  assert.throws(() => validateSnapshot(data), /different recordings/i);
});

test('a cleared local request is not replaced by the old published request', () => {
  const original = { ...state(), lastRequest: 'Old published request' };
  const overlay = emptyOverlay();
  patchState(original, { ...original, lastRequest: '' }, overlay);
  assert.equal(mergedState(original, overlay).lastRequest, '');
});
