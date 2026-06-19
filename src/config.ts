import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const CONFIG = {
  atlassian: {
    email: extra.atlassianEmail as string,
    apiToken: extra.atlassianApiToken as string,
    baseUrl: extra.atlassianBaseUrl as string,
    spaceKey: extra.confluenceSpaceKey as string,
    parentId: extra.confluenceParentId as string,
    parentIdDoc: (extra.confluenceParentIdDoc ?? extra.confluenceParentId) as string,
    parentIdDaily: (extra.confluenceParentIdDaily ?? extra.confluenceParentId) as string,
  },
  gemini: {
    apiKey: extra.geminiApiKey as string,
    model: (extra.geminiModel as string) || 'gemini-3.1-flash-lite',
  },
};

export const getAuth = () =>
  'Basic ' + btoa(`${CONFIG.atlassian.email}:${CONFIG.atlassian.apiToken}`);
