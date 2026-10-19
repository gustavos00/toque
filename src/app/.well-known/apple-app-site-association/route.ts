// GET /.well-known/apple-app-site-association — lets iOS open /t/<token> straight in the app
// (Associated Domains `applinks:<domain>`). Needs TOQUE_APPLE_TEAM_ID (the 10-character Apple
// team id); TOQUE_IOS_BUNDLE_ID defaults to the app's bundle id. 404 until the team id is set.

export function GET() {
  const teamId = process.env.TOQUE_APPLE_TEAM_ID?.trim();
  if (!teamId) return new Response(null, { status: 404 });
  const bundleId =
    process.env.TOQUE_IOS_BUNDLE_ID?.trim() || "com.gustavo.toque";
  return Response.json(
    {
      applinks: {
        details: [
          {
            appIDs: [`${teamId}.${bundleId}`],
            components: [{ "/": "/t/*" }],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
