export type Person = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role?: string;
};

export type TaskRow = {
  id: string;
  number: number;
  title: string;
  type: string;
  status: string;
  priority: string;
  necessity: string;
  area: string | null;
  labels: string[];
  dueAt: string | null;
  estimateHours: number | null;
  reopenCount: number;
  sortOrder: number;
  createdAt: string;
  activityAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  assignee: Person | null;
  reporter: Person | null;
  checklistTotal: number;
  checklistDone: number;
  comments: number;
  attachments: number;
  overdue: boolean;
  unread: boolean;
};

export type TaskListResponse = {
  items: TaskRow[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
  counts: Record<string, number>;
  mine: number;
  overdue: number;
};

export type TaskMeta = {
  me: { id: string; role: string };
  members: Person[];
  areas: string[];
  labels: string[];
};

export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  activityId: string | null;
  userId: string | null;
};

export type Activity = {
  id: string;
  kind: string;
  body: string | null;
  meta: Record<string, unknown>;
  editedAt: string | null;
  createdAt: string;
  user: Person | null;
};

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  doneAt: string | null;
  sortOrder: number;
};

export type TaskDetail = {
  id: string;
  number: number;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  necessity: string;
  area: string | null;
  pageUrl: string | null;
  labels: string[];
  dueAt: string | null;
  estimateHours: number | null;
  reopenCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  activityAt: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  reporterId: string | null;
  assigneeId: string | null;
  reporter: Person | null;
  assignee: Person | null;
  checklist: ChecklistItem[];
  activities: Activity[];
  attachments: Attachment[];
};

export type TaskDetailResponse = {
  task: TaskDetail;
  lastSeenAt: string | null;
  permissions: {
    manage: boolean;
    editContent: boolean;
    comment: boolean;
    checklist: boolean;
    take: boolean;
    estimate: boolean;
    transitions: string[];
  };
};

export function personName(p: Person | null | undefined): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.email;
}
