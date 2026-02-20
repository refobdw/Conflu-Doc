module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { _path, ...rest } = req.query;
  const path = Array.isArray(_path) ? _path[0] : (_path || '');

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) {
    params.set(k, Array.isArray(v) ? v[0] : (v || ''));
  }
  const queryStr = params.toString();
  const url = `https://${process.env.ATLASSIAN_BASE_URL}/wiki/rest/api/${path}${queryStr ? '?' + queryStr : ''}`;

  const auth = Buffer.from(
    `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`
  ).toString('base64');

  const fetchOptions = {
    method: req.method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  };

  if (req.method !== 'GET' && req.method !== 'DELETE' && req.body) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  try {
    const response = await fetch(url, fetchOptions);
    if (req.method === 'DELETE') {
      return res.status(response.status).end();
    }
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
