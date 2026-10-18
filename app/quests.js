'use strict';

/* ==========================================================================
   Quests, the daily chest and badges
   Every day the board deals three face-down cards: one easy, one medium and one
   secret. Some quests count what you log; others you tick off yourself.
   Titles live in the translations as quest.<id>.title (and quest.<id>.hint for riddles).
   ========================================================================== */
const TIERS = ['easy', 'medium', 'secret'];

const QUEST_POOL = [
  // Easy
  { id: 'lesson', tier: 'easy', icon: 'learn', goal: 1, gems: 8, xp: 10, go: { tab: 'learn' }, progress: () => state.lessonsByDay[today()] || 0 },
  { id: 'water4', tier: 'easy', icon: 'drop', goal: 4, gems: 8, xp: 5, go: { tab: 'track', panel: 'water' }, progress: glassesToday },
  { id: 'food2', tier: 'easy', icon: 'food', goal: 2, gems: 8, xp: 5, go: { tab: 'track', panel: 'food' }, progress: () => foodToday().length },
  { id: 'walk10', tier: 'easy', icon: 'pulse', goal: 1, gems: 8, xp: 5, self: true },
  // Medium
  { id: 'food3', tier: 'medium', icon: 'food', goal: 3, gems: 12, xp: 10, go: { tab: 'track', panel: 'food' }, progress: () => foodToday().length },
  { id: 'water6', tier: 'medium', icon: 'drop', goal: 6, gems: 12, xp: 10, go: { tab: 'track', panel: 'water' }, progress: glassesToday },
  { id: 'move20', tier: 'medium', icon: 'pulse', goal: 20, gems: 15, xp: 15, go: { tab: 'track', panel: 'move' }, progress: minutesMoved },
  { id: 'xp40', tier: 'medium', icon: 'bolt', goal: 40, gems: 12, xp: 0, go: { tab: 'learn' }, progress: xpToday },
  { id: 'lessons2', tier: 'medium', icon: 'learn', goal: 2, gems: 15, xp: 10, go: { tab: 'learn' }, progress: () => state.lessonsByDay[today()] || 0 },
  { id: 'cook', tier: 'medium', icon: 'chef', goal: 1, gems: 12, xp: 10, go: { tab: 'recipes' }, progress: () => state.cooked[today()] || 0 },
  { id: 'veg', tier: 'medium', icon: 'food', goal: 1, gems: 12, xp: 10, self: true },
  // Secret: the card shows a riddle until the quest is done
  { id: 'flawless', tier: 'secret', icon: 'quest', goal: 1, gems: 20, xp: 15, go: { tab: 'learn' }, progress: () => state.perfectsByDay[today()] || 0 },
  { id: 'hydrate8', tier: 'secret', icon: 'drop', goal: 8, gems: 20, xp: 15, go: { tab: 'track', panel: 'water' }, progress: glassesToday },
  { id: 'breakfast', tier: 'secret', icon: 'food', goal: 1, gems: 20, xp: 15, go: { tab: 'track', panel: 'food' }, progress: () => (foodToday().some(item => item.meal === 'Breakfast') ? 1 : 0) },
  { id: 'allround', tier: 'secret', icon: 'track', goal: 3, gems: 25, xp: 15, go: { tab: 'track', panel: 'food' },
    progress: () => Number(foodToday().length > 0) + Number(glassesToday() > 0) + Number(movesToday().length > 0) },
  { id: 'stretch', tier: 'secret', icon: 'sparkle', goal: 1, gems: 20, xp: 15, self: true },
];

const weekStart = () => {
  const mondayOffset = (parseKey(today()).getDay() + 6) % 7;
  return addDays(today(), -mondayOffset);
};
const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart(), i));
const activeDaysThisWeek = () => weekDays().filter(key => (state.days[key] || 0) > 0).length;
const weighedThisWeek = () =>
  Object.keys(state.weights).some(key => key >= weekStart() && key !== state.profile.start);

const WEEKLY_QUESTS = [
  { id: 'active5', icon: 'flame', goal: 5, gems: 30, xp: 25, weekly: true, progress: activeDaysThisWeek },
  { id: 'weighin', icon: 'scale', goal: 1, gems: 20, xp: 15, weekly: true, progress: () => Number(weighedThisWeek()) },
];

