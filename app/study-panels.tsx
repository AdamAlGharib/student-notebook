'use client';
import { useState, useRef } from 'react';
import {
  Plus,
  RefreshCw,
  Download,
  Check,
  ArrowUpRight,
  Target,
  ShieldCheck,
  Clock3,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  type DashboardData,
  type DeskState,
  type Grade,
  gradeSummary,
  torontoDate,
  buildStudyTasks,
  dayLabel,
} from '@/lib/domain';
import { Choice, download, api } from './note-library';
type Props = {
  data: DashboardData;
  update: (s: DeskState) => Promise<boolean>;
  busy: boolean;
  course?: string;
};
export function GradesPanel({ data, update, busy, course = 'all' }: Props) {
  const [selected, setSelected] = useState(
    course === 'all' ? data.academic.courses[0].id : course,
  );
  const [edits, setEdits] = useState<Grade[]>(data.state.grades);
  const c = data.academic.courses.find((c) => c.id === selected)!;
  const summary = gradeSummary(c, data.state.grades);
  function change(category: string, patch: Partial<Grade>) {
    const old = edits.find(
      (g) => g.course === c.id && g.category === category,
    ) || { course: c.id, category, score: null, feedback: '' };
    setEdits([
      ...edits.filter((g) => !(g.course === c.id && g.category === category)),
      { ...old, ...patch },
    ]);
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Grades & feedback</h2>
          <p className="subtext">
            Enter released results. Leave ungraded work blank.
          </p>
        </div>
        <Choice
          label="Grade course"
          value={selected}
          onChange={setSelected}
          options={data.academic.courses
            .filter((c) => course === 'all' || c.id === course)
            .map((c) => ({ value: c.id, label: c.code }))}
        />
      </div>
      <div className="grade-summary">
        <div>
          <span className="eyebrow">AVERAGE ON RECORDED RESULTS</span>
          <strong>
            {summary.average === null ? '—' : summary.average.toFixed(1) + '%'}
          </strong>
        </div>
        <div>
          <span className="eyebrow">COURSE WEIGHT REPRESENTED</span>
          <strong>{summary.coverage}%</strong>
          <Progress
            value={summary.coverage}
            aria-label="Course weight represented"
          />
        </div>
        <div>
          <span className="eyebrow">EARNED COURSE POINTS</span>
          <strong>
            {summary.earned.toFixed(1)} <small>/ 100</small>
          </strong>
        </div>
      </div>
      <div className="grade-form">
        {c.gradeCategories.map((cat) => {
          const g = edits.find(
            (g) => g.course === c.id && g.category === cat.id,
          );
          return (
            <div className="grade-category" key={cat.id}>
              <div>
                <h3>
                  {cat.label} <span className="muted">{cat.weight}%</span>
                </h3>
                <p className="help-text">
                  {cat.countBest
                    ? 'Best three of four quizzes count.'
                    : cat.dropLowest
                      ? 'Enter the released category total after the lowest two are dropped.'
                      : cat.itemWeightsKnown === false
                        ? 'Enter a released category total; individual weights are not yet verified.'
                        : 'Enter the released percentage for this assessment.'}
                </p>
              </div>
              <div>
                {cat.countBest ? (
                  <div className="quiz-scores">
                    {Array.from({ length: cat.totalItems || 4 }, (_, i) => (
                      <label key={i}>
                        Quiz {i + 1}
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={g?.scores?.[i] ?? ''}
                          placeholder="—"
                          onChange={(e) => {
                            const scores = [
                              ...(g?.scores || [null, null, null, null]),
                            ];
                            scores[i] =
                              e.target.value === ''
                                ? null
                                : Number(e.target.value);
                            change(cat.id, { scores });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="score-input">
                    Released mark (%)
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={g?.score ?? ''}
                      placeholder="Ungraded"
                      onChange={(e) =>
                        change(cat.id, {
                          score:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                )}
                <label className="feedback-label">
                  Instructor feedback
                  <Textarea
                    rows={2}
                    value={g?.feedback || ''}
                    onChange={(e) =>
                      change(cat.id, { feedback: e.target.value })
                    }
                    placeholder="What should you work on next?"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="review-flags">
        <strong>Course rules</strong>
        {c.gradeCaveats.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
        <p>
          This is a running record of entered results, not a predicted final
          grade. Use final released category totals for grouped assignments.
          Quiz selection remains provisional until all four results are known.
          Represented weight is not a claim that every assessment in that
          category has been graded.
        </p>
      </div>
      <div className="dialog-actions">
        <Button
          disabled={busy}
          onClick={() => update({ ...data.state, grades: edits })}
        >
          {busy ? 'Saving…' : 'Save grades & feedback'}
        </Button>
      </div>
    </section>
  );
}
export function StudyPanel({ data, update, busy }: Props) {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(data.academic.courses[0].id);
  const [date, setDate] = useState(torontoDate());
  const tasks = data.state.tasks;
  const visibleTasks = tasks.filter(t => data.academic.courses.some(c => c.id === t.course));
  const done = visibleTasks.filter((t) => t.done).length;
  function generate() {
    const generated = buildStudyTasks(data, torontoDate());
    const known = new Set(tasks.map((t) => t.id));
    return update({
      ...data.state,
      tasks: [...tasks, ...generated.filter((t) => !known.has(t.id))],
    });
  }
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Your study plan</h2>
            <p className="subtext">
              Build from upcoming assessments, then make it yours.
            </p>
          </div>
          <Button disabled={busy} onClick={generate}>
            <RefreshCw />
            Plan from deadlines
          </Button>
        </div>
        {visibleTasks.length > 0 && (
          <div className="plan-progress">
            <span>
              {done} of {visibleTasks.length} finished
            </span>
            <Progress value={(done / visibleTasks.length) * 100} />
          </div>
        )}
        {visibleTasks.map((t) => (
          <div className="study-task" key={t.id}>
            <Checkbox
              checked={t.done}
              disabled={busy}
              aria-label={'Complete ' + t.title}
              onCheckedChange={(checked) =>
                update({
                  ...data.state,
                  tasks: tasks.map((x) =>
                    x.id === t.id ? { ...x, done: checked } : x,
                  ),
                })
              }
            />
            <div>
              <Input
                className={t.done ? 'task-done' : ''}
                aria-label="Study task title"
                defaultValue={t.title}
                onBlur={(e) =>
                  e.target.value !== t.title &&
                  update({
                    ...data.state,
                    tasks: tasks.map((x) =>
                      x.id === t.id ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
              <p>{t.reason}</p>
              <span className="muted">
                {data.academic.courses.find((c) => c.id === t.course)?.code} ·{' '}
                {dayLabel(t.date, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        ))}
        {!visibleTasks.length && (
          <Empty>
            <EmptyHeader>
              <div className="empty-icon">
                <Target />
              </div>
              <EmptyTitle>Make room for the next important thing.</EmptyTitle>
              <EmptyDescription>
                Start with work due in the next two weeks, or add a study
                session below. Suggestions explain which deadline they are based
                on.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <form
          className="new-task"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            update({
              ...data.state,
              tasks: [
                ...tasks,
                {
                  id: crypto.randomUUID(),
                  title: title.trim(),
                  course,
                  date,
                  reason: 'Added by you.',
                  done: false,
                },
              ],
            }).then((saved) => saved && setTitle(''));
          }}
        >
          <Input
            aria-label="New study task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a study session…"
            required
            maxLength={300}
          />
          <Choice
            label="Study task course"
            value={course}
            onChange={setCourse}
            options={data.academic.courses.map((c) => ({
              value: c.id,
              label: c.code,
            }))}
          />
          <Input
            type="date"
            aria-label="Study date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            <Plus />
            Add
          </Button>
        </form>
      </section>
      <section className="panel feedback-panel">
        <div className="section-heading">
          <h2>Feedback to work with</h2>
        </div>
        {data.state.grades.filter((g) => g.feedback && data.academic.courses.some(c => c.id === g.course)).length ? (
          data.state.grades
            .filter((g) => g.feedback && data.academic.courses.some(c => c.id === g.course))
            .map((g) => (
              <div className="feedback-item" key={g.course + g.category}>
                <span className="course-tag">
                  {data.academic.courses.find((c) => c.id === g.course)?.code}
                </span>
                <p>{g.feedback}</p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    update({
                      ...data.state,
                      tasks: [
                        ...tasks,
                        {
                          id: crypto.randomUUID(),
                          course: g.course,
                          title: 'Review instructor feedback',
                          reason: g.feedback,
                          done: false,
                          date: torontoDate(),
                        },
                      ],
                    })
                  }
                >
                  Add a review session
                </Button>
              </div>
            ))
        ) : (
          <p className="pending">
            Instructor feedback will appear here after you record it with a
            grade. A low mark alone does not identify a topic weakness.
          </p>
        )}
      </section>
    </>
  );
}
export function ConnectionsPanel({
  data,
  update,
  busy,
  refresh,
}: Props & { refresh: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const restoreFile = useRef<HTMLInputElement>(null);
  async function review() {
    setBackupBusy(true);
    try {
      const r = await api<{ status: string; updated: number }>('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reviewText,
      });
      await refresh();
      setMessage(`${r.status} review saved; ${r.updated} assessment updates.`);
      setReviewText('');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBackupBusy(false);
    }
  }
  async function restore(f: File) {
    setBackupBusy(true);
    try {
      if (f.size > 20000000) throw new Error('Backup exceeds 20 MB.');
      const value = JSON.parse(await f.text());
      value.expectedRevision = data.stateRevision;
      const r = await api<{ imported: number }>('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      await refresh();
      setMessage(
        `Restored ${r.imported} lecture packages and saved study progress. Existing annotations and the current school snapshot are preserved.`,
      );
    } catch (e) {
      setMessage((e as Error).message);
      await refresh();
    } finally {
      setBackupBusy(false);
    }
  }
  async function backup() {
    setBackupBusy(true);
    try {
      const backup = await api<unknown>('/api/export');
      download(
        'study-desk-backup-' + torontoDate() + '.json',
        JSON.stringify(backup, null, 2),
        'application/json',
      );
      setMessage(
        'Backup downloaded. Attached files can be downloaded from each lecture.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBackupBusy(false);
    }
  }
  return (
    <div className="connections-grid">
      <section className="panel">
        <div className="section-heading">
          <h2>Data & imports</h2>
          <ShieldCheck size={20} />
        </div>
        <div className="connection-row">
          <div>
            <h3>Wispr lecture notes</h3>
            <p>Account access and meeting discovery verified September 14.</p>
          </div>
          <span className="status-badge">Awaiting first lecture</span>
        </div>
        <div className="connection-row">
          <div>
            <h3>School review</h3>
            <p>
              Saved timetable and assessment snapshot from{' '}
              {dayLabel(data.academic.reviewedOn)}.
            </p>
          </div>
          <span className="status-badge">
            {data.academic.history?.at(-1)?.status || 'Saved snapshot'}
          </span>
        </div>
        <div className="connection-row">
          <div>
            <h3>Scheduled updates</h3>
            <p>Weekdays at 6:30 p.m.; Sunday review at 6 p.m. Toronto time.</p>
          </div>
          <span className="status-badge">Not active</span>
        </div>
        <div className="connection-row">
          <div>
            <h3>Lecture recording cap</h3>
            <p>
              Two hours last observed. COMP 4114 requires the three-hour
              setting.
            </p>
            <p>Weekly recording allowance remains unverified.</p>
          </div>
        </div>
        <div className="connection-row">
          <div>
            <h3>Course sources</h3>
            <p>COMP 4114 Brightspace access still needs verification.</p>
            <div className="source-links">
              {data.academic.courses.map((c) => (
                <a key={c.id} href={c.source} target="_blank" rel="noreferrer">
                  {c.code}
                  <ArrowUpRight size={14} />
                </a>
              ))}
            </div>
          </div>
        </div>
        <details className="review-import">
          <summary>Import an academic review</summary>
          <p className="help-text">
            Paste the assistant’s review JSON. Missing or failed sources
            preserve earlier data; a full review must cover all five courses.
          </p>
          <Textarea
            rows={8}
            aria-label="Academic review JSON"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Paste the review package here…"
          />
          <Button disabled={backupBusy || !reviewText.trim()} onClick={review}>
            Import review
          </Button>
        </details>
        {data.academic.history?.map((h, i) => (
          <details className="review-history" key={i}>
            <summary>
              {new Date(h.date).toLocaleDateString('en-CA', {
                timeZone: 'America/Toronto',
              })}{' '}
              · {h.status}
            </summary>
            <p>{h.detail}</p>
          </details>
        ))}
      </section>
      <div>
        <section className="panel">
          <div className="section-heading">
            <h2>Process now</h2>
          </div>
          <p className="body-copy">
            Your assistant reads Wispr, prepares a source-linked lecture
            package, and imports it into this private desk. A website button
            cannot start the assistant in this chat.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              const saved = await update({
                ...data.state,
                lastRequest: new Date().toISOString(),
              });
              if (!saved) return;
              setMessage(
                'Request saved. Ask your assistant: “Process my new course recordings into Study Desk.”',
              );
            }}
          >
            <RefreshCw />
            Prepare processing request
          </Button>
          {data.state.lastRequest && (
            <p className="help-text">
              Last requested{' '}
              {new Date(data.state.lastRequest).toLocaleString('en-CA', {
                timeZone: 'America/Toronto',
              })}{' '}
              · Pending assistant
            </p>
          )}
          <div className="workflow-steps">
            <div>
              <i>1</i>
              <p>
                <strong>Capture</strong>Start and stop the full lecture in
                Wispr.
              </p>
            </div>
            <div>
              <i>2</i>
              <p>
                <strong>Prepare</strong>The assistant reads only identified
                course recordings and creates notes with source references.
              </p>
            </div>
            <div>
              <i>3</i>
              <p>
                <strong>Import</strong>Upload the lecture JSON here. The
                signed-in endpoint saves a new version; no redeployment.
              </p>
            </div>
          </div>
        </section>
        <section className="panel backup-panel">
          <h2>Take your work with you</h2>
          <p className="body-copy">
            Export courses, assessments, current lecture sources, annotations,
            grades, and study tasks. Attachments are downloaded separately.
          </p>
          <Button variant="outline" disabled={backupBusy} onClick={backup}>
            <Download />
            {backupBusy ? 'Preparing backup…' : 'Download backup'}
          </Button>
          <details className="restore-controls">
            <summary>Restore from a backup</summary>
            <p className="help-text">
              Restoring replaces study tasks, completion marks, and grades with
              the backup. A recovery checkpoint is kept. Existing personal
              annotations and current school dates are preserved.
            </p>
            <input
              ref={restoreFile}
              type="file"
              accept=".json"
              className="sr-only"
              aria-label="Study Desk backup"
              onChange={(e) =>
                e.target.files?.[0] && restore(e.target.files[0])
              }
            />
            <Button
              disabled={backupBusy}
              variant="outline"
              onClick={() => restoreFile.current?.click()}
            >
              Choose backup and restore
            </Button>
          </details>
        </section>
      </div>
      {message && (
        <p className="info-box" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
