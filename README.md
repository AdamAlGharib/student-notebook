# Adam’s notebook

A personal academic notebook built with React and Vite for GitHub Pages. The public deployment contains the application and an AES-256-GCM encrypted content snapshot. A private key unlocks the content in the browser; there is no Google/ChatGPT sign-in or server API.

Deployment status: intended repository `AdamAlGharib/student-notebook`; repository creation, Pages deployment and hosted readback are pending. Record the verified live URL here after deployment. The former Sites server prototype was never deployed and is archived in a local Git tag.

## Content and device edits

The notebook has course pages, a Toronto timetable, source-linked assessments, lecture imports, source revisions, personal annotations, attachments, grades/feedback, study plans, practice, Markdown/print export and backup/restore. The interface uses a paper canvas, serif headings, a course index and weekly agenda.

The private master and key live outside this checkout:

- `../student-dashboard-private/notebook.json`: schema-version-2 content, with academic records, study state, all lecture versions, annotations and attachments.
- `../student-dashboard-private/unlock-key.json`: the 32-byte AES key in the notebook key-file format.
- Private incoming packages, browser backups and rollback copies also stay outside the repository.

Never commit these files, plaintext academic seed data, unlock links, school credentials or backups. Never put the key in client code, Pages configuration, GitHub Actions secrets/logs or the generated content file. The public `public/notebook.enc.json` contains only the encryption format, fresh IV and ciphertext with authentication tag. Anyone with the key can read it.

Browser annotations, grades, task progress, practice and imported files are encrypted in IndexedDB. They survive published updates but do not automatically sync between devices or back to the assistant. Device remembering stores a non-extractable CryptoKey locally; **Lock and forget this device** removes the remembered key.

**Download complete backup** exports private plaintext JSON with all lecture revisions, annotations, grades, tasks and attachments. Save it before changing browsers or clearing site data. Give a backup to the assistant to include local work in later published content. Browser restore preserves current academic data and existing annotations, restores study state, and saves an encrypted recovery checkpoint first.

## Updating and publishing

Run from this repository with Node 22.13 or newer. Inputs and the private master must be outside the repository; the update script also rejects symlinks into it. Default master path is `../student-dashboard-private/notebook.json`.

```sh
# Validate and apply a new or revised lecture. No publication occurs yet.
node --experimental-strip-types scripts/update-notebook.mjs lecture ../student-dashboard-private/incoming-lecture.json --dry-run
node --experimental-strip-types scripts/update-notebook.mjs lecture ../student-dashboard-private/incoming-lecture.json

# Apply a complete, evidence-reviewed academic snapshot.
node --experimental-strip-types scripts/update-notebook.mjs academic ../student-dashboard-private/academic-review.json

# Merge a supplied browser backup, retaining current school data and study state.
node --experimental-strip-types scripts/update-notebook.mjs backup ../student-dashboard-private/browser-backup.json

# Use this option only when intentionally adopting the backup's grades/tasks/progress.
node --experimental-strip-types scripts/update-notebook.mjs backup ../student-dashboard-private/browser-backup.json --state-from-backup
```

The update script validates the result, rejects stale or changed recording identities, preserves source revisions and creates a private rollback copy before replacing the master. Unchanged lectures are deduplicated. Backup imports retain the master's academic data and default study state; annotations merge by revision and conflicting attachment identities are rejected. Academic input must already be a merged snapshot retaining unavailable-source data, courses, exclusions, finals and timetable exceptions. Review meaningful date changes against current sources.

After changing the private master:

```sh
npm run content:prepare
npm run test:static
npx tsc --noEmit
npm run build
```

`content:prepare` reads the private master/key and writes only encrypted `public/notebook.enc.json`, using a fresh IV each time. It accepts explicit private paths via `npm run content:prepare -- --source /private/notebook.json --key /private/unlock-key.json`. Review the changed files and generated output for plaintext content or keys before committing. Commit the reviewed source/encrypted package and push to the configured branch; the GitHub Pages workflow builds and deploys the static site. The workflow needs no decryption key. Verify its success and unlock/read back the published lecture before marking an update published.

A browser import updates only that browser. The internal `/api/...` identifiers are handled by the browser's local data adapter; they are not hosted network endpoints. The website cannot call Wispr MCP, launch this assistant, use a school login, commit to GitHub or run a scheduled task.

## Lecture package

Required fields: `course`, `date` (ISO lecture date), `title`, `transcript`, and `captureStatus` (`complete`, `partial`, `unknown`). Optional fields: `meetingId`, `sourceModifiedAt`, `sourceUrl`, `quickNotes`, `detailedNotes`, `questions` (`question`, `answer`, optional `source`), `uncertainties`, and `figures` (`title`, `description`).

Always include the Wispr meeting ID and modification timestamp when available. Keep the same meeting ID/course/date for revisions. Manual identity derives from course/date/title. Use `[L12](#source-L12)` citations against newline-separated original transcript lines. Preserve supplied timestamps and speaker labels; invent neither. A finalized transcript does not prove the entire lecture was captured. Keep partial/uncertain recordings labelled and protect personal annotations during regeneration.

## Development and remaining checks

Use `npm install` and `npm run dev` for the local preview at `http://localhost:3000/`. Use `npm run build` for `dist/`, `npm run preview` to serve that build, and the static tests/typecheck above. The current static release is undergoing validation; the old server-authentication integration tests are historical evidence only.

First real course transcript validation, the recording allowance, scheduled source/browser access and recurring task activation remain pending. No scheduled processing or paid AI service is active. Assistant updates run when requested until an actual scheduled workflow has been tested and enabled.
