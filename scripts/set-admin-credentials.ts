/**
 * Force a known login for the preserved admin after a prod-dump restore.
 *
 * better-auth password hashing (scrypt) is independent of BETTER_AUTH_SECRET, so
 * a hash written here verifies in the app container regardless of which env's
 * secret signs sessions. This is why prod sessions die on restore (cookies are
 * secret-signed) but a password set here logs in cleanly.
 *
 * No-op unless DUMP_ADMIN_PASSWORD is set, so dev/prod runs are unaffected.
 * Targets the ADMIN_EMAIL user, which dump-prod-anonymized.sh preserves as-is.
 */
import { PrismaClient } from '@prisma/client'
import { hashPassword } from 'better-auth/crypto'

const email = process.env.ADMIN_EMAIL
const password = process.env.DUMP_ADMIN_PASSWORD

async function main() {
  if (!password) {
    console.log('[set-admin-cred] DUMP_ADMIN_PASSWORD unset — skipping admin credential reset')
    return
  }
  if (!email) {
    console.error('[set-admin-cred] ADMIN_EMAIL unset — cannot target admin user')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.error(`[set-admin-cred] no user with email ${email} — was it preserved by the dump?`)
      process.exit(1)
    }

    const hash = await hashPassword(password)

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    })

    // better-auth stores email+password under providerId 'credential'.
    const existing = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    })
    if (existing) {
      await prisma.account.update({ where: { id: existing.id }, data: { password: hash } })
    } else {
      await prisma.account.create({
        data: { accountId: user.id, providerId: 'credential', userId: user.id, password: hash },
      })
    }

    console.log(`[set-admin-cred] ${email}: password set from DUMP_ADMIN_PASSWORD + email verified`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
