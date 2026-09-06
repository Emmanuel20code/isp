import { RouterOSAPI } from "node-routeros";

export interface UserSession {
  sessionId: string;
  username: string;
  ipAddress: string;
  macAddress: string;
  bytesIn: number;
  bytesOut: number;
  uptime: string;
}

/**
 * MikroTik RouterOS API Service
 * Handles direct communication with routers for real-time operations.
 */
export class MikrotikApiClient {
  private api: RouterOSAPI;
  private isConnected: boolean = false;
  private host: string;
  private username: string;
  private password: string;
  private port: number;

  constructor(options: { host: string; username?: string; password?: string; port?: number; timeout?: number }) {
    this.host = options.host;
    this.username = options.username || "admin";
    this.password = options.password || "";
    this.port = options.port || 8728;

    this.api = new RouterOSAPI({
      host: this.host,
      user: this.username,
      password: this.password,
      port: this.port,
      timeout: options.timeout || 4, // 4-second connect timeout for fast fallback
    });
  }

  /**
   * Establishes a persistent connection to the router if not already connected.
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;
    try {
      await this.api.connect();
      this.isConnected = true;
      console.log(`✅ Connected to MikroTik router at ${this.host}`);

      this.api.on("error", (err) => {
        console.warn(`[MikrotikApiClient] Router connection notice (${this.host}):`, err?.message || err);
        this.isConnected = false;
      });
    } catch (error: any) {
      this.isConnected = false;
      const isTimeout =
        error?.message?.includes("Timed out") ||
        error?.name === "RosException" ||
        error?.code === "ETIMEDOUT" ||
        error?.code === "ECONNREFUSED" ||
        error?.code === "EHOSTUNREACH";

      if (isTimeout) {
        console.debug(
          `[MikrotikApiClient] Direct API connection to ${this.host}:${this.port} unavailable (${error.message || error.name}). Router uses agent polling sync.`,
        );
      } else {
        console.warn(`[MikrotikApiClient] Could not connect to MikroTik router at ${this.host}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Manually terminates the persistent router connection.
   */
  async disconnect(): Promise<void> {
    try {
      await this.api.close();
      this.isConnected = false;
      console.log(`🔌 Disconnected from MikroTik router at ${this.host}`);
    } catch (error) {
      console.error(`Error disconnecting from router at ${this.host}:`, error);
    }
  }

  /**
   * Automatically handles user logic. If they exist, it resets counters and updates their profile.
   * If they do not exist, it inserts them freshly into the hotspot database.
   */
  async upsertHotspotUser(
    username: string,
    password: string,
    profile: string = "default",
    limitUptime?: string, // e.g., "01:00:00" or "1d"
    limitBytesTotal?: number, // e.g., 1073741824 for 1GB
    comment: string = "Paid via Portal",
  ): Promise<void> {
    try {
      await this.connect();

      // Search for an existing user record
      const users = await this.api.write("/ip/hotspot/user/print", [`?name=${username}`]);

      if (users && users.length > 0) {
        const userId = users[0][".id"];
        const updateArgs = [
          `=.id=${userId}`,
          `=password=${password}`,
          `=profile=${profile}`,
          `=comment=Renewed: ${comment}`,
          "=disabled=no",
        ];

        // Apply or safely clear limits
        updateArgs.push(limitUptime ? `=limit-uptime=${limitUptime}` : "=limit-uptime=");
        updateArgs.push(
          limitBytesTotal
            ? `=limit-bytes-total=${limitBytesTotal.toString()}`
            : "=limit-bytes-total=",
        );

        // Zero out usage data to give them a completely clean renewal window
        updateArgs.push("=uptime=0s");
        updateArgs.push("=bytes-in=0");
        updateArgs.push("=bytes-out=0");

        await this.api.write("/ip/hotspot/user/set", updateArgs);
        console.log(`🔄 Renewed existing user: ${username} on ${this.host}`);

        // Kick them if they are actively connected so changes apply instantly
        await this.kickUserSessionByUsername(username);
      } else {
        // Create user freshly if they don't exist
        const commandArgs = [
          `=name=${username}`,
          `=password=${password}`,
          `=profile=${profile}`,
          `=comment=${comment}`,
          "=disabled=no",
        ];

        if (limitUptime) commandArgs.push(`=limit-uptime=${limitUptime}`);
        if (limitBytesTotal) commandArgs.push(`=limit-bytes-total=${limitBytesTotal.toString()}`);

        await this.api.write("/ip/hotspot/user/add", commandArgs);
        console.log(`✅ Created fresh hotspot user: ${username} on ${this.host}`);
      }
    } catch (error) {
      console.error(`❌ Upsert workflow failed for user ${username} on ${this.host}:`, error);
      throw error;
    }
  }

