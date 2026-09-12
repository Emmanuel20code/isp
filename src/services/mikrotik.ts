import { RouterOSClient } from 'routeros-client';

// NOTE: Ensure these are set in Railway variables
const HOST = process.env.MIKROTIK_HOST;
const USER = process.env.MIKROTIK_USER;
const PASSWORD = process.env.MIKROTIK_PASSWORD;

async function getClient() {
  if (!HOST || !USER || !PASSWORD) {
    throw new Error("MikroTik credentials not configured");
  }
  const client = new RouterOSClient({
    host: HOST,
    user: USER,
    password: PASSWORD,
  });
  await client.connect();
  return client;
}

export async function enableUser(username: string) {
  const client = await getClient();
  try {
    // Example: Enabling a hotspot user
    await client.write('/ip/hotspot/user/set', {
      '.id': username,
      'disabled': 'no'
    });
    return { status: 'success' };
  } finally {
    await client.close();
  }
}
