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

---

## New Feature Ideas

### 5. Habit Tracker (`#habit`)

Generic daily habit check-ins beyond workouts/quran. Track any habit with streaks and completion rates.

```
#habit check sleep
#habit check journal
#habit list
#habit stats
```

### 6. Fasting Tracker (`#puasa`)

Log fasting days (Ramadhan or sunnah), track consistency. Pairs nicely with the existing Quran Ramadhan mode.

```
#puasa log
#puasa log sunnah senin
#puasa list
```

### 7. Expense Tracker (`#expense`)

Quick daily expense logging with monthly summaries and category breakdowns. Fits the "personal daily tracking" theme.

```
#expense 50k makan siang
#expense 200k transport
#expense list
#expense summary
```

### 8. Cross-Module Stats (`#stats`)

Personal dashboard combining all modules in one reply: workout streak, quran streak, pages this month, active reminders, etc.

```
#stats
```

### 9. Goal Setting (`#goal`)

Set personal targets and get progress updates in the daily digest.

```
#goal workout 5x/week
#goal quran 3 pages/day
#goal progress
```
