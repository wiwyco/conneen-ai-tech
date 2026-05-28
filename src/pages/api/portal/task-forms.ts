import type { APIRoute } from "astro";
import { logAudit, logTimeline } from "../../../lib/portal/activity";
import { canAccessClient, requirePortalAuth } from "../../../lib/portal/auth";
import { cleanText, jsonResponse, readJson } from "../../../lib/portal/http";
import { eq, insertRow, selectOne, updateRows } from "../../../lib/portal/supabase";

export const prerender = false;

type FormField = {
  name?: string;
  label?: string;
  type?: string;
  required?: boolean;
};

function normalizeFields(schema: unknown): Required<Pick<FormField, "name" | "label">>[] {
  if (!schema || typeof schema !== "object" || !Array.isArray((schema as any).fields)) return [];
  return (schema as any).fields
    .filter((field: FormField) => field && field.name && field.label)
    .map((field: FormField) => ({
      name: cleanText(field.name, 80).replace(/[^a-zA-Z0-9_-]/g, "_"),
      label: cleanText(field.label, 180),
    }))
    .filter((field: Required<Pick<FormField, "name" | "label">>) => field.name && field.label);
}

function formatMemoryContent(task: any, fields: Required<Pick<FormField, "name" | "label">>[], answers: Record<string, string>, submittedBy: string) {
  const lines = fields.map((field) => `- ${field.label}: ${answers[field.name] || "(not answered)"}`);
  return [
    `Customer completed the Scout form for task "${task.title || "Untitled task"}".`,
    `Submitted by: ${submittedBy}`,
    `Project task type: ${task.task_type || "customer_questions"}`,
    task.description ? `Task context: ${task.description}` : "",
    "",
    "Answers:",
    ...lines,
  ].filter((line) => line !== "").join("\n");
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await requirePortalAuth(request);
    const body = (await readJson<Record<string, unknown>>(request)) || {};
    const clientId = cleanText(body.clientId || body.client_id, 80) || auth.clientId || "";
    const taskId = cleanText(body.taskId || body.task_id, 80);
    const rawAnswers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, unknown> : {};

    if (!clientId || !taskId) return jsonResponse({ error: "Client and task are required." }, 400);
    if (!canAccessClient(auth, clientId)) return jsonResponse({ error: "Forbidden." }, 403);

    const task = await selectOne<any>("portal_tasks", { id: eq(taskId), client_id: eq(clientId) });
    if (!task) return jsonResponse({ error: "Task not found." }, 404);
    if (!auth.isAdmin && task.visibility === "internal") return jsonResponse({ error: "Forbidden." }, 403);
    if (!auth.isAdmin && task.assigned_to && task.assigned_to !== auth.user.id) {
      return jsonResponse({ error: "Only the assigned user can complete this form." }, 403);
    }
    if (task.form_response || task.completed_at || ["complete", "completed", "done"].includes(String(task.status || "").toLowerCase())) {
      return jsonResponse({ error: "This form has already been submitted." }, 409);
    }

    const fields = normalizeFields(task.form_schema);
    if (!fields.length) return jsonResponse({ error: "This task does not have a Scout form." }, 400);

    const answers = Object.fromEntries(
      fields.map((field) => [field.name, cleanText(rawAnswers[field.name], 4000)])
    );
    const requiredMissing = (task.form_schema?.fields || [])
      .filter((field: FormField) => field?.required)
      .map((field: FormField) => cleanText(field.name, 80).replace(/[^a-zA-Z0-9_-]/g, "_"))
      .filter((name: string) => !answers[name]);
    if (requiredMissing.length) return jsonResponse({ error: "Please answer every required question." }, 400);

    const submittedAt = new Date().toISOString();
    const [updatedTask] = await updateRows<any>(
      "portal_tasks",
      { id: eq(taskId), client_id: eq(clientId) },
      {
        form_response: {
          submitted_at: submittedAt,
          submitted_by_user_id: auth.user.id,
          submitted_by_name: auth.user.display_name,
          answers,
        },
        status: "complete",
        completed_at: submittedAt,
        updated_at: submittedAt,
      }
    );

    const memory = await insertRow<any>("portal_ai_memories", {
      client_id: clientId,
      title: `Customer response: ${task.title || "Scout form"}`,
      memory_type: "customer form response",
      content: formatMemoryContent(task, fields, answers, auth.user.display_name || auth.user.email),
      confidence: "customer-submitted",
      visibility: "internal",
    });

    await logAudit(auth, "complete_task_form", "portal_tasks", taskId, clientId, { memory_id: memory?.id || null });
    await logTimeline(clientId, `Customer completed form: ${task.title || "Task"}`, {
      auth,
      projectId: task.project_id || null,
      eventType: "task_form_completed",
      sourceTable: "portal_tasks",
      sourceId: taskId,
      visibility: "shared",
    });

    return jsonResponse({ task: updatedTask, memory });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not submit form." }, 500);
  }
};
