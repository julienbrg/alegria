import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EntUser } from '../ent/session.service';
import { APP_VERSION } from '../version';

/** One server per request: tools close over the caller's identity. */
export function createMcpServer(user: EntUser): McpServer {
  const server = new McpServer({ name: 'alegria', version: APP_VERSION });

  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description:
        'Returns the ENT profile, role, schools and classes of the caller.',
      annotations: { readOnlyHint: true },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            profile: user.profile,
            role: user.role,
            schools: user.uai,
            classes: user.classes,
          }),
        },
      ],
    }),
  );

  return server;
}
