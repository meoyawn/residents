import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

try {
  await writeFile('.dev.vars', `AUTH_MODE=development\nOTP_SECRET=${randomBytes(32).toString('hex')}\nWHATSAPP_ACCESS_TOKEN=\nWHATSAPP_PHONE_NUMBER_ID=\nBOOTSTRAP_WEBMASTER_PHONE=\n`, { flag: 'wx', mode: 0o600 })
  console.log('Created local sandbox configuration with a random OTP secret.')
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') console.log('Keeping existing .dev.vars configuration.')
  else throw error
}
