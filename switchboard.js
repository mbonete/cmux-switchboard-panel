// Switchboard panel for cmux: which agents need you, which are working, which
// wait for your next step, and which went stale. Tap a row to jump to it.
//
// https://github.com/mbonete/cmux-switchboard-panel
//
// Install:  put this file in ~/.config/cmux/sidebars/switchboard.js
// Show:     cmux right-sidebar set custom switchboard
//           (or right-click the sidebar button and pick "switchboard")
//
// It runs inside cmux on live data, with no server. The "Full dashboard" link is
// optional: it opens the separate web dashboard (github.com/mbonete/cmux-switchboard)
// if you run it on localhost:4747.

const DASHBOARD_URL = "http://localhost:4747";
const C = {
  needs: "#FF9F0A",
  working: "#0A84FF",
  move: "#30D158",
  stale: "#8E8E93",
  faint: "#7f7f7f33",
};
const STALE_CHOICES = [
  { label: "1d", secs: 86400 },
  { label: "2d", secs: 172800 },
  { label: "1w", secs: 604800 },
];

const [staleSecs, setStaleSecs] = signal(172800);
const [showStale, setShowStale] = signal(false);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const now = () => num(data.clock()?.epoch) ?? 0;

// Prompts injected by tools (agent messages, task notices) start with "<"; they are not yours.
function human(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t && !t.startsWith("<") ? t : "";
}

function dirTail(d) {
  const parts = String(d ?? "").split("/").filter((p) => p.length > 0);
  return parts.length ? parts[parts.length - 1] : "";
}

function short(secs) {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  const d = Math.floor(h / 24);
  return d < 14 ? d + "d" : Math.floor(d / 7) + "w";
}

function clock(secs) {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m " + String(s % 60).padStart(2, "0") + "s";
  return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
}

// ---------------------------------------------------------------------------
// One row per live agent session.

const rows = computed(() => {
  const t = now();
  const out = [];
  for (const w of data.workspaces() ?? []) {
    const agents = (w.agents ?? []).filter((a) => a.status !== "ended");
    for (const a of agents) {
      const tab = (w.tabs ?? []).find((x) => x.id === a.panelId || x.surfaceId === a.panelId);
      const solo = agents.length === 1;
      const prompt = human(tab?.latestPrompt) || (solo ? human(w.latestPrompt) : "");
      const promptAt = num(tab?.latestAt) ?? (solo ? num(w.latestAt) : null);
      const lastAt = num(a.lastActivityAt);
      const unread = tab ? Boolean(tab.hasUnread) : (num(w.unread) ?? 0) > 0;
      // cmux re-stamps lastActivityAt when it restores sessions after a restart,
      // so the last prompt's time is the better signal for "stale".
      const activeAt = promptAt ?? lastAt ?? 0;

      // While an agent shows a question or a permission prompt, cmux can still report it as
      // "working" (the prompt runs inside its turn) but marks the workspace "needs-attention".
      // That lane belongs to the workspace, so it goes to the most recent agent in it.
      const asking = a.status === "needs_input" || (w.status === "needs-attention" && a === agents[0] && a.status !== "idle");

      let lane = "move";
      let reason = "";
      if (asking) {
        lane = "needs";
        reason = "Waiting for your answer or approval";
      } else if (a.status === "working") {
        lane = "working";
      } else if (t > 0 && t - activeAt > staleSecs()) {
        lane = "stale";
      } else if (unread || w.status === "needs-attention") {
        lane = "needs";
        reason = unread ? "New result you haven't read" : "Needs your attention";
      }

      const meta = [];
      const dir = dirTail(a.directory || w.directory);
      if (dir) meta.push(dir);
      if (w.branch) meta.push("⎇ " + w.branch + (w.dirty ? " •" : ""));
      for (const p of (w.ports ?? []).slice(0, 3)) meta.push(":" + p);
      const subs = (a.children ?? []).filter((c) => c.running).length;
      if (subs) meta.push(subs + (subs === 1 ? " subagent" : " subagents"));
      if (w.pr && num(w.pr.number) !== null) meta.push("PR #" + w.pr.number);

      out.push({
        key: w.id + ":" + a.id,
        lane,
        reason,
        wsId: w.id,
        surfaceId: a.panelId ?? a.surfaceId ?? null,
        order: num(w.index) ?? 999,
        title: w.title || a.title || "untitled",
        here: Boolean(w.selected),
        status: a.status,
        asking,
        since: num(a.sinceEpoch),
        lastAt,
        activeAt,
        prompt,
        meta: meta.join("  ·  "),
      });
    }
  }
  return out;
});

const by = (lane, sort) => computed(() => rows().filter((r) => r.lane === lane).sort(sort));
const needs = by("needs", (x, y) =>
  (x.asking ? 0 : 1) - (y.asking ? 0 : 1)
  || (x.since ?? x.lastAt ?? 0) - (y.since ?? y.lastAt ?? 0));
