# Update notifications for self-hosted Canutin

Research requested by issue #431. The version display itself ships on this branch; this note covers the follow-up question of telling users a newer version exists, and whether auto-update is worth pursuing.

Verdict: notify, don't auto-update. A daily server-side check plus one quiet line in settings is the whole feature. A draft for the spin-out issue is at the bottom.

## How comparable apps do it

Uptime Kuma is the reference implementation and it is tiny. The Node backend fetches a small JSON file from the maintainer's own domain every 48 hours, stores the latest version in memory, and the UI reads it. Two settings gate it: one to skip the check entirely, one to include beta tags. Hosting your own version pointer means you control rate limits and can hold back a release, at the cost of the pointer going stale, which has happened to them ([check-version.js](https://github.com/louislam/uptime-kuma/blob/master/server/check-version.js), [issue #5610](https://github.com/louislam/uptime-kuma/issues/5610)).

Gitea runs a server-side cron that GETs a configurable endpoint, persists the answer, and semver-compares against the built-in version. Only admins see the result. They shipped it default-on while the docs said default-off and people were annoyed enough to file [issue #22078](https://github.com/go-gitea/gitea/issues/22078) ([update_checker.go](https://github.com/go-gitea/gitea/blob/main/modules/updatechecker/update_checker.go)).

Immich is the elaborate version: a server cron with a randomized minute so instances don't all hit GitHub on the hour, results cached with a timestamp, and the answer pushed to browsers over the existing websocket. Their tracker is full of log spam from instances that can't reach GitHub, which is the failure mode to design against ([version.service.ts](https://github.com/immich-app/immich/blob/main/server/src/services/version.service.ts), [issue #14801](https://github.com/immich-app/immich/issues/14801)).

Actual Budget, the direct competitor, does nothing. No banner, no check. The docs only explain how to update once you already know a release exists ([FAQ](https://actualbudget.org/docs/faq/)). Any notification at all puts Canutin ahead of Actual.

Nextcloud is the cautionary tale. Its "update check" sends version, update channel, edition, PHP version, and subscriber status to their server. That is telemetry wearing an update-check costume ([VersionCheck.php](https://github.com/nextcloud/server/blob/master/lib/private/Updater/VersionCheck.php)).

## Mechanics

Unauthenticated GitHub API calls are capped at 60/hour per IP, which is plenty for one box checking daily. Users behind CGNAT or shared cloud egress share that bucket and will occasionally see 403s. ETag conditional requests don't help: unauthenticated 304s still count against the quota ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).

Two Canutin-specific traps:

1. `next` is a prerelease channel in `.releaserc.json`, and GitHub's `/releases/latest` endpoint returns the newest non-prerelease only. It will never see `2.0.0-next.96`, so every `next` user would be told they're ahead of "latest" forever. The check has to hit `/releases` and filter by the running build's channel ([get latest release](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)).
2. Semver says prereleases sort below their release (`2.0.0-next.95 < 2.0.0`), which is wrong chronologically for a `next` user. Compare within a channel, never across.

Server-side beats browser-side on every axis: one request per install instead of one per open tab, one cache, one off switch, and the server's IP goes to GitHub instead of the user's. Every app surveyed checks server-side.

Community expectations on privacy: a plain GET that sends nothing about the instance is fine, provided there's a documented off switch. What gets people angry is payload (Nextcloud) or a default-on switch the docs claim is off (Gitea).

## Auto-update for Docker

Watchtower was archived December 2025 and is unmaintained; don't point users at it. Diun is the successor most people landed on, and it deliberately only notifies, never touches containers ([survey](https://www.pistack.xyz/posts/watchtower-vs-diun-vs-dockcheck-docker-container-update-tools-2026/)).

Self-updating from inside the container is structurally off the table. A container can't replace its own image; something outside must, and the only handle is the Docker socket, which grants root-equivalent access to the host ([Docker socket security](https://www.netdata.cloud/guides/docker/docker-socket-security/)). A personal finance app holding root on someone's home server to save them a `docker compose pull` is a bad trade. Document `docker compose pull && docker compose up -d` in the README and mention Diun for people who want infrastructure-level notifications. That's the whole auto-update story.

## Smallest credible design

For when the spin-out issue gets picked up, not prescribed in the issue itself:

- A goroutine in the PocketBase process fetches the GitHub releases list every 24 hours, filters to the running build's channel, semver-compares, caches `{latest, checkedAt}` in memory. Roughly a hundred lines of Go.
- Requires stamping the version into the Go binary at release time via `-ldflags -X` (the binary has no version today; this branch only versions the frontend).
- One custom route, `GET /api/canutin/version`, returning current, latest, and whether an update exists. Needs the matching `pocketbase/skill.go` update.
- Surfaced as one line in settings next to the version added on this branch, linking to release notes. No modal, no toast, no badge.
- Opt out via one env var, documented next to the compose example. Log fetch failures at debug so offline instances don't fill their logs.

## Draft spin-out issue

Title: `Self-hosted users don't know when a newer version exists`

> ## Summary
>
> - Once #431 ships, users can see which version they're running, but nothing tells them whether a newer one exists. Finding out means leaving the app and checking GitHub releases by hand.
> - Self-hosted users routinely run months-old versions with long-fixed bugs, and bug reports come in against versions that are far behind.
>
> ## Context
>
> - Any update check has to be channel-aware: `next` is a prerelease channel, and GitHub's "latest release" endpoint only ever returns stable releases, so a naive check would mislead every `next` user.
> - The self-hosted community expects update checks to send nothing about the instance and to have a documented off switch.
> - Auto-updating from inside a container requires root-equivalent access to the host's Docker socket, so peer apps (Uptime Kuma, Gitea, Immich) all stop at notifying. Research notes with the survey live in `.agents/notes/2026-08-29-update-check-research.md` on the `feat/display-app-version` branch.
>
> ## Expected outcome
>
> - The app quietly tells the user when a newer version in their channel exists, with a way to opt out of the check.
