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
