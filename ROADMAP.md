# FatBoy: UI ideas to build next

## Agreed (from chat)
- Home screen with today's goal ring and one big "next action" button
- Weight chart with milestone markers (first kg, 5 kg, halfway, goal)
- Haptics plus a small animation on every log (food, water, move, weight)
- Mascot empty states (food, photos, fasts, quests) instead of plain text

## More ideas
- "Reduce transparency" toggle in Settings (turns glass into solid surfaces)
- Splash screen with the logo, plus a themed (monochrome) Android icon
- Swipe to delete or edit log entries
- Skeleton loading for food search and AI recipes
- Respect the phone's text size setting (check layouts at 130% and 160%)
- Quick-add button that stays within thumb reach on the Track tab
- Weekly recap screen (calories, streak, weight change, one line from the mascot)
- Home screen widget (streak and today's calories), needs native work


---
## Status (v22)
Done: home card with one next action, milestone markers, haptics + floating numbers on every log, mascot moods and empty states, solid/clear glass setting, splash + themed icon, swipe to remove with undo, skeleton loading, quick-add button, weekly recap, text-size pass.
Not done: home screen widget (needs native Android code), Health Connect step sync, real payments.

Done since: cross-device sync of everything incl. settings (auto-refresh), forum with usernames, posts, comments, likes, reports, blocks.
Still local to each phone: progress photos.

## Social + polish update
- Done: Social tab (feed, search, polls, reactions, @mentions, photo posts), friends/DMs, groups, challenges, duels, leagues, notifications, tips, age gate, mute words, saved meals, scan history, measurements, weekly goal ring, sounds, on-device reminders, share cards.
- Not possible in this build: home-screen widget, step counter / Health Connect, server push notifications, custom avatar photos (emoji avatars instead).
- Needs a real-device check: Supabase social.sql on the live project, Google login return, local notifications, share sheet.
