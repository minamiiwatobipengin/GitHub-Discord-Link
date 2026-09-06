export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 0-0. 利用規約 ページ
    if (url.pathname === "/terms") {
      return new Response(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>利用規約</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
            h1 { border-bottom: 2px solid #5865F2; padding-bottom: 10px; }
            h2 { margin-top: 20px; font-size: 1.1rem; }
            .btn { display: inline-block; padding: 10px 20px; background-color: #5865F2; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>利用規約</h1>
          <p>本サービスは、GitHubのアクティビティ状況に応じてDiscordのロール連携メタデータを自動更新するサービスです。</p>
          
          <h2>1. 規約への同意</h2>
          <p>ユーザーは、本サービスを利用することにより、本規約に同意したものとみなされます。</p>

          <h2>2. 連携データおよび機能</h2>
          <p>本サービスは、ユーザーのGitHubアクティビティ履歴を照会し、直近30日以内の活動の有無をDiscordに送信します。</p>

          <h2>3. 免責事項</h2>
          <p>本サービスは現状有姿で提供され、障害やエラー等によりデータが正常に同期されなかった場合でも、開発者は一切の責任を負いません。</p>

          <h2>4. サービスの変更・終了</h2>
          <p>運営上の理由やAPI仕様の変更等により、事前の通知なくサービス内容の変更または提供を終了する場合があります。</p>

          <p><a href="/link" class="btn">同意画面へ戻る</a></p>
        </body>
        </html>
      `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // 0-0. プライバシーポリシー ページ
    if (url.pathname === "/privacy") {
      return new Response(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>プライバシーポリシー</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
            h1 { border-bottom: 2px solid #5865F2; padding-bottom: 10px; }
            h2 { margin-top: 20px; font-size: 1.1rem; }
            .btn { display: inline-block; padding: 10px 20px; background-color: #5865F2; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>プライバシーポリシー</h1>

          <h2>1. 取得する情報</h2>
          <p>本サービスでは、以下の情報を取得・保存します。</p>
          <ul>
            <li>Discord ユーザーID、OAuthアクセストークン、リフレッシュトークン</li>
            <li>GitHub ユーザー名、OAuthアクセストークン</li>
            <li>GitHub上の最終アクティビティ日時および警告送信フラグ</li>
          </ul>

          <h2>2. データの利用目的</h2>
          <p>取得した情報は、GitHubのアクティビティを判定し、Discord Linked Roleメタデータを適切に同期・更新するためにのみ利用します。</p>

          <h2>3. データの保管と第三者提供</h2>
          <p>ユーザーデータは暗号化された安全なデータベース（Cloudflare D1）にて保管されます。法令に基づく場合を除き、第三者に提供・売却することはありません。</p>

          <h2>4. 個人データの削除請求および連携解除</h2>
          <p>ユーザーはいつでも保存された自身のデータ削除（連携解除）を請求することができます。</p>
          <p>自動連携解除（即時削除）を行う場合は <a href="/unlink">連携解除ページ（/unlink）</a> へアクセスするか、手動でのデータ削除請求手続きについては <a href="/data-deletion">データ削除請求ページ（/data-deletion）</a> をご確認ください。</p>

          <p><a href="/link" class="btn">同意画面へ戻る</a></p>
        </body>
        </html>
      `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ★追加: データ削除請求（Data Deletion Request）ページ
    if (url.pathname === "/data-deletion") {
      return new Response(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>データ削除請求</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
            h1 { border-bottom: 2px solid #5865F2; padding-bottom: 10px; }
            .card { background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #ddd; margin: 20px 0; }
            .btn { display: inline-block; padding: 10px 20px; background-color: #ed4245; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>データ削除請求（Data Deletion）</h1>
          <p>本サービスに格納されているあなたの個人データ（Discord ID、GitHub ユーザー名、トークン情報等）の削除を行うことができます。</p>

          <div class="card">
            <h3>方法 1: 即時自動削除（推奨）</h3>
            <p>以下のボタンよりDiscord認証を行うことで、Discord側の連携メタデータおよびデータベース（Cloudflare D1）内のユーザーデータが即座に完全削除されます。</p>
            <p><a href="/unlink" class="btn">連携解除とデータ削除を実行</a></p>
          </div>

          <div class="card">
            <h3>方法 2: 手動削除リクエスト</h3>
            <p>自動解除が利用できない場合や問い合わせによる削除をご希望の場合は、Discord Appsの設定ページより連携アプリの認証を取り消すか、管理者までお問い合わせください。</p>
          </div>

          <p><a href="/link" style="color: #5865F2;">トップページへ戻る</a></p>
        </body>
        </html>
      `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // 0-0. 同意トップページ
    if (url.pathname === "/link") {
      return new Response(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>連携確認</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding-top: 50px; color: #333; }
            .card { max-width: 500px; margin: 0 auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            .links { margin: 20px 0; }
            .links a { margin: 0 8px; color: #5865F2; font-weight: bold; text-decoration: none; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #5865F2; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>GitHub × Discord 連携</h2>
            <p>連携を開始する前に、以下の規約とポリシーをご確認ください。</p>
            <div class="links">
              <a href="/terms" target="_blank">利用規約</a> | 
              <a href="/privacy" target="_blank">プライバシーポリシー</a> | 
              <a href="/data-deletion" target="_blank">データ削除請求</a>
            </div>
            <p style="margin-top: 30px;">
              <a href="/linked-role" class="btn">同意して連携を開始する</a>
            </p>
          </div>
        </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // メタデータ定義の直接登録エンドポイント
    if (url.pathname === "/register-metadata") {
      try {
        await registerRoleConnectionMetadata(env);
        return new Response("Discord Linked Role メタデータ定義の更新に成功しました。", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      } catch (err) {
        return new Response(`メタデータ定義の更新に失敗しました: ${err.message}`, {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    }

    // 1. GitHub OAuth2 認証開始
    if (url.pathname === "/linked-role") {
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&scope=read:user`;
      return Response.redirect(githubAuthUrl, 302);
    }

    // 連携解除の処理開始
    if (url.pathname === "/unlink") {
      const unlinkRedirectUri = `${url.origin}/unlink-callback`;
      const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(unlinkRedirectUri)}&scope=role_connections.write%20identify`;
      return Response.redirect(discordAuthUrl, 302);
    }

    // 連携解除のコールバック処理（API削除＋DB削除）
    if (url.pathname === "/unlink-callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("認証コードがありません", { status: 400 });

      try {
        const unlinkRedirectUri = `${url.origin}/unlink-callback`;
        const tokenData = await getDiscordTokenWithUri(code, env, unlinkRedirectUri);
        const discordUser = await getDiscordUser(tokenData.access_token);

        // 1. Discord 側の連携ロールメタデータを削除 (DELETE)
        await deleteDiscordRoleConnection(tokenData.access_token, env.DISCORD_CLIENT_ID);

        // 2. D1 データベースから該当ユーザーを削除
        await env.DB.prepare("DELETE FROM users WHERE discord_id = ?").bind(discordUser.id).run();

        return new Response(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2>連携を完全に解除しました</h2>
              <p>GitHubとの連携データおよびDiscordのロール条件を削除しました。</p>
            </body>
          </html>
        `, {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });

      } catch (err) {
        return new Response(`連携解除エラー: ${err.message}`, { status: 500 });
      }
    }

    // 2. GitHub コールバック処理
    if (url.pathname === "/github-callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("GitHub Codeが取得できませんでした", { status: 400 });

      try {
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

        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
            "User-Agent": "CloudflareWorkers-DiscordBot"
          }
        });
        const githubUser = await userRes.json();
        const githubUsername = githubUser.login;

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

        const tokenData = await getDiscordTokenWithUri(code, env, env.DISCORD_REDIRECT_URI);
        const discordUser = await getDiscordUser(tokenData.access_token);

        const githubMetrics = await getGitHubUserMetricsGraphQL(githubUsername, githubAccessToken);
        
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        
        let isActive = false;
        if (githubMetrics.lastActiveAt) {
          const lastActiveTime = new Date(githubMetrics.lastActiveAt).getTime();
          isActive = (now - lastActiveTime) <= thirtyDaysMs && lastActiveTime <= now;
        }

        const saveDate = githubMetrics.lastActiveAt || new Date(0).toISOString();

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

        await updateDiscordRoleConnection(
          tokenData.access_token,
          env.DISCORD_CLIENT_ID,
          githubUsername,
          isActive,
          githubMetrics
        );

        return new Response(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2>連携完了</h2>
              <p>このタブを安全に閉じることができます</p>
            </body>
          </html>
        `, {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });

      } catch (err) {
        return new Response(`認証エラーが発生しました: ${err.message}`, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // 4. 定期実行バッチ (Cron)
  async scheduled(event, env, ctx) {
    const { results: users } = await env.DB.prepare("SELECT * FROM users").all();
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const user of users) {
      try {
        let accessToken = user.access_token;

        try {
          const refreshed = await refreshDiscordToken(user.refresh_token, env);
          accessToken = refreshed.access_token;
          
          await env.DB.prepare(`
            UPDATE users SET access_token = ?, refresh_token = ? WHERE discord_id = ?
          `).bind(refreshed.access_token, refreshed.refresh_token, user.discord_id).run();
        } catch (e) {
          console.warn(`[Token Refresh Failed] Discord ID: ${user.discord_id} - ${e.message}`);
        }

        const githubMetrics = await getGitHubUserMetricsGraphQL(user.github_username, user.github_access_token);
        
        const lastActiveTime = githubMetrics.lastActiveAt ? new Date(githubMetrics.lastActiveAt).getTime() : 0;
        const isActive = (now - lastActiveTime) <= thirtyDaysMs && lastActiveTime > 0;

        const daysInactive = Math.floor((now - lastActiveTime) / (1000 * 60 * 60 * 24));
        const remainingDays = 30 - daysInactive;

        await updateDiscordRoleConnection(
          accessToken,
          env.DISCORD_CLIENT_ID,
          user.github_username,
          isActive,
          githubMetrics
        );

        if (!isActive) {
          await sendDirectMessage(
            env.DISCORD_BOT_TOKEN,
            user.discord_id,
            "【通知】GitHubで30日以上アクティビティが確認できなかったため、アクティブ条件を満たさなくなりました。"
          );
          continue;
        }

        if (remainingDays <= 5 && remainingDays >= 0 && !user.warned_at) {
          const message = `【警告】GitHubのアクティビティが低下しています。\nあと **${remainingDays}日** 以内にコミットなどの活動がない場合、Discordのアクティブ判定が解除されます。\n（対象アカウント: ${user.github_username}）`;
          
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

async function registerRoleConnectionMetadata(env) {
  try {
    const url = `https://discord.com/api/v10/applications/${env.DISCORD_CLIENT_ID}/role-connections/metadata`;
    const body = [
      {
        key: "active_within_30days",
        name: "30日以内のGitHubアクティビティ",
        description: "直近30日以内にGitHubで活動があるか",
        type: 7
      }
    ];

    await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    });
  } catch (e) {
    console.error("Failed to register role connection metadata:", e);
  }
}

async function refreshDiscordToken(refreshToken, env) {
  const params = new URLSearchParams();
  params.append("client_id", env.DISCORD_CLIENT_ID);
  params.append("client_secret", env.DISCORD_CLIENT_SECRET);
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);

  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Discord Token Refresh Failed: ${errText}`);
  }
  return await res.json();
}

async function getGitHubUserMetricsGraphQL(username, accessToken) {
  if (!accessToken) return { lastActiveAt: null };

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

    if (!res.ok) return { lastActiveAt: null };

    const resData = await res.json();
    const weeks = resData.data?.user?.contributionsCollection?.contributionCalendar?.weeks;

    if (!weeks) return { lastActiveAt: null };

    let lastActiveDate = null;
    for (let i = weeks.length - 1; i >= 0; i--) {
      const days = weeks[i].contributionDays;
      for (let j = days.length - 1; j >= 0; j--) {
        if (days[j].contributionCount > 0) {
          lastActiveDate = `${days[j].date}T23:59:59.000Z`;
          break;
        }
      }
      if (lastActiveDate) break;
    }

    return { lastActiveAt: lastActiveDate };
  } catch (e) {
    console.error(`GitHub GraphQL API Error: ${e.message}`);
    return { lastActiveAt: null };
  }
}

async function getDiscordTokenWithUri(code, env, redirectUri) {
  const params = new URLSearchParams();
  params.append("client_id", env.DISCORD_CLIENT_ID);
  params.append("client_secret", env.DISCORD_CLIENT_SECRET);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirectUri);

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

async function updateDiscordRoleConnection(accessToken, clientId, githubUsername, isActive, metrics = {}) {
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

async function deleteDiscordRoleConnection(accessToken, clientId) {
  const res = await fetch(`https://discord.com/api/v10/users/@me/applications/${clientId}/role-connection`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error("Discord側の連携データ削除に失敗しました");
  }
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
