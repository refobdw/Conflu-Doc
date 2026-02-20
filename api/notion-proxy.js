module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const notionApiKey = process.env.NOTION_API_KEY;
  if (!notionApiKey) {
    return res.status(500).json({ error: 'NOTION_API_KEY가 설정되지 않았습니다.' });
  }

  const { _path, ...rest } = req.query;
  const path = Array.isArray(_path) ? _path[0] : (_path || '');
  const url = `https://api.notion.com/v1/${path}`;

  const fetchOptions = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
  };

  if (req.method !== 'GET' && req.method !== 'DELETE' && req.body) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  try {
    const response = await fetch(url, fetchOptions);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
