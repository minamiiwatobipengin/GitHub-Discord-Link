export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Discordロールメタデータ定義の自動登録
    ctx.waitUntil(registerRoleConnectionMetadata(env));

    // 1. GitHub OAuth2 認証開始
    if (url.pathname === "/linked-role") {
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&scope=read:user`;
      return Response.redirect(githubAuthUrl, 302);
    }

    // 2. GitHub コールバック処理 ➔ トークン取得 ➔ Discord 認証へリダイレクト
    if (url.pathname === "/github-callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("GitHub Codeが取得できませんでした", { status: 400 });

      try {
        // GitHubアクセストークン取得
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "CloudflareWorkers-DiscordBot"
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code: code,
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error("GitHubトークンの取得に失敗しました");

        // GitHub ユーザー名取得
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
            "User-Agent": "CloudflareWorkers-DiscordBot"
          }
        });
        const githubUser = await userRes.json();
        const githubUsername = githubUser.login;

        // 次のDiscord認証へ渡すため state に情報を格納
        const stateData = JSON.stringify({
          username: githubUsername,
          token: tokenData.access_token
        });

        const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(env.DISCORD_REDIRECT_URI)}&scope=role_connections.write%20identify&state=${encodeURIComponent(stateData)}`;
        return Response.redirect(discordAuthUrl, 302);

      } catch (err) {
        return new Response(`GitHub連携エラー: ${err.message}`, { status: 500 });
      }
    }

    // 3. Discord OAuth2 コールバック処理
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const stateRaw = url.searchParams.get("state");

      if (!code || !stateRaw) {
        return new Response("パラメータが不足しています", { status: 400 });
      }

      try {
        const { username: githubUsername, token: githubAccessToken } = JSON.parse(stateRaw);

        const tokenData = await getDiscordToken(code, env);
        const discordUser = await getDiscordUser(tokenData.access_token);

        // GraphQL APIで最終活動日（草が生えた日）を取得
        const lastActiveAt = await getGitHubLastActiveDateGraphQL(githubUsername, githubAccessToken);
        
        let isActive = false;
        if (lastActiveAt) {
          const lastActiveTime = new Date(lastActiveAt).getTime();
          const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
          isActive = lastActiveTime > thirtyDaysAgo;
        }

        const saveDate = lastActiveAt || new Date(0).toISOString();

        // D1 へ保存 (github_access_token も保存)
        await env.DB.prepare(`
          INSERT INTO users (discord_id, access_token, refresh_token, github_username, github_access_token, last_active_at, warned_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(discord_id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            github_username = excluded.github_username,
            github_access_token = excluded.github_access_token,
            last_active_at = excluded.last_active_at,
            warned_at = NULL
        `).bind(discordUser.id, tokenData.access_token, tokenData.refresh_token, githubUsername, githubAccessToken, saveDate).run();

        // Discord の Linked Role を更新
        await updateDiscordRoleConnection(tokenData.access_token, env.DISCORD_CLIENT_ID, githubUsername, isActive);

        const discordChannelUrl = `https://discord.com/channels/${env.TARGET_GUILD_ID}/${env.TARGET_CHANNEL_ID}`;
        return Response.redirect(discordChannelUrl, 302);

      } catch (err) {
        return new Response(`認証エラーが発生しました: ${err.message}`, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // 4. 定期実行バッチ (Cron)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(registerRoleConnectionMetadata(env));

    const { results: users } = await env.DB.prepare("SELECT * FROM users").all();

    for (const user of users) {
      try {
        // 保存しておいた GitHub Access Token で GraphQL API を実行
        const lastActiveAt = await getGitHubLastActiveDateGraphQL(user.github_username, user.github_access_token);
        
        const lastActiveTime = lastActiveAt ? new Date(lastActiveAt).getTime() : 0;
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const isActive = lastActiveTime > thirtyDaysAgo;

        const daysInactive = getDaysDifference(new Date(lastActiveTime), new Date());
        const remainingDays = 30 - daysInactive;

        // 30日以上非アクティブ（1970年等データなし含む）➔ ロール解除 ＆ DM通知
        if (!isActive) {
          await updateDiscordRoleConnection(user.access_token, env.DISCORD_CLIENT_ID, user.github_username, false);
          await sendDirectMessage(
            env.DISCORD_BOT_TOKEN,
            user.discord_id,
            "【通知】GitHubで30日以上アクティビティが確認できなかったため、連携ロールを自動解除しました。"
          );
          continue;
        }

        // 残り5日以下 ＆ 未警告 ➔ 警告DM送信
        if (remainingDays <= 5 && !user.warned_at) {
          const message = `【警告】GitHubのアクティビティが低下しています。\nあと **${remainingDays}日** 以内にコミットなどの活動がない場合、Discordの連携ロールが自動解除されます。\n（対象アカウント: ${user.github_username}）`;
          
          const sent = await sendDirectMessage(env.DISCORD_BOT_TOKEN, user.discord_id, message);
          if (sent) {
            await env.DB.prepare("UPDATE users SET warned_at = ? WHERE discord_id = ?")
              .bind(new Date().toISOString(), user.discord_id).run();
          }
        }
      } catch (err) {
        console.error(`[Cron Error] Discord ID: ${user.discord_id} - ${err.message}`);
      }
    }
  }
};

