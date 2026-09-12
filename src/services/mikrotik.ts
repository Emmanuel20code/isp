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
    // 1. Find the user to get their correct .id
    const users = await client.write('/ip/hotspot/user/print', {
      '?name': username
    });

    if (!users || users.length === 0) {
      throw new Error(`User '${username}' not found on MikroTik router`);
    }

    const userId = users[0]['.id'];

    // 2. Enable the user using the correct .id
    await client.write('/ip/hotspot/user/set', {
      '.id': userId,
      'disabled': 'no'
    });
    return { status: 'success' };
  } finally {
    await client.close();
  }
}
