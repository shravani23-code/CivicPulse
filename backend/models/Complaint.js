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
  // moderationStatus at all and are treated as approved everywhere.
  // Only 'rejected' (an administrator's decision) keeps a complaint out
  // of the processing workflow (queries use $ne: 'rejected'). New
  // complaints are always 'approved'; 'needs_review' only exists on
  // older records and is admitted on the first admin status change.
  // No migration is needed.
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

  // --------------------------------------
  // SUSPICIOUS-SUBMISSION CHECK (services/suspicionDetector.js)
  //
  // Records review-worthy signals and their evidence (older complaints
  // were held for review because of them). Purely advisory: it
  // never rejects a complaint, never touches the account, and is never
  // read by the priority engine (dsaEngines.js). Older complaints have
  // no `suspicion` and count as "normal".
  //
  //   level: normal            no review-worthy signal
  //          review_required   an administrator should look at it
  //          confirmed_invalid an administrator reviewed it and rejected it
  // --------------------------------------

  suspicion: {

    level: {
      type: String,
      enum: ['normal', 'review_required', 'confirmed_invalid']
    },

    flagged: {
      type: Boolean
    },

    signals: [

      {
        _id: false,
        rule: { type: String, required: true },
        reason: { type: String, default: '' },
        evidence: { type: String, default: '' },
        matchedComplaintIds: [String]
      }

    ],

    // Similar recent reports by OTHER citizens. Several people reporting
    // the same streetlight is normal, so this is information for the
    // admin, never a suspicion signal.
    relatedComplaintIds: [String],

    detectedAt: Date,

    // not_required | pending | dismissed | approved | confirmed_invalid
    reviewStatus: String,

    reviewedAt: Date,

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    reviewerEmail: String,

    reviewReason: String

  },

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

// Support the suspicious-submission lookups (recent complaints by the
// same citizen / in the same category). Non-unique, built in background.
complaintSchema.index({ citizenId: 1, createdAt: -1 })
complaintSchema.index({ category: 1, createdAt: -1 })

module.exports = mongoose.model('Complaint', complaintSchema)
