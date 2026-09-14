import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAcademic, classesOn } from '../lib/domain.ts';

// Course IDs exercise existing section aliases; every event and label is fictional.
const originalIds = ['COMP3000A', 'COMP3004A', 'TEST303', 'TEST404', 'ECON3210E'];
function course(id, status) {
  return {
    id, code: id, name: 'Synthetic course', color: '#123456',
    gradeCategories: [], gradeCaveats: [], ...(status ? { status } : {}),
  };
}
function assessment(id, courseId, date = '2026-09-21') {
  return { id, course: courseId, title: 'Synthetic assessment', date, time: null, status: 'Example', source: 'Synthetic test fixture' };
}
function fixture() {
  return {
    courses: originalIds.map(id => course(id)),
    assessments: originalIds.map(id => assessment(`assessment-${id}`, id)),
    excluded: originalIds.map(id => assessment(`excluded-${id}`, id)),
    finals: originalIds.map(id => assessment(`final-${id}`, id, null)),
    series: originalIds.map(id => ({
      course: id, start_time: '10:00', end_time: '11:00', location: 'Synthetic classroom',
      periods: [
        { start: '2026-09-07', end_inclusive: '2026-10-05', days: ['MO'] },
        { start: '2026-10-19', end_inclusive: '2026-10-19', days: ['MO'] },
        { start: '2026-11-02', end_inclusive: '2026-12-07', days: ['MO'] },
        { start: '2026-12-11', end_inclusive: '2026-12-11', days: ['FR'] },
      ],
    })),
    reviewedOn: '2026-09-14', sourceStatus: 'Synthetic fixture',
    history: [{ date: '2026-09-14', status: 'Example', detail: 'Synthetic review' }],
  };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

test('dropping one course and adding another leaves five active courses and preserves the archive', () => {
  const raw = fixture();
  raw.courses.find(c => c.id === 'TEST404').status = 'dropped';
  raw.courses.find(c => c.id === 'TEST404').droppedOn = '2026-09-14';
  raw.courses.push(course('TEST505', 'active'));
  for (const field of ['assessments', 'excluded', 'finals']) {
    raw[field].push(assessment(`${field}-TEST505`, 'TEST505'));
  }
  raw.series.push({ ...structuredClone(raw.series[0]), course: 'TEST505' });
  const before = structuredClone(raw);
  const visible = activeAcademic(freeze(raw));
  assert.deepEqual(visible.courses.map(c => c.id), ['COMP3000A', 'COMP3004A', 'TEST303', 'ECON3210E', 'TEST505']);
  for (const field of ['assessments', 'excluded', 'finals', 'series']) {
    assert.equal(visible[field].length, 5);
    assert.equal(visible[field].some(item => item.course === 'TEST404'), false);
    assert.equal(visible[field].some(item => item.course === 'TEST505'), true);
    assert.notEqual(visible[field], raw[field]);
  }
  assert.deepEqual(raw, before, 'the full academic archive must remain untouched');
  assert.equal(raw.courses.length, 6);
  assert.equal(raw.assessments.some(item => item.course === 'TEST404'), true);
  assert.equal(visible.reviewedOn, raw.reviewedOn);
  assert.deepEqual(visible.history, raw.history);
});

test('active parent courses retain section aliases and dropped parents hide their aliases', () => {
  const raw = fixture();
  raw.assessments.push(assessment('alias-assignment', 'COMP3000'));
  raw.excluded.push(assessment('alias-excluded', 'COMP3004'));
  raw.finals.push(assessment('alias-final', 'COMP3000', null));
  raw.series.push({ ...structuredClone(raw.series[0]), course: 'COMP3000A1' });
  raw.series.push({ ...structuredClone(raw.series[0]), course: 'ECON3210E02' });
  raw.series.push({ ...structuredClone(raw.series[0]), course: 'UNKNOWN999' });
  let visible = activeAcademic(raw);
  assert.equal(visible.assessments.some(item => item.id === 'alias-assignment'), true);
  assert.equal(visible.excluded.some(item => item.id === 'alias-excluded'), true);
  assert.equal(visible.finals.some(item => item.id === 'alias-final'), true);
  assert.equal(visible.series.some(item => item.course === 'COMP3000A1'), true);
  assert.equal(visible.series.some(item => item.course === 'ECON3210E02'), true);
  assert.equal(visible.series.some(item => item.course === 'UNKNOWN999'), false);

  for (const c of raw.courses) if (['COMP3000A', 'COMP3004A', 'ECON3210E'].includes(c.id)) c.status = 'dropped';
  visible = activeAcademic(raw);
  assert.equal(visible.assessments.some(item => item.id === 'alias-assignment'), false);
  assert.equal(visible.excluded.some(item => item.id === 'alias-excluded'), false);
  assert.equal(visible.finals.some(item => item.id === 'alias-final'), false);
  assert.equal(visible.series.some(item => ['COMP3000A1', 'ECON3210E02'].includes(item.course)), false);
});

test('filtering active courses preserves holidays, reading week, and replacement-day recurrence', () => {
  const raw = fixture();
  for (const c of raw.courses) if (c.id !== 'TEST303') c.status = 'dropped';
  const visible = activeAcademic(raw);
  assert.deepEqual(visible.series[0].periods, raw.series.find(s => s.course === 'TEST303').periods);
  assert.equal(classesOn(visible, '2026-10-12').length, 0);
  assert.equal(classesOn(visible, '2026-10-26').length, 0);
  assert.equal(classesOn(visible, '2026-10-19').length, 1);
  assert.deepEqual(classesOn(visible, '2026-12-11').map(s => s.parent), ['TEST303']);
});
