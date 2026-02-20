import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const CONFIG = {
  atlassian: {
    email: extra.atlassianEmail as string,
    apiToken: extra.atlassianApiToken as string,
    baseUrl: extra.atlassianBaseUrl as string,
    spaceKey: extra.confluenceSpaceKey as string,
    parentId: extra.confluenceParentId as string,
  },
  gemini: {
    apiKey: extra.geminiApiKey as string,
    model: (extra.geminiModel as string) || 'gemini-2.5-flash',
  },
  notion: {
    apiKey: extra.notionApiKey as string,
    databaseId: extra.notionDatabaseId as string,
  },
};

export const getAuth = () =>
  'Basic ' + btoa(`${CONFIG.atlassian.email}:${CONFIG.atlassian.apiToken}`);
