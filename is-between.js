// NOTIFIER_PERIOD="Los Angeles, 8:10AM-5PM" node is-between.js
const moment = require('moment');
const tzloc = require('tzloc');
const period = process.env.NOTIFIER_PERIOD;

// const [location, time] = period.split(',').map(d => d.trim());
// const [timeStart, timeEnd] = time.split('-');

module.exports = function isGoodTime(location, timeStart, timeEnd) {
  tzloc('now', null, location, (err, d) => {
    if (err) { return cb(err); }

    const now = moment(d[0].date);

    const isBetween = now.isAfter(moment(timeStart, 'h:mma')) &&
      now.isBefore(moment(timeEnd, 'h:mma'));

    cb(null, isBetween);
  });
}
