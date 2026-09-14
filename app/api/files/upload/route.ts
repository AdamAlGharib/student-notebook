import {
  ApiError,
  bucket,
  checkOrigin,
  db,
  failure,
  identity,
  respond,
} from '@/lib/server';
export async function POST(request: Request) {
  try {
    const u = await identity();
    checkOrigin(request);
    if (Number(request.headers.get('content-length')) > 16000000)
      throw new ApiError(413, 'Attachments must be under 15 MB.');
    const form = await request.formData();
    const file = form.get('file');
    const noteId = form.get('noteId');
    if (
      !(file instanceof File) ||
      typeof noteId !== 'string' ||
      file.size > 15000000
    )
      throw new ApiError(400, 'Choose an attachment under 15 MB.');
    const extension = file.name.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      txt: 'text/plain',
      md: 'text/plain',
    };
    if (!extension || !types[extension])
      throw new ApiError(400, 'Use a PDF, PNG, JPG, WebP or text file.');
    if (
      !(await db()
        .prepare('SELECT id FROM notes WHERE owner=? AND id=?')
        .bind(u.userId, noteId)
        .first())
    )
      throw new ApiError(404, 'Lecture not found.');
    const id = crypto.randomUUID();
    const key = `${u.userId}/files/${id}`;
    await bucket().put(key, file.stream(), {
      httpMetadata: { contentType: types[extension] },
    });
    await db()
      .prepare(
        'INSERT INTO files(owner,id,note_id,name,type,object_key) VALUES(?,?,?,?,?,?)',
      )
      .bind(
        u.userId,
        id,
        noteId,
        file.name.slice(0, 200),
        types[extension],
        key,
      )
      .run();
    return respond({ id });
  } catch (e) {
    return failure(e);
  }
}
