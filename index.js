const assert = require('assert');
const util = require('util');
const Snoocore = require('snoocore');
const push = require('pushover-notifications');

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

const reddit = new Snoocore({
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
});

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

  Pushover.send(msg, function(err, result) {
    if (err) {
      console.error('Pushover failure');
      throw err;
    }

    // console.log(result);
  });

  // dump(data);
};

const boot = (user) => {
  let oldData = [];
  let currentData = [];

  const check = () => {
    console.log('checking..');
    reddit(`/user/${user}.json`)
      .get({
        limit: 5
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
  };

  check();
};

boot(USER);
