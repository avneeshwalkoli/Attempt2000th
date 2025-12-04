const Device = require('../models/Device');
const User = require('../models/User');

const ensureOwnership = (device, userId) => {
  if (!device) {
    return { error: { status: 404, message: 'Device not found' } };
  }
  if (String(device.userId) !== String(userId)) {
    return { error: { status: 403, message: 'Not authorized to manage this device' } };
  }
  return {};
};

/**
 * POST /api/device/register
 * Registers or updates a DeskLink device for the authenticated user.
 */
const registerDevice = async (req, res) => {
  const { userId, deviceId, osInfo, deviceName, platform } = req.body;

  if (!userId || !deviceId || !osInfo || !deviceName) {
    return res.status(400).json({ message: 'userId, deviceId, osInfo, and deviceName are required' });
  }

  if (String(req.user._id) !== String(userId)) {
    return res.status(403).json({ message: 'Forbidden: mismatched user context' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let device = await Device.findOne({ deviceId });

    if (device) {
      if (device.blocked) {
        return res.status(423).json({ message: 'Device is blocked. Contact support.' });
      }
      device.userId = userId;
      device.deviceName = deviceName;
      device.osInfo = osInfo;
      device.lastOnline = new Date();
      device.deleted = false;
      device.deletedAt = null;
      if (platform) device.platform = platform;
      await device.save();
    } else {
      device = await Device.create({
        deviceId,
        userId,
        deviceName,
        osInfo,
        platform: platform || '',
        lastOnline: new Date(),
      });
    }

    if (!user.devices.includes(deviceId)) {
      user.devices.push(deviceId);
      await user.save();
    }

    res.status(200).json({
      device: {
        id: device._id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        osInfo: device.osInfo,
        lastOnline: device.lastOnline,
        blocked: device.blocked,
        deleted: device.deleted,
      },
    });
  } catch (error) {
    console.error('[device/register] error', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /api/device/:deviceId/block
 * Toggle block state for a device.
 */
const setDeviceBlock = async (req, res) => {
  const deviceId = req.params.deviceId || req.body.deviceId;
  const { blocked } = req.body;

  if (!deviceId) {
    return res.status(400).json({ message: 'deviceId is required' });
  }
  if (typeof blocked !== 'boolean') {
    return res.status(400).json({ message: 'blocked flag must be boolean' });
  }

  try {
    const device = await Device.findOne({ deviceId });
    const { error } = ensureOwnership(device, req.user._id);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    device.blocked = blocked;
    await device.save();

    res.json({ message: blocked ? 'Device blocked' : 'Device unblocked', device });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /api/device/:deviceId
 * Soft delete a device record.
 */
const softDeleteDevice = async (req, res) => {
  const deviceId = req.params.deviceId || req.body.deviceId;

  if (!deviceId) {
    return res.status(400).json({ message: 'deviceId is required' });
  }

  try {
    const device = await Device.findOne({ deviceId });
    const { error } = ensureOwnership(device, req.user._id);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    device.deleted = true;
    device.deletedAt = new Date();
    await device.save();

    await User.updateOne(
      { _id: req.user._id },
      { $pull: { devices: deviceId } }
    );

    res.json({ message: 'Device soft deleted', device });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerDevice,
  setDeviceBlock,
  softDeleteDevice,
};


