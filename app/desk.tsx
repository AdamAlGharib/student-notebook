'use client';
import { useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  MapPin,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { Checkbox } from '@/components/ui/checkbox';
import {
  type DashboardData,
  type Assessment,
  type DeskState,
  torontoDate,
  classesOn,
  dayLabel,
  clockLabel,
  addDays,
  parentCourse,
} from '@/lib/domain';
import NoteLibrary, { api } from './note-library';
import { GradesPanel, StudyPanel } from './study-panels';
import { NotebookSettings } from './notebook-settings';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import './notebook.css';

const nav = [
  ['Overview', 'This week'],
  ['Schedule', 'Timetable'],
  ['Assessments', 'Deadlines'],
  ['Lecture notes', 'Notes'],
  ['Study plan', 'Study plan'],
  ['Grades', 'Grades'],
] as const;

export default function Dashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState('Overview');
  const [selected, setSelected] = useState('all');
  const [date, setDate] = useState(torontoDate());
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [courseTab, setCourseTab] = useState('Notes');
  const [noteDirty, setNoteDirty] = useState(false);
  const today = torontoDate();
  const academic = data.academic;
  const courses = academic.courses;
  const currentCourse = courses.find((c) => c.id === selected);
  const weekStart = addDays(
    date,
    -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7),
  );
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const agenda = classesOn(academic, date);
  const capture = Array.from({ length: 8 }, (_, i) =>
    classesOn(academic, addDays(today, i + 1)),
  )
    .flat()
    .find(
      (s) =>
        s.kind !== 'Tutorial' &&
        Number(s.end_time.slice(0, 2)) * 60 +
          Number(s.end_time.slice(3)) -
          Number(s.start_time.slice(0, 2)) * 60 -
          Number(s.start_time.slice(3)) <=
          120,
    );
  const due = academic.assessments
    .filter(
      (a) => a.date && a.date >= today && !data.state.completed.includes(a.id),
    )
    .sort((a, b) => a.date!.localeCompare(b.date!));

  async function update(state: DeskState) {
    setBusy(true);
    try {
      const r = await api<{ revision: number }>('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, revision: data.stateRevision }),
      });
      setData((current) => ({ ...current, state, stateRevision: r.revision }));
      setMessage('Saved on this device.');
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setData(await api<DashboardData>('/api/data'));
  }
  function navigate(v: string, c = 'all') {
    if (noteDirty) {
      setMessage(
        'Your note has unsaved changes. Wait for autosave or download the unsaved edits.',
      );
      return;
    }
    setView(v);
    setSelected(c);
    setQuery('');
    setCourseTab('Notes');
    setMessage('');
  }
  function importLecture() {
    if (noteDirty) {
      setMessage('Wait for your personal notes to save before importing.');
      return;
    }
    setView('Lecture notes');
    setImportOpen(true);
  }
  function courseTag(id: string) {
    const c = courses.find((c) => c.id === parentCourse(id));
    return (
      <span
        className="course-tag"
        style={{ '--course': c?.color } as CSSProperties}
      >
        <i />
        {c?.code || id}
      </span>
    );
  }
  function assessmentRow(a: Assessment) {
    const completed = data.state.completed.includes(a.id);
    return (
      <div
        className={`assessment-row${completed ? ' assessment-complete' : ''}`}
        key={a.id}
      >
        <Checkbox
          aria-label={`Mark ${a.title} complete`}
          checked={completed}
          disabled={busy}
          onCheckedChange={(checked) =>
            update({
              ...data.state,
              completed: checked
                ? [...new Set([...data.state.completed, a.id])]
                : data.state.completed.filter((x) => x !== a.id),
            })
          }
        />
        <div className="assessment-main">
          {courseTag(a.course)}
          <a href={a.source} target="_blank" rel="noreferrer">
            {a.title}
            <ArrowUpRight size={14} />
          </a>
          {a.status === 'tentative' && (
            <span className="warning-text">Tentative date</span>
          )}
        </div>
        <div className="assessment-date">
          <strong>
            {a.date
              ? dayLabel(a.date, { month: 'short', day: 'numeric' })
              : 'Date TBD'}
          </strong>
          <span>{clockLabel(a.time)}</span>
        </div>
      </div>
    );
  }
  function agendaRows() {
    return agenda.length ? (
      agenda.map((s) => (
        <div className="class-row" key={`${s.course}-${s.start_time}`}>
          <div className="class-time">
            <strong>{clockLabel(s.start_time)}</strong>
            <span>{clockLabel(s.end_time)}</span>
          </div>
          <div className="class-detail">
            <button
              className="agenda-course"
              onClick={() => navigate('Course', s.parent)}
            >
              {courseTag(s.parent)}
              <h3>
                {courses.find((c) => c.id === s.parent)?.name || s.course}
              </h3>
            </button>
            <p>
              <MapPin size={13} />
              {s.location.replace(', Carleton University', '')}
              <span>·</span>
              {s.kind || 'Lecture'}
            </p>
          </div>
        </div>
      ))
    ) : (
      <div className="notebook-empty-day">
        <h3>A clear page.</h3>
        <p>No classes in the saved timetable for this day.</p>
      </div>
    );
  }

  const pageTitle = currentCourse
    ? currentCourse.code
    : view === 'Overview'
      ? 'The week ahead.'
      : view === 'Connections'
        ? 'Keeping your notebook.'
        : nav.find(([key]) => key === view)?.[1] || view;

  return (
    <div className="notebook">
      <a className="notebook-skip" href="#notebook-content">
        Skip to notebook
      </a>
      <header className="notebook-header">
        <div className="notebook-masthead">
          <button
            className="notebook-title"
            onClick={() => navigate('Overview')}
          >
            Adam’s notebook<span className="notebook-title-dot">.</span>
          </button>
          <div className="notebook-edition">
            <span>Personal study notebook</span>
            <strong>Fall 2026</strong>
          </div>
        </div>
        <nav className="notebook-nav" aria-label="Notebook sections">
          <div className="notebook-nav-pages">
            {nav.map(([key, label]) => (
              <button
                key={key}
                aria-current={
                  view === key && selected === 'all' ? 'page' : undefined
                }
                onClick={() => navigate(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="notebook-settings-link"
            aria-current={view === 'Connections' ? 'page' : undefined}
            onClick={() => navigate('Connections')}
          >
            Data & backups
          </button>
        </nav>
      </header>

      <div className="notebook-layout">
        <aside className="notebook-margin" aria-label="Course index">
          <p className="notebook-margin-label">In this notebook</p>
          <div className="notebook-course-index">
            {courses.map((c, index) => (
              <button
                key={c.id}
                className={selected === c.id ? 'is-selected' : undefined}
                aria-current={selected === c.id ? 'page' : undefined}
                onClick={() => navigate('Course', c.id)}
                style={{ '--course': c.color } as CSSProperties}
              >
                <span className="notebook-course-number">0{index + 1}</span>
                <span>
                  <strong>{c.code}</strong>
                  <small>{c.name || 'Course notes & assessments'}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="notebook-margin-note">
            <span>Last school review</span>
            <strong>
              {dayLabel(academic.reviewedOn, { month: 'long', day: 'numeric' })}
            </strong>
            <p>
              {academic.history?.at(-1)?.status === 'partial'
                ? 'Partial review. Earlier information is preserved.'
                : academic.history?.at(-1)?.status === 'failed'
                  ? 'Latest review unavailable. Earlier information is preserved.'
                  : 'From your saved course sources.'}
            </p>
          </div>
        </aside>

        <main className="notebook-main" id="notebook-content" tabIndex={-1}>
          <div className="notebook-page-heading">
            <div>
              <p className="eyebrow">
                {currentCourse ? 'Course notebook' : dayLabel(today)}
              </p>
              <h1>{pageTitle}</h1>
              {currentCourse && (
                <p className="subtext">
                  {currentCourse.name || 'Notes, assessments & grades'}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              className="notebook-import"
              onClick={importLecture}
            >
              <Plus size={15} /> Add lecture
            </Button>
          </div>
          <output className="save-status" aria-live="polite">
            {busy ? 'Saving…' : message}
          </output>

          {view === 'Course' && (
            <Tabs
              className="course-tabs"
              value={courseTab}
              onValueChange={(v) => {
                if (noteDirty) {
                  setMessage('Wait for your personal notes to save.');
                  return;
                }
                setCourseTab(String(v));
              }}
            >
              <TabsList>
                {['Notes', 'Assessments', 'Grades'].map((t) => (
                  <TabsTrigger key={t} value={t}>
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {view === 'Overview' ? (
            <>
              <section className="notebook-week" aria-label="Week agenda">
                <div className="notebook-week-heading">
                  <p>
                    {dayLabel(weekStart, { month: 'long', day: 'numeric' })}
                    {' — '}
                    {dayLabel(addDays(weekStart, 6), {
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                  <div className="notebook-week-controls">
                    <button
                      aria-label="Previous week"
                      onClick={() => setDate(addDays(date, -7))}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button onClick={() => setDate(today)}>Today</button>
                    <button
                      aria-label="Next week"
                      onClick={() => setDate(addDays(date, 7))}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="notebook-week-days">
                  {week.map((d) => {
                    const dayClasses = classesOn(academic, d);
                    return (
                      <button
                        key={d}
                        className={`${date === d ? 'is-selected ' : ''}${today === d ? 'is-today' : ''}`}
                        onClick={() => setDate(d)}
                        aria-pressed={date === d}
                        aria-label={`${dayLabel(d)}, ${dayClasses.length} scheduled ${dayClasses.length === 1 ? 'class' : 'classes'}`}
                      >
                        <span>{dayLabel(d, { weekday: 'short' })}</span>
                        <strong>{Number(d.slice(-2))}</strong>
                        <div className="notebook-day-marks" aria-hidden="true">
                          {dayClasses.map((s) => (
                            <i
                              key={`${s.course}-${s.start_time}`}
                              style={{
                                background: courses.find(
                                  (c) => c.id === s.parent,
                                )?.color,
                              }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="notebook-overview-columns">
                <section className="notebook-agenda">
                  <div className="section-heading">
                    <h2>
                      {date === today
                        ? 'Today’s pages'
                        : dayLabel(date, { weekday: 'long' })}
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => navigate('Schedule')}
                    >
                      Timetable <ArrowRight size={14} />
                    </button>
                  </div>
                  {agendaRows()}
                  <p className="notebook-caption">
                    All class times in Toronto.
                  </p>
                </section>
                <section className="notebook-deadlines">
                  <div className="section-heading">
                    <h2>Coming due</h2>
                    <button
                      className="text-button"
                      onClick={() => navigate('Assessments')}
                    >
                      All <ArrowRight size={14} />
                    </button>
                  </div>
                  {due.length ? (
                    due.slice(0, 4).map(assessmentRow)
                  ) : (
                    <p className="notebook-no-deadlines">
                      No upcoming deadlines in the saved schedule.
                    </p>
                  )}
                </section>
              </div>

              <section className="notebook-recent">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">From the lecture hall</p>
                    <h2>Lecture notes</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate('Lecture notes')}
                  >
                    Open notes <ArrowRight size={14} />
                  </button>
                </div>
                {data.notes.length ? (
                  <div className="notebook-recent-list">
                    {[...data.notes]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 4)
                      .map((note) => (
                        <button
                          key={note.id}
                          onClick={() => navigate('Course', note.course)}
                        >
                          <span className="notebook-note-date">
                            {dayLabel(note.date, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <div>
                            {courseTag(note.course)}
                            <h3>{note.title}</h3>
                            <p>{note.excerpt.slice(0, 150)}</p>
                          </div>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                  </div>
                ) : (
                  <div className="notebook-first-note">
                    <span className="notebook-first-number" aria-hidden="true">
                      01
                    </span>
                    <div>
                      <h3>Your first lecture goes here.</h3>
                      <p>
                        Record a class in Wispr. I’ll turn the transcript into
                        notes, explanations, and questions to return to.
                      </p>
                      {capture && (
                        <p className="notebook-recording-cue">
                          Next recording to try:{' '}
                          <strong>
                            {courses.find((c) => c.id === capture.parent)?.code}
                          </strong>
                          {' · '}
                          {dayLabel(capture.date, {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {' · '}
                          {clockLabel(capture.start_time)}
                        </p>
                      )}
                      <button className="text-button" onClick={importLecture}>
                        Add a lecture <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : view === 'Schedule' ? (
            <section className="panel notebook-schedule">
              <div className="section-heading">
                <h2>{dayLabel(date)}</h2>
                <div className="inline-actions">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous day"
                    onClick={() => setDate(addDays(date, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <Input
                    type="date"
                    aria-label="Schedule date"
                    value={date}
                    onChange={(e) => setDate(e.target.value || today)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next day"
                    onClick={() => setDate(addDays(date, 1))}
                  >
                    <ChevronRight />
                  </Button>
                  <Button variant="outline" onClick={() => setDate(today)}>
                    Today
                  </Button>
                </div>
              </div>
              {agendaRows()}
              <p className="panel-footnote">
                All times in Toronto. Thanksgiving: October 12 · Reading week:
                October 26–30 · December 11 follows Monday’s timetable.
              </p>
            </section>
          ) : view === 'Assessments' ||
            (view === 'Course' && courseTab === 'Assessments') ? (
            <section className="panel notebook-assessments">
              <div className="section-heading">
                <h2>
                  {currentCourse ? 'Course assessments' : 'Assessment calendar'}
                </h2>
                <label className="search" htmlFor="notebook-assessment-search">
                  <Search size={16} />
                  <Input
                    id="notebook-assessment-search"
                    aria-label="Search assessments"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find an assessment"
                  />
                </label>
              </div>
              {academic.assessments
                .filter(
                  (a) =>
                    (selected === 'all' || a.course === selected) &&
                    a.title.toLowerCase().includes(query.toLowerCase()),
                )
                .sort((a, b) =>
                  (a.date || '9999').localeCompare(b.date || '9999'),
                )
                .map(assessmentRow)}
              {!academic.assessments.some(
                (a) =>
                  (selected === 'all' || a.course === selected) &&
                  a.title.toLowerCase().includes(query.toLowerCase()),
              ) && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No matching assessments</EmptyTitle>
                    <EmptyDescription>Try a different search.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              <div className="section-heading notebook-finals-heading">
                <h3>Final exams · Dates to be announced</h3>
              </div>
              {academic.finals
                .filter((a) => selected === 'all' || a.course === selected)
                .map((a) => (
                  <div key={a.id} className="final-row">
                    {courseTag(a.course)}
                    <strong>{a.weight_percent}% of course</strong>
                    <span>Date & time TBD</span>
                  </div>
                ))}
              <p className="panel-footnote">
                Four provisional COMP 3000 assignment dates remain excluded.
                Checking an item records your progress; it does not submit
                coursework.
              </p>
            </section>
          ) : view === 'Lecture notes' ||
            (view === 'Course' && courseTab === 'Notes') ? (
            <NoteLibrary
              key={selected}
              onDirtyChange={setNoteDirty}
              data={data}
              course={selected}
              refresh={refresh}
              update={update}
              openImport={importOpen}
              onImportClose={() => setImportOpen(false)}
            />
          ) : view === 'Grades' ||
            (view === 'Course' && courseTab === 'Grades') ? (
            <GradesPanel
              key={selected}
              data={data}
              update={update}
              busy={busy}
              course={selected}
            />
          ) : view === 'Study plan' ? (
            <StudyPanel data={data} update={update} busy={busy} />
          ) : (
            <NotebookSettings
              data={data}
              update={update}
              busy={busy}
              refresh={refresh}
            />
          )}

          <footer className="notebook-footer">
            <span>
              Fall 2026 <span aria-hidden="true">/</span> Personal study
              notebook
            </span>
            <span>Edits saved on this device.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
