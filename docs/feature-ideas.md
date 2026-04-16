# Feature Ideas

## Improvements to Existing Modules

### 1. Delete/Cancel Reminders

Add `#remind delete <id>` to cancel pending reminders. Currently there's no way to remove a reminder once created.

### 2. Delete/Undo Workout or Quran Entries

Allow users to fix mislogs (e.g., `#workout delete <id>`, `#quran undo`). Currently entries are permanent.

### 3. Per-User Timezone

Everyone shares a single `USER_TIMEZONE_OFFSET_MINUTES`. Supporting per-user timezones would help if group members span different cities.

### 4. Recurring Reminders

`#remind` is one-shot only. Add daily/weekly recurrence support, e.g.:

```
#remind every monday 9:00 Weekly review
#remind daily 7:00 Morning check-in
```

### 5. Sholat API Fallback

If the MyQuran API is down, the sholat module just fails. A last-known-good cache fallback would make it more resilient.

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
