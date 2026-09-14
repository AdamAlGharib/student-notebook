import { body, failure, identity, importLecture, respond } from '@/lib/server';
export async function POST(request: Request) {
  try {
    const user = await identity();
    const value = await body(request);
    return respond(await importLecture(user.userId, value));
  } catch (e) {
    return failure(e);
  }
}
