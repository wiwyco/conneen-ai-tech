# Client Portal Feature Map

This maps the selected feature numbers to the implemented files so the portal can be debugged in small pieces.

## Authentication and Access

1. Client login: `/portal`, `/api/portal/login`, `src/lib/portal/auth.ts`
2. Admin login / role detection: `/api/portal/me`, admin-only UI sections
3. Role permissions: `src/lib/portal/auth.ts`, `src/lib/portal/records.ts`
86. Secure invite system: `/api/portal/users`, `/api/portal/accept-invite`
87. Password reset scaffolding: `/api/portal/request-access-link`
88. Magic link scaffolding: `/api/portal/request-access-link`
89. Two-factor flag support: `portal_users.mfa_enabled`
92. Row-level security baseline: `supabase/client_portal.sql`
93. Admin seed/bootstrap: `/api/portal/bootstrap-admin`

## Client Workspace

4. Dashboard: `/api/portal/dashboard`, portal dashboard view
5. Organization profile: `portal_clients`
6. Contacts: `portal_contacts`
31. Activity feed: `portal_timeline_events`
62. Client preferences: `portal_preferences`
63. Notifications: `portal_notifications`
64. Email notification event tracking: `portal_email_events`
83. Portal branding: `PortalApp.astro`, `client-portal.css`
84. Welcome/login page: portal login view
85. Custom setup tour from Scout inquiry: `portal_tour_steps`, dashboard tour panel, onboarding checklist
113. Responsive portal: `client-portal.css`
114. Simple client UI: client-limited sections and shared visibility

## Documents and Knowledge

7. Document library: `portal_documents`
8. Categories: document `category`
9. Versions: `portal_document_versions`
10. Admin-only document notes: `portal_document_notes.visibility`
11. Client-visible notes: `portal_document_notes.visibility`
12. Search: `/api/portal/search`
13. Tags: document and knowledge `tags`
16. Business knowledge + RAG-ready Scout: `portal_business_knowledge`, `portal_knowledge_chunks`, `/api/portal/ai`
38. Architecture notes: `portal_architecture_notes`
39. Requirements: `portal_requirements`
50. Training materials: `portal_training_materials`
51. Handover package: `portal_handover_items`
52. FAQ: `portal_faqs`
53. AI memory: `portal_ai_memories`
96. Import existing documents: `/api/portal/upload`
97. Markdown-style notes: textarea content fields
101. Document summarization: `/api/portal/ai`
102. Document Q&A: `/api/portal/ai`
103. Client memory assistant: `/api/portal/ai`
110. Export client package: `/api/portal/export`

## Workflows and Projects

17. Agile workflow inventory: `portal_workflows.agile_epic`
18. Workflow details: `portal_workflows`
19. Pain tracker: `portal_pain_points`
20. Opportunity backlog: `portal_opportunities`
21. Projects: `portal_projects`
22. Project details: `portal_projects`
23. Milestones: `portal_milestones`
24. Task board: `portal_tasks`
25. Assignments: `portal_tasks.assigned_to`
26. Due dates: `portal_tasks.due_date`
27. Task comments: `portal_task_comments`
28. Decisions: `portal_decisions`
29. Meeting notes: `portal_meetings`
30. Meeting action items: `portal_meeting_action_items`
32. Onboarding checklist: `portal_checklist_items`
33. Data request checklist: `portal_data_requests`
34. Data submissions: `portal_data_submissions`
35. System access: `portal_system_access`
40. Change requests: `portal_change_requests`
46-49. Support tickets, statuses, priority, history: `portal_support_tickets`, `portal_support_comments`
56. Business goals: `portal_business_goals`
57. Success metrics: `portal_success_metrics`
58. Before/after measurements: `portal_measurements`
59. ROI notes: `portal_roi_notes`
60. Risk register: `portal_risks`
61. Open questions: `portal_open_questions`
78. Calendar/events: `portal_calendar_events`

## Commercial Records

41. Estimate history: `portal_estimates`
42. Pricing explanation: pricing policy in Scout plus estimates table
43. Milestone payments: `portal_payments`
44. Invoices: `portal_invoices`
45. Contracts/SOWs: `portal_contracts`

## Admin Console and Analytics

65. Admin client list: `/api/portal/clients`, admin view
66. Admin client detail: client picker + dashboard
67. Admin analytics: `/api/portal/admin`
68. Engagement analytics: dashboard counts/activity
69. Project analytics: `/api/portal/admin`
70. Lead analytics: `/api/portal/admin`
71. Revenue/pipeline analytics: invoice/estimate/payment records
72. Support analytics: ticket counts/statuses
73. Document analytics: document counts/statuses
74. Workflow opportunity analytics: workflow/opportunity records
75. Admin notes: `portal_admin_notes`
76. Admin status labels: `portal_clients.admin_status`
77. Follow-up reminders: `portal_followup_reminders`
79. Audit log: `portal_audit_logs`
80. Visibility controls: `visibility` fields
81. Global search: `/api/portal/search`
82. Saved views/filter foundation: section tabs and client picker
94. Client creation: `/api/portal/clients`
95. Convert lead into client: `/api/portal/convert-lead`
98. Admin summaries: `/api/portal/ai`
99. Client-facing summaries: `/api/portal/ai`
100. Internal next actions: `/api/portal/ai`
104. Scope draft generator: `/api/portal/ai`
105. Meeting prep: `/api/portal/ai`
106. Follow-up email drafts: `/api/portal/ai`
107. Data readiness score: `/api/portal/ai`
108. Project health score: `/api/portal/ai`
109. Client health score: `/api/portal/ai`
111. Privacy/data deletion foundation: archive/export endpoints and schema
112. Archive completed clients: `/api/portal/archive-client`
115. Admin command center: admin portal view
