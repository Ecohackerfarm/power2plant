import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isTrustedResearcher, getSessionUser } from '@/lib/admin-auth'

export async function GET() {
  if (!(await isTrustedResearcher())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tasks = await prisma.externalResearchTask.findMany({
    where: {
      OR: [
        { status: 'OPEN' },
        { claimedById: user.id, status: 'CLAIMED' },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      status: true,
      prompt: true,
      context: true,
      deadline: true,
      agentModel: true,
      claimedAt: true,
      createdAt: true,
      cropA: { select: { id: true, name: true, botanicalName: true } },
      cropB: { select: { id: true, name: true, botanicalName: true } },
    },
  })

  return NextResponse.json({ tasks })
}
