import { eq, selectRows } from "./supabase";

async function safeSelectRows<T>(label: string, table: string, query: Record<string, unknown>): Promise<T[]> {
  try {
    return await selectRows<T>(table, query as any);
  } catch (error) {
    console.error(`Portal analytics skipped ${label}:`, error);
    return [];
  }
}

export async function getAdminAnalytics() {
  const [
    clients,
    projects,
    tasks,
    documents,
    tickets,
    leads,
    invoices,
    events,
  ] = await Promise.all([
    selectRows<any>("portal_clients", { select: "id,name,status,admin_status,created_at,archived_at", order: "created_at.desc" }),
    selectRows<any>("portal_projects", { select: "id,client_id,status,health_status,agile_stage,target_date", order: "created_at.desc" }),
    selectRows<any>("portal_tasks", { select: "id,client_id,status,priority,due_date", order: "created_at.desc" }),
    selectRows<any>("portal_documents", { select: "id,client_id,category,review_status,created_at", order: "created_at.desc" }),
    selectRows<any>("portal_support_tickets", { select: "id,client_id,status,priority,created_at,resolved_at", order: "created_at.desc" }),
    selectRows<any>("diagnostic_leads", { select: "id,status,workflow_type,created_at", order: "created_at.desc" }).catch(() => []),
    selectRows<any>("portal_invoices", { select: "id,client_id,amount,status,due_date,paid_at", order: "created_at.desc" }),
    selectRows<any>("portal_timeline_events", { select: "id,client_id,event_type,created_at", order: "created_at.desc", limit: 50 }),
  ]);

  const overdueTasks = tasks.filter((task) => task.due_date && !["done", "complete"].includes(task.status) && new Date(task.due_date) < new Date());
  const openTickets = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  const outstandingInvoices = invoices.filter((invoice) => !invoice.paid_at && invoice.status !== "void");

  return {
    counts: {
      clients: clients.length,
      activeClients: clients.filter((client) => !client.archived_at && client.status !== "archived").length,
      projects: projects.length,
      activeProjects: projects.filter((project) => project.status === "active").length,
      overdueTasks: overdueTasks.length,
      documents: documents.length,
      openTickets: openTickets.length,
      leads: leads.length,
      outstandingInvoices: outstandingInvoices.length,
    },
    clients,
    projects,
    tasks,
    documents,
    tickets,
    leads,
    invoices,
    events,
  };
}

export async function getClientDashboard(clientId: string, includeInternal = false) {
  const visibility = includeInternal ? undefined : "or=(visibility.eq.shared,visibility.is.null)";
  const scoped = { client_id: eq(clientId), order: "created_at.desc" };

  const [
    clientRows,
    contacts,
    documents,
    projects,
    tasks,
    decisions,
    meetings,
    timeline,
    tickets,
    goals,
    metrics,
    reminders,
    notifications,
    tourSteps,
  ] = await Promise.all([
    safeSelectRows<any>("client profile", "portal_clients", { id: eq(clientId), limit: 1 }),
    safeSelectRows<any>("contacts", "portal_contacts", { ...scoped, ...(visibility ? { or: "(visibility.eq.shared,visibility.is.null)" } : {}) }),
    safeSelectRows<any>("documents", "portal_documents", { ...scoped, ...(visibility ? { or: "(visibility.eq.shared,visibility.is.null)" } : {}) }),
    safeSelectRows<any>("projects", "portal_projects", { ...scoped, ...(visibility ? { or: "(visibility.eq.shared,visibility.is.null)" } : {}) }),
    safeSelectRows<any>("tasks", "portal_tasks", { ...scoped, ...(visibility ? { or: "(visibility.eq.shared,visibility.is.null)" } : {}) }),
    safeSelectRows<any>("decisions", "portal_decisions", { ...scoped, ...(visibility ? { or: "(visibility.eq.shared,visibility.is.null)" } : {}) }),
    safeSelectRows<any>("meetings", "portal_meetings", { ...scoped, ...(visibility ? { or: "(visibility.eq.shared,visibility.is.null)" } : {}) }),
    safeSelectRows<any>("timeline", "portal_timeline_events", { ...scoped, limit: 30, ...(visibility ? { or: "(visibility.eq.shared,visibility.is.null)" } : {}) }),
    safeSelectRows<any>("support tickets", "portal_support_tickets", { ...scoped, ...(visibility ? { or: "(visibility.eq.shared,visibility.is.null)" } : {}) }),
    safeSelectRows<any>("business goals", "portal_business_goals", scoped),
    safeSelectRows<any>("success metrics", "portal_success_metrics", scoped),
    includeInternal ? safeSelectRows<any>("follow-up reminders", "portal_followup_reminders", scoped) : Promise.resolve([]),
    safeSelectRows<any>("notifications", "portal_notifications", { ...scoped, limit: 20 }),
    safeSelectRows<any>("setup tour", "portal_tour_steps", { client_id: eq(clientId), order: "sort_order.asc" }),
  ]);

  return {
    client: clientRows[0] || null,
    contacts,
    documents,
    projects,
    tasks,
    decisions,
    meetings,
    timeline,
    tickets,
    goals,
    metrics,
    reminders,
    notifications,
    tourSteps,
  };
}
