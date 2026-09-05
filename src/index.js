export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 0-1. 利用規約ページ (/terms)
    if (url.pathname === "/terms") {
      return new Response(getTermsHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // 0-2. プライバシーポリシーページ (/privacy)
    if (url.pathname === "/privacy") {
      return new Response(getPrivacyHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // 0-3. 同意・連携案内ページ (/link)
    if (url.pathname === "/link") {
      return new Response(`
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>規約同意と連携 - Githubアクティブアカウントチェック</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 40px 20px; line-height: 1.6; background: #f9f9f9; color: #333; }
              .card { max-width: 480px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
              h2 { margin-top: 0; color: #111; }
              a.btn { display: inline-block; background-color: #5865F2; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 20px; }
              a.btn:hover { background-color: #4752C4; }
              .links { margin: 20px 0; font-size: 14px; }
              .links a { color: #0969da; text-decoration: none; }
              .links a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>サービス連携と規約同意</h2>
              <p>以下のアカウント連携を進める前に、利用規約およびプライバシーポリシーをご確認ください。</p>
              <div class="links">
                <a href="/terms" target="_blank">利用規約</a> | <a href="/privacy" target="_blank">プライバシーポリシー</a><br>
                <span style="font-size: 12px; color: #666;">（リポジトリで確認する場合は <a href="https://github.com/minamiiwatobipengin/GitHub-Discord-Link/tree/main" target="_blank">こちら</a>）</span>
              </div>
              <p>「同意して進む」をクリックすると、GitHub認証画面へ遷移します。</p>
              <a href="/linked-role" class="btn">同意して連携する</a>
            </div>
          </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // Discordロールメタデータ定義の自動登録
    ctx.waitUntil(registerRoleConnectionMetadata(env));

    // 1. GitHub OAuth2 認証開始
    if (url.pathname === "/linked-role") {
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&scope=read:user`;
      return Response.redirect(githubAuthUrl, 302);
    }

    // 連携解除の処理開始（Discord認証へ飛ばしてユーザー識別を行う）
    if (url.pathname === "/unlink") {
      const unlinkRedirectUri = `${url.origin}/unlink-callback`;
      const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(unlinkRedirectUri)}&scope=role_connections.write%20identify`;
      return Response.redirect(discordAuthUrl, 302);
    }

    // 連携解除のコールバック処理（API削除＋DB削除を実行）
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

    // 3. Discord OAuth2 コールバック処理（連携保存）
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

        const lastActiveAt = await getGitHubLastActiveDateGraphQL(githubUsername, githubAccessToken);
        
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        
        let isActive = false;
        if (lastActiveAt) {
          const lastActiveTime = new Date(lastActiveAt).getTime();
          isActive = (now - lastActiveTime) <= thirtyDaysMs && lastActiveTime <= now;
        }

        const saveDate = lastActiveAt || new Date(0).toISOString();

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

        await updateDiscordRoleConnection(tokenData.access_token, env.DISCORD_CLIENT_ID, githubUsername, isActive);

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
    ctx.waitUntil(registerRoleConnectionMetadata(env));

    const { results: users } = await env.DB.prepare("SELECT * FROM users").all();
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const user of users) {
      try {
        const lastActiveAt = await getGitHubLastActiveDateGraphQL(user.github_username, user.github_access_token);
        
        const lastActiveTime = lastActiveAt ? new Date(lastActiveAt).getTime() : 0;
        const isActive = (now - lastActiveTime) <= thirtyDaysMs && lastActiveTime > 0;

        const daysInactive = Math.floor((now - lastActiveTime) / (1000 * 60 * 60 * 24));
        const remainingDays = 30 - daysInactive;

        if (!isActive) {
          await updateDiscordRoleConnection(user.access_token, env.DISCORD_CLIENT_ID, user.github_username, false);
          await sendDirectMessage(
            env.DISCORD_BOT_TOKEN,
            user.discord_id,
            "【通知】GitHubで30日以上アクティビティが確認できなかったため、連携ロールを自動解除しました。"
          );
          continue;
        }

        if (remainingDays <= 5 && remainingDays >= 0 && !user.warned_at) {
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

/* --- ドキュメント用 HTML --- */

function getPrivacyHtml() {
  return `
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>プライバシーポリシー - Githubアクティブアカウントチェック</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; padding: 20px; max-width: 800px; margin: 0 auto; color: #24292f; }
          h1 { border-bottom: 1px solid #d0d7de; padding-bottom: 8px; }
          h3 { margin-top: 24px; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <h1>プライバシーポリシー</h1>
        <p>Githubアクティブアカウントチェック（以下、「当サービス」といいます。）は、ユーザーの個人情報の取扱いについて、以下のとおりプライバシーポリシー（以下、「本ポリシー」といいます。）を定め、適切な保護に努めます。</p>

        <h3>1. 取得する情報およびその取得方法</h3>
        <p>当サービスは、本サービスの提供にあたり、以下の情報を取得・利用します。</p>
        <ul>
          <li><strong>Discordに関する情報:</strong> Discord ユーザーID、ユーザー名、アクセストークンおよびリフレッシュトークン</li>
          <li><strong>GitHubに関する情報:</strong> GitHub ユーザー名、アクセストークン、および公開・非公開を含む草（コントリビューション）の最終アクティブ日時</li>
          <li><strong>アクセスログおよび運用管理情報:</strong> システム利用履歴、エラーログ、警告通知の送信履歴（<code>warned_at</code> 等）</li>
        </ul>

        <h3>2. 利用目的</h3>
        <p>当サービスは、取得した情報を以下の目的で利用します。</p>
        <ol>
          <li>ユーザーの識別およびDiscordアカウントとGitHubアカウントの連携処理のため</li>
          <li>GitHubでのアクティビティに基づき、Discordのロール（Linked Role）メタデータを自動更新・管理するため</li>
          <li>非アクティブ状態時の警告通知およびロール自動解除通知をDiscord DMにて送信するため</li>
          <li>当サービスの維持、管理、障害対応および品質向上のため</li>
          <li>お問い合わせへの対応のため</li>
        </ol>

        <h3>3. 情報の第三者提供および外部送信</h3>
        <p>当サービスは、法令に基づく場合を除き、事前にユーザーの同意を得ることなく個人情報を第三者に提供することはありません。</p>
        <p>なお、サービスの性質上、Discord API（Discord Inc.）および GitHub API（GitHub, Inc.）とのデータ通信を行います。</p>

        <h3>4. データの保存および安全管理</h3>
        <p>1. 当サービスは、取得したトークン等の機密情報をデータベース（Cloudflare D1等）に適切に保管し、不正アクセス・漏洩の防止に努めます。</p>
        <p>2. 連携解除が実行された場合、当サービス内に保存されている該当ユーザーのトークンおよび関連データは速やかに削除されます。</p>

        <h3>5. ユーザーによるデータの削除（連携解除）</h3>
        <p>ユーザーは、以下の方法によりいつでも自身のデータを削除し、連携を解除することができます。</p>
        <ul>
          <li>当サービスの連携解除機能（<code>/unlink</code> ページ）の実行</li>
          <li>Discordアプリ内の「設定 ＞ 連携アカウント」からの削除</li>
        </ul>

        <h3>6. 免責事項</h3>
        <p>当サービスは、GitHub APIまたはDiscord APIの仕様変更、通信障害、システム保守等に起因して発生した損害について、一切の責任を負いません。</p>

        <h3>7. プライバシーポリシーの改定</h3>
        <p>当サービスは、必要に応じて本ポリシーを変更することがあります。変更後のポリシーは、当サービス上に掲載した時点から効力を生じるものとします。</p>

        <h3>8. お問い合わせ窓口</h3>
        <p>サポートサーバー: https://discord.gg/XdGrtFSbQ6</p>
        <p><strong>事業者／運営者名:</strong> ミナミイワトビペンギン</p>
        <p>（制定日：2026年9月5日）</p>
      </body>
    </html>
  `;
}

function getTermsHtml() {
  return `
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>利用規約 - Githubアクティブアカウントチェック</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; padding: 20px; max-width: 800px; margin: 0 auto; color: #24292f; }
          h1 { border-bottom: 1px solid #d0d7de; padding-bottom: 8px; }
          h3 { margin-top: 24px; }
          ol { padding-left: 20px; }
        </style>
      </head>
      <body>
        <h1>利用規約</h1>
        <p>この利用規約（以下、「本規約」といいます。）は、ミナミイワトビペンギン（以下、「運営者」といいます。）が提供するGithubアクティブアカウントチェック（以下、「本サービス」といいます。）の利用条件を定めるものです。ユーザーの皆様は、本規約に従って本サービスをご利用ください。</p>

        <h3>第1条（適用）</h3>
        <p>1. 本規約は、ユーザーと運営者との間の本サービスの利用に関わる一切の関係に適用されます。</p>
        <p>2. ユーザーは、本サービスを利用（GitHubおよびDiscordの連携認証を行うことを含みます）することにより、本規約に同意したものとみなされます。</p>

        <h3>第2条（連携機能およびロール更新）</h3>
        <p>1. 本サービスは、ユーザーのGitHubアクティビティ（過去30日以内のコミットやコントリビューション等）を取得し、Discordのロール付与条件（Linked Role）を自動更新します。</p>
        <p>2. 30日以上GitHubでのアクティビティが確認できない場合、Discord側のロールが自動的に解除されることがあります。</p>

        <h3>第3条（禁止事項）</h3>
        <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
        <ol>
          <li>法令または公序良俗に違反する行為</li>
          <li>本サービスのシステムやAPI、データベースに対する不正アクセス、過度な負荷をかける行為</li>
          <li>他のユーザーのアカウントになりすます行為</li>
          <li>本サービスの運営を妨害するおそれのある行為</li>
          <li>その他、運営者が不適切と判断する行為</li>
        </ol>

        <h3>第4条（サービスの停止・変更・終了）</h3>
        <p>運営者は、以下のいずれかの理由により、ユーザーに事前に通知することなく本サービスの提供を一時停止、変更、または終了することができるものとします。</p>
        <ol>
          <li>本サービスに係るシステムの保守点検または更新を行う場合</li>
          <li>地震、火災、停電等の不可抗力により本サービスの提供が困難となった場合</li>
          <li>GitHub API または Discord API の仕様変更やサービス停止が発生した場合</li>
          <li>その他、運営者が本サービスの提供が困難と判断した場合</li>
        </ol>

        <h3>第5条（免責事項）</h3>
        <p>1. 運営者は、本サービスに事実上または法律上の欠陥（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます。）がないことを明示的にも暗示的にも保証しておりません。</p>
        <p>2. 運営者は、本サービスの利用によってユーザーに生じたあらゆる損害（Discordロールの剥奪、データの消失等を含む）について、一切の責任を負いません。</p>

        <h3>第6条（利用規約の変更）</h3>
        <p>運営者は、必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更することができるものとします。変更後の規約は、本サービス上に掲載した時点で効力を生じるものとします。</p>

        <h3>第7条（準拠法・裁判管轄）</h3>
        <p>1. 本規約の解釈にあたっては、日本法を準拠法とします。</p>
        <p>2. 本サービスに関して紛争が生じた場合、運営者の所在地を管轄する裁判所を専属的合意管轄とします。</p>

        <p>（制定日：2026年9月5日）</p>
      </body>
    </html>
  `;
}

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
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Failed to register role connection metadata:", e);
  }
}

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

    let lastActiveDate = null;
    for (let i = weeks.length - 1; i >= 0; i--) {
      const days = weeks[i].contributionDays;
      for (let j = days.length - 1; j >= 0; j--) {
        if (days[j].contributionCount > 0) {
          // 日本時間 (JST) の 23:59:59 として指定（+09:00 を付与してUTC未来判定を防ぐ）
          lastActiveDate = `${days[j].date}T23:59:59.000+09:00`;
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
