import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from "./lib/prisma"

export async function appRoutes(app: FastifyInstance) {
    app.post('/habits', async (req) => {
        // title e weekdays
        const createHabitBody = z.object({
            title: z.string(),
            weekdays: z.array(z.number().min(0).max(6))
        })

        const { title, weekdays } = createHabitBody.parse(req.body)

        const today = dayjs().startOf('day').toDate()

        await prisma.habit.create({
            data: {
                title,
                created_at: today,
                weekDays: {
                    create: weekdays.map(weekDay => {
                        return {
                            week_day: weekDay
                        }
                    })
                }
            }
        })
    })

    app.get('/day', async (req ) => {
        const getDayParams = z.object({
            date: z.coerce.date()
        })

        const { date } = getDayParams.parse(req.query)

        const parsedDate = dayjs(date).startOf('day')
        const weekDay = parsedDate.get('day')


        // todos os habitos possiveis
        // habitos que ja foram completados

        const possibleHabits = await prisma.habit.findMany({
            where: {
                created_at: {
                    lte: date
                },
                weekDays: {
                    some: {
                        week_day: weekDay
                    }
                }
            }
        })

        const day = await prisma.day.findUnique({
            where: {
                date: parsedDate.toDate()
            },
            include: {
                dayHabits: true
            }
        })

        const completedHabits = day?.dayHabits.map(dayHabit => {
            return dayHabit.habit_id
        })

        return {
            possibleHabits,
            completedHabits
        }
    })

    // completar e nao complementar um habito

    app.patch('/habits/:id/toggle', async (req) => {
        //route param => parametro de indentificacao 

        const toggleHabitParams = z.object({
            id: z.string().uuid()
        })

        const { id } = toggleHabitParams.parse(req.params)
        const today = dayjs().startOf('day').toDate()

        let day = await prisma.day.findUnique({
            where: {
                date: today
            }
        })

        if(!day) {
            day = await prisma.day.create({
                data: {
                    date: today
                }
            })
        }

        const dayHabit = await  prisma.dayHabit.findUnique({
            where: {
                day_id_habit_id: {
                    day_id: day.id,
                    habit_id: id
                }
            }
        })

        if (dayHabit) {
            // remover a marcacao
            await prisma.dayHabit.delete({
                where: {
                    id: dayHabit.id,
                }
            })
        } else {
            await prisma.dayHabit.create({
                data: {
                    day_id: day.id,
                    habit_id: id
                }
            })
        }
    })

    app.get('/summary', async () => {
        // Query mai complexa, mais condicoes, relacionamentos => SQL na mao (Raw)

        const summary = await prisma.$queryRaw`
            SELECT 
                D.id, 
                D.date, 
                (
                    SELECT 
                        cast(count(*) as float)
                    FROM days_habits DH
                    WHERE DH.day_id = D.id
                ) as completed,
                (
                    SELECT
                        cast(count(*) as float)
                    FROM habit_week_days HWD
                    WHERE
                        HWD.week_day = cast(strftime('%w', D.date/1000.0, 'unixepoch') as int)
                ) as amount
            FROM days D
        `

        return summary
    })
}