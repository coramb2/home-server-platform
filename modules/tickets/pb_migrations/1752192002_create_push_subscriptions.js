/// <reference path="../pb_data/types.d.ts" />

// Web Push subscriptions — one row per device/browser a user has enabled
// notifications on. The sender service (modules/push) reads these to deliver
// Web Push on assignment/comment.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const subs = new Collection({
      type: "base",
      name: "push_subscriptions",
      // Owner-scoped; any signed-in user may create their own.
      listRule: "@request.auth.id = user",
      viewRule: "@request.auth.id = user",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id = user",
      deleteRule: "@request.auth.id = user",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { name: "endpoint", type: "text", required: true, max: 1000 },
        { name: "p256dh", type: "text", required: true, max: 500 },
        { name: "auth", type: "text", required: true, max: 500 },
        { name: "ua", type: "text", max: 400 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint)"],
    });

    app.save(subs);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("push_subscriptions"));
  }
);
