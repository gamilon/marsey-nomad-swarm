export type RunStatus = "pending" | "planning" | "working" | "completed" | "failed";

export interface Task {
  id: string;
  description: string;
}

export interface Handoff {
  taskId: string;
  content: string;
  completedAt: string;
}

export interface Run {
  id: string;
  goal: string;
  metadata: Record<string, unknown>;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  plan: Task[];
  handoffs: Handoff[];
  error?: string;
}
