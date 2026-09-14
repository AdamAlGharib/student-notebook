import type { Lecture } from '@/lib/domain';
import {
  body,
  bucket,
  db,
  failure,
  identity,
  readRecord,
  respond,
  writeRecord,
  ApiError,
  hash,
  lectureStatus,
} from '@/lib/server';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await identity();
    const { id } = await params;
    const n = await db()
      .prepare(
        'SELECT id,course,date,title,status,version,source_hash as sourceHash,object_key,updated_at as updatedAt FROM notes WHERE owner=? AND id=?',
      )
      .bind(user.userId, id)
      .first<any>();
    if (!n) throw new ApiError(404, 'Lecture not found.');
    const v = new URL(request.url).searchParams.get('version');
    let key = n.object_key;
    if (v) {
      const revision = await db()
        .prepare(
          'SELECT object_key,updated_at FROM note_revisions WHERE owner=? AND note_id=? AND version=?',
        )
        .bind(user.userId, id, Number(v))
        .first<{ object_key: string; updated_at: string }>();
      if (!revision) throw new ApiError(404, 'Revision not found.');
      key = revision.object_key;
      n.version = Number(v);
      n.updatedAt = revision.updated_at;
    }
    const obj = await bucket().get(key);
    if (!obj)
      throw new ApiError(503, 'The lecture source could not be loaded.');
    const [a, vs, fs] = await Promise.all([
      readRecord(user.userId, 'annotation:' + id),
      db()
        .prepare(
          'SELECT version,updated_at as updatedAt FROM note_revisions WHERE owner=? AND note_id=? ORDER BY version DESC',
        )
        .bind(user.userId, id)
        .all(),
      db()
        .prepare('SELECT id,name,type FROM files WHERE owner=? AND note_id=?')
        .bind(user.userId, id)
        .all(),
    ]);
    const lecture = await obj.json<Lecture>();
    delete n.object_key;
    return respond({
      ...lecture,
      ...n,
      status: lectureStatus(lecture),
      sourceHash: await hash(lecture.transcript),
      annotation: a ? JSON.parse(a.value) : '',
      annotationRevision: a?.revision || 0,
      versions: vs.results,
      files: fs.results,
      viewingVersion: v ? Number(v) : n.version,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await identity();
    const { id } = await params;
    const value = await body(request, 100000);
    if (
      typeof value.annotation !== 'string' ||
      value.annotation.length > 60000 ||
      !Number.isInteger(value.revision)
    )
      throw new ApiError(400, 'Invalid note edit.');
    if (
      !(await db()
        .prepare('SELECT id FROM notes WHERE owner=? AND id=?')
        .bind(user.userId, id)
        .first())
    )
      throw new ApiError(404, 'Lecture not found.');
    return respond({
      revision: await writeRecord(
        user.userId,
        'annotation:' + id,
        value.annotation,
        value.revision,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
