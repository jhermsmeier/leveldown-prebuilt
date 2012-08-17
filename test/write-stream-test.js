/* Copyright (c) 2012 Rod Vagg <@rvagg> */

/*global commonSetUp:true, commonTearDown:true*/

var buster  = require('buster')
  , assert  = buster.assert
  , levelup = require('../lib/levelup.js')
  , errors  = require('../lib/errors.js')
  , rimraf  = require('rimraf')
  , async   = require('async')
  , fs      = require('fs')
  , path    = require('path')

buster.testCase('WriteStream', {
    'setUp': function () {
      commonSetUp.call(this)

      this.timeout = 1000

      this.sourceData = []

      for (var i = 0; i < 10; i++) {
        this.sourceData.push({
            type  : 'put'
          , key   : i
          , value : Math.random()
        })
      }

      this.verify = function (ws, db, done) {
        assert.isFalse(ws.writable)
        assert.isFalse(ws.readable)
        async.forEach(
            this.sourceData
          , function (data, callback) {
              db.get(data.key, function (err, value) {
                refute(err)
                assert.equals(value, data.value, 'WriteStream data #' + data.key + ' has correct value')
                callback()
              })
            }
          , done
        )
      }
    }

  , 'tearDown': commonTearDown

  //TODO: test various encodings

  , 'test simple WriteStream': function (done) {
      this.openTestDatabase(function (db) {
        var ws = db.writeStream()
        ws.on('error', function (err) {
          refute(err)
        })
        ws.on('close', this.verify.bind(this, ws, db, done))
        this.sourceData.forEach(function (d) {
          ws.write(d)
        })
        ws.once('ready', ws.end) // end after it's ready, nextTick makes this work OK
      }.bind(this))
    }

  , 'test WriteStream with async writes': function (done) {
      this.openTestDatabase(function (db) {
        var ws = db.writeStream()

        ws.on('error', function (err) {
          refute(err)
        })
        ws.on('close', this.verify.bind(this, ws, db, done))
        async.forEachSeries(
            this.sourceData
          , function (d, callback) {
              // some should batch() and some should put()
              if (d.key % 3) {
                setTimeout(function () {
                  ws.write(d)
                  callback()
                }, 10)
              } else {
                ws.write(d)
                callback()
              }
            }
          , function () {
              ws.end()
            }
        )
      }.bind(this))
    }

  , 'test delayed open with maxBufferLength': function (done) {
      var location = path.join(__dirname, 'levelup_test_db_delayed_open')
      this.cleanupDirs.push(location)
      var db = levelup.createDatabase(
              location
            , { createIfMissing: true, errorIfExists: false }
          )
        , ws = db.writeStream({ maxBufferLength: 1 })

      this.closeableDatabases.push(db)
      // should be able to push first element in just fine
      assert.isTrue(ws.write(this.sourceData[0]))
      // second element should warn that the buffer isn't being cleared
      assert.isFalse(ws.write(this.sourceData[1]))

      ws.once('close', this.verify.bind(this, ws, db, done))
      ws.once('drain', function () {
        this.sourceData.slice(2).forEach(function (d, i) {
          assert[i !== 0 ? 'isFalse' : 'isTrue'](ws.write(d), 'correct return value for element #' + i)
        })
        assert.isTrue(ws.writable)
        assert.isFalse(ws.readable)
        ws.end()
      }.bind(this))

      db.open(function (err) {
        // should lead to a 'drain' event
        refute(err)
      })
    }

    // at the moment, destroySoon() is basically just end()
  , 'test destroySoon()': function (done) {
      this.openTestDatabase(function (db) {
        var ws = db.writeStream()
        ws.on('error', function (err) {
          refute(err)
        })
        ws.on('close', this.verify.bind(this, ws, db, done))
        this.sourceData.forEach(function (d) {
          ws.write(d)
        })
        ws.once('ready', ws.destroySoon) // end after it's ready, nextTick makes this work OK
      }.bind(this))
    }

  , 'test destroy()': function (done) {
      var verify = function (ws, db) {
        assert.isFalse(ws.writable)
        async.forEach(
            this.sourceData
          , function (data, callback) {
              db.get(data.key, function (err, value) {
                // none of them should exist
                assert(err)
                refute(value)
                callback()
              })
            }
          , done
        )
      }

      this.openTestDatabase(function (db) {
        var ws = db.writeStream()
        ws.on('error', function (err) {
          refute(err)
        })
        assert.isTrue(ws.writable)
        assert.isFalse(ws.readable)
        ws.on('close', verify.bind(this, ws, db))
        this.sourceData.forEach(function (d) {
          ws.write(d)
          assert.isTrue(ws.writable)
          assert.isFalse(ws.readable)
        })
        assert.isTrue(ws.writable)
        assert.isFalse(ws.readable)
        ws.once('ready', ws.destroy)
      }.bind(this))
    }
})