import {
  ApiError,
  body,
  bootstrap,
  db,
  failure,
  identity,
  importLecture,
  readRecord,
  respond,
  validateState,
  writeRecord,
} from '@/lib/server';
export async function POST(request: Request) {
  try {
    const user = await identity();
    const b = await body(request, 20000000);
    if (
      b.schemaVersion !== 1 ||
      !Array.isArray(b.lectures) ||
      b.lectures.length > 150
    )
      throw new ApiError(400, 'Choose a Study Desk backup.');
    const academic = await bootstrap(user.userId);
    validateState(b.state, academic);
    const current = await readRecord(user.userId, 'state');
    if (
      !Number.isInteger(b.expectedRevision) ||
      b.expectedRevision !== current?.revision
    )
      throw new ApiError(
        409,
        'Your data changed. Refresh before restoring the backup.',
      );
    const checkpoint = 'before-restore:' + crypto.randomUUID();
    await writeRecord(user.userId, checkpoint, {
      state: current ? JSON.parse(current.value) : null,
      academic,
    });
    const imported = [];
    const failed = [];
    for (const item of b.lectures) {
      try {
        const r = await importLecture(user.userId, item.lecture);
        const old = await readRecord(user.userId, 'annotation:' + r.id);
        if (
          typeof item.annotation === 'string' &&
          item.annotation.length <= 60000 &&
          (!old || JSON.parse(old.value) === '')
        )
          await writeRecord(user.userId, 'annotation:' + r.id, item.annotation);
        imported.push(r.id);
      } catch (e) {
        failed.push({
          id: item.id,
          error: e instanceof ApiError ? e.message : 'Lecture restore failed',
        });
      }
    }
    if (failed.length)
      return respond(
        {
          status: 'partial',
          imported,
          failed,
          error:
            'Some lectures could not be restored. Existing study progress and annotations are preserved.',
        },
        409,
      );
    await writeRecord(user.userId, 'state', b.state, current!.revision);
    return respond({
      status: 'complete',
      imported: imported.length,
      checkpoint,
      academicPreserved: true,
    });
  } catch (e) {
    return failure(e);
  }
}
