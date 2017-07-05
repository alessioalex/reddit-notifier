const moment = require('moment');
const tzloc = require('tzloc');

function isItAGoodTime(location, timeStart, timeEnd, cb) {
  tzloc('now', null, location, (err, d) => {
    if (err) { return cb(err); }

    const now = moment(d[0].date);

    const isBetween = now.isAfter(moment(timeStart, 'h:mma')) &&
      now.isBefore(moment(timeEnd, 'h:mma'));

    cb(null, isBetween);
  });
}

module.exports = isItAGoodTime;
