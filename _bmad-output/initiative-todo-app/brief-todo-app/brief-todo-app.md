---
title: "Product Brief: Todo App"
status: final
created: 2026-09-29
updated: 2026-09-30
---

# Product Brief: Todo App

## Executive Summary

A personal todo list for the small tasks that come up during the working day and are too minor for a ticket. Adding one takes a single line of text and the Enter key. Tasks left open for over a day go to the top of the list, marked red, so neglected tasks are hard to ignore.

It is deliberately minimal: one user, one list, no priorities, deadlines or accounts. It is also a practice project for learning the BMad Method from brief to working code.

## The Problem

Project tasks live in ticket systems. The small things that come up during the day don't: reply to that message, check that setting, buy the adapter. They're too minor for a ticket and too easy to forget, so they end up on scraps of paper or in memory, and they get lost.

## The Solution

A web app that opens straight to a text box and the task list. Type the task, press Enter, and it's saved. There are no fields to fill in and nothing to open first.

Each task shows how long it has been waiting, as a colour from green (under an hour old) to red (over a day old). Tasks over a day old move to the top of the list, oldest first, so a quick glance shows what has been waiting longest. Tasks can be ticked off, unticked, or deleted.

## What Makes This Different

The age nudge. Most todo apps rely on the user to set priorities or deadlines. This one orders tasks by how long each has been waiting, so the user never has to sort or tag anything.

There is no deeper competitive advantage, and none is claimed. It is a personal practice app with one idea worth testing.

## Who This Serves

The author, as an everyday user: someone who works mostly at a laptop, tracks project work in tickets, and needs somewhere quick to put everything else. They check the list whenever they have a spare minute, not at set times.

## Success Criteria

- Capturing a task takes under 5 seconds, from deciding to write it down to it being saved.
- Over two weeks, the author adds tasks on most workdays.
- Overdue (red) tasks are completed or deleted rather than left to pile up.
- Tasks survive page refreshes and new browser sessions.

## Scope

**In for v1:**
- Add a task by typing and pressing Enter.
- See all tasks in one list, ordered automatically: overdue tasks (over 24 hours old) first, oldest first; then other open tasks, newest first; then completed tasks.
- A colour indicator on each task showing its age, from green (under an hour) to red (over a day).
- Mark a task complete, or un-mark it.
- Delete a task. Deletion is permanent.
- Tasks are saved and survive refreshes and new sessions.
- Works on a laptop browser first, and is still usable on a phone.

**Out of v1:**
- Manual priorities. The only ordering is the automatic, age-based one above.
- Editing task text. To fix a typo, delete the task and add it again.
- Undoing a delete.
- User accounts, collaboration, deadlines and notifications.
