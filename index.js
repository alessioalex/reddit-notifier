const assert = require('assert');
const util = require('util');
const Snoocore = require('snoocore');
const push = require('pushover-notifications');
const express = require('express');
const auth = require('basic-auth');
const debug = require('debug')('reddit-notifier');
let isItAGoodTime = require('./is-between');

// env var example: NOTIFIER_PERIOD="New York, 8:02AM-5PM"
const period = process.env.NOTIFIER_PERIOD;
const [location, time] = period ? period.split(',').map(d => d.trim()) : [null, null];
const [timeStart, timeEnd] = time ? time.split('-') : [null, null];

if (location && timeStart && timeEnd) {
  isItAGoodTime = isItAGoodTime.bind(null, location, timeStart, timeEnd);
} else {
  isItAGoodTime = function noop(cb) { return setImmediate(() => cb(null, true)); };
  console.warn('Not time interval specified, checks will run all 24/7.');
}

// interval to check for new data (in seconds)
let TIMEOUT = process.env.TIMEOUT ? parseInt(process.env.TIMEOUT, 10) : 80;
TIMEOUT = TIMEOUT * 1000;
const USER = process.env.USER_TO_CHECK;
const PUSHOVER_USER = process.env['PUSHOVER_USER'];
const PUSHOVER_TOKEN = process.env['PUSHOVER_TOKEN'];

assert.ok(USER, 'Reddit user to stalk needed!');
console.log('Timeout: %s, User: %s', TIMEOUT, USER);

const Pushover = new push({
  user: PUSHOVER_USER,
  token: PUSHOVER_TOKEN,
  onerror: function(error) { throw err; }
});


const dump = function() {
  console.log(util.inspect(arguments, { depth: null }));
}

const redditApiOpts = {
  // Unique string identifying the app
  userAgent: 'nodeapp rnotifier@1.0.0',
  // It's possible to adjust throttle less than 1 request per second.
  // Snoocore will honor rate limits if reached.
  throttle: 300,
  oauth: {
    type: 'script',
    key: process.env.REDDIT_KEY,
    secret: process.env.REDDIT_SECRET,
    username: process.env.REDDIT_USER,
    password: new Buffer(process.env.REDDIT_PASS, 'base64').toString('utf8'),
    redirectUri: 'http://localhost:3000',
    // scope: [ 'identity', 'read', 'vote' ]
    // TODO: check what scopes we actually need
    scope: "identity,history,mysubreddits,privatemessages,read,report,save,submit,subscribe,vote,creddits".split(',')
  }
};

debug('reddit api opts', redditApiOpts);
const reddit = new Snoocore(redditApiOpts);

const diffByOrder = (oldArray, newArray) => {
  const oa = oldArray.map(i => i.id);
  const na = newArray.map(i => i.id);

  let lastKnownItemIndex = na.findIndex(item => oa.includes(item));
  lastKnownItemIndex = lastKnownItemIndex === -1 ? 0 : lastKnownItemIndex;

  return newArray.slice(0, lastKnownItemIndex);
};

const notify = (data) => {
  const text = `User ${USER} has ${data.length} new posts/comments on Reddit`;

  const msg = {
    // These values correspond to the parameters detailed on https://pushover.net/api
    // 'message' is required. All other values are optional.
    message: text, // required
    title: 'Reddit Notifier',
    // sound: 'magic',
    // device: 'devicename',
    // priority: 1
  };

  console.log('Sending notification: %s', text);

  Pushover.send(msg, function(err, result) {
    if (err) {
      console.error('Pushover failure');
      throw err;
    }

    // console.log(result);
  });

  // dump(data);
};

let latestRedditData = [];

const boot = (user) => {
  let oldData = [];
  let currentData = [];

  const check = () => {
    isItAGoodTime((err, wellIsIt) => {
      if (err) { throw err; }

      if (wellIsIt) {
        console.log('checking..');

        reddit(`/user/${user}.json`)
          .get({
            limit: 15
          })
          // .then(data => dump(data))
          // t3 - reddit.com/${permalink}, title, selftext
          // t1 - link_permalink/${id}, body
          .then(d => {
            // dump(d.data.children.map(item => {
            // }));
            oldData = currentData;

            currentData = d.data.children.map(item => {
              const data = item.data;
              const kind = item.kind;

              if (kind === 't3') {
                return {
                  id: data.id,
                  title: data.title,
                  body: data.selftext,
                  link: `https://www.reddit.com${data.permalink}`
                };
              } else if (kind === 't1') {
                return {
                  id: data.id,
                  body: data.body,
                  link: `${data.link_permalink}${data.id}`
                }
              }
            });

            latestRedditData = currentData;

            // dump(oldData, currentData);

            if (oldData.length && currentData.length && !(oldData[0].id === currentData[0].id)) {
              notify(diffByOrder(oldData, currentData));
            }

            setTimeout(check, TIMEOUT);
          })
          .catch(err => {
            console.error('Error making the reddit request');
            throw err;
          });
      } else {
        setTimeout(check, TIMEOUT);
      }
    });

  };

  check();
};

boot(USER);

const app = express();

app.get('/', (req, res) => {
  const credentials = auth(req);

  if (!credentials || credentials.name !== process.env.HTTP_USER || credentials.pass !== process.env.HTTP_PASS) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="example"');
    res.end('Access denied');
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<h3>${USER}</h3>` + latestRedditData.map(d => `
      <p><a href="${d.link}">${d.body}</a></p>
    `).join('') + '</p>');
    // res.end(JSON.stringify(latestRedditData, null, 2));
  }
});

app.listen(process.env.PORT || 9999);
console.log('Web app port: %s', process.env.PORT || 9999);
