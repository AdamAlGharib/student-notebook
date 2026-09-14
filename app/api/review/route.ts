import {
  ApiError,
  body,
  bootstrap,
  db,
  failure,
  identity,
  readRecord,
  respond,
} from '@/lib/server';
import { torontoDate, type Assessment } from '@/lib/domain';
export async function POST(request: Request) {
  try {
    const user = await identity();
    const input = await body(request, 250000);
    const academic = await bootstrap(user.userId);
    const row = await readRecord(user.userId, 'academic');
    if (
      !input ||
      !['complete', 'partial', 'failed'].includes(input.status) ||
      typeof input.observedAt !== 'string' ||
      Number.isNaN(Date.parse(input.observedAt)) ||
      !Array.isArray(input.sources) ||
      input.sources.length > 30
    )
      throw new ApiError(
        400,
        'Use a review package with status, observedAt and source observations.',
      );
    for (const s of input.sources) {
      if (
        !academic.courses.some((c) => c.id === s.course) ||
        !['complete', 'partial', 'sign-in-needed', 'unavailable'].includes(
          s.status,
        ) ||
        typeof s.url !== 'string' ||
        !/^https:\/\//.test(s.url) ||
        typeof s.detail !== 'string'
      )
        throw new ApiError(400, 'Invalid course source observation.');
    }
    if (
      input.status === 'complete' &&
      !academic.courses.every((c) =>
        input.sources.some(
          (s: any) => s.course === c.id && s.status === 'complete',
        ),
      )
    )
      throw new ApiError(400, 'A complete review must cover all five courses.');
    const updates = input.assessments || [];
    if (!Array.isArray(updates) || updates.length > 100)
      throw new ApiError(400, 'Invalid assessment updates.');
    if (input.status === 'failed' && updates.length)
      throw new ApiError(400, 'A failed review cannot change assessment data.');
    const assessments = [...academic.assessments];
    const changes = [];
    for (const a of updates as Assessment[]) {
      if (
        !a ||
        typeof a.id !== 'string' ||
        !academic.courses.some((c) => c.id === a.course) ||
        typeof a.title !== 'string' ||
        a.title.length > 300 ||
        !a.date ||
        !/^2026-\d{2}-\d{2}$/.test(a.date) ||
        Number.isNaN(Date.parse(a.date)) ||
        new Date(a.date).toISOString().slice(0, 10) !== a.date ||
        (a.time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time)) ||
        typeof a.status !== 'string' ||
        !/^https:\/\//.test(a.source)
      )
        throw new ApiError(
          400,
          'Invalid assessment; keep unpublished times null and provide source evidence.',
        );
      if (
        !input.sources.some(
          (s: any) =>
            s.course === a.course && ['complete', 'partial'].includes(s.status),
        )
      )
        throw new ApiError(
          400,
          'Assessment updates need a successful source observation.',
        );
      if (
        academic.excluded.some(
          (e) =>
            e.course === a.course &&
            (e.title.toLowerCase() === a.title.toLowerCase() ||
              e.id === a.id ||
              (e.date === a.date && /assignment/i.test(a.title))),
        )
      )
        throw new ApiError(
          409,
          'A provisional excluded assignment needs explicit review before it can become a deadline.',
        );
      const i = assessments.findIndex((x) => x.id === a.id);
      if (i >= 0 && assessments[i].course !== a.course)
        throw new ApiError(409, 'Assessment identity cannot change course.');
      changes.push({
        id: a.id,
        before: i >= 0 ? assessments[i] : null,
        after: a,
      });
      if (i >= 0) assessments[i] = a;
      else assessments.push(a);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const history = [
      ...(academic.history || []),
      {
        date: input.observedAt,
        status: input.status,
        detail: input.sources
          .map((s: any) => `${s.course}: ${s.status} — ${s.detail}`)
          .join('\n'),
      },
    ].slice(-40);
    const next = {
      ...academic,
      assessments,
      history,
      reviewedOn:
        input.status === 'complete'
          ? torontoDate(new Date(input.observedAt))
          : academic.reviewedOn,
      sourceStatus:
        input.status === 'complete'
          ? 'Complete review'
          : input.status === 'partial'
            ? 'Partial review; earlier data preserved'
            : 'Review failed; earlier data preserved',
    };
    const result = await db().batch([
      db()
        .prepare(
          'UPDATE records SET value=?,revision=revision+1,updated_at=? WHERE owner=? AND key=? AND revision=?',
        )
        .bind(
          JSON.stringify(next),
          now,
          user.userId,
          'academic',
          row!.revision,
        ),
      db()
        .prepare(
          'INSERT INTO records(owner,key,value,revision,updated_at) VALUES(?,?,?,1,?)',
        )
        .bind(
          user.userId,
          'review:' + id,
          JSON.stringify({ ...input, changes, previousAcademic: academic }),
          now,
        ),
    ]);
    if (!result[0].meta.changes)
      throw new ApiError(
        409,
        'Another review updated the dashboard. Reload and retry.',
      );
    return respond({ id, status: input.status, updated: changes.length });
  } catch (e) {
    return failure(e);
  }
}