const working = by("working", (x, y) => x.order - y.order);
const move = by("move", (x, y) => (y.lastAt ?? 0) - (x.lastAt ?? 0));
const stale = by("stale", (x, y) => (y.activeAt ?? 0) - (x.activeAt ?? 0));

function timeLabel(r) {
  const t = now();
  if (r.lane === "working") return r.since ? clock(t - r.since) : "";
  if (r.asking) {
    const since = r.status === "needs_input" ? r.since ?? r.lastAt : r.lastAt;
    return since ? "waiting " + short(t - since) : "";
  }
  if (r.lane === "stale") return "idle " + short(t - r.activeAt);
  return r.lastAt ? short(t - r.lastAt) + " ago" : "";
}

function subtitle(r) {
  if (r.reason) return r.reason;
  if (r.prompt) return (r.lane === "working" ? "Working on: " : "You: ") + r.prompt;
  return r.lane === "working" ? "Working" : "";
}

// ---------------------------------------------------------------------------
// Activity strip: how many agents were working, last 15 minutes in 30 s buckets.
// History lives in the panel, so it starts filling when cmux loads it.

const BUCKET = 30;
const KEEP = 30;
const busy = new Map();
let backfilled = false;

const strip = computed(() => {
  const t = now();
  const b = Math.floor(t / BUCKET);
  const workingAgents = (data.workspaces() ?? []).flatMap((w) => w.agents ?? []).filter((a) => a.status === "working");
  if (!backfilled && t > 0 && (data.workspaces() ?? []).length > 0) {
    backfilled = true;
    for (const a of workingAgents) {
      const s = num(a.sinceEpoch);
      if (s === null) continue;
      for (let k = Math.max(b - KEEP + 1, Math.floor(s / BUCKET)); k < b; k += 1) busy.set(k, (busy.get(k) ?? 0) + 1);
    }
  }
  busy.set(b, Math.max(busy.get(b) ?? 0, workingAgents.length));
  for (const k of Array.from(busy.keys())) if (k <= b - KEEP || k > b) busy.delete(k);
  const levels = [];
  for (let k = b - KEEP + 1; k <= b; k += 1) levels.push(busy.get(k) ?? 0);
  return levels;
});

const BAR_H = 22;

function activityStrip() {
  const bars = Array.from({ length: KEEP }, (_, i) => ({ id: String(i), i }));
  const peak = () => Math.max(3, ...strip());
  return VStack({ spacing: 3 }, [
    HStack({ spacing: 2 }, [
      ForEach({ items: () => bars, key: (x) => x.id }, (x) =>
        VStack({ spacing: 0 }, [
          Spacer({ minLength: 0 }),
          RoundedRectangle({ cornerRadius: 1.5 })
            .fill(() => (strip()[x().i] > 0 ? C.working : C.faint))
            .frame(() => {
              const v = strip()[x().i];
              return { width: 5, height: v > 0 ? Math.max(3, (v / peak()) * BAR_H) : 2 };
            }),
        ]).frame({ height: BAR_H })),
      Spacer({ minLength: 0 }),
    ]),
    HStack({ spacing: 4 }, [
      Text("agents working · last 15 min").font(9.5).color("tertiary").lineLimit(1).fixedSize("horizontal"),
      Spacer({ minLength: 0 }),
    ]),
  ]).paddingHorizontal(10);
}

// ---------------------------------------------------------------------------
// Views

function jump(r) {
  cmux("workspace.select", { workspace_id: r.wsId });
  if (r.surfaceId) cmux("surface.focus", { surface_id: r.surfaceId, workspace_id: r.wsId });
}

function tally(label, color, list, onTap) {
  return VStack({ spacing: 0 }, [
    Text(() => String(list().length))
      .font(17).weight("semibold").monospaced()
      .color(() => (list().length ? color : "tertiary")),
    Text(label).font(9.5).color("secondary").lineLimit(1).fixedSize("horizontal"),
  ])
    .paddingVertical(5).paddingHorizontal(4)
    .frame({ maxWidth: "infinity" })
    .cornerRadius(8)
    .background(() => (list().length && color === C.needs ? "#FF9F0A1f" : "#7f7f7f14"))
    .hoverBackground("#7f7f7f29")
    .onTap(onTap ?? (() => {}));
}

