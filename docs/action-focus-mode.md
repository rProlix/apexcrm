# Action Required Focus Mode

## Behavior

Focus Mode is an alternate view of the already-filtered Action Required inbox. It shows one item,
its priority and status, why it needs action, source context, assignment, latest evidence, safe
status controls, current position, and the next item.

Entering Focus Mode records the list scroll position. Leaving it restores that position and keeps
the page's filter URL. Arrow keys move between items when focus is not inside an interactive
control; Escape returns to the inbox.

## Confirmation contract

The interface advances or removes an item only after the authoritative server action succeeds and
returns a terminal `resolved` or `dismissed` status. Starting and snoozing do not remove the item.
Dismissal requires a reason; snooze requires a timestamp. Maintenance and setup confirmations use
the same inline pattern rather than browser prompts.

No action is auto-resolved, and motion never implies that a safety determination has been confirmed.

## Motion and accessibility

Resolved items collapse through a bounded layout transition. Moving between focus items uses a short
directional state transition. Reduced-motion users receive the same content and state updates without
required movement. All controls remain native buttons/links with visible focus.

## Permissions

Server-side action loading and updates enforce tenant, role, assignment, and dismissal permissions.
Quick Peek and full-source links inherit their own authorization checks.
