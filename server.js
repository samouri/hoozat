var express = require('express');
var passport = require('passport');
var util = require('util');
var Twit = require('twit');
var TwitterStrategy = require('passport-twitter').Strategy;
var async = require("async");

var TWITTER_CONSUMER_KEY = "28ppMUIt20JQ2CLVh4btoA";
var TWITTER_CONSUMER_SECRET = "22lbZ0Akhu4DZTA2rpM47uSYZKdlXp6vyRWQlb6k";
var port = Number(process.env.PORT || 5000);

/******************************************************************************
 * passport
 */

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Twitter profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the TwitterStrategy within Passport.
//   Strategies in passport require a `verify` function, which accept
//   credentials (in this case, a token, tokenSecret, and Twitter profile), and
//   invoke a callback with a user object.
passport.use(new TwitterStrategy({
    consumerKey: TWITTER_CONSUMER_KEY,
    consumerSecret: TWITTER_CONSUMER_SECRET,
    callbackURL: "http://127.0.0.1:" + port + "/auth/twitter/callback"
  },
  function(token, tokenSecret, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      // To keep the example simple, the user's Twitter profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Twitter account with a user record in your database,
      // and return that user instead.
      profile.info = {
          consumer_key:         TWITTER_CONSUMER_KEY, 
          consumer_secret:      TWITTER_CONSUMER_SECRET, 
          access_token:         token, 
          access_token_secret:  tokenSecret };
      return done(null, profile);
    });
  }
));

/******************************************************************************
 * app
 */

var app = express(), server = require('http').createServer(app)

// configure Express
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.session({ secret: 'keyboard cat' }));
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.get('/', function(req, res){
    var params = {};
        
    if (!req.user) {
      // Not logged-in. Authenticate based on Twitter account.
        res.render('signin');
    } else {
      // Logged in. Associate Twitter account with user.
        var T = new Twit({
                 consumer_key:         req.user.info.consumer_key, 
                 consumer_secret:      req.user.info.consumer_secret, 
                 access_token:         req.user.info.access_token, 
                 access_token_secret:  req.user.info.access_token_secret}
                 );
        async.series({
            get_friends: function(callback){
                         if(! req.user.friends) {     
                             T.get('friends/ids', { screen_name: req.user.username },  function (err, reply) {
                                 if(err === null) {
                                     req.user.friends = reply;
                                 }
                                 callback(err, req.user.friends);
                             });
                         } else {
                             callback();
                         }
                     },
            pick_the_six_friends: function(callback) {

                         var rand_friend; var six_rand_friends;
                         six_rand_friends = {};
                         while (Object.keys(six_rand_friends).length < 6 && 
                             req.user.friends.ids.length >= Object.keys(six_rand_friends).length) {
                             rand_friend = req.user.friends.ids[Math.floor(Math.random() * req.user.friends.ids.length)];
                             six_rand_friends[rand_friend] = true;
                         }

                         params.chosen = rand_friend;
                         params.six_rand_friends = Object.keys(six_rand_friends);
                         params.friend_ids = req.user.friends.ids;
                         callback(null, params.six_rand_friends);
                     },
            friends_data: function(callback){
                                  T.get('users/lookup', { user_id: params.six_rand_friends }, function (err, reply) {
                                      if(err === null) {
                                          params.friends_data = reply;
                                          for(var i in reply) {
                                              reply[i].photo = reply[i].profile_image_url.replace("_normal","_bigger");
                                          }
                                      }
                                      callback(err, reply);
                                  });
                              },
            tweets: function(callback){
                            T.get('statuses/user_timeline', { user_id: params.chosen, count: 200, exclude_replies: true, include_rts: false },  function (err, reply) {
                                if(err === null) {
                                    var rand_tweet = reply[Math.floor(Math.random() * reply.length)];
                                    params.tweet = rand_tweet;
                                    console.log( typeof(params.tweet)==='undefined' );
                                    if( typeof(params.tweet) === 'undefined') { params.tweet = {text: '', user: params.chosen}}
                                    params.tweeter = params.tweet.user;
                                }
                                callback(err, reply);
                            });
                        }
        },
        function(err, results) {
            if(err != null) { console.log(err); }
            params.asyncResults = results;
            params.user = req.user;
            res.render('index', params);
        }); 
    }
});

app.get('/account', ensureAuthenticated, function(req, res){
  res.render('account', { user: req.user });
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});

// GET /auth/twitter
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Twitter authentication will involve redirecting
//   the user to twitter.com.  After authorization, the Twitter will redirect
//   the user back to this application at /auth/twitter/callback
app.get('/auth/twitter', passport.authenticate('twitter'));

// GET /auth/twitter/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/twitter/callback', 
  passport.authenticate('twitter', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.listen(port);

/******************************************************************************
 * middleware
 */

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}
