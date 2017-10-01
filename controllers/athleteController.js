var async = require('async');

var Weight = require('../models/weight');
var Athlete = require('../models/athlete');
var Org = require('../models/org')

// Display list of all Athletes
exports.athlete_list = function (req, res) {
    Athlete.find()
        .sort([['lname', 'ascending']])
        .exec(function (err, list_athletes) {
            if (err) { return next(err); }
            //Successful, so render
            res.render('dashboard/athlete_list', { title: 'Athlete List', athlete_list: list_athletes });
        })
};

// Display detail page for a specific athlete on GET
exports.athlete_detail = function (req, res) {

    // 1.) Simultaniously look for athlete and weight information
    async.parallel({
        athlete: function (callback) {
            Athlete.findById(req.params.id)
                .exec(callback)
        },
        athletes_weights: function (callback) {
            Weight.find({ 'athlete': req.params.id }, 'weight type')
                .exec(callback)
        },
    }, function (err, results) {
        if (err) return handleError(err);
        //Successful - 3.) Find the name of the orginization the athlete is associated with
        Org.findById(results.athlete.org, 'name', function (err, org) {
            if (err) return handleError(err);
            //Success
            res.render('dashboard/athlete_detail', {
                athlete: results.athlete,
                athlete_weights: results.athletes_weights,
                org: org.name
            });
        })
    });
};

// Display athlete create form on GET
exports.athlete_create_get = function (req, res) {
    res.send('NOT IMPLEMENTED: athlete create GET');
};

// Handle athlete create on POST
exports.athlete_create_post = function (req, res) {
    // Grab first and last name from body of client browser
    req.checkBody('firstName', 'First name must be specified.').notEmpty(); //We won't force Alphanumeric, because people might have spaces.
    req.checkBody('lastName', 'Last name must be specified.').notEmpty();

    req.sanitize('firstName').escape();
    req.sanitize('lastName').escape();
    req.sanitize('firstName').trim();
    req.sanitize('lastName').trim();
    req.sanitize('bday').toDate();

    // 1) Get current user id
    var currentUser = res.locals.user._id;

    // 2) Find school related to current admin
    Org.findOne({ 'admin': currentUser }, '_id', function (err, adminOrg) {
        if (err) return handleError(err);
        // Create athlete model with current user's org._id
        var athlete = new Athlete(
            {
                fname: req.body.firstName,
                lname: req.body.lastName,
                bday: req.body.bday,
                org: adminOrg
            });

        athlete.save(function (err) {
            if (err) return handleError(err);

            //success
            req.flash('success_msg', 'You have registered a new athlete');
            res.redirect(athlete.url + '/update');
        });
    });
};

// Handle athlete delete on POST
exports.athlete_delete_post = function (req, res) {
    req.checkBody('athleteid', 'Athlete id must exist').notEmpty();

    async.parallel({
        athlete: function (callback) {
            Athlete.findById(req.body.athleteid).exec(callback)
        },
        athlete_weights: function (callback) {
            Weight.find({ 'athlete': req.body.athleteid }).exec(callback)
        },
    }, function (err, results) {
        if (err) { return next(err); }
        //Success
        // Impletent below in order to delete all associated weight records when an athlete is deleted
        // if (results.athlete_weights.length > 0) {
        //     //Author has books. Render in same way as for GET route.
        //     res.render('author_delete', { title: 'Delete Author', author: results.author, author_books: results.athlete_weights } );
        //     return;
        // }
        //else {
        //Author has no books. Delete object and redirect to the list of authors.
        Athlete.findByIdAndRemove(req.body.athleteid, function deleteAthlete(err) {
            if (err) { return next(err); }
            //Success - got to author list
            res.redirect('/dashboard/athletes')
        })

        //}
    });
};

// Display athlete update form on GET
exports.athlete_update_get = function (req, res) {

    req.sanitize('id').escape();
    req.sanitize('id').trim();
    Athlete.findById(req.params.id, function (err, athlete) {
        if (err) { return next(err); }
        //On success
        res.render('dashboard/athlete_form', {
            title: 'Update Athlete',
            athlete: athlete,
            genders: Athlete.schema.path('gender').enumValues
        });
    });
};

// Handle athlete update on POST
exports.athlete_update_post = function (req, res) {

    req.sanitize('id').escape();
    req.sanitize('id').trim();

    req.checkBody('fname', 'First name must be specified.').notEmpty();
    req.checkBody('lname', 'Last name must be specified.').notEmpty();
    req.checkBody('lname', 'Last name must be alphanumeric text.').isAlpha();
    req.sanitize('fname').escape();
    req.sanitize('lname').escape();
    req.sanitize('fname').trim();
    req.sanitize('lname').trim();
    req.sanitize('sport').trim();
    req.sanitize('bodyfat').trim();
    req.sanitize('passcode').trim();
    req.sanitize('bday').toDate();

    //Capitilize first letter of sport entry
    sportCAP = req.body.sport.charAt(0).toUpperCase() + req.body.sport.slice(1);


    //Run the validators
    var valErrors = req.validationErrors();
    //Create a author object with escaped and trimmed data (and the old id!)
    var athlete = new Athlete(
        {
            fname: req.body.fname,
            lname: req.body.lname,
            bday: req.body.bday,
            gender: req.body.gender,
            sport: sportCAP,
            passcode: req.body.passcode,
            gradyr: req.body.gradyr,
            highrisk: req.body.highrisk || false,
            showweight: req.body.showweight || false,
            bodyfat: req.body.bodyfat,
            _id: req.params.id
        }
    );
    if (valErrors) {
        //If there are errors render the form again, passing the previously entered values and errors
        res.render('athlete_form', { title: 'Error Updating Athlete', athlete: athlete, valErrors: valErrors });
        return;
    }
    else {
        // Data from form is valid. Update the record.
        Athlete.findByIdAndUpdate(req.params.id, athlete, {}, function (err, theathlete) {
            if (err) { return next(err); }
            //successful - redirect to genre detail page.
            res.redirect(theathlete.url);
        });
    }
};

// Display history page for a specific athlete on GET
exports.athlete_history = function (req, res) {
    var isValid = false;
    var User = this;
    var errorObject;

    var athleteQuery = Athlete.findById(req.params.id, 'name gender gradyr bday_mm_dd_yyyy sport url _id');

    var weightQuery = Weight.find({ 'athlete': req.params.id }, 'type date time_hh_mm_a weight bodyFat');

    var promise1 = athleteQuery.exec();
    var promise2 = weightQuery.exec();

    assert.ok(promise1 instanceof require('mpromise'));
    assert.ok(promise2 instanceof require('mpromise'));

    promise1.then(function (athleteQuery) {
        promise2.then(function (weightQuery) {
            //Successful, so render
            console.log(weightQuery);
            console.log(athleteQuery);
            res.render('dashboard/athlete_history', {
                athlete: athlete,
                athlete_weights: weights
            });
        });
    });
};
