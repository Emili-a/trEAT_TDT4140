import { Recipe, User } from '../models.js'
import express from 'express'
import { getToken, COOKIE_OPTIONS, getRefreshToken, verifyUser } from "../authenticate.js"
import passport from "passport"
import jwt from "jsonwebtoken"

const router = express.Router();

// Get user credentials. 
// Checks validity using verifyUser using JwtStrategy (gets JWT from bearer-token header) 
router.get("/me", verifyUser, async (req, res, next) => {
  const user = await User
    .findOne({ _id: req.user._id })
    .populate('recipes')

  res.send(user)
  console.log(user)
})

router.post("/login", passport.authenticate('local'), (req, res, next) => {
  const token = getToken({ _id: req.user._id })
  const refreshToken = getRefreshToken({ _id: req.user._id })
  User.findById(req.user._id).then(
    user => {
      user.refreshToken.push({ refreshToken })
      user.save((err, user) => {
        if (err) {
          res.statusCode = 500
          res.send(err)
        } else {
          res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
          res.send({ success: true, token })
        }
      })
    }
  )
})

router.post("/signup", (req, res, next) => {
  // Verify that first name is not empty
  if (!req.body.fullName) {
    res.statusCode = 500
    res.send({
      name: "FullNameError",
      message: "Full Name is required",
    })
  } else {
    User.register(
      new User({ username: req.body.username, fullName: req.body.fullName }),
      req.body.password,
      (err, user) => {
        if (err) {
          console.log(err)
          res.statusCode = 500
          res.send(err)
        } else {
          user.fullName = req.body.fullName;
          const token = getToken({ _id: user._id })
          const refreshToken = getRefreshToken({ _id: user._id })
          user.refreshToken.push({ refreshToken })
          user.save((err, user) => {
            if (err) {
              res.statusCode = 500
              res.send(err)
            } else {
              res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
              res.send({ sucess: true, token })
            }
          })
        }
      }
    )
  }
})

// We retrieve the refresh token from the signed cookies.
// We verify the refresh token against the secret used to create the refresh token and extract the payload(which contains the user id) from it.
// Then we find if the refresh token still exists in the database(in case of logout from all devices, 
// all the refresh tokens belonging to the user will be deleted and the user will be forced to log in again).
// If it exists in the database, then we replace it with the newly created refresh token.
// Similar to login & registration steps, here also we will be setting the refresh token in the response cookie and authentication token(JWT) in the response body
router.post("/refreshToken", (req, res, next) => {
  const { signedCookies = {} } = req
  const { refreshToken } = signedCookies
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)
      const userId = payload._id
      User.findOne({ _id: userId }).then(
        user => {
          if (user) {
            // Find the refresh token against the user record in database
            const tokenIndex = user.refreshToken.findIndex(
              item => item.refreshToken === refreshToken
            )
            if (tokenIndex === -1) {
              res.statusCode = 401
              res.send("Unauthorized")
            } else {
              const token = getToken({ _id: userId })
              // If the refresh token exists, then create new one and replace it.
              const newRefreshToken = getRefreshToken({ _id: userId })
              user.refreshToken[tokenIndex] = { refreshToken: newRefreshToken }
              user.save((err, user) => {
                if (err) {
                  res.statusCode = 500
                  res.send(err)
                } else {
                  res.cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS)
                  res.send({ success: true, token })
                }
              })
            }
          } else {
            res.statusCode = 401
            res.send("Unauthorized")
          }
        },
        err => next(err)
      )
    } catch (err) {
      res.statusCode = 401
      res.send("Unauthorized")
    }
  } else {
    res.statusCode = 401
    res.send("Unauthorized")
  }
})

// Extract refreshToken cookie, and delete from database.
router.get("/logout", verifyUser, (req, res, next) => {
  const { signedCookies = {} } = req
  const { refreshToken } = signedCookies
  //console.log("logout request:", req);
  console.log("logging out:");
  console.log("signed cookies: ", signedCookies);
  User.findById(req.user._id).then(
    user => {
      const tokenIndex = user.refreshToken.findIndex(
        item => item.refreshToken === refreshToken
      )
      if (tokenIndex !== -1) {
        user.refreshToken.id(user.refreshToken[tokenIndex]._id).remove()
      }
      user.save((err, user) => {
        if (err) {
          res.statusCode = 500
          res.send(err)
        } else {
          res.clearCookie("refreshToken", COOKIE_OPTIONS)
          res.send({ success: true })
        }
      })
    },
    err => next(err)
  )
})

// TODO : add recipe to user collection

// get list of all users
router.route('/users').get(async (req, res) => {
  User.find().populate("recipes").then(users => {
    res.send(users)
  }).catch(err => {
    res.send("there was an error")
  })
})

// get user
router.route('/user/:id').get(async (req, res) => {
  const { params } = req
  let getRes;

  if (!(req.params.id)) {
    getRes = { error: "Badly formatted ID" };
    res.status(400);
  }

  else if (typeof params.id != "string") {
    getRes = { error: "ID is not of type string" };
    res.status(400);
  }

  else if (req.params.id.length != 24) {
    getRes = { error: "ID is of wrong length" };
    res.status(400);
  }
  else {
    getRes = await User.findOne({ _id: params.id }).populate('recipes')
    if (getRes == null) {
      getRes = { error: "Recipe not found" }
      res.status(204);
    }
    else {
      res.status(200);
    }
  }
  res.send({ data: getRes })
})


export default router;