import { test as setup, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

export const ADMIN_EMAIL = 'e2e-admin@test.local'
export const ADMIN_PASSWORD = 'E2eAdmin1!'
export const USER_EMAIL = 'e2e-user@test.local'
export const USER_PASSWORD = 'E2eUser1!'
export const ADMIN_STATE = 'tests/e2e/.auth/admin.json'
export const USER_STATE = 'tests/e2e/.auth/user.json'

setup('create test users and save sessions', async ({ request }) => {
  fs.mkdirSync('tests/e2e/.auth', { recursive: true })

  // Sign up both users — ignore 422 if they already exist
  await request.post('/api/auth/sign-up/email', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: 'E2E Admin' },
  })
  await request.post('/api/auth/sign-up/email', {
    data: { email: USER_EMAIL, password: USER_PASSWORD, name: 'E2E User' },
  })

  // Mark both as email-verified directly in the DB
  const prisma = new PrismaClient()
  try {
    await prisma.user.updateMany({
      where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } },
      data: { emailVerified: true },
    })
  } finally {
    await prisma.$disconnect()
  }

  // Save admin session
  const adminSignIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(adminSignIn.ok(), `admin sign-in failed: ${await adminSignIn.text()}`).toBeTruthy()
  await request.storageState({ path: ADMIN_STATE })

  // Sign out, then save user session
  await request.post('/api/auth/sign-out')
  const userSignIn = await request.post('/api/auth/sign-in/email', {
    data: { email: USER_EMAIL, password: USER_PASSWORD },
  })
  expect(userSignIn.ok(), `user sign-in failed: ${await userSignIn.text()}`).toBeTruthy()
  await request.storageState({ path: USER_STATE })
})
