import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

// Начать дуэль с проверками
export const startDuel = mutation({
  args: {
    challengerId: v.string(),
    opponentUsername: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Проверяем, нет ли уже активной дуэли у challenger
    const existingDuel = await ctx.db
      .query('duels')
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field('initiatorId'), args.challengerId),
            q.eq(q.field('opponentId'), args.challengerId)
          ),
          q.or(
            q.eq(q.field('status'), 'pending'),
            q.eq(q.field('status'), 'accepted'),
            q.eq(q.field('status'), 'active')
          )
        )
      )
      .first()
    
    if (existingDuel) {
      throw new Error('You already have an active duel. Complete or cancel it first.')
    }

    // 2. Находим оппонента
    const opponent = await ctx.db
      .query('users')
      .filter((q) => q.eq(q.field('username'), args.opponentUsername))
      .first()
    
    if (!opponent) throw new Error('Opponent not found')

    // 3. Проверяем, что оппонент тоже не в дуэли
    const opponentDuel = await ctx.db
      .query('duels')
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field('initiatorId'), opponent._id),
            q.eq(q.field('opponentId'), opponent._id)
          ),
          q.or(
            q.eq(q.field('status'), 'pending'),
            q.eq(q.field('status'), 'accepted'),
            q.eq(q.field('status'), 'active')
          )
        )
      )
      .first()
    
    if (opponentDuel) {
      throw new Error('Opponent is already in another duel')
    }

    // 4. Проверяем, нет ли уже дуэли между этими пользователями
    const existingPairDuel = await ctx.db
      .query('duels')
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field('status'), 'pending'),
            q.eq(q.field('status'), 'accepted'),
            q.eq(q.field('status'), 'active')
          ),
          q.or(
            q.and(
              q.eq(q.field('initiatorId'), args.challengerId),
              q.eq(q.field('opponentId'), opponent._id)
            ),
            q.and(
              q.eq(q.field('initiatorId'), opponent._id),
              q.eq(q.field('opponentId'), args.challengerId)
            )
          )
        )
      )
      .first()
    
    if (existingPairDuel) {
      throw new Error('A duel between you and this opponent already exists')
    }

    // 5. Создаём дуэль только если все проверки пройдены
    const duelId = await ctx.db.insert('duels', {
      initiatorId: args.challengerId,
      opponentId: opponent._id,
      challengerScore: 0,
      opponentScore: 0,
      winnerId: undefined,
      status: 'active',
      wager: 0,
      prize: 0,
      chatId: `duel_${args.challengerId}_${opponent._id}`,
      createdAt: Date.now(),
      endsAt: Date.now() + 600000,
    })
    
    return duelId
  },
})

// Функция для отмены/завершения дуэли (освобождает слот)
export const cancelDuel = mutation({
  args: {
    duelId: v.id('duels'),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const duel = await ctx.db.get(args.duelId)
    if (!duel) throw new Error('Duel not found')
    
    // Проверяем, что пользователь участник дуэли
    if (duel.initiatorId !== args.userId && duel.opponentId !== args.userId) {
      throw new Error('Not a participant of this duel')
    }
    
    // Проверяем статус
    if (duel.status === 'completed' || duel.status === 'finished') {
      throw new Error('Cannot cancel completed duel')
    }
    
    await ctx.db.patch(args.duelId, {
      status: 'declined',
    })
    
    return { cancelled: true }
  }
})

// Проверить, может ли пользователь создать дуэль
export const canStartDuel = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const activeDuel = await ctx.db
      .query('duels')
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field('initiatorId'), args.userId),
            q.eq(q.field('opponentId'), args.userId)
          ),
          q.or(
            q.eq(q.field('status'), 'pending'),
            q.eq(q.field('status'), 'accepted'),
            q.eq(q.field('status'), 'active')
          )
        )
      )
      .first()
    
    return {
      canStart: !activeDuel,
      activeDuelId: activeDuel?._id || null,
      activeDuelStatus: activeDuel?.status || null,
    }
  }
})

// Получить активные дуэли
export const getActiveDuels = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('duels')
      .filter((q) =>
        q.and(
          q.eq(q.field('status'), 'active'),
          q.or(
            q.eq(q.field('initiatorId'), args.userId),
            q.eq(q.field('opponentId'), args.userId)
          )
        )
      )
      .collect()
  },
})

// Получить историю дуэлей
export const getDuelHistory = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const duels = await ctx.db
      .query('duels')
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field('status'), 'finished'),
            q.eq(q.field('status'), 'completed')
          ),
          q.or(
            q.eq(q.field('initiatorId'), args.userId),
            q.eq(q.field('opponentId'), args.userId)
          )
        )
      )
      .order('desc')
      .take(20)
    
    return duels
  },
})

// Отправить счёт и завершить дуэль
export const submitScore = mutation({
  args: {
    duelId: v.id('duels'),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    const duel = await ctx.db.get(args.duelId)
    if (!duel) throw new Error('Duel not found')
    
    // Проверяем что дуэль активна
    if (duel.status !== 'active') {
      throw new Error('Duel is not active')
    }
    
    // Определяем победителя
    const winner = args.score > (duel.opponentScore || 0) 
      ? duel.initiatorId
      : duel.opponentId
    
    await ctx.db.patch(args.duelId, {
      challengerScore: args.score,
      winnerId: winner,
      status: 'finished',
    })
    
    // Начисляем XP победителю
    if (winner) {
      const winnerUser = await ctx.db
        .query('users')
        .filter((q) => q.eq(q.field('_id'), winner))
        .first()
        
      if (winnerUser) {
        await ctx.db.patch(winnerUser._id, {
          xp: (winnerUser.xp || 0) + 50,
        })
      }
    }
    
    return winner
  },
})