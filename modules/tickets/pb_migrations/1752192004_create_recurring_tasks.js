/// <reference path="../pb_data/types.d.ts" />

// Recurring task templates. A daily cron (pb_hooks/recurring.pb.js) materializes
// due templates into real tickets and advances next_due by interval_days.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const authed = "@request.auth.id != ''";

    const c = new Collection({
      type: "base",
      name: "recurring_tasks",
      listRule: authed,
      viewRule: authed,
      createRule: authed,
      updateRule: authed,
      deleteRule: authed,
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "description", type: "editor" },
        {
          name: "category",
          type: "select",
          maxSelect: 1,
          values: ["repair", "planning", "project", "errand", "it-server", "fun", "security"],
        },
        { name: "priority", type: "select", maxSelect: 1, values: ["P1", "P2", "P3", "P4"] },
        { name: "assignee", type: "relation", collectionId: users.id, maxSelect: 1 },
        { name: "interval_days", type: "number", required: true, min: 1, onlyInt: true },
        { name: "next_due", type: "date", required: true },
        { name: "active", type: "bool" },
        { name: "last_created", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_recurring_due ON recurring_tasks (active, next_due)"],
    });

    app.save(c);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("recurring_tasks"));
  }
);
