export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. DiscordからのOAuth2認証開始エンドポイント
    if (url.pathname === "/linked-role") {
      const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(env.DISCORD_REDIRECT_URI)}&scope=role_connections.write%20identify`;
      return Response.redirect(discordAuthUrl, 302);
    }

    // 2. OAuth2 コールバック処理
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const githubUsername = url.searchParams.get("github");

      if (!code || !githubUsername) {
        return new Response("パラメータが不足しています (?github=YOUR_GITHUB_NAME が必要です)", { status: 400 });
      }

      try {
        // Discordのトークン & ユーザーID取得
        const tokenData = await getDiscordToken(code, env);
        const discordUser = await getDiscordUser(tokenData.access_token);

        // GitHubアクティビティチェック
        const lastActiveAt = await getGitHubLastActiveDate(githubUsername);
        const daysInactive = getDaysDifference(new Date(lastActiveAt), new Date());
        const isActive = daysInactive < 30;

        // Cloudflare D1 (CfD1) にユーザー情報・トークン・状態を保存
        await env.DB.prepare(`
          INSERT INTO users (discord_id, access_token, refresh_token, github_username, last_active_at, warned_at)
          VALUES (?, ?, ?, ?, ?, NULL)
          ON CONFLICT(discord_id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            github_username = excluded.github_username,
            last_active_at = excluded.last_active_at,
            warned_at = NULL
        `).bind(discordUser.id, tokenData.access_token, tokenData.refresh_token, githubUsername, lastActiveAt).run();

        // Discord Role Connection (連携メタデータ) 更新
        await updateDiscordRoleConnection(tokenData.access_token, env.DISCORD_CLIENT_ID, githubUsername, isActive);

        // 指定のDiscordチャンネルへリダイレクト
        const discordChannelUrl = `https://discord.com/channels/${env.TARGET_GUILD_ID}/${env.TARGET_CHANNEL_ID}`;
        return Response.redirect(discordChannelUrl, 302);

      } catch (err) {
        return new Response(`認証エラーが発生しました: ${err.message}`, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // 3. 毎日0時の定時バッチ処理 (警告DM ＆ 自動ロール剥奪)
  async scheduled(event, env, ctx) {
    const { results: users } = await env.DB.prepare("SELECT * FROM users").all();

    for (const user of users) {
      try {
        const lastActiveAt = await getGitHubLastActiveDate(user.github_username);
        const daysInactive = getDaysDifference(new Date(lastActiveAt), new Date());
        const remainingDays = 30 - daysInactive;

        // パターンA: 30日以上非アクティブ ➔ ロール剥奪 ＆ 解除DM送信
        if (remainingDays <= 0) {
          await updateDiscordRoleConnection(user.access_token, env.DISCORD_CLIENT_ID, user.github_username, false);
          await sendDirectMessage(
            env.DISCORD_BOT_TOKEN,
            user.discord_id,
            "【通知】GitHubで30日以上アクティビティが確認できなかったため、連携ロールを自動解除しました。"
          );
          continue;
        }

        // パターンB: 残り5日以下 ＆ 未警告 ➔ 警告DM送信
        if (remainingDays <= 5 && !user.warned_at) {
          const message = `【警告】GitHubのアクティビティが低下しています。\nあと **${remainingDays}日** 以内にコミットなどの活動がない場合、Discordの連携ロールが自動解除されます。\n（対象アカウント: ${user.github_username}）`;
          
          const sent = await sendDirectMessage(env.DISCORD_BOT_TOKEN, user.discord_id, message);
          if (sent) {
            // 連日送信を避けるため警告送信日時をD1へ書き込み
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

/* --- API通信・処理用ヘルパー関数群 --- */

// Discord OAuth2 トークン取得
async function getDiscordToken(code, env) {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });

  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error("Discordトークンの取得に失敗しました");
  return await res.json();
}

// ユーザー情報取得
async function getDiscordUser(accessToken) {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("Discordユーザー情報の取得に失敗しました");
  return await res.json();
}

// GitHub APIで最新アクティビティ日時を取得
async function getGitHubLastActiveDate(username) {
  const res = await fetch(`https://api.github.com/users/${username}/events`, {
    headers: { "User-Agent": "CloudflareWorkers-DiscordBot" }
  });
  if (!res.ok) return new Date(0).toISOString();
  const events = await res.json();
  return events.length > 0 ? events[0].created_at : new Date(0).toISOString();
}

// 日数差の判定
function getDaysDifference(d1, d2) {
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

// Discord Role Connection (連携メタデータ) の更新
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

// Botトークンを用いたDiscord DM送信
async function sendDirectMessage(botToken, recipientId, messageContent) {
  try {
    // DMチャンネルの作成
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

    // メッセージの送信
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