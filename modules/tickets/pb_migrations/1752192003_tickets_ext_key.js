/// <reference path="../pb_data/types.d.ts" />

// Adds `ext_key` to tickets: a dedup key for tickets created by external
// integrations (e.g. the alert bridge maps one analyzer alert_key -> one
// ticket, idempotently). Nullable; unused by human-filed tickets.
migrate(
  (app) => {
    const tickets = app.findCollectionByNameOrId("tickets");
    tickets.fields.add(new Field({ name: "ext_key", type: "text", max: 200 }));
    tickets.indexes = [
      ...tickets.indexes,
      "CREATE INDEX idx_tickets_ext_key ON tickets (ext_key)"
    ];
    app.save(tickets);
  },
  (app) => {
    const tickets = app.findCollectionByNameOrId("tickets");
    const f = tickets.fields.getByName("ext_key");
    if (f) tickets.fields.removeById(f.id);
    tickets.indexes = tickets.indexes.filter((i) => !i.includes("idx_tickets_ext_key"));
    app.save(tickets);
  }
);
