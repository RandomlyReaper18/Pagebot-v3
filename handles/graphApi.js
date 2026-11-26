const GRAPH_API_VERSION = 'v27.0';

function graphApiUrl(endpoint) {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${endpoint}`;
}

module.exports = { graphApiUrl };
