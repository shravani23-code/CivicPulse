const mongoose = require('mongoose')

const complaintSchema = new mongoose.Schema({

  id: {
    type: String,
    required: true,
    unique: true
  },

  title: {
    type: String,
    required: true
  },

  category: {
    type: String,
    required: true,
    enum: {
      values: ['Road', 'Garbage', 'Water', 'Streetlight', 'Drainage', 'Traffic', 'Other'],
      message: '{VALUE} is not a valid complaint category.'
    }
  },

  description: {
    type: String,
    required: true
  },

  location: {
    type: String,
    required: true
  },

  // Optional: GPS was added to CivicPulse after launch, so older complaints
  // legitimately have neither field set. When present, each must fall
  // within its real-world range — never trusted blindly from the client.
  latitude: {
    type: Number,
    min: [-90, 'Latitude must be between -90 and 90.'],
    max: [90, 'Latitude must be between -90 and 90.']
  },

  longitude: {
    type: Number,
    min: [-180, 'Longitude must be between -180 and 180.'],
    max: [180, 'Longitude must be between -180 and 180.']
  },

  severity: {
    type: String,
    required: true,
    enum: {
      values: ['Low', 'Medium', 'High', 'Critical'],
      message: '{VALUE} is not a valid severity level.'
    }
  },

  status: {
    type: String,
    default: 'Pending'
  },

  priority: {
    type: Number,
    default: 10
  },

  images: [

    {
      url: {
        type: String,
        required: true
      },

      publicId: {
        type: String,
        required: true
      }
    }

  ],

  citizenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  citizenName: {
    type: String
  },

  citizenEmail: {
    type: String
  },

  // Normalized "+91XXXXXXXXXX". Optional: older complaints have none.
  // Never returned unmasked to anyone except an admin.
  citizenMobile: {
    type: String
  },

  citizenMobileVerified: {
    type: Boolean
  },

  // --------------------------------------
  // MODERATION (separate from operational `status`)
  //
  // Complaints created before moderation existed have no
  // moderationStatus at all and are treated as approved everywhere
  // (queries use $nin: ['needs_review', 'rejected']), so no migration
  // is needed.
  // --------------------------------------

  moderationStatus: {
    type: String,
    enum: ['approved', 'needs_review', 'rejected'],
    index: true
  },

  moderationReason: {
    type: String,
    default: ''
  },

  moderationFlags: [String],

  // Audit trail: every automatic or admin moderation decision.
  moderationHistory: [

    {
      decision: {
        type: String,
        enum: ['approved', 'needs_review', 'rejected'],
        required: true
      },

      reason: {
        type: String,
        default: ''
      },

      actor: {
        type: String,
        enum: ['system', 'admin'],
        required: true
      },

      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },

      adminEmail: {
        type: String
      },

      timestamp: {
        type: Date,
        default: Date.now
      }
    }

  ],

  // Set exactly once — the moment the complaint entered the processing
  // workflow (auto-approval at submission, or admin approval).
  workflowEnteredAt: {
    type: Date
  },

  history: [

    {
      status: {
        type: String,
        required: true
      },

      timestamp: {
        type: Date,
        default: Date.now
      },

      description: {
        type: String,
        default: ''
      }
    }

  ],

  createdAt: {
    type: Date,
    default: Date.now
  }

})

module.exports = mongoose.model('Complaint', complaintSchema)