/* --- ヘルパー関数群 --- */

// Discord Role Connection メタデータの自動登録
async function registerRoleConnectionMetadata(env) {
  try {
    const url = `https://discord.com/api/v10/applications/${env.DISCORD_CLIENT_ID}/role-connections/metadata`;
    const body = [
      {
        key: "active_within_30days",
        name: "30日以内のGitHubアクティビティ",
        description: "直近30日以内にGitHubで活動があるか",
        type: 7 // Boolean
      }
    ];

    await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Failed to register role connection metadata:", e);
  }
}

// GitHub GraphQL API で草（コントリビューション）の最新日付を取得
async function getGitHubLastActiveDateGraphQL(username, accessToken) {
  if (!accessToken) return null;

  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "User-Agent": "CloudflareWorkers-DiscordBot",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { username } }),
    });

    if (!res.ok) return null;

    const resData = await res.json();
    const weeks = resData.data?.user?.contributionsCollection?.contributionCalendar?.weeks;

    if (!weeks) return null;

    // 最新の日付から逆順にルックアップし、草が1つ以上生えている日を探す
    let lastActiveDate = null;
    for (let i = weeks.length - 1; i >= 0; i--) {
      const days = weeks[i].contributionDays;
      for (let j = days.length - 1; j >= 0; j--) {
        if (days[j].contributionCount > 0) {
          lastActiveDate = `${days[j].date}T00:00:00.000Z`;
          break;
        }
      }
      if (lastActiveDate) break;
    }

    return lastActiveDate;
  } catch (e) {
    console.error(`GitHub GraphQL API Error: ${e.message}`);
    return null;
  }
}

async function getDiscordToken(code, env) {
  const params = new URLSearchParams();
  params.append("client_id", env.DISCORD_CLIENT_ID);
  params.append("client_secret", env.DISCORD_CLIENT_SECRET);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", env.DISCORD_REDIRECT_URI);

  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorDetail = await res.text();
    throw new Error(`Discordトークンの取得に失敗しました: ${errorDetail}`);
  }
  return await res.json();
}

async function getDiscordUser(accessToken) {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("Discordユーザー情報の取得に失敗しました");
  return await res.json();
}

function getDaysDifference(d1, d2) {
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

async function updateDiscordRoleConnection(accessToken, clientId, githubUsername, isActive) {
  const res = await fetch(`https://discord.com/api/v10/users/@me/applications/${clientId}/role-connection`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      platform_name: "GitHub",
      platform_username: githubUsername,
      metadata: {
        active_within_30days: isActive ? 1 : 0
      },
    }),
  });
  if (!res.ok) throw new Error("Linked Roleメタデータの更新に失敗しました");
}

async function sendDirectMessage(botToken, recipientId, messageContent) {
  try {
    const channelRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: recipientId }),
    });
    if (!channelRes.ok) return false;
    const channel = await channelRes.json();

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: messageContent }),
    });
    return msgRes.ok;
  } catch (e) {
    return false;
  }
}