// One quest per tier, picked from the date so everyone sees the same board on the same day.
const dailyQuests = () => TIERS.map(tier => {
  const pool = QUEST_POOL.filter(quest => quest.tier === tier);
  return pool[hashText(`${today()}:${tier}`) % pool.length];
});

const claimKey = quest => (quest.weekly ? `week:${weekStart()}:${quest.id}` : `${today()}:${quest.id}`);
const dayKey = quest => `${today()}:${quest.id}`;
const isClaimed = quest => Boolean(state.claimed[claimKey(quest)]);
const questProgress = quest => (quest.self ? Number(Boolean(state.checks[dayKey(quest)])) : quest.progress());
const isQuestDone = quest => questProgress(quest) >= quest.goal;
const isRevealed = quest => Boolean(state.revealed[dayKey(quest)]) || questProgress(quest) > 0 || isClaimed(quest);
const questById = id => [...QUEST_POOL, ...WEEKLY_QUESTS].find(quest => quest.id === id);

function claimQuest(quest) {
  if (isClaimed(quest) || !isQuestDone(quest)) return false;
  state.claimed[claimKey(quest)] = 1;
  grantXp(quest.xp, quest.gems);
  return true;
}

/* --- Daily chest: unlocks when all three of today's quests are claimed --------- */
const chestKey = () => `${today()}:chest`;
const questsClaimedToday = () => dailyQuests().filter(isClaimed).length;
const isChestOpen = () => Boolean(state.claimed[chestKey()]);
const isChestReady = () => questsClaimedToday() === TIERS.length && !isChestOpen();
const chestReward = () => ({ gems: 20 + 5 * (hashText(`${today()}:chest`) % 5), xp: 10 });

function openChest() {
  if (!isChestReady()) return null;
  const reward = chestReward();
  state.claimed[chestKey()] = 1;
  state.flags.fullBoard = true;
  grantXp(reward.xp, reward.gems);
  return reward;
}

/* --- Badges: progress is [value, goal]. Secret ones stay hidden until earned --- */
const BADGES = [
  { id: 'first', icon: 'learn', progress: () => [Math.min(lessonsDone(), 1), 1] },
  { id: 'perfect', icon: 'quest', progress: () => [Math.min(state.perfects, 1), 1] },
  { id: 'streak3', icon: 'flame', progress: () => [Math.min(state.best, 3), 3] },
  { id: 'streak7', icon: 'flame', progress: () => [Math.min(state.best, 7), 7] },
  { id: 'streak30', icon: 'flame', progress: () => [Math.min(state.best, 30), 30] },
  { id: 'unit1', icon: 'trophy', progress: () => [unitLessonsDone(0), LESSONS_PER_UNIT] },
  { id: 'graduate', icon: 'trophy', progress: () => [lessonsDone(), TOTAL_LESSONS] },
  { id: 'hydration', icon: 'drop', progress: () => [Number(Boolean(state.flags.hydrated)), 1] },
  { id: 'weighin', icon: 'scale', progress: () => [Number(Boolean(state.flags.weighed)), 1] },
  { id: 'kg1', icon: 'check', progress: () => [clamp(kgLost(), 0, 1), 1], measured: true },
  { id: 'logger', icon: 'food', progress: () => [Math.min(Object.values(state.food).filter(list => list.length).length, 7), 7] },
  { id: 'chef', icon: 'chef', progress: () => [Math.min(Object.values(state.cooked).reduce((sum, n) => sum + n, 0), 5), 5] },
  { id: 'hattrick', icon: 'sparkle', secret: true, progress: () => [Math.min(state.perfects, 3), 3] },
  { id: 'fullboard', icon: 'sparkle', secret: true, progress: () => [Number(Boolean(state.flags.fullBoard)), 1] },
  { id: 'halfway', icon: 'sparkle', secret: true, progress: () => [Math.min(Math.round(slimProgress() * 100), 50), 50], measured: true },
];

const badgeEarned = badge => {
  const [value, goal] = badge.progress();
  return value >= goal;
};
const badgeById = id => BADGES.find(badge => badge.id === id);
