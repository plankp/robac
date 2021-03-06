/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 Plankp T.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const net = require('net')
const User = require('./user').User

var HOST = '127.0.0.1'
var PORT = 4000

const mainHub = []

/**
 * Removes a user from the `mainHub`.
 *
 * @param sock socket of the user you are deleting
 */
function removeUser (sock) {
  var user
  var friend
  var index
  for (index in mainHub) {
    if (mainHub.hasOwnProperty(index)) {
      user = mainHub[index]
      if (user.matches(sock.remoteAddress, sock.remotePort)) {
        mainHub.splice(index, index + 1)
        console.log('User ' + user.name + ' has left')
        console.log("Unlinking user's friends")
        for (friend of user.friends) {
          friend.write(JSON.stringify({
            msg: 'Your friend ' + user.name + ' has disconnected'
          }))
          friend.removeFriend(user)
        }
        break
      }
    }
  }
}

/**
 * Checks if a user exist based on the user's name
 *
 * @param name The user's name
 */
function doesUserExist (name) {
  return findUserByName(name) !== undefined
}

/**
 * Finds the user using the user's socket data
 *
 * @param sock The user's socket
 */
function findUserBySock (sock) {
  return mainHub.find(e => e.matches(sock.remoteAddress, sock.remotePort))
}

/**
 * Finds the user using the user's name
 *
 * @param sock The user's name
 */
function findUserByName (name) {
  return mainHub.find(e => e.name === name)
}

/**
 * Checks if a username is already used. Adds the user into `mainHub`
 * otherwise. It also registers mob detection and initial gold pieces.
 *
 * @param sock The user's socket
 * @param name The user's name
 */
function validateUser (sock, name) {
  if (doesUserExist(name)) {
    sock.write(JSON.stringify({
      err: 'Choose a new logon name. ' + name + ' is already used.'
    }))
  } else {
    var newUser = new User(name, sock)
    newUser.cash = 150
    mainHub.push(newUser)
    sock.write(JSON.stringify({
      msg: 'Welcome ' + name + '!'
    }))
    newUser.findMobs(function () {
      sock.write(JSON.stringify({
        msg: 'Mob detected...'
      }))
    })
  }
}

/**
 * Direct messages a friend
 *
 * @param user The user performing this ACTION
 * @param friend The friend receiving the msg
 * @param tmsg The message sent
 */
function procDirectMsg (user, friend, tmsg) {
  try {
    user.msgFriend(friend, JSON.stringify({
      msg: '[' + user.name + ']:' + tmsg
    }))
  } catch (e) {
    user.write(JSON.stringify({
      msg: 'Failed to msg friend ' + friend + '. ' + e
    }))
    console.log('ERROR OCCURED: ' + e)
  }
}

/**
 * Adds a friend to the user
 *
 * @param user The user performing this action
 * @param reqFriend The friend being added
 */
function procAddFriend (user, reqFriend) {
  var failedAddCount = 0
  for (var friend of reqFriend) {
    friend = findUserByName(friend)
    if (friend) {
      friend.write(
      JSON.stringify({msg: 'You are now ' + user.name + "'s friend"}))
      friend.addFriend(user)
      user.addFriend(friend)
    } else failedAddCount++
  }
  user.write(JSON.stringify({
    msg: failedAddCount // 0 means false in js
      ? 'Cannot find ' + failedAddCount + ' people / person'
      : 'Done adding friends'
  }))
}

/**
 * Removes a friend from a user's friend list. Note: Does not remove person
 * from friend's friend list
 *
 * @param user The user performing the action
 * @param friends A list of friends being added
 */
function procDelFriend (user, friends) {
  user.removeFriendsByName(friends, function (f) {
    f.write(JSON.stringify({
      msg: 'You have been unfriended by ' + user.name + '. ' +
        user.name + ' can still see your chats however'
    }))
  })
}

/**
 * Sending messages to all friends.
 *
 * @param user The user performing this action
 * @param data The message being transmitted in JSON format. `msg` attribute
 * must be present
 */
function procEcho (user, data) {
  data.msg = user.name + ':' + data.msg
  for (var friend of user.friends) friend.write(JSON.stringify(data))
}

/**
 * Sending standard messages to others meaning they are sent to all friends.
 *
 * @param user The user performing this action
 * @param data The message being transmitted in JSON format. `msg` attribute
 * must be present
 */
function procShout (user, data) {
  data.msg = user.name + ':' + data.msg
  for (var person of mainHub) {
    if (person !== user) person.write(JSON.stringify(data))
  }
}

