import { ApiError, bucket, db, failure, identity } from '@/lib/server';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await identity();
    const { id } = await params;
    const f = await db()
      .prepare('SELECT name,type,object_key FROM files WHERE owner=? AND id=?')
      .bind(u.userId, id)
      .first<{ name: string; type: string; object_key: string }>();
    if (!f) throw new ApiError(404, 'Attachment not found.');
    const object = await bucket().get(f.object_key);
    if (!object) throw new ApiError(503, 'The attachment is unavailable.');
    return new Response(object.body, {
      headers: {
        'Content-Type': f.type,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
