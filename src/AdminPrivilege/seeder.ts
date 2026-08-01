import asyncHandler from "express-async-handler";
import User from "../model/User.js";

/**
 * @desc    Seed the Super-Admin user (dev only, see routes/auth.ts). No
 *          password/email — the Super-Admin authenticates via the same
 *          phone-OTP flow as Providers. The seeded doc has no `firebaseUid`
 *          until they complete a real OTP login, at which point `login` in
 *          authController.ts binds it (first-touch binding) — so re-running
 *          this seed never clobbers an already-claimed account.
 * @route   POST /api/auth/seed
 * @access  Public in development only (see routes/auth.ts)
 */
const seedAdmin = asyncHandler(async (req, res) => {
  const phone = process.env.SUPER_ADMIN_PHONE;
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";

  if (!phone) {
    res.status(500);
    throw new Error("SUPER_ADMIN_PHONE is not configured");
  }

  try {
    const existingAdmin = await User.findOne({ role: "Super-Admin" });

    if (!existingAdmin) {
      const admin = await User.create({
        name,
        phone,
        role: "Super-Admin",
      });

      res.status(201).json({
        success: true,
        message: "Super-Admin user created successfully",
        data: { name: admin.name, phone: admin.phone, role: admin.role },
      });
    } else {
      // Deliberately does NOT touch `phone`: if it's already bound to a
      // firebaseUid (the admin has logged in before), changing it here would
      // orphan that binding and lock them out on their next login.
      existingAdmin.name = name;
      existingAdmin.isDisabled = false;
      await existingAdmin.save();

      res.status(200).json({
        success: true,
        message: "Super-Admin user updated",
        data: {
          name: existingAdmin.name,
          phone: existingAdmin.phone,
          role: existingAdmin.role,
        },
      });
    }
  } catch (error) {
    res.status(500);
    throw new Error(
      `Error seeding admin: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
});

export default seedAdmin;
