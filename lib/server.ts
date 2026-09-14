import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  emptyState,
  type Academic,
  type DashboardData,
  type DeskState,
  type Lecture,
} from './domain';
export const local = import.meta.env.DEV;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  return env.DB;
}
export function bucket() {
  return env.FILES;
}
export async function identity() {
  const user = await getChatGPTUser();
  if (user) {
    if (!local) {
      const allowed = (env as unknown as Record<string, string>)
        .ALLOWED_OWNER_EMAIL;
      if (!allowed)
        throw new ApiError(
          503,
          'The private owner account has not been configured.',
        );
      if (user.email.toLowerCase() !== allowed.toLowerCase())
        throw new ApiError(
          403,
          'This study desk belongs to a different account.',
        );
    }
    return user;
  }
  if (local)
    return {
      userId: 'local-owner',
      displayName: 'Adam',
      email: '',
      fullName: 'Adam',
    };
  throw new ApiError(401, 'Sign in to access your study desk.');
}
export function respond(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export function failure(e: unknown) {
  console.error(e instanceof Error ? e.message : 'Dashboard operation failed');
  return respond(
    {
      error:
        e instanceof ApiError
          ? e.message
          : 'The update could not be completed. Your previous data is preserved.',
    },
    e instanceof ApiError ? e.status : 500,
  );
}
export function checkOrigin(request: Request) {
  const o = request.headers.get('origin');
  if (o && o !== new URL(request.url).origin)
    throw new ApiError(403, 'This update must be made from your study desk.');
}
export async function body(request: Request, max = 750000) {
  checkOrigin(request);
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(415, 'Use a JSON lecture package.');
  if (Number(request.headers.get('content-length')) > max)
    throw new ApiError(413, 'This import is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'An import body is required.');
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, 'This import is too large.');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (text.length > max)
    throw new ApiError(
      413,
      'This import is too large. Use a smaller lecture package.',
    );
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'The file is not valid JSON.');
  }
}
export async function readRecord(owner: string, key: string) {
  return db()
    .prepare('SELECT value,revision FROM records WHERE owner=? AND key=?')
    .bind(owner, key)
    .first<{ value: string; revision: number }>();
}
export async function writeRecord(
  owner: string,
  key: string,
  value: unknown,
  expected?: number,
) {
  const now = new Date().toISOString();
  if (expected !== undefined) {
    const r = await db()
      .prepare(
        'UPDATE records SET value=?,revision=revision+1,updated_at=? WHERE owner=? AND key=? AND revision=?',
      )
      .bind(JSON.stringify(value), now, owner, key, expected)
      .run();
    if (!r.meta.changes)
      throw new ApiError(
        409,
        'This changed in another window. Reload before saving.',
      );
    return expected + 1;
  }
  await db()
    .prepare(
      'INSERT INTO records(owner,key,value,revision,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value,revision=records.revision+1,updated_at=excluded.updated_at',
    )
    .bind(owner, key, JSON.stringify(value), now)
    .run();
  return (await readRecord(owner, key))!.revision;
}
export async function bootstrap(owner: string) {
  let record = await readRecord(owner, 'academic');
  if (!record) {
    const vars = env as unknown as Record<string, string>;
    let raw = '';
    for (let i = 0; i < 30; i++) {
      const part = vars['ACADEMIC_SEED_' + i];
      if (!part) break;
      raw += part;
    }
    if (!raw)
      throw new ApiError(
        503,
        'Your academic snapshot has not been imported yet.',
      );
    const academic = JSON.parse(atob(raw));
    await db().batch([
      db()
        .prepare(
          'INSERT OR IGNORE INTO records(owner,key,value,revision,updated_at) VALUES(?,?,?,1,?)',
        )
        .bind(
          owner,
          'academic',
          JSON.stringify(academic),
          new Date().toISOString(),
        ),
      db()
        .prepare(
          'INSERT OR IGNORE INTO records(owner,key,value,revision,updated_at) VALUES(?,?,?,1,?)',
        )
        .bind(
          owner,
          'state',
          JSON.stringify(emptyState),
          new Date().toISOString(),
        ),
    ]);
    record = await readRecord(owner, 'academic');
  }
  return JSON.parse(record!.value) as Academic;
}
export async function loadDashboard(): Promise<DashboardData> {
  const user = await identity();
  const academic = await bootstrap(user.userId);
  const [state, ns] = await Promise.all([
    readRecord(user.userId, 'state'),
    db()
      .prepare(
        'SELECT id,course,date,title,status,version,source_hash as sourceHash,excerpt,updated_at as updatedAt FROM notes WHERE owner=? ORDER BY date DESC',
      )
      .bind(user.userId)
      .all(),
  ]);
  return {
    academic,
    notes: ns.results as unknown as DashboardData['notes'],
    state: state ? JSON.parse(state.value) : emptyState,
    stateRevision: state?.revision || 0,
    name: user.fullName?.split(' ')[0] || 'Adam',
    local,
  };
}
export function validateState(s: DeskState, academic: Academic) {
  if (
    !s ||
    !Array.isArray(s.completed) ||
    !Array.isArray(s.tasks) ||
    !Array.isArray(s.grades) ||
    !s.practice ||
    typeof s.practice !== 'object'
  )
    throw new ApiError(400, 'Invalid study data.');
  const courses = new Set(academic.courses.map((c) => c.id));
  const assessments = new Set(academic.assessments.map((a) => a.id));
  if (
    s.completed.some((x) => !assessments.has(x)) ||
    s.tasks.length > 200 ||
    s.grades.length > 60 ||
    JSON.stringify(s).length > 150000
  )
    throw new ApiError(400, 'Invalid study data.');
  for (const task of s.tasks) {
    if (
      !courses.has(task.course) ||
      typeof task.id !== 'string' ||
      typeof task.title !== 'string' ||
      task.title.length > 300 ||
      typeof task.done !== 'boolean' ||
      typeof task.reason !== 'string' ||
      task.reason.length > 6000 ||
      typeof task.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(task.date) ||
      Number.isNaN(Date.parse(task.date)) ||
      new Date(task.date).toISOString().slice(0, 10) !== task.date
    )
      throw new ApiError(400, 'Invalid study task.');
  }
  if (new Set(s.tasks.map((t) => t.id)).size !== s.tasks.length)
    throw new ApiError(400, 'Duplicate study task identity.');
  for (const [key, value] of Object.entries(s.practice)) {
    if (
      key.length > 200 ||
      !value ||
      !Number.isInteger(value.attempts) ||
      !Number.isInteger(value.correct) ||
      value.correct < 0 ||
      value.attempts < value.correct ||
      value.attempts > 100000
    )
      throw new ApiError(400, 'Invalid practice result.');
  }
  if (
    s.lastRequest !== undefined &&
    (typeof s.lastRequest !== 'string' ||
      Number.isNaN(Date.parse(s.lastRequest)))
  )
    throw new ApiError(400, 'Invalid processing request.');
  const keys = new Set();
  for (const grade of s.grades) {
    const key = grade.course + ':' + grade.category;
    const category = academic.courses
      .find((c) => c.id === grade.course)
      ?.gradeCategories.find((c) => c.id === grade.category);
    if (
      keys.has(key) ||
      !category ||
      typeof grade.feedback !== 'string' ||
      grade.feedback.length > 5000
    )
      throw new ApiError(400, 'Invalid grade record.');
    keys.add(key);
    const values = category.countBest ? grade.scores || [] : [grade.score];
    if (category.countBest && values.length !== (category.totalItems || 4))
      throw new ApiError(
        400,
        'Enter the four quiz results, leaving ungraded quizzes blank.',
      );
    if (
      values.some(
        (n) =>
          n !== null &&
          (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100),
      )
    )
      throw new ApiError(
        400,
        'Grades must be between 0 and 100; leave ungraded results blank.',
      );
  }
}
export function validateLecture(p: Lecture, academic: Academic) {
  if (!p || !academic.courses.some((c) => c.id === p.course))
    throw new ApiError(400, 'Select a valid course.');
  if (
    typeof p.date !== 'string' ||
    !/^2026-\d{2}-\d{2}$/.test(p.date) ||
    Number.isNaN(Date.parse(p.date)) ||
    new Date(p.date).toISOString().slice(0, 10) !== p.date ||
    p.date < '2026-09-02' ||
    p.date > '2026-12-31'
  )
    throw new ApiError(400, 'Enter a valid Fall 2026 lecture date.');
  for (const key of ['title', 'transcript'] as const)
    if (typeof p[key] !== 'string' || !p[key].trim())
      throw new ApiError(400, 'A title and source transcript are required.');
  if (p.title.length > 200 || p.transcript.length > 350000)
    throw new ApiError(400, 'The title or transcript is too long.');
  if (!['complete', 'partial', 'unknown'].includes(p.captureStatus))
    throw new ApiError(400, 'Choose the recording coverage.');
  for (const k of [
    'quickNotes',
    'detailedNotes',
    'sourceModifiedAt',
    'sourceUrl',
    'meetingId',
  ] as const)
    if (p[k] !== undefined && typeof p[k] !== 'string')
      throw new ApiError(400, 'Invalid lecture field: ' + k);
  if (p.sourceUrl && !/^https:\/\//.test(p.sourceUrl))
    throw new ApiError(400, 'Source links must use HTTPS.');
  if (p.sourceModifiedAt && Number.isNaN(Date.parse(p.sourceModifiedAt)))
    throw new ApiError(400, 'Invalid source revision timestamp.');
  if (p.meetingId && !/^[a-zA-Z0-9_-]{1,100}$/.test(p.meetingId))
    throw new ApiError(400, 'Invalid recording identity.');
  if (
    p.questions &&
    (!Array.isArray(p.questions) ||
      p.questions.length > 100 ||
      p.questions.some(
        (q) =>
          typeof q.question !== 'string' ||
          typeof q.answer !== 'string' ||
          (q.source !== undefined && typeof q.source !== 'string'),
      ))
  )
    throw new ApiError(400, 'Invalid practice questions.');
  if (
    p.uncertainties &&
    (!Array.isArray(p.uncertainties) ||
      p.uncertainties.some((x) => typeof x !== 'string'))
  )
    throw new ApiError(400, 'Invalid review flags.');
}
export async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function importLecture(owner: string, p: Lecture) {
  const academic = await bootstrap(owner);
  validateLecture(p, academic);
  p = Object.fromEntries(
    [
      'meetingId',
      'course',
      'date',
      'title',
      'transcript',
      'quickNotes',
      'detailedNotes',
      'questions',
      'sourceUrl',
      'sourceModifiedAt',
      'captureStatus',
      'uncertainties',
      'figures',
    ]
      .filter((k) => Object.prototype.hasOwnProperty.call(p, k))
      .map((k) => [k, p[k as keyof Lecture]]),
  ) as Lecture;
  const sourceHash = await hash(p.transcript);
  const id = p.meetingId
    ? 'wispr-' + p.meetingId
    : 'manual-' + (await hash(p.course + ':' + p.date + ':' + p.title));
  const packageHash = await hash(JSON.stringify(p));
  const previous = await db()
    .prepare(
      'SELECT version,package_hash,course,date,object_key FROM notes WHERE owner=? AND id=?',
    )
    .bind(owner, id)
    .first<{
      version: number;
      package_hash: string;
      course: string;
      date: string;
      object_key: string;
    }>();
  if (previous && (previous.course !== p.course || previous.date !== p.date))
    throw new ApiError(
      409,
      'This recording already belongs to another course or date. Resolve its identity before importing.',
    );
  if (previous?.package_hash === packageHash)
    return { id, version: previous.version, unchanged: true };
  if (previous) {
    const oldObject = await bucket().get(previous.object_key);
    if (!oldObject)
      throw new ApiError(
        503,
        'Previous source is unavailable; import deferred.',
      );
    const old = await oldObject.json<Lecture>();
    if (
      old.sourceModifiedAt &&
      (!p.sourceModifiedAt ||
        Date.parse(p.sourceModifiedAt) < Date.parse(old.sourceModifiedAt))
    )
      throw new ApiError(
        409,
        'This source revision is older than the saved lecture. The newer version is preserved.',
      );
  }
  const version = (previous?.version || 0) + 1;
  const now = new Date().toISOString();
  const objectKey = `${owner}/lectures/${id}/${crypto.randomUUID()}.json`;
  await bucket().put(objectKey, JSON.stringify(p), {
    httpMetadata: { contentType: 'application/json' },
  });
  const status = lectureStatus(p);
  const queries = [
    db()
      .prepare(
        'INSERT INTO note_revisions(owner,note_id,version,object_key,updated_at) VALUES(?,?,?,?,?)',
      )
      .bind(owner, id, version, objectKey, now),
    db()
      .prepare(
        'INSERT INTO notes(owner,id,course,date,title,status,version,source_hash,package_hash,object_key,excerpt,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET title=excluded.title,status=excluded.status,version=excluded.version,source_hash=excluded.source_hash,package_hash=excluded.package_hash,object_key=excluded.object_key,excerpt=excluded.excerpt,updated_at=excluded.updated_at',
      )
      .bind(
        owner,
        id,
        p.course,
        p.date,
        p.title,
        status,
        version,
        sourceHash,
        packageHash,
        objectKey,
        (p.quickNotes || p.transcript).slice(0, 250),
        now,
      ),
    db()
      .prepare(
        'INSERT OR IGNORE INTO records(owner,key,value,revision,updated_at) VALUES(?,?,?,1,?)',
      )
      .bind(owner, 'annotation:' + id, JSON.stringify(''), now),
  ];
  try {
    await db().batch(queries);
  } catch {
    throw new ApiError(
      409,
      'Another import changed this lecture. Retry; the previous version is preserved.',
    );
  }
  return { id, version, unchanged: false };
}

export function lectureStatus(p: Lecture) {
  return p.captureStatus === 'partial'
    ? 'Partial recording'
    : !p.detailedNotes
      ? 'Awaiting notes'
      : p.captureStatus === 'unknown' ||
          p.uncertainties?.length ||
          !/#source-L\d+/.test(p.detailedNotes)
        ? 'Needs review'
        : 'Ready';
}
