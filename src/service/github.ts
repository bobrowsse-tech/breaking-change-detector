/**
 * Post a markdown comment on a PR via GitHub REST (fetch).
 * Token must be supplied by the caller (SecretStorage in the extension host).
 */
export async function postPrComment(opts: {
  token: string;
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
}): Promise<{ htmlUrl: string }> {
  const url = `https://api.github.com/repos/${opts.owner}/${opts.repo}/issues/${opts.pullNumber}/comments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'breaking-change-detector',
    },
    body: JSON.stringify({ body: opts.body }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { html_url: string };
  return { htmlUrl: data.html_url };
}

export function parseGithubRemote(remoteUrl: string): { owner: string; repo: string } | undefined {
  const m =
    remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/) ||
    remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!m) {
    return undefined;
  }
  return { owner: m[1], repo: m[2] };
}
