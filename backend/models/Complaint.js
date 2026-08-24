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
    required: true
  },

  description: {
    type: String,
    required: true
  },

  location: {
    type: String,
    required: true
  },

  latitude: {
    type: Number
  },

  longitude: {
    type: Number
  },

  severity: {
    type: String,
    required: true
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
