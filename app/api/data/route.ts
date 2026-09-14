import {
  body,
  bootstrap,
  failure,
  identity,
  loadDashboard,
  respond,
  validateState,
  writeRecord,
} from '@/lib/server';
export async function GET() {
  try {
    return respond(await loadDashboard());
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    const user = await identity();
    const value = await body(request, 200000);
    const academic = await bootstrap(user.userId);
    validateState(value.state, academic);
    if (!Number.isInteger(value.revision))
      return respond({ error: 'A revision is required.' }, 400);
    return respond({
      revision: await writeRecord(
        user.userId,
        'state',
        value.state,
        value.revision,
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