function row(r, laneColor) {
  const strong = r().lane === "needs";
  return HStack({ spacing: 9 }, [
    Circle({ size: 8 }).fill(() => (r().asking ? C.needs : laneColor)),
    VStack({ spacing: 2 }, [
      HStack({ spacing: 6 }, [
        Text(() => r().title)
          .font(12.5).weight(strong ? "semibold" : "medium")
          .lineLimit(1).truncation("tail"),
        Text(() => (r().here ? "here" : ""))
          .font(9).color("tertiary").lineLimit(1).fixedSize("horizontal").layoutPriority(2),
        Spacer({ minLength: 4 }),
        Text(() => timeLabel(r()))
          .font(10).monospaced()
          .color(() => (r().lane === "working" ? C.working : r().asking ? C.needs : "tertiary"))
          .layoutPriority(2),
      ]),
      HStack({ spacing: 0 }, [
        Text(() => subtitle(r()))
          .font(11)
          .color(() => (r().reason ? C.needs : "secondary"))
          .lineLimit(2).truncation("tail"),
        Spacer({ minLength: 0 }),
      ]),
      HStack({ spacing: 0 }, [
        Text(() => r().meta).font(10).monospaced().color("tertiary").lineLimit(1).truncation("middle"),
        Spacer({ minLength: 0 }),
      ]),
    ]),
  ])
    .paddingHorizontal(10).paddingVertical(7)
    .cornerRadius(9)
    .background(strong ? "#FF9F0A17" : null)
    .hoverBackground(strong ? "#FF9F0A2e" : "#7f7f7f24")
    .frame({ maxWidth: "infinity" })
    .cursor("pointer")
    .onTap(() => jump(r()))
    .contextMenu([
      Button("Open in cmux", () => jump(r())),
      Button("Mark read", () => cmux("workspace.action", { workspace_id: r().wsId, action: "mark_read" })),
      Divider(),
      Button("Open full dashboard", () => openURL(DASHBOARD_URL)),
    ]);
}

function sectionHeader(label, color, list, extra) {
  return HStack({ spacing: 6 }, [
    Circle({ size: 6 }).fill(() => (list().length ? color : C.faint)),
    Text(label).font(10).weight("semibold")
      .color(() => (list().length ? "secondary" : "tertiary")),
    Text(() => (list().length ? String(list().length) : "")).font(10).monospaced().color("tertiary"),
    Spacer({ minLength: 0 }),
    extra ?? Text(""),
  ]).paddingHorizontal(10).paddingTop(4);
}

function section(label, color, list, empty) {
  return VStack({ spacing: 3 }, [
    sectionHeader(label, color, list),
    ForEach({ items: list, key: (r) => r.key }, (r) => row(r, color)),
    HStack({ spacing: 0 }, [
      Text(() => (list().length === 0 ? empty : "")).font(11).color("tertiary").lineLimit(1).layoutPriority(1),
      Spacer({ minLength: 0 }),
    ]).paddingHorizontal(10),
  ]);
}

function staleSection() {
  const visible = computed(() => (showStale() ? stale() : []));
  const toggle = Text(() => (stale().length ? (showStale() ? "Hide" : "Show") : ""))
    .font(10).weight("medium").color("secondary")
    .paddingHorizontal(7).paddingVertical(2).cornerRadius(6)
    .hoverBackground("#7f7f7f29").cursor("pointer")
    .onTap(() => setShowStale(!showStale()));
  return VStack({ spacing: 3 }, [
    sectionHeader("STALE", C.stale, stale, toggle),
    ForEach({ items: visible, key: (r) => r.key }, (r) => row(r, C.stale).opacity(0.75)),
  ]);
}

function staleChoice(choice) {
  return Text(choice.label)
    .font(10).weight("medium").monospaced().lineLimit(1).fixedSize("horizontal")
    .paddingHorizontal(6).paddingVertical(2).cornerRadius(5)
    .color(() => (staleSecs() === choice.secs ? "primary" : "tertiary"))
    .background(() => (staleSecs() === choice.secs ? "#7f7f7f3d" : null))
    .hoverBackground("#7f7f7f29").cursor("pointer")
    .onTap(() => setStaleSecs(choice.secs));
}

sidebar(() =>
  VStack({ spacing: 10 }, [
    HStack({ spacing: 6 }, [
      Text("Switchboard").font(14).weight("semibold"),
      Spacer({ minLength: 0 }),
      Text(() => data.clock()?.time ?? "").font(10).monospaced().color("tertiary"),
    ]).paddingHorizontal(10).paddingTop(4),

    HStack({ spacing: 5 }, [
      tally("need you", C.needs, needs),
      tally("working", C.working, working),
      tally("your move", C.move, move),
      tally("stale", C.stale, stale, () => setShowStale(!showStale())),
    ]).paddingHorizontal(8),

    activityStrip(),
    Divider(),

    section("NEEDS YOU", C.needs, needs, "Nothing is waiting on you."),
    section("WORKING", C.working, working, "No agent is working."),
    section("YOUR MOVE", C.move, move, "Nothing finished recently."),
    staleSection(),

    Divider(),
    HStack({ spacing: 4 }, [
      Text("Stale after").font(10).color("tertiary").lineLimit(1).fixedSize("horizontal"),
      ...STALE_CHOICES.map(staleChoice),
      Spacer({ minLength: 0 }),
      Text("Full dashboard ↗")
        .font(10).weight("medium").color("secondary").lineLimit(1).fixedSize("horizontal")
        .paddingHorizontal(6).paddingVertical(2).cornerRadius(5)
        .hoverBackground("#7f7f7f29").cursor("pointer")
        .onTap(() => openURL(DASHBOARD_URL)),
    ]).paddingHorizontal(10),
    Spacer({ minLength: 0 }),
  ]).paddingHorizontal(6).paddingVertical(6),
  { surface: "glass" }
)
