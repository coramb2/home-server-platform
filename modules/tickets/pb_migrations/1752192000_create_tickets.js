/// <reference path="../pb_data/types.d.ts" />

// Tickets collection — the core of the household ticket system.
// Time tracking is derived from `created` (autodate) and `done_at`/`done_by`,
// so "time to complete, per person" needs no extra table.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const authed = "@request.auth.id != ''";

    const tickets = new Collection({
      type: "base",
      name: "tickets",
      // Behind Tailscale + PocketBase auth; any signed-in household member may CRUD.
      listRule: authed,
      viewRule: authed,
      createRule: authed,
      updateRule: authed,
      deleteRule: authed,
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "description", type: "editor" },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["Backlog", "Open", "In Progress", "Waiting", "Done"],
        },
        {
          name: "priority",
          type: "select",
          maxSelect: 1,
          values: ["P1", "P2", "P3", "P4"],
        },
        {
          name: "category",
          type: "select",
          maxSelect: 1,
          values: ["repair", "planning", "project", "errand", "it-server", "fun", "security"],
        },
        { name: "assignee", type: "relation", collectionId: users.id, maxSelect: 1 },
        { name: "created_by", type: "relation", collectionId: users.id, maxSelect: 1 },
        { name: "due_date", type: "date" },
        { name: "done_at", type: "date" },
        { name: "done_by", type: "relation", collectionId: users.id, maxSelect: 1 },
        {
          name: "attachments",
          type: "file",
          maxSelect: 10,
          maxSize: 10485760,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_tickets_status ON tickets (status)",
        "CREATE INDEX idx_tickets_assignee ON tickets (assignee)",
      ],
    });

    app.save(tickets);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("tickets"));
  }
);
