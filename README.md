# Switchboard for cmux

A [cmux](https://cmux.com) sidebar panel that shows which of your coding agents need you, which are working, which are waiting for your next step, and which went stale. Tap a row to jump straight to that terminal.

<img src="screenshot.png" width="290" alt="The Switchboard panel in cmux's right sidebar: counters for need you, working, your move and stale, an activity strip, and one row per agent session with a live timer">

## Install

```bash
mkdir -p ~/.config/cmux/sidebars && \
curl -fsSL https://raw.githubusercontent.com/mbonete/cmux-switchboard-panel/main/switchboard.js \
  -o ~/.config/cmux/sidebars/switchboard.js && \
cmux right-sidebar set custom switchboard
```

That saves one file and opens it in cmux's right sidebar. To use it as the left sidebar instead, right-click the sidebar button and pick **switchboard**.

To update, run the same command again. To remove it, delete `~/.config/cmux/sidebars/switchboard.js`.

## What it shows

| Section | What lands there |
| --- | --- |
| **Needs you** | An agent waiting for your answer or approval, or a finished result you haven't read yet. Longest wait first. |
| **Working** | Agents mid-turn, with a live timer, what you asked, and how many subagents are running. |
| **Your move** | Agents that finished and are waiting for your next message. |
| **Stale** | No activity for longer than the "Stale after" setting (1 day, 2 days or 1 week). Collapsed until you tap **Show**. |

Each row also shows the project folder, git branch (`•` when there are uncommitted changes), dev-server ports, and the pull request when cmux knows one. The strip under the counters shows how many agents were working over the last 15 minutes.

- **Tap a row:** jump to that workspace and terminal.
- **Right-click a row:** Open in cmux, Mark read, or Open full dashboard.

## Requirements and limits

- cmux with Custom Sidebars turned on. It is a beta feature, on by default, under **Settings → Custom Sidebars**. Built on cmux 0.65.2.
- It reads cmux's own list of agent sessions, so it should show any agent cmux tracks. It has only been tested with Claude Code.
- It reads cmux's local data only and sends nothing anywhere.
- cmux sidebars can't read files or the network, so the panel can't show what an agent replied, and you can't approve or reply from it. Tap through to the terminal for that.
- The activity strip starts filling when cmux loads the panel. The "Stale after" choice goes back to 2 days when cmux reloads it.

## Optional: the full web dashboard

**Full dashboard ↗** opens [cmux-switchboard](https://github.com/mbonete/cmux-switchboard) on `localhost:4747`, if you run it. It's a separate local web app that adds Claude's recaps, approving permissions and answering questions from the page, and quick replies. The panel works fine without it.

## Customize

Edit `~/.config/cmux/sidebars/switchboard.js` and save; cmux reloads it right away. Colors and the dashboard URL are at the top of the file.
