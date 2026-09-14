import {
  bucket,
  db,
  failure,
  identity,
  loadDashboard,
  readRecord,
  respond,
} from '@/lib/server';
export async function GET() {
  try {
    const user = await identity();
    const dashboard = await loadDashboard();
    const rows = await db()
      .prepare('SELECT id,object_key FROM notes WHERE owner=?')
      .bind(user.userId)
      .all<{ id: string; object_key: string }>();
    if (rows.results.length > 150)
      return respond(
        {
          error:
            'Export lecture packages individually when the library has more than 150 lectures.',
        },
        413,
      );
    const lectures = [];
    let bytes = 0;
    for (const row of rows.results) {
      const object = await bucket().get(row.object_key);
      if (!object)
        return respond(
          { error: 'A source is unavailable; backup was not completed.' },
          503,
        );
      const text = await object.text();
      bytes += text.length;
      if (bytes > 20000000)
        return respond(
          {
            error:
              'The library exceeds the full backup size. Export lectures individually.',
          },
          413,
        );
      const annotation = await readRecord(user.userId, 'annotation:' + row.id);
      lectures.push({
        id: row.id,
        lecture: JSON.parse(text),
        annotation: annotation ? JSON.parse(annotation.value) : '',
      });
    }
    return respond({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      academic: dashboard.academic,
      state: dashboard.state,
      lectures,
      attachmentsIncluded: false,
    });
  } catch (e) {
    return failure(e);
  }
}
