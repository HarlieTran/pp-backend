const http = require('https');

const postData = JSON.stringify({
  recipeId: 1512345678,
  servingsUsed: 4,
  dryRun: true
});

const req = http.request('https://67c2h49fs7.execute-api.us-east-2.amazonaws.com/recipes/cook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer NO_AUTH_NEEDED_BECAUSE_I_AM_JUST_CHECKING_THE_ERROR'
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk.toString());
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', body));
});

req.on('error', (e) => console.error(e));
req.write(postData);
req.end();
