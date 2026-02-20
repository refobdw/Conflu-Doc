import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ConfluDoc',
  slug: 'confludoc',
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
    name: 'ConfluDoc',
    shortName: 'ConfluDoc',
    backgroundColor: '#ffffff',
    themeColor: '#0052CC',
  },
  extra: {
    atlassianEmail: process.env.ATLASSIAN_EMAIL,
    atlassianApiToken: process.env.ATLASSIAN_API_TOKEN,
    atlassianBaseUrl: process.env.ATLASSIAN_BASE_URL,
    confluenceSpaceKey: process.env.CONFLUENCE_SPACE_KEY,
    confluenceParentId: process.env.CONFLUENCE_PARENT_ID,
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    notionApiKey: process.env.NOTION_API_KEY,
    notionDatabaseId: process.env.NOTION_DATABASE_ID,
  },
});
