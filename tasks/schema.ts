// duels only

export default defineSchema({
notifications: defineTable({
  userId: v.string(),
  type: v.union(
    v.literal('new_follower'), 
    v.literal('achievement_earned'), 
    v.literal('module_completed'), 
    v.literal('rank_up'), 
    v.literal('streak_milestone'), 
    v.literal('chat_invite'), 
    v.literal('duel_challenge'), 
    v.literal('duel_won'), 
    v.literal('duel_lost'), 
    v.literal('duel_accepted'),
    v.literal('duel_started'),
    v.literal('gift_received')
  ),
  actorName: v.optional(v.string()), 
  actorAvatar: v.optional(v.string()), 
  actorUsername: v.optional(v.string()),
  message: v.string(), 
  metadata: v.optional(v.string()), 
  read: v.boolean(), 
  createdAt: v.float64(),
}).index('by_user_created', ['userId', 'createdAt']).index('by_user_read', ['userId', 'read']),
duels: defineTable({
  chatId: v.string(),
  chatType: v.optional(v.union(v.literal('group'), v.literal('private'))),
  initiatorId: v.string(),        // ← challengerId → initiatorId
  opponentId: v.string(),
  wager: v.number(),
  puzzleSlug: v.optional(v.string()),  // ← сделай опциональным
  status: v.union(
    v.literal('pending'), 
    v.literal('accepted'), 
    v.literal('active'), 
    v.literal('completed'),
    v.literal('finished'),         // ← ДОБАВЬ 'finished'
    v.literal('declined')
  ),
  prize: v.number(),
  
  // ← ДОБАВЬ ЭТИ ПОЛЯ:
  challengerScore: v.optional(v.number()),  // счёт инициатора
  opponentScore: v.optional(v.number()),    // счёт оппонента
  winnerId: v.optional(v.string()),         // ID победителя
  
  createdAt: v.float64(),
  endsAt: v.optional(v.float64()),          // время окончания
})
.index('by_chat', ['chatId', 'status'])
.index('by_opponent', ['opponentId', 'status'])
.index('by_initiator', ['initiatorId', 'status']),
chatSettings: defineTable({
  clerkId: v.string(),
  onlyFriendsCanMessage: v.boolean(),
  readReceipts: v.boolean(),
  showOnline: v.boolean(),
  chatBackground: v.optional(v.string()),
  blockAnonymousMessages: v.optional(v.boolean()),
  allowFriendRequests: v.optional(v.string()),
  profileVisibility: v.optional(v.string()),
  activityVisibility: v.optional(v.string()),
  whoCanMessage: v.optional(v.string()),
  // === ДОБАВЬ ЭТИ ПОЛЯ ===
  notifNewFollower: v.optional(v.boolean()),
  notifNewMessage: v.optional(v.boolean()),
  notifDuelChallenge: v.optional(v.boolean()),
  notifAchievement: v.optional(v.boolean()),
  notifRankUp: v.optional(v.boolean()),
  notifStreakMilestone: v.optional(v.boolean()),
  notifGiftReceived: v.optional(v.boolean()),
})
.index('by_clerk', ['clerkId']),
})