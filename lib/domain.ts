export type Category = {
  id: string;
  label: string;
  weight: number;
  itemWeightsKnown?: boolean;
  dropLowest?: number;
  totalItems?: number;
  countBest?: number;
  countedItemWeight?: number;
};
export type Course = {
  id: string;
  code: string;
  name: string | null;
  color: string;
  instructor?: string;
  status?: 'active' | 'dropped';
  droppedOn?: string;
  gradeCategories: Category[];
  gradeCaveats: string[];
  source?: string;
};
export type Assessment = {
  id: string;
  course: string;
  title: string;
  date: string | null;
  time: string | null;
  end_time?: string | null;
  status: string;
  source: string;
  notes?: string;
  weight_percent?: number;
};
export type Series = {
  course: string;
  kind?: string;
  start_time: string;
  end_time: string;
  location: string;
  periods: { start: string; end_inclusive: string; days: string[] }[];
};
export type Academic = {
  courses: Course[];
  assessments: Assessment[];
  excluded: Assessment[];
  finals: Assessment[];
  series: Series[];
  reviewedOn: string;
  sourceStatus: string;
  history?: { date: string; status: string; detail: string }[];
};
export type NoteMeta = {
  id: string;
  course: string;
  date: string;
  title: string;
  status: string;
  version: number;
  updatedAt: string;
  sourceHash: string;
  excerpt: string;
};
export type Question = { question: string; answer: string; source?: string };
export type Lecture = {
  meetingId?: string;
  course: string;
  date: string;
  title: string;
  transcript: string;
  quickNotes?: string;
  detailedNotes?: string;
  questions?: Question[];
  sourceUrl?: string;
  sourceModifiedAt?: string;
  captureStatus: 'complete' | 'partial' | 'unknown';
  uncertainties?: string[];
  figures?: { title: string; description: string }[];
};
export type NoteDetail = NoteMeta &
  Lecture & {
    annotation: string;
    annotationRevision: number;
    versions: { version: number; updatedAt: string }[];
    files: { id: string; name: string; type: string }[];
  };
export type Grade = {
  course: string;
  category: string;
  score: number | null;
  scores?: (number | null)[];
  feedback: string;
};
export type Task = {
  id: string;
  course: string;
  title: string;
  reason: string;
  done: boolean;
  date: string;
};
export type DeskState = {
  completed: string[];
  grades: Grade[];
  tasks: Task[];
  practice: Record<string, { correct: number; attempts: number }>;
  lastRequest?: string;
};
export type DashboardData = {
  academic: Academic;
  notes: NoteMeta[];
  state: DeskState;
  stateRevision: number;
  name: string;
  local: boolean;
};
export const emptyState: DeskState = {
  completed: [],
  grades: [],
  tasks: [],
  practice: {},
};
export function torontoDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
export function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  },
) {
  return new Intl.DateTimeFormat('en-CA', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
}
export function clockLabel(time: string | null | undefined) {
  if (!time) return 'Time not published';
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}
export function parentCourse(id: string) {
  return id === 'COMP3000A1'
    ? 'COMP3000A'
    : id === 'ECON3210E02'
      ? 'ECON3210E'
      : id === 'COMP3000'
        ? 'COMP3000A'
        : id === 'COMP3004'
          ? 'COMP3004A'
          : id;
}
export function activeAcademic(academic: Academic): Academic {
  const courses = academic.courses.filter((course) => course.status !== 'dropped');
  const activeIds = new Set(courses.map((course) => course.id));
  const belongsToActiveCourse = (item: { course: string }) =>
    activeIds.has(item.course) || activeIds.has(parentCourse(item.course));
  return {
    ...academic,
    courses,
    assessments: academic.assessments.filter(belongsToActiveCourse),
    excluded: academic.excluded.filter(belongsToActiveCourse),
    finals: academic.finals.filter(belongsToActiveCourse),
    series: academic.series.filter(belongsToActiveCourse),
  };
}
export function classesOn(academic: Academic, date: string) {
  const day = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][
    new Date(date + 'T12:00:00Z').getUTCDay()
  ];
  return academic.series
    .filter((s) =>
      s.periods.some(
        (p) =>
          p.start <= date && p.end_inclusive >= date && p.days.includes(day),
      ),
    )
    .map((s) => ({ ...s, parent: parentCourse(s.course), date }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}
export function gradeSummary(course: Course, grades: Grade[]) {
  let earned = 0,
    coverage = 0;
  for (const cat of course.gradeCategories) {
    const g = grades.find(
      (x) => x.course === course.id && x.category === cat.id,
    );
    if (!g) continue;
    if (cat.countBest && cat.countedItemWeight) {
      const scores = (g.scores || [])
        .filter((x): x is number => typeof x === 'number')
        .sort((a, b) => b - a)
        .slice(0, cat.countBest);
      for (const s of scores) {
        coverage += cat.countedItemWeight;
        earned += (s / 100) * cat.countedItemWeight;
      }
    } else if (g.score !== null) {
      coverage += cat.weight;
      earned += (g.score / 100) * cat.weight;
    }
  }
  return {
    coverage,
    earned,
    average: coverage ? (earned / coverage) * 100 : null,
  };
}
export function buildStudyTasks(data: DashboardData, today: string): Task[] {
  return data.academic.assessments
    .filter(
      (a) =>
        a.date &&
        a.date >= today &&
        a.date <= addDays(today, 14) &&
        !data.state.completed.includes(a.id),
    )
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, 6)
    .map((a) => ({
      id: 'assessment-' + a.id,
      course: a.course,
      title: `Prepare: ${a.title}`,
      reason: `Due ${dayLabel(a.date!, { month: 'short', day: 'numeric' })}${a.time ? ' at ' + clockLabel(a.time) : '; cutoff not published'}. Based on the saved assessment schedule.`,
      done: false,
      date: today,
    }));
}
