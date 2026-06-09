import { test as setup, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import { ADMIN_EMAIL, ADMIN_PASSWORD, USER_EMAIL, USER_PASSWORD, ADMIN_STATE, USER_STATE } from './auth-constants'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const AUTH_HEADERS = { Origin: BASE_URL }

setup('create test users and save sessions', async ({ request }) => {
  fs.mkdirSync('tests/e2e/.auth', { recursive: true })

  // Sign up both users — ignore errors if they already exist
  await request.post('/api/auth/sign-up/email', {
    headers: AUTH_HEADERS,
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: 'E2E Admin' },
  })
  await request.post('/api/auth/sign-up/email', {
    headers: AUTH_HEADERS,
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
    headers: AUTH_HEADERS,
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(adminSignIn.ok(), `admin sign-in failed: ${await adminSignIn.text()}`).toBeTruthy()
  await request.storageState({ path: ADMIN_STATE })

  // Sign out, then save user session
  await request.post('/api/auth/sign-out', { headers: AUTH_HEADERS })
  const userSignIn = await request.post('/api/auth/sign-in/email', {
    headers: AUTH_HEADERS,
    data: { email: USER_EMAIL, password: USER_PASSWORD },
  })
  expect(userSignIn.ok(), `user sign-in failed: ${await userSignIn.text()}`).toBeTruthy()
  await request.storageState({ path: USER_STATE })
})
