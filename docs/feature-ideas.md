# Feature Ideas

## Improvements to Existing Modules

### 1. Delete Specific Reminders by ID

Add `#remind delete <id>` to cancel arbitrary pending reminders. The current `#remind undo` only removes the most recent reminder within a short window — there's no way to cancel a specific older reminder.

### 2. Per-User Timezone

Everyone shares a single `USER_TIMEZONE_OFFSET_MINUTES`. Supporting per-user timezones would help if group members span different cities.

### 3. Recurring Reminders

`#remind` is one-shot only. Add daily/weekly recurrence support, e.g.:

```
#remind every monday 9:00 Weekly review
#remind daily 7:00 Morning check-in
```

### 4. Sholat API Fallback

If the MyQuran API is down, the sholat module just fails. A last-known-good cache fallback would make it more resilient.

### 5. Per-Chat Sholat Reminder Location

Prayer reminders use the single `SHOLAT_DEFAULT_LOCATION` for every chat. Let each chat choose its own city when enabling — e.g. `#sholat reminder on --location jakarta` — so members in different cities get the right times. Needs a `location_input` column on `sholat_reminder_settings`, validation at enable time (reusing the suggestion/ambiguous/not-found messages, see [ADR 0006](adr/0006-location-resolution.md)), and the prefetch + ticker extended to handle several locations at once.

---

## New Feature Ideas

### 6. Habit Tracker (`#habit`)

Generic daily habit check-ins beyond workouts/quran. Track any habit with streaks and completion rates.

```
#habit check sleep
#habit check journal
#habit list
#habit stats
```

### 7. Fasting Tracker (`#puasa`)

Log fasting days (Ramadhan or sunnah), track consistency. Pairs nicely with the existing Quran Ramadhan mode.

```
#puasa log
#puasa log sunnah senin
#puasa list
```

### 8. Expense Tracker (`#expense`)

Quick daily expense logging with monthly summaries and category breakdowns. Fits the "personal daily tracking" theme.

```
#expense 50k makan siang
#expense 200k transport
#expense list
#expense summary
```

### 9. Cross-Module Stats (`#stats`)

Personal dashboard combining all modules in one reply: workout streak, quran streak, pages this month, active reminders, etc.

```
#stats
```

### 10. Goal Setting (`#goal`)

Set personal targets and get progress updates in the daily digest.

```
#goal workout 5x/week
#goal quran 3 pages/day
#goal progress
```