  /**
   * Kicks an active session immediately by username, forcing re-authentication.
   */
  async kickUserSessionByUsername(username: string): Promise<boolean> {
    try {
      await this.connect();
      const activeSessions = await this.api.write("/ip/hotspot/active/print", [
        `?user=${username}`,
      ]);

      if (activeSessions && activeSessions.length > 0) {
        for (const session of activeSessions) {
          await this.api.write("/ip/hotspot/active/remove", [`=.id=${session[".id"]}`]);
          console.log(`⚡ Kicked active session for user: ${username} on ${this.host}`);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error(`❌ Failed to kick user session for ${username} on ${this.host}:`, error);
      throw error;
    }
  }

  /**
   * Removes a user from the router Hotspot databases completely.
   */
  async removeHotspotUser(username: string): Promise<void> {
    try {
      await this.connect();
      const users = await this.api.write("/ip/hotspot/user/print", [`?name=${username}`]);

      if (users && users.length > 0) {
        const userId = users[0][".id"];
        await this.api.write("/ip/hotspot/user/remove", [`=.id=${userId}`]);
        console.log(`🗑️ Removed hotspot user: ${username} on ${this.host}`);
      }
    } catch (error) {
      console.error(`❌ Failed to remove hotspot user ${username} on ${this.host}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves an array of all active connections on the hotspot network.
   */
  async getActiveUsers(): Promise<UserSession[]> {
    try {
      await this.connect();
      const activeSessions = await this.api.write("/ip/hotspot/active/print");

      return activeSessions.map((session: any) => ({
        sessionId: session[".id"],
        username: session.user || "unknown",
        ipAddress: session.address || "",
        macAddress: session["mac-address"] || "",
        bytesIn: parseInt(session["bytes-in"] || "0"),
        bytesOut: parseInt(session["bytes-out"] || "0"),
        uptime: session.uptime || "0s",
      }));
    } catch (error) {
      console.error(`❌ Failed to get active users on ${this.host}:`, error);
      return [];
    }
  }

  /**
   * Fetches data metrics for an actively logged-in user.
   */
  async getUserUsage(
    username: string,
  ): Promise<{ bytesIn: number; bytesOut: number; uptime: string } | null> {
    try {
      await this.connect();
      const activeSessions = await this.api.write("/ip/hotspot/active/print", [
        `?user=${username}`,
      ]);

      if (activeSessions && activeSessions.length > 0) {
        const session = activeSessions[0];
        return {
          bytesIn: parseInt(session["bytes-in"] || "0"),
          bytesOut: parseInt(session["bytes-out"] || "0"),
          uptime: session.uptime || "0s",
        };
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to get user usage for ${username} on ${this.host}:`, error);
      return null;
    }
  }

  /**
   * Creates a structured user speed and session parameter profile template on the router.
   */
  async createUserProfile(
    profileName: string,
    rateLimit: string,
    sessionTimeout: string,
  ): Promise<void> {
    try {
      await this.connect();
      await this.api.write("/ip/hotspot/user/profile/add", [
        `=name=${profileName}`,
        `=rate-limit=${rateLimit}`,
        `=session-timeout=${sessionTimeout}`,
        "=shared-users=1",
        "=status-autorefresh=1m",
      ]);
      console.log(`✅ Created user profile: ${profileName} on ${this.host}`);
    } catch (error) {
      console.error(`❌ Failed to create user profile ${profileName} on ${this.host}:`, error);
      throw error;
    }
  }

  /**
   * Periodically cleans up active sessions on the router that are not in the provided allowed list.
   * This prevents "ghost" sessions from blocking a user's portal access.
   */
  async cleanupStaleSessions(allowedUsernames: string[]): Promise<{ kicked: number }> {
    try {
      await this.connect();
      const activeSessions = await this.api.write("/ip/hotspot/active/print");
      const allowedSet = new Set(allowedUsernames);
      let kickedCount = 0;

      for (const session of activeSessions) {
        const username = session.user;
        // Skip sessions that might be internal or specifically exempted if needed
        if (username && !allowedSet.has(username)) {
          // This session is stale according to our database
          await this.api.write("/ip/hotspot/active/remove", [`=.id=${session[".id"]}`]);
          console.log(`🧹 Cleaned up stale ghost session for user: ${username} on ${this.host}`);
          kickedCount++;
        }
      }

      // Also clean up host entries that are "authorized" but not in our active list
      // This is less common but can happen with certain Mikrotik configs
      const hostEntries = await this.api.write("/ip/hotspot/host/print", ["?authorized=true"]);
      for (const host of hostEntries) {
        const user = host.user;
        if (user && !allowedSet.has(user)) {
          await this.api.write("/ip/hotspot/host/remove", [`=.id=${host[".id"]}`]);
          console.log(`🧹 Removed stale authorized host entry for user: ${user} on ${this.host}`);
        }
      }

      return { kicked: kickedCount };
    } catch (error: any) {
      const isTimeout =
        error?.message?.includes("Timed out") ||
        error?.name === "RosException" ||
        error?.code === "ETIMEDOUT" ||
        error?.code === "ECONNREFUSED" ||
        error?.code === "EHOSTUNREACH";

      if (isTimeout) {
        console.debug(`[MikrotikApiClient] Direct session cleanup skipped for ${this.host} (router behind NAT / API unreachable).`);
      } else {
        console.warn(`[MikrotikApiClient] Session cleanup notice for ${this.host}:`, error?.message || error);
      }
      return { kicked: 0 };
    }
  }
}
