# Circles

A to-do list whose dashboard is a set of nested rings. The innermost ring is due
today; each ring outward is a later deadline. Rings thicken with the number of
tasks they hold, a custom deadline inserts its own ring at the right radius, and
a ring holding recurring work splits down the middle — regular on the left,
gold on the right, each half hovering and opening on its own.

## Running it

```sh
npm install
npm run dev
```

With no credentials configured the app stores everything in the browser, skips
the sign-in screen entirely and says "This browser only" in the header.

Two development-only URL flags, both compiled out of a production build:

| Flag | Effect |
| --- | --- |
| `?seed` | Loads a demo board covering every ring case at once. Local store only. |
| `?local` | Forces the browser store even when Supabase credentials are present, so you can work on the UI without writing to the real database. |

`?local&seed` together give you a full board with no sign-in and no network.

```sh
npm test         # domain unit tests
npm run build    # typecheck + production build
```

## Connecting Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. It creates
   the tables, indexes and row level security policies, and is safe to re-run.
3. Under **Authentication → Sign In / Providers → Email**, check the provider is
   enabled and turn **off "Confirm email"**. Without that, signing up returns no
   session until the emailed link is clicked, and Supabase's built-in mailer is
   rate limited to a few messages an hour. Turn it back on once you have custom
   SMTP configured.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.

Accounts are email and password. The app renders a sign-in screen before
anything else and never issues a query until there is a session, so an
unauthenticated visitor cannot reach the board at all.

The anon key is public by design — it ships in the browser bundle. The RLS
policies are the only thing keeping one person's board out of another's.

Free Supabase projects pause after about a week of inactivity; the first load
after a pause is slow while the project restores.

## How it is put together

The interesting logic lives in `src/domain/`, is pure, and is unit tested before
anything is drawn:

| File | Responsibility |
| --- | --- |
| `deadlines.ts` | Quick-picks → instants, ring labels, the day key that identifies a ring |
| `recurrence.ts` | The next outstanding occurrence of a rule, including month-end clamping |
| `sort.ts` | Deadline first, importance as the tiebreaker |
| `rings.ts` | Bucketing tasks into rings, innermost first, plus the Completed list |
| `geometry.ts` | Turning task counts into radii, thicknesses and colours |

Two decisions worth knowing about:

- **A ring key is a calendar day**, apart from `overdue` and `beyond` which are
  pinned to the ends. So a custom deadline landing on a fixed horizon merges
  into it with no special case, one that does not opens its own ring between the
  right neighbours, and a task restored past its deadline falls into Overdue
  rather than pretending to be due today.
- **A split ring is two `<circle>` elements**, not arc paths, each with
  `pathLength="100"` and a `50 50` dash. Independent hover then costs no
  hit-testing at all — they are simply two different elements — and `r`,
  `stroke-width` and `stroke-dasharray` all animate in CSS, which a path's `d`
  does not. The stroke spans the band's full width, so the whole solid area is
  the hit target rather than a rim.
- **Bands are painted outermost first**, so the innermost ends up on top. A
  hovered band therefore grows *outward only*, over a neighbour drawn earlier,
  and its swell is never clipped by the ring outside it.

Ticking a checkbox selects; completing is a separate "Mark as done". Completed
work stays restorable from the Completed section in the list view.

**Goals and tags** are two independent axes, and a task can carry any number of
each. A goal is something you are working towards, so it can have a deadline and
a description of its own; a tag is a plain label for what kind of work this is —
health, financial, admin. On a task row a goal shows a filled dot and a tag a
hollow one, the same mark drawn two ways, so the two stay legible without a
legend. Within one axis the filters are an OR, across axes an AND.

Recurring tasks are never expanded into rows. `tasks.deadline` holds the first
occurrence and the `occurrences` table logs completed instances, so an endless
daily task stays one row.
