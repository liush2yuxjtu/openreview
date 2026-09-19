const getRequired = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

export const getSetupState = () => getRequired("OPENREVIEW_SETUP_STATE");

const getVercelConfig = () => ({
  projectId: getRequired("OPENREVIEW_SETUP_PROJECT_ID"),
  teamId: getRequired("OPENREVIEW_SETUP_TEAM_ID"),
  token: getRequired("OPENREVIEW_SETUP_VERCEL_TOKEN"),
});

export const upsertProductionEnv = async (
  entries: Array<{ key: string; value: string }>
) => {
  const { projectId, teamId, token } = getVercelConfig();
  const response = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true&teamId=${encodeURIComponent(teamId)}`,
    {
      body: JSON.stringify(
        entries.map(({ key, value }) => ({
          key,
          target: ["production"],
          type: "sensitive",
          value,
        }))
      ),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    throw new Error(`Vercel env update failed: ${response.status}`);
  }
};

export const triggerProductionDeployment = async () => {
  const { teamId, token } = getVercelConfig();
  const response = await fetch(
    `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(teamId)}`,
    {
      body: JSON.stringify({
        gitSource: {
          org: "liush2yuxjtu",
          ref: "main",
          repo: "openreview",
          type: "github",
        },
        name: "openreview-selfhost",
        project: "openreview-selfhost",
        target: "production",
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    throw new Error(`Vercel deployment trigger failed: ${response.status}`);
  }

  return (await response.json()) as { id?: string; url?: string };
};
