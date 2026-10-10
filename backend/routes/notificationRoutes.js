const express = require('express')
const mongoose = require('mongoose')
const Notification = require('../models/Notification')
const { requireAuth } = require('../middleware/auth')
const { rateLimit } = require('../middleware/rateLimit')

const router = express.Router()

// Every query below is scoped to recipientId = the id inside the
// verified JWT. A citizen can never read or modify someone else's
// notifications, and a notification that exists but belongs to someone
// else is answered exactly like one that doesn't exist.

router.use(requireAuth)

router.use(rateLimit({
  name: 'notifications',
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many notification requests. Please slow down.'
}))

function toClientNotification(notification) {

  return {
    _id: notification._id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    complaintId: notification.complaintId,
    read: notification.read,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    smsStatus: notification.sms ? notification.sms.status : 'not_configured'
  }

}


// ======================================
// LIST MY NOTIFICATIONS (+ unread count)
// GET /api/notifications?limit=30
// ======================================

router.get('/', async (req, res) => {

  try {

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100)

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipientId: req.user.id }).sort({ createdAt: -1 }).limit(limit),
      Notification.countDocuments({ recipientId: req.user.id, read: false })
    ])

    res.json({ notifications: notifications.map(toClientNotification), unreadCount })

  } catch (error) {

    console.error('Notification list error:', error)

    res.status(500).json({ message: 'Failed to fetch notifications.' })

  }

})


// ======================================
// UNREAD COUNT ONLY
// GET /api/notifications/unread-count
// ======================================

router.get('/unread-count', async (req, res) => {

  try {

    const unreadCount = await Notification.countDocuments({ recipientId: req.user.id, read: false })

    res.json({ unreadCount })

  } catch (error) {

    console.error('Unread count error:', error)

    res.status(500).json({ message: 'Failed to fetch unread count.' })

  }

})


// ======================================
// MARK ALL AS READ
// PATCH /api/notifications/read-all
// ======================================

router.patch('/read-all', async (req, res) => {

  try {

    const result = await Notification.updateMany(
      { recipientId: req.user.id, read: false },
      { $set: { read: true, readAt: new Date() } }
    )

    res.json({ message: 'All notifications marked as read.', updated: result.modifiedCount })

  } catch (error) {

    console.error('Mark all read error:', error)

    res.status(500).json({ message: 'Failed to update notifications.' })

  }

})


// ======================================
// MARK ONE AS READ
// PATCH /api/notifications/:id/read
// ======================================

router.patch('/:id/read', async (req, res) => {

  try {

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Notification not found.' })
    }

    const existing = await Notification.findOne({ _id: req.params.id, recipientId: req.user.id })

    if (!existing) {
      return res.status(404).json({ message: 'Notification not found.' })
    }

    // Idempotent: marking an already-read notification keeps its readAt.
    if (!existing.read) {
      existing.read = true
      existing.readAt = new Date()
      await existing.save()
    }

    res.json({ message: 'Notification marked as read.', notification: toClientNotification(existing) })

  } catch (error) {

    console.error('Mark read error:', error)

    res.status(500).json({ message: 'Failed to update notification.' })

  }

})

module.exports = router
