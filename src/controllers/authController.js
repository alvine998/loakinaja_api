const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("node:crypto");
const { Op } = require("sequelize");
const { env } = require("../config/env");
const { User } = require("../models");

function publicUser(user) {
  const {
    id,
    name,
    email,
    phone,
    tokens,
    referralCode,
    referredBy,
    createdAt,
  } = user;
  return {
    id,
    name,
    email,
    phone,
    tokens,
    referralCode,
    referredBy,
    createdAt,
  };
}

function createToken(user) {
  return jwt.sign({}, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresIn,
  });
}

function safeNextPath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/";
}

function redirectToLoginError(res) {
  return res.redirect(`${env.webOrigin}/login?error=google_auth_failed`);
}

function getCookie(req, name) {
  const cookie = req.headers.cookie?.split(";").find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : undefined;
}

function googleStart(req, res) {
  if (!env.google.clientId || !env.google.clientSecret) {
    return redirectToLoginError(res);
  }

  const state = `${randomBytes(24).toString("hex")}.${Buffer.from(safeNextPath(req.query.next || "/")).toString("base64url")}`;
  res.cookie("google_oauth_state", state, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/api/auth/google",
  });
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: `${env.apiPublicUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return res.redirect(authorizationUrl.toString());
}

async function googleCallback(req, res, next) {
  const stateCookie = getCookie(req, "google_oauth_state");
  res.clearCookie("google_oauth_state", { path: "/api/auth/google" });
  if (req.query.error || !req.query.code || !req.query.state || req.query.state !== stateCookie) {
    return redirectToLoginError(res);
  }

  try {
    const [stateNonce, encodedNext] = String(req.query.state).split(".");
    if (!stateNonce || !encodedNext) return redirectToLoginError(res);
    const nextPath = safeNextPath(Buffer.from(encodedNext, "base64url").toString());

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        redirect_uri: `${env.apiPublicUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return redirectToLoginError(res);
    const tokens = await tokenResponse.json();
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) return redirectToLoginError(res);
    const profile = await profileResponse.json();
    if (!profile.email || profile.verified_email !== true) return redirectToLoginError(res);

    const email = profile.email.trim().toLowerCase();
    let user = await User.findOne({ where: { email } });
    if (!user) {
      try {
        user = await User.create({
          name: (profile.name || email.split("@")[0]).slice(0, 120),
          email,
          phone: "",
          passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
          referralCode: `LOAK${randomBytes(4).toString("hex").toUpperCase()}`,
          isGoogleLogin: true,
        });
      } catch (error) {
        if (error.name !== "SequelizeUniqueConstraintError") throw error;
        user = await User.findOne({ where: { email } });
      }
    }
    if (!user) return redirectToLoginError(res);
    if (!user.isGoogleLogin) {
      await user.update({ isGoogleLogin: true });
    }

    return res.redirect(`${env.webOrigin}/login#google_token=${encodeURIComponent(createToken(user))}&next=${encodeURIComponent(nextPath)}`);
  } catch (error) {
    return next(error);
  }
}

async function register(req, res, next) {
  try {
    const { name, email, phone, password, referralCode } = req.body || {};
    if (
      ![name, email, phone, password].every(
        (value) => typeof value === "string" && value.trim(),
      )
    ) {
      return res
        .status(400)
        .json({ error: "name, email, phone, and password are required" });
    }
    if (password.length < 8)
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Enter a valid email address" });

    const normalizedEmail = email.trim().toLowerCase();
    if (await User.unscoped().findOne({ where: { email: normalizedEmail } })) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    let referredBy = null;
    if (referralCode?.trim()) {
      const referrer = await User.findOne({
        where: { referralCode: referralCode.trim().toUpperCase() },
      });
      if (!referrer)
        return res.status(400).json({ error: "Referral code not found" });
      referredBy = referrer.id;
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      passwordHash: await bcrypt.hash(password, 12),
      referralCode: `LOAK${randomBytes(4).toString("hex").toUpperCase()}`,
      referredBy,
    });
    return res
      .status(201)
      .json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const identifier =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!identifier || !password)
      return res
        .status(400)
        .json({ error: "email or phone and password are required" });

    const user = await User.scope("withPassword").findOne({
      where: {
        [Op.or]: [{ email: identifier.toLowerCase() }, { phone: identifier }],
      },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    return res.json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    return next(error);
  }
}

function getCurrentUser(req, res) {
  return res.json({ user: publicUser(req.user) });
}

async function updateCurrentUser(req, res, next) {
  try {
    const { name, email, phone } = req.body || {};
    if (
      ![name, email, phone].every(
        (value) => typeof value === "string" && value.trim(),
      )
    ) {
      return res
        .status(400)
        .json({ error: "name, email, and phone are required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    await req.user.update({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
    });
    return res.json({ user: publicUser(req.user) });
  } catch (error) {
    return next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < 8)
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });

    const user = await User.scope("withPassword").findByPk(req.user.id);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    await user.update({ passwordHash: await bcrypt.hash(newPassword, 12) });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

async function getReferralCount(req, res, next) {
  try {
    const count = await User.count({ where: { referredBy: req.user.id } });
    return res.json({ count });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  googleStart,
  googleCallback,
  register,
  login,
  getCurrentUser,
  updateCurrentUser,
  changePassword,
  getReferralCount,
};
