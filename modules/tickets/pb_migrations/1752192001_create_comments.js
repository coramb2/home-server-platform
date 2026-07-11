/// <reference path="../pb_data/types.d.ts" />

// Comment threads on tickets, for the back-and-forth.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const tickets = app.findCollectionByNameOrId("tickets");
    const authed = "@request.auth.id != ''";

    const comments = new Collection({
      type: "base",
      name: "comments",
      listRule: authed,
      viewRule: authed,
      createRule: authed,
      // Authors may edit/delete only their own comments.
      updateRule: "@request.auth.id = author",
      deleteRule: "@request.auth.id = author",
      fields: [
        {
          name: "ticket",
          type: "relation",
          required: true,
          collectionId: tickets.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: "author", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "body", type: "text", required: true, max: 5000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_comments_ticket ON comments (ticket)"],
    });

    app.save(comments);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("comments"));
  }
);