/**
 * Queries the data for the user
 *
 * @param user The user performing this action
 * @param query The thing user is querying
 */
function procQuery (user, query) {
  query = query.toLowerCase()
  switch (query) {
    case 'friend':
      user.write(JSON.stringify({
        msg: '' + (user.friends.length > 0)
      }))
      break
    case 'friends':
      user.write(JSON.stringify({
        msg: user.listFriends()
      }))
      break
    case 'gp':
    case 'cash':
      user.write(JSON.stringify({
        msg: 'GP: ' + user.cash
      }))
      break
    case 'mob':
      user.write(JSON.stringify({
        msg: '' + (user.mobcounter > 0)
      }))
      break
    case 'mobs':
      user.write(JSON.stringify({
        msg: '' + user.mobcounter
      }))
      break
    case 'hp':
    case 'health':
      user.write(JSON.stringify({
        msg: '' + user.hp
      }))
      break
    case 'stat':
    case 'stats':
      user.write(JSON.stringify({
        msg: user.stats()
      }))
      break
    default:
      break
  }
}

/**
 * Deals with transfering gold pieces. Can only perform give and on friends.
 *
 * @param user The user performing this action
 * @param friend The friend receiving
 * @param amount The amount of gold pieces the user is giving
 */
function procTransfer (user, friend, amount) {
  if (amount < 0) user.write('Transfer failed: Negative transfer amount')
  else if (amount > 0) {
    user.transGp(friend, amount, function (tstat, dest) {
      if (tstat) {
        dest.write(JSON.stringify({
          msg: 'Received ' + amount + (amount === 1 ? ' GP' : 'GPs') +
            ' from ' + user.name
        }))
        user.write(JSON.stringify({msg: 'Transfer completed'}))
      } else {
        if (!isDef(dest)) {
          user.write(JSON.stringify({
            msg: friend + ' is not present in friend list'
          }))
          return
        }
        dest.write(JSON.stringify({
          msg: 'Transfer by ' + user.name + ' has failed'
        }))
        user.write(JSON.stringify({
          msg: 'Transfer failed: Insufficient GP in reserve'
        }))
      }
    })
  }
}

/**
 * Queues action of killing mob. Adds cash and increases difficulty when mob is
 * killed. Difficulty is decreased otherwise.
 *
 * @param user The user killing the mob
 */
function processKillMob (user) {
  user.killMob(function (rst) {
    if (rst) {
      var reward = (user.difficulty | 0) * 10
      user.cash += reward
      user.incrDifficulty()
      user.write(JSON.stringify({
        msg: 'Adding ' + reward + ' GPs for killing mob. Difficulty is now ' +
          (user.difficulty | 0) + '.'
      }))
    } else {
      user.decrDifficulty()
      user.write(JSON.stringify({
        msg: 'You have ' + user.hp + ' hp remaining. Difficulty is now ' +
          (user.difficulty | 0) + '.'
      }))
    }
  })
}

/**
 * Checks if a variable is defined or is null
 *
 * @param v The variable you are testing
 */
function isDef (v) {
  return typeof (v) !== 'undefined' && v !== null
}

net.createServer(function (sock) {
  console.log('Connected: ' + sock.remoteAddress + ':' + sock.remotePort)
  sock.on('data', function (data) {
    data = JSON.parse(data) // All data will be transmitted in JSON format
    if (isDef(data.name)) validateUser(sock, data.name)
    else {
      var user = findUserBySock(sock)
      if (!isDef(user)) {
        sock.write(JSON.stringify({
          err: 'You (somehow) do not exist in the server...'
        }))
        return
      }
      if (isDef(data.friend)) {
        if (isDef(data.msg)) procDirectMsg(user, data.friend, data.msg)
        else if (isDef(data.amount)) procTransfer(user, data.friend, data.amount)
        else procAddFriend(user, data.friend)
      } else if (isDef(data.unfriend)) procDelFriend(user, data.unfriend)
      else if (isDef(data.query)) procQuery(user, data.query)
      else if (isDef(data.kill)) processKillMob(user)
      else if (isDef(data.shout)) procShout(user, data)
      else procEcho(user, data)
    }
  })
  sock.on('close', function (data) {
    removeUser(sock)
    console.log('Close: ' + sock.remoteAddress + ':' + sock.remotePort)
  })
  sock.on('error', function (err) {
    console.log('Error occured: ' + err)
  })
}).listen(PORT, HOST)

console.log('Server listening on ' + HOST + ':' + PORT)
