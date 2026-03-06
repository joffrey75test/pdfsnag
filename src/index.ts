import { Hono } from "hono";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { companiesRouter } from "./routes/companies";
import { documentsRouter } from "./routes/documents";
import { gedRouter } from "./routes/ged";
import { invitesRouter } from "./routes/invites";
import { listsRouter } from "./routes/lists";
import { projectsRouter } from "./routes/projects";
import { syncRouter } from "./routes/sync";
import { tasksRouter } from "./routes/tasks";
import { requireAuth } from "./services/auth";
import { checkDbHealth, type AppEnv } from "./services/db";

const app = new Hono<AppEnv>();

app.get("/", (c) => c.redirect("/app/", 302));
app.get("/app", (c) => c.redirect("/app/", 302));

app.get("/health/db", async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ ok: false, error: "D1 binding DB is missing." }, 500);
  }

  try {
    const row = await checkDbHealth(db);
    return c.json({ ok: true, db: true, result: row }, 200);
  } catch (error) {
    return c.json(
      {
        ok: false,
        db: false,
        error: error instanceof Error ? error.message : "DB query failed",
      },
      500
    );
  }
});

app.use("/api/projects/*", requireAuth);
app.use("/api/projects", requireAuth);
app.use("/api/tasks/*", requireAuth);
app.use("/api/tasks", requireAuth);
app.use("/api/documents/*", requireAuth);
app.use("/api/documents", requireAuth);
app.use("/api/sync/*", requireAuth);
app.use("/api/sync", requireAuth);
app.use("/api/admin/*", requireAuth);
app.use("/api/admin", requireAuth);
app.use("/api/companies/*", requireAuth);
app.use("/api/companies", requireAuth);
app.use("/api/invites/*", requireAuth);
app.use("/api/invites", requireAuth);
app.use("/api/lists/*", requireAuth);
app.use("/api/lists", requireAuth);
app.route("/api/auth", authRouter);
app.route("/auth", authRouter);
app.route("/api/projects", projectsRouter);
app.route("/api/tasks", tasksRouter);
app.route("/api/documents", documentsRouter);
app.route("/api/sync", syncRouter);
app.route("/api/admin", adminRouter);
app.route("/api/companies", companiesRouter);
app.route("/api/invites", invitesRouter);
app.route("/api/lists", listsRouter);
app.route("/", gedRouter);

app.all("*", async (c) => {
  let res = await c.env.ASSETS.fetch(c.req.raw);
  const url = new URL(c.req.url);

  if (res.status === 404 && url.pathname.startsWith("/app/") && !/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
    const spaRequest = new Request(new URL("/app/index.html", url), c.req.raw);
    res = await c.env.ASSETS.fetch(spaRequest);
  }
  return res;
});

export default app;
