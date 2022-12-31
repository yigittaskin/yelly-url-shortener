const express = require('express');
const router = express.Router();
const user = require('../model/user');
const urls = require('../model/url');
const bcryptjs = require('bcryptjs');
const passport = require('passport');
require('./passportLocal')(passport);
require('./googleAuth')(passport);
const userRoutes = require('./accountRoutes');
const shortid = require('shortid');
const alert = require('alert-node')

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) {
        res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, post-check=0, pre-check=0');
        next();
    } else {
        req.flash('error_messages', "Please Login to continue !");
        res.redirect('/login');
    }
}

router.get('/login', (req, res) => {
    res.render("login", { csrfToken: req.csrfToken() });
});

router.get('/signup', (req, res) => {
    res.render("signup", { csrfToken: req.csrfToken() });
});

router.post('/signup', (req, res) => {
    // get all the values 
    const { email, password, confirmpassword } = req.body;
    // check if the are empty 
    if (!email || !password || !confirmpassword) {
        res.render("signup", { err: "All Fields Required !", csrfToken: req.csrfToken() });
    } else if (password != confirmpassword) {
        res.render("signup", { err: "Password Don't Match !", csrfToken: req.csrfToken() });
    } else {
        // validate email and username and password 
        // skipping validation
        // check if a user exists
        user.findOne({ email: email }, function (err, data) {
            if (err) throw err;
            if (data) {
                res.render("signup", { err: "User Exists, Try Logging In !", csrfToken: req.csrfToken() });
            } else {
                // generate a salt
                bcryptjs.genSalt(12, (err, salt) => {
                    if (err) throw err;
                    // hash the password
                    bcryptjs.hash(password, salt, (err, hash) => {
                        if (err) throw err;
                        // save user in db
                        user({
                            email: email,
                            password: hash,
                            googleId: null,
                            provider: 'email',
                        }).save((err, data) => {
                            if (err) throw err;
                            // login the user
                            // use req.login
                            // redirect , if you don't want to login
                            res.redirect('/login');
                        });
                    })
                });
            }
        });
    }
});

router.post('/login', (req, res, next) => {
    if (req.body.email == 'admin@gmail.com') {
        passport.authenticate('local', {
            failureRedirect: '/login',
            successRedirect: '/admin',
            failureFlash: true,
        })(req, res, next);
    }
    else {
        passport.authenticate('local', {
            failureRedirect: '/login',
            successRedirect: '/dashboard',
            failureFlash: true,
        })(req, res, next);
    }
});

router.get('/logout', (req, res) => {
    req.logout(function (err) {
        if (err) { return next(err); }
        req.session.destroy();
        res.redirect('/');
    });
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email',] }));

router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    res.redirect('/dashboard');
});

router.get('/dashboard', checkAuth, (req, res) => {

    urls.find({ owned: req.user.email }, (err, data) => {
        if (err) throw err;
        var visits = 0
        for (let i = 0; i < data.length; i++) {
            visits += data[i].visits
            var date = new Date();
            var checkDate = date - data[i].created;
            const day60 = 5184000000; //30 gün = 2592000000 milisaniye - 1 dakika 60000 milisaniye
            if (checkDate > day60) {
                console.log(data[i].id)
                urls.find({ _id: data[i].id }, (err, data) => {
                    urls.deleteOne({ _id: data[i].id }).then(() => {
                        console.log('Silindi')
                    })
                });
            }
        }
        res.render('dashboard', { verified: req.user.isVerified, logged: true, csrfToken: req.csrfToken(), urls: data, username: req.user.email, totalVisits: visits, totalLinks: data.length });
    }).sort({ $natural: -1 });
});

router.get('/admin', checkAuth, (req, res) => {
    user.find((err, veri) => {
        urls.find((err, data) => {
            var visits = 0
            if (err) throw err;
            for (let i = 0; i < data.length; i++) {
                visits += data[i].visits
            }
            res.render('admin', { verified: req.user.isVerified, logged: true, csrfToken: req.csrfToken(), urls: data.sort((a, b) => b.visits - a.visits), user: veri, username: req.user.email, totalUser: veri.length, totalVisits: visits, totalLinks: data.length });
        })
    });
});

router.get('/urls/api', (req, res) => {
    urls.find().then((data) => {
        res.json(data);
    })
});

router.get('/users/api', (req, res) => {
    user.find().then((data) => {
        res.json(data);
    })
});

router.post('/create', checkAuth, (req, res) => {
    const { original, short } = req.body;
    urls.find((error, veri) => {
        var checkSlug = true;
        for (let i = 0; i < veri.length; i++) {
            if (short == veri[i].slug) {
                checkSlug = false;
            }
        }
        if (!short) {
            urls.findOne({ slug: short }, (err, data) => {
                urls({
                    originalUrl: original,
                    slug: shortid.generate(),
                    owned: req.user.email,
                }).save((err) => {
                    res.redirect('/dashboard');
                });
            })
        }
        else if (!checkSlug || short == 'dashboard' || short == 'login' || short == 'signup' || short == 'admin' || short == 'create' || short == 'edit' || short == 'logout') {
            alert('The Short Url You Entered Has Already Been Used. Try Different Short Url, This exists.');
            res.redirect('/dashboard');
        }
        else {
            urls.findOne({ slug: short }, (err, data) => {
                if (err) throw err;
                if (data) {
                    res.render('dashboard', { verified: req.user.isVerified, logged: true, csrfToken: req.csrfToken(), err: "Try Different Short Url, This exists !" });
                } else {
                    urls({
                        originalUrl: original,
                        slug: short,
                        owned: req.user.email,
                    }).save((err) => {
                        res.redirect('/dashboard');
                    });
                }
            })
        }
    })
});

router.use(userRoutes);

router.get('/:slug?', async (req, res) => {

    if (req.params.slug != undefined) {
        var data = await urls.findOne({ slug: req.params.slug });
        if (data) {
            data.visits = data.visits + 1;

            await data.save();

            res.redirect(data.originalUrl);
        } else {
            if (req.isAuthenticated()) {
                res.render("index", { logged: true, err: true });
            } else {
                res.render("index", { logged: false, err: true });
            }
        }
    } else {
        if (req.isAuthenticated()) {
            res.render("index", { logged: true });
        } else {
            res.render("index", { logged: false });
        }
    }
});

router.post('/dashboard/:id?', (req, res) => {
    urls.find({ _id: req.params.id }, (err, data) => {
        urls.deleteOne({ _id: req.params.id }).then(() => {
            res.redirect('/dashboard');
        })
    });
})

router.post('/admin/:id?', (req, res) => {
    urls.find({ _id: req.params.id }, (err, data) => {
        urls.deleteOne({ _id: req.params.id }).then(() => {
            res.redirect('/admin');
        })
    });
})

router.post('/edit', checkAuth, function (req, res, next) {
    bcryptjs.genSalt(12, (err, salt) => {
        if (err) throw err;
        bcryptjs.hash(req.body.password, salt, (err, hash) => {
            user.findByIdAndUpdate(req.user.id, { email: req.body.email, password: hash },
                function (err, docs) {
                    if (err) {
                        console.log(err)
                    }
                    else {
                        res.redirect('/dashboard');
                    }
                });
        });
    });
});


module.exports = router;