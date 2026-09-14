'use client';
import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
} from 'react';
import {
  Plus,
  Upload,
  FileText,
  ArrowLeft,
  Download,
  Paperclip,
  Check,
  Search,
  BookOpen,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  type DashboardData,
  type Lecture,
  type NoteDetail,
  type DeskState,
  torontoDate,
  dayLabel,
} from '@/lib/domain';
import {notebookApi,downloadAttachment} from '../lib/notebook-store';
export const api = notebookApi;
export function download(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(String(v))}
    >
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue>
          {options.find((o) => o.value === value)?.label || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g)
    .map((s, i) => {
      if (s.startsWith('**')) return <strong key={i}>{s.slice(2, -2)}</strong>;
      if (s.startsWith('`')) return <code key={i}>{s.slice(1, -1)}</code>;
      const m = s.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m && /^(https:\/\/|#source-L)/.test(m[2]))
        return (
          <a
            key={i}
            href={m[2]}
            target={m[2].startsWith('https') ? '_blank' : undefined}
            rel="noreferrer"
          >
            {m[1]}
          </a>
        );
      return s;
    });
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      {text.split(/(```[\s\S]*?```)/g).map((block, i) =>
        block.startsWith('```') ? (
          <pre key={i}>
            <code>
              {block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}
            </code>
          </pre>
        ) : (
          block.split('\n').map((line, j) =>
            line.startsWith('### ') ? (
              <h3 key={`${i}-${j}`}>{inline(line.slice(4))}</h3>
            ) : line.startsWith('## ') ? (
              <h2 key={`${i}-${j}`}>{inline(line.slice(3))}</h2>
            ) : line.startsWith('# ') ? (
              <h2 key={`${i}-${j}`}>{inline(line.slice(2))}</h2>
            ) : /^[-*] /.test(line) ? (
              <p className="bullet-line" key={`${i}-${j}`}>
                • {inline(line.slice(2))}
              </p>
            ) : line.trim() ? (
              <p key={`${i}-${j}`}>{inline(line)}</p>
            ) : (
              <br key={`${i}-${j}`} />
            ),
          )
        ),
      )}
    </div>
  );
}
export default function NoteLibrary({
  data,
  course = 'all',
  refresh,
  update,
  openImport,
  onImportClose,
  onDirtyChange,
}: {
  data: DashboardData;
  course?: string;
  refresh: () => Promise<void>;
  update: (s: DeskState) => Promise<boolean>;
  openImport: boolean;
  onImportClose: () => void;
  onDirtyChange: (v: boolean) => void;
}) {
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (openImport) setShowImport(true);
  }, [openImport]);
  async function open(id: string, version?: number) {
    if (dirty) {
      setError(
        'Wait for your personal notes to save before changing revisions.',
      );
      return;
    }
    setLoading(true);
    setError('');
    try {
      setDetail(
        await api<NoteDetail>(
          '/api/notes/' + id + (version ? '?version=' + version : ''),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const filtered = data.notes.filter(
    (n) =>
      (course === 'all' || n.course === course) &&
      `${n.title} ${n.course} ${n.excerpt}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="panel notes-panel">
        <div className="section-heading">
          <div>
            <h2>{detail ? detail.title : 'Lecture library'}</h2>
            <p className="subtext">
              {detail
                ? `${dayLabel(detail.date)} · Version ${detail.version}`
                : 'Your sources, explanations, and personal notes.'}
            </p>
          </div>
          <div className="inline-actions">
            {detail ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (dirty) {
                    setError('Your personal notes are not saved yet.');
                    return;
                  }
                  setDetail(null);
                }}
              >
                <ArrowLeft />
                Library
              </Button>
            ) : (
              <label className="search">
                <Search size={17} />
                <Input
                  aria-label="Search lecture library"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search titles and summaries"
                />
              </label>
            )}
            <Button
              onClick={() => {
                if (dirty) {
                  setError('Wait for your notes to save first.');
                  return;
                }
                setShowImport(true);
              }}
            >
              <Plus />
              Import lecture
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {loading ? (
          <p className="pending">Loading lecture…</p>
        ) : detail ? (
          <NoteReader
            onDirtyChange={(v) => {
              setDirty(v);
              onDirtyChange(v);
            }}
            key={detail.id}
            note={detail}
            reload={() => open(detail.id)}
            openVersion={(v) => open(detail.id, v)}
            data={data}
            update={update}
          />
        ) : filtered.length ? (
          <div className="note-list">
            {filtered.map((n) => {
              const c = data.academic.courses.find((c) => c.id === n.course);
              return (
                <button
                  key={n.id}
                  className="note-card"
                  onClick={() => open(n.id)}
                >
                  <div className="note-file" style={{ color: c?.color }}>
                    <FileText />
                  </div>
                  <div>
                    <span
                      className="course-tag"
                      style={{ '--course': c?.color } as CSSProperties}
                    >
                      {c?.code}
                    </span>
                    <h3>{n.title}</h3>
                    <p>{n.excerpt.slice(0, 140)}</p>
                    <span className="muted">
                      {dayLabel(n.date, { month: 'short', day: 'numeric' })} ·
                      Version {n.version}
                    </span>
                  </div>
                  <span className="status-badge">{n.status}</span>
                  <ChevronRight size={18} />
                </button>
              );
            })}
          </div>
        ) : (
          <Empty className="library-empty">
            <EmptyHeader>
              <div className="empty-icon">
                <NotebookIcon />
              </div>
              <EmptyTitle>
                {query
                  ? 'No matching lectures'
                  : 'A place for everything you learn.'}
              </EmptyTitle>
              <EmptyDescription>
                {query
                  ? 'Try a course code or a different word.'
                  : 'Record your lecture with Wispr, then import its transcript or the study package prepared by your assistant.'}
              </EmptyDescription>
            </EmptyHeader>
            <Button
              variant="outline"
              onClick={() => {
                if (dirty) {
                  setError('Wait for your notes to save first.');
                  return;
                }
                setShowImport(true);
              }}
            >
              <Upload />
              Import your first lecture
            </Button>
            <div className="import-flow">
              <span>1 · Record</span>
              <ChevronRight />
              <span>2 · Import</span>
              <ChevronRight />
              <span>3 · Review</span>
            </div>
          </Empty>
        )}
      </section>
      <ImportDialog
        courses={data.academic.courses}
        course={course}
        open={showImport}
        close={() => {
          setShowImport(false);
          onImportClose();
        }}
        done={async (id) => {
          setShowImport(false);
          onImportClose();
          await refresh();
          await open(id);
        }}
      />
    </>
  );
}
function NotebookIcon() {
  return <BookOpen size={29} />;
}
function ImportDialog({
  courses,
  course,
  open,
  close,
  done,
}: {
  courses: DashboardData['academic']['courses'];
  course: string;
  open: boolean;
  close: () => void;
  done: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Lecture>({
    course: course === 'all' ? courses[0].id : course,
    date: torontoDate(),
    title: '',
    transcript: '',
    captureStatus: 'unknown',
  });
  const [mode, setMode] = useState('transcript');
  const [packageText, setPackageText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  async function importFile(f: File) {
    setError('');
    if (f.size > 750000) {
      setError('Use a text or JSON file smaller than 750 KB.');
      return;
    }
    try {
      const text = await f.text();
      if (f.name.endsWith('.json')) {
        setMode('package');
        setPackageText(text);
      } else {
        setMode('transcript');
        setDraft({
          ...draft,
          transcript: text,
          title: draft.title || f.name.replace(/\.[^.]+$/, ''),
        });
      }
    } catch {
      setError('This file could not be read.');
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const lecture = mode === 'package' ? JSON.parse(packageText) : draft;
      const r = await api<{ id: string }>('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lecture),
      });
      await done(r.id);
      setDraft({ ...draft, title: '', transcript: '' });
      setPackageText('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="import-dialog">
        <DialogHeader>
          <DialogTitle>Import a lecture</DialogTitle>
          <DialogDescription>
            Keep the original source. Add generated notes now or in a later
            revision.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(String(v))}>
          <TabsList>
            <TabsTrigger value="transcript">Transcript / Markdown</TabsTrigger>
            <TabsTrigger value="package">Assistant package</TabsTrigger>
          </TabsList>
        </Tabs>
        <input
          ref={file}
          type="file"
          accept=".txt,.md,.json"
          className="sr-only"
          aria-label="Lecture source file"
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
        <Button variant="outline" onClick={() => file.current?.click()}>
          <Upload />
          Choose .txt, .md or .json
        </Button>
        {mode === 'transcript' ? (
          <div className="form-stack">
            <div className="form-columns">
              <label>
                Course
                <Choice
                  label="Lecture course"
                  value={draft.course}
                  onChange={(v) => setDraft({ ...draft, course: v })}
                  options={courses.map((c) => ({ value: c.id, label: c.code }))}
                />
              </label>
              <label>
                Lecture date
                <Input
                  type="date"
                  min="2026-09-02"
                  max="2026-12-31"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
            </div>
            <label>
              Lecture title
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Lecture topic or course and date"
              />
            </label>
            <label>
              Original transcript or exported note
              <Textarea
                rows={8}
                value={draft.transcript}
                onChange={(e) =>
                  setDraft({ ...draft, transcript: e.target.value })
                }
                placeholder="Paste the unedited lecture source here…"
              />
            </label>
            <label>
              Recording coverage
              <Choice
                label="Recording coverage"
                value={draft.captureStatus}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    captureStatus: v as Lecture['captureStatus'],
                  })
                }
                options={[
                  { value: 'unknown', label: 'Not checked yet' },
                  { value: 'complete', label: 'Full lecture captured' },
                  {
                    value: 'partial',
                    label: 'Recording ended early / partial',
                  },
                ]}
              />
            </label>
            <p className="help-text">
              Text imports are saved as sources awaiting study notes. This
              button does not run paid AI processing.
            </p>
          </div>
        ) : (
          <label className="form-stack">
            Lecture package JSON
            <Textarea
              className="code-input"
              rows={14}
              value={packageText}
              onChange={(e) => setPackageText(e.target.value)}
              placeholder={
                '{ "meetingId": "…", "course": "…", "date": "2026-09-15", "title": "…", "transcript": "…", "captureStatus": "complete", "quickNotes": "…", "detailedNotes": "…" }'
              }
            />
            <span className="help-text">
              The recording ID keeps repeat imports together. Existing personal
              notes are preserved.
            </span>
          </label>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? 'Saving lecture…' : 'Import lecture'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function NoteReader({
  note,
  reload,
  openVersion,
  data,
  update,
  onDirtyChange,
}: {
  note: NoteDetail;
  reload: () => Promise<void>;
  openVersion: (v: number) => void;
  data: DashboardData;
  update: (s: DeskState) => Promise<boolean>;
  onDirtyChange: (v: boolean) => void;
}) {
  const [annotation, setAnnotation] = useState(note.annotation);
  const [revision, setRevision] = useState(note.annotationRevision);
  const [saved, setSaved] = useState(note.annotation);
  const [saveState, setSaveState] = useState('Saved on this device');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('quick');
  const [error, setError] = useState('');
  const [find, setFind] = useState('');
  const [question, setQuestion] = useState(0);
  const [answer, setAnswer] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const stopped = useRef(false);
  useEffect(() => {
    onDirtyChange(annotation !== saved);
  }, [annotation, saved]);
  useEffect(() => {
    if (annotation === saved || busy || stopped.current) return;
    const timer = setTimeout(async () => {
      setBusy(true);
      setSaveState('Saving…');
      try {
        const r = await api<{ revision: number }>('/api/notes/' + note.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotation, revision }),
        });
        setRevision(r.revision);
        setSaved(annotation);
        setSaveState('Saved on this device');
      } catch (e) {
        stopped.current = true;
        setSaveState((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [annotation, saved, revision, busy, note.id]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (annotation !== saved) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [annotation, saved]);
  async function attach(f: File) {
    setError('');
    if (f.size > 15000000) {
      setError('Attachments must be under 15 MB.');
      return;
    }
    const form = new FormData();
    form.set('file', f);
    form.set('noteId', note.id);
    try {
      await api('/api/files/upload', { method: 'POST', body: form });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const qs = note.questions || [];
  const q = qs[question % Math.max(1, qs.length)];
  const sourceLines = note.transcript.split('\n');
  const exportText = `# ${note.title}\n\n${note.course} · ${note.date}\nCoverage: ${note.captureStatus}\n\n## Quick review\n${note.quickNotes || ''}\n\n## Detailed notes\n${note.detailedNotes || ''}\n\n## My notes\n${annotation}\n\n## Original source\n${note.transcript}`;
  return (
    <div className="note-reader">
      <div className="note-toolbar">
        <span className="status-badge">{note.status}</span>
        <span className="muted">Coverage: {note.captureStatus}</span>
        <div className="inline-actions">
          <Button
            variant="outline"
            onClick={() =>
              download(note.title + '.md', exportText, 'text/markdown')
            }
          >
            <Download />
            Markdown
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>
      </div>
      {note.captureStatus !== 'complete' || note.uncertainties?.length ? (
        <div className="review-flags">
          <strong>Check before studying</strong>
          {note.captureStatus !== 'complete' && (
            <p>
              Lecture capture is {note.captureStatus}. Missing board work and
              missing audio cannot be recovered from the transcript.
            </p>
          )}
          {note.uncertainties?.map((u, i) => (
            <p key={i}>{u}</p>
          ))}
        </div>
      ) : null}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="reader-tabs">
          {[
            ['quick', 'Quick review'],
            ['detailed', 'Detailed notes'],
            ['source', 'Transcript'],
            ['personal', 'My notes'],
            ['practice', 'Practice'],
          ].map(([v, l]) => (
            <TabsTrigger value={v} key={v}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="quick">
          {note.quickNotes ? (
            <Markdown text={note.quickNotes} />
          ) : (
            <div className="quiet-empty">
              <h3>Source saved. Study notes are next.</h3>
              <p>
                Ask your assistant to prepare a source-linked lecture package,
                then import it with the same identity.
              </p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="detailed">
          {note.detailedNotes ? (
            <Markdown text={note.detailedNotes} />
          ) : (
            <p className="pending">
              Detailed notes have not been generated for this source.
            </p>
          )}
        </TabsContent>
        <TabsContent value="source">
          <div className="source-heading">
            <label className="search">
              <Search size={16} />
              <Input
                aria-label="Find in transcript"
                placeholder="Find a concept in the source"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
            </label>
            {note.sourceUrl && (
              <a target="_blank" rel="noreferrer" href={note.sourceUrl}>
                Open original recording ↗
              </a>
            )}
          </div>
          <div className="transcript">
            {sourceLines.map((line, i) => (
              <div
                id={'source-L' + (i + 1)}
                key={i}
                className={
                  find && line.toLowerCase().includes(find.toLowerCase())
                    ? 'source-match'
                    : ''
                }
              >
                <a href={'#source-L' + (i + 1)}>L{i + 1}</a>
                <span>{line || ' '}</span>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="personal">
          <div className="section-heading">
            <div>
              <h3>Your annotations</h3>
              <p className="help-text">
                Autosaved on this device; imports never replace these.
              </p>
            </div>
            <span className="save-status" role="status">
              {saveState}
            </span>
          </div>
          <Textarea
            rows={14}
            value={annotation}
            onChange={(e) => {
              setAnnotation(e.target.value);
              setSaveState('Unsaved changes');
            }}
            placeholder="Add what clicked, your own examples, or questions for office hours…"
          />
          {stopped.current && (
            <Button
              variant="outline"
              onClick={() => download('unsaved-personal-notes.md', annotation)}
            >
              Download unsaved edits
            </Button>
          )}
        </TabsContent>
        <TabsContent value="practice">
          {q ? (
            <div className="practice-card">
              <span className="eyebrow">
                RETRIEVAL PRACTICE · {(question % qs.length) + 1} OF {qs.length}
              </span>
              <h2>{q.question}</h2>
              {answer ? (
                <>
                  <Markdown text={q.answer} />
                  {q.source && <p className="muted">Source: {q.source}</p>}
                  <div className="inline-actions">
                    {[false, true].map((correct) => (
                      <Button
                        key={String(correct)}
                        variant={correct ? 'default' : 'outline'}
                        onClick={async () => {
                          const key = note.id + ':' + (question % qs.length);
                          const old = data.state.practice[key] || {
                            correct: 0,
                            attempts: 0,
                          };
                          const savedPractice = await update({
                            ...data.state,
                            practice: {
                              ...data.state.practice,
                              [key]: {
                                correct: old.correct + Number(correct),
                                attempts: old.attempts + 1,
                              },
                            },
                          });
                          if (savedPractice) {
                            setQuestion(question + 1);
                            setAnswer(false);
                          }
                        }}
                      >
                        {correct ? 'Got it' : 'Review again'}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <Button onClick={() => setAnswer(true)}>Reveal answer</Button>
              )}
            </div>
          ) : (
            <div className="quiet-empty">
              <h3>No practice questions yet</h3>
              <p>
                Questions and source references can be included in the
                assistant’s lecture package.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <details className="source-references">
        <summary>Source reference · Original transcript</summary>
        <p className="help-text">
          Citations can link to these stable source lines from any notes tab.
        </p>
        {sourceLines.map((line, i) => (
          <p id={tab !== 'source' ? 'source-L' + (i + 1) : undefined} key={i}>
            <span className="muted">L{i + 1} </span>
            {line}
          </p>
        ))}
      </details>
      <div className="note-bottom">
        <div>
          <h3>Lecture materials</h3>
          <input
            type="file"
            ref={upload}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])}
          />
          <Button variant="outline" onClick={() => upload.current?.click()}>
            <Paperclip />
            Attach slides or images
          </Button>
          {note.files.map((f) => (
            <button
              className="file-link"
              key={f.id}
              onClick={() => downloadAttachment(f.id).catch(e=>setError(e.message))}
            >
              <FileText size={15} />
              {f.name}
            </button>
          ))}
        </div>
        <div>
          <h3>Source revisions</h3>
          <Choice
            label="Source revision"
            value={String(
              (note as NoteDetail & { viewingVersion?: number })
                .viewingVersion || note.version,
            )}
            onChange={(v) => openVersion(Number(v))}
            options={note.versions.map((v) => ({
              value: String(v.version),
              label: `Version ${v.version} · ${new Date(v.updatedAt).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })}`,
            }))}
          />
        </div>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
