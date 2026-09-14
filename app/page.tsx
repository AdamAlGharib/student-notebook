import Dashboard from './desk';
import { loadDashboard, ApiError } from '@/lib/server';
import { chatGPTSignInPath } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  try {
    return <Dashboard initial={await loadDashboard()} />;
  } catch (e) {
    return (
      <main className="access-page">
        <div className="brand-mark">S</div>
        <h1>Your study desk</h1>
        <p>
          {e instanceof ApiError
            ? e.message
            : 'Your study data is temporarily unavailable. Please try again.'}
        </p>
        {e instanceof ApiError && e.status === 401 ? (
          <a
            className="primary-link"
            href={chatGPTSignInPath('/')}
            target="_top"
          >
            Sign in with ChatGPT
          </a>
        ) : (
          <a className="primary-link" href="/">
            Try again
          </a>
        )}
      </main>
    );
  }
}
