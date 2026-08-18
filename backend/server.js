const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
require('dotenv').config()

const app = express()
const PORT = 5000

app.use(cors())
app.use(express.json())


// ===============================
// MongoDB Complaint Schema
// ===============================

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

  severity: {
    type: String,
    required: true
  },

  status: {
    type: String,
    default: 'Pending'
  },

  priority: {
    type: String,
    default: 'Not calculated'
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

})

const Complaint = mongoose.model(
  'Complaint',
  complaintSchema
)


// ===============================
// Home
// ===============================

app.get('/', (req, res) => {

  res.json({
    message: 'CivicPulse Backend is running!'
  })

})


// ===============================
// Get All Complaints
// ===============================

app.get('/api/complaints', async (req, res) => {

  try {

    const complaints = await Complaint.find()
      .sort({ createdAt: -1 })

    res.json(complaints)

  } catch (error) {

    console.error(error)

    res.status(500).json({
      message: 'Failed to fetch complaints.'
    })

  }

})


// ===============================
// Submit Complaint
// ===============================

app.post('/api/complaints', async (req, res) => {

  try {

    const {
      title,
      category,
      description,
      location,
      severity
    } = req.body


    // Validate required fields

    if (
      !title ||
      !category ||
      !description ||
      !location ||
      !severity
    ) {

      return res.status(400).json({
        message: 'Please provide all required complaint details.'
      })

    }


    // Generate Complaint ID

    const complaintId =
      'CP' + Date.now().toString().slice(-8)


    // Create complaint
function calculatePriority(severity) {

  if (severity === 'Critical') {
    return 40
  }

  if (severity === 'High') {
    return 30
  }

  if (severity === 'Medium') {
    return 20
  }

  return 10
}
    const complaint = new Complaint({

      id: complaintId,

      title: title,

      category: category,

      description: description,

      location: location,

      severity: severity,

      status: 'Pending',

     priority: calculatePriority(severity)
    })


    // Save to MongoDB

    await complaint.save()


    console.log(
      'Complaint saved to MongoDB:',
      complaint.id
    )


    res.status(201).json({

      message: 'Complaint submitted successfully.',

      complaint: complaint

    })


  } catch (error) {

    console.error(
      'Error saving complaint:',
      error
    )

    res.status(500).json({
      message: 'Failed to save complaint.'
    })

  }

})


// ===============================
// Get Complaint By ID
// ===============================

app.get('/api/complaints/:id', async (req, res) => {

  try {

    const complaint = await Complaint.findOne({
      id: req.params.id
    })


    if (!complaint) {

      return res.status(404).json({
        message: 'Complaint not found.'
      })

    }


    res.json(complaint)


  } catch (error) {

    console.error(error)

    res.status(500).json({
      message: 'Failed to fetch complaint.'
    })

  }

})


// ===============================
// Connect MongoDB + Start Server
// ===============================

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {

    console.log(
      'MongoDB connected successfully!'
    )

    app.listen(PORT, () => {

      console.log(
        `CivicPulse backend running on http://localhost:${PORT}`
      )

    })

  })
  .catch((error) => {

    console.error(
      'MongoDB connection failed:',
      error.message
    )

  })