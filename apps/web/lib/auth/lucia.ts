import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { type Workspace, db, schema } from "@/lib/db";
import { Lucia, TimeSpan } from "lucia";
import { LocalAdapter } from "./adapter";
import type { Auth } from "./interface";

const adapter = new LocalAdapter({ db });

export const lucia = new Lucia(adapter, {
  sessionExpiresIn: new TimeSpan(30, "d"),
  sessionCookie: {
    // this sets cookies with super long expiration
    // since Next.js doesn't allow Lucia to extend cookie expiration when rendering pages
    expires: false,
    attributes: {
      // set to `true` when using HTTPS
      secure: process.env.NODE_ENV === "production",
    },
  },
  getUserAttributes: (attributes) => {
    return {
      username: attributes.username,
    };
  },
});

// IMPORTANT!
declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      username: string;
    } & (
      | {
          oauthId: string;
          oauthProvider: "github" | "google";
        }
      | { oauthId?: never; oauthProvider?: never }
    );
  }
}

export class Impl implements Auth {
  private readonly lucia: typeof lucia;

  constructor(l: typeof lucia) {
    this.lucia = l;
  }

  public async listWorkspaces(userId: string): Promise<Workspace[]> {
    const user = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.id, userId),
      with: {
        memberships: {
          with: {
            workspace: true,
          },
        },
      },
    });
    if (!user) {
      return [];
    }
    return user.memberships.map((m) => m.workspace);
  }

  public async createWorkspace(
    userId: string,
    workspace: Omit<Workspace, "tenantId">,
  ): Promise<void> {
    await db.insert(schema.workspaces).values({
      ...workspace,
      tenantId: userId,
    });
  }
}
