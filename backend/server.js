const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
require('dotenv').config()

const { rankByPriority, buildHistoryTimeline, processQueue } = require('./dsaEngines')


const app = express()


// ======================================
// MIDDLEWARE
// ======================================

// FRONTEND_ORIGIN can be a single origin or a comma-separated list
// (useful for a Vercel production URL + preview deployments). Falls back
// to allowing any origin when unset, so local development still works.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {

    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    callback(new Error('Not allowed by CORS'))
  }
}))

app.use(express.json())


// ======================================
// PRIORITY CALCULATION
// ======================================

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


// ======================================
// MONGODB COMPLAINT SCHEMA
// ======================================

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
    type: Number,
    default: 10
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


const Complaint =
  mongoose.model(
    'Complaint',
    complaintSchema
  )


// ======================================
// HOME
// ======================================

app.get('/', (req, res) => {

  res.json({

    message:
      'CivicPulse Backend is running!'

  })

})

// ======================================
// CITY STATISTICS
// ======================================

app.get(
  '/api/complaints/stats',
  async (req, res) => {

    try {

      const total =
        await Complaint.countDocuments()


      const pending =
        await Complaint.countDocuments({
          status: 'Pending'
        })


      const inProgress =
        await Complaint.countDocuments({
          status: 'In Progress'
        })


      const resolved =
        await Complaint.countDocuments({
          status: 'Resolved'
        })


      const critical =
        await Complaint.countDocuments({
          severity: 'Critical'
        })


      res.json({

        total,
        pending,
        inProgress,
        resolved,
        critical

      })


    } catch (error) {

      console.error(
        'Statistics error:',
        error
      )


      res.status(500).json({

        message:
          'Failed to fetch complaint statistics.',

        error:
          error.message

      })

    }

  }
)
// ======================================
// GET ALL COMPLAINTS
// ======================================

app.get(
  '/api/complaints',
  async (req, res) => {

    try {

      const complaints =
        await Complaint.find()
          .sort({
            createdAt: -1
          })


      res.json(
        complaints
      )


    } catch (error) {

      console.error(
        'Error fetching complaints:',
        error
      )


      res.status(500).json({

        message:
          'Failed to fetch complaints.',

        error:
          error.message

      })

    }

  }
)


// ======================================
// PRIORITY COMPLAINTS
// MAX HEAP
// ======================================

app.get(
  '/api/complaints/priority',
  async (req, res) => {

    try {

      const complaints =
        await Complaint.find()


      // ==================================
      // REPAIR OLD PRIORITY VALUES
      // ==================================

      for (
        const complaint of complaints
      ) {

        if (
          typeof complaint.priority !== 'number' ||
          Number.isNaN(
            complaint.priority
          )
        ) {

          complaint.priority =
            calculatePriority(
              complaint.severity
            )

          await complaint.save()

        }

      }


      // ==================================
      // RANK USING MAX HEAP ENGINE
      // ==================================

      const rankedComplaints =
        rankByPriority(complaints)
          .map(complaint => ({

            id: complaint.id,
            title: complaint.title,
            category: complaint.category,
            severity: complaint.severity,
            priority: complaint.priority,
            location: complaint.location,
            status: complaint.status,
            createdAt: complaint.createdAt

          }))


      res.json({

        message:
          'Complaints ranked using Max Heap',

        complaints:
          rankedComplaints

      })


    } catch (error) {

      console.error(
        'Priority integration error:',
        error
      )


      res.status(500).json({

        message:
          'Failed to process complaints.',

        error:
          error.message

      })

    }

  }
)


// ======================================
// COMPLAINT HISTORY
// LINKED LIST
// ======================================

app.get(
  '/api/complaints/:id/history',
  async (req, res) => {

    try {

      // ==================================
      // FIND COMPLAINT
      // ==================================

      const complaint =
        await Complaint.findOne({

          id:
            req.params.id

        })


      if (!complaint) {

        return res.status(404).json({

          message:
            'Complaint not found.'

        })

      }


      // ==================================
      // REPAIR OLD PRIORITY
      // ==================================

      if (
        typeof complaint.priority !== 'number' ||
        Number.isNaN(
          complaint.priority
        )
      ) {

        complaint.priority =
          calculatePriority(
            complaint.severity
          )

      }


      // ==================================
      // CREATE HISTORY FOR OLD COMPLAINTS
      // ==================================

      if (
        !Array.isArray(
          complaint.history
        ) ||
        complaint.history.length === 0
      ) {

        const history = [

          {

            status:
              'Pending',

            timestamp:
              complaint.createdAt ||
              new Date(),

            description:
              'Complaint was submitted.'

          }

        ]


        if (
          complaint.status ===
          'In Progress'
        ) {

          history.push({

            status:
              'In Progress',

            timestamp:
              new Date(),

            description:
              'Complaint is currently being processed.'

          })

        }


        if (
          complaint.status ===
          'Resolved'
        ) {

          history.push({

            status:
              'In Progress',

            timestamp:
              new Date(),

            description:
              'Complaint was processed by the authority.'

          })


          history.push({

            status:
              'Resolved',

            timestamp:
              new Date(),

            description:
              'Complaint was marked as resolved.'

          })

        }


        complaint.history =
          history

      }


      await complaint.save()


      // ==================================
      // BUILD HISTORY USING LINKED LIST ENGINE
      // ==================================

      const historyResult =
        buildHistoryTimeline(complaint.history)


      res.json({

        message:
          'Complaint history processed using Linked List',

        history:
          historyResult

      })


    } catch (error) {

      console.error(
        'History integration error:',
        error
      )


      res.status(500).json({

        message:
          'Failed to process complaint history.',

        error:
          error.message

      })

    }

  }
)


// ======================================
// COMPLAINT PROCESSING QUEUE
// FIFO QUEUE
// ======================================

app.get(
  '/api/complaints/queue',
  async (req, res) => {

    try {

      // ==================================
      // GET UNRESOLVED COMPLAINTS
      // OLDEST FIRST
      // ==================================

      const complaints =
        await Complaint.find({

          status: {
            $ne: 'Resolved'
          }

        }).sort({

          createdAt: 1

        })


      // ==================================
      // PROCESS USING FIFO QUEUE ENGINE
      // ==================================

      const queueComplaints =
        processQueue(complaints)
          .map((complaint, index) => ({

            position: index + 1,
            id: complaint.id,
            title: complaint.title,
            category: complaint.category,
            severity: complaint.severity,
            priority: complaint.priority,
            status: complaint.status,
            createdAt: complaint.createdAt

          }))


      res.json({

        message:
          'Complaints processed using FIFO Queue',

        queue:
          queueComplaints

      })


    } catch (error) {

      console.error(
        'Queue integration error:',
        error
      )


      res.status(500).json({

        message:
          'Failed to process complaint queue.',

        error:
          error.message

      })

    }

  }
)


// ======================================
// SUBMIT COMPLAINT
// ======================================

app.post(
  '/api/complaints',
  async (req, res) => {

    try {

      const {

        title,
        category,
        description,
        location,
        severity

      } =
        req.body


      // ==================================
      // VALIDATION
      // ==================================

      if (
        !title ||
        !category ||
        !description ||
        !location ||
        !severity
      ) {

        return res.status(400).json({

          message:
            'Please provide all required complaint details.'

        })

      }


      // ==================================
      // GENERATE COMPLAINT ID
      // ==================================

      const complaintId =
        'CP' +
        Date.now()
          .toString()
          .slice(-8)


      // ==================================
      // CALCULATE PRIORITY
      // ==================================

      const priority =
        calculatePriority(
          severity
        )


      // ==================================
      // CREATE COMPLAINT
      // ==================================

      const complaint =
        new Complaint({

          id:
            complaintId,

          title:
            title,

          category:
            category,

          description:
            description,

          location:
            location,

          severity:
            severity,

          status:
            'Pending',

          priority:
            priority,

          history: [

            {

              status:
                'Pending',

              timestamp:
                new Date(),

              description:
                'Complaint submitted by citizen.'

            }

          ]

        })


      // ==================================
      // SAVE
      // ==================================

      await complaint.save()


      res.status(201).json({

        message:
          'Complaint submitted successfully.',

        complaint:
          complaint

      })


    } catch (error) {

      console.error(
        'Error saving complaint:',
        error
      )


      res.status(500).json({

        message:
          'Failed to save complaint.',

        error:
          error.message

      })

    }

  }
)


// ======================================
// UPDATE COMPLAINT STATUS
// ======================================

app.put(
  '/api/complaints/:id/status',
  async (req, res) => {

    try {

      const {
        status
      } =
        req.body


      // ==================================
      // VALID STATUSES
      // ==================================

      const allowedStatuses = [

        'Pending',
        'In Progress',
        'Resolved'

      ]


      if (
        !allowedStatuses.includes(
          status
        )
      ) {

        return res.status(400).json({

          message:
            'Invalid status. Use Pending, In Progress or Resolved.'

        })

      }


      // ==================================
      // FIND COMPLAINT
      // ==================================

      const complaint =
        await Complaint.findOne({

          id:
            req.params.id

        })


      if (!complaint) {

        return res.status(404).json({

          message:
            'Complaint not found.'

        })

      }


      // ==================================
      // REPAIR OLD PRIORITY
      // ==================================

      if (
        typeof complaint.priority !== 'number' ||
        Number.isNaN(
          complaint.priority
        )
      ) {

        complaint.priority =
          calculatePriority(
            complaint.severity
          )

      }


      // ==================================
      // UPDATE STATUS
      // ==================================

      complaint.status =
        status


      // ==================================
      // ENSURE HISTORY EXISTS
      // ==================================

      if (
        !Array.isArray(
          complaint.history
        )
      ) {

        complaint.history = []

      }


      // ==================================
      // ADD HISTORY
      // ==================================

      complaint.history.push({

        status:
          status,

        timestamp:
          new Date(),

        description:
          `Complaint status changed to ${status}.`

      })


      // ==================================
      // SAVE
      // ==================================

      await complaint.save()


      res.json({

        message:
          'Complaint status updated successfully.',

        complaint:
          complaint

      })


    } catch (error) {

      console.error(
        'Status update error:',
        error
      )


      res.status(500).json({

        message:
          'Failed to update complaint status.',

        error:
          error.message

      })

    }

  }
)


// ======================================
// GET COMPLAINT BY ID
// ======================================

app.get(
  '/api/complaints/:id',
  async (req, res) => {

    try {

      // ==================================
      // FIND COMPLAINT
      // ==================================

      const complaint =
        await Complaint.findOne({

          id:
            req.params.id

        })


      if (!complaint) {

        return res.status(404).json({

          message:
            'Complaint not found.'

        })

      }


      // ==================================
      // REPAIR OLD PRIORITY
      // ==================================

      if (
        typeof complaint.priority !== 'number' ||
        Number.isNaN(
          complaint.priority
        )
      ) {

        complaint.priority =
          calculatePriority(
            complaint.severity
          )

      }


      // ==================================
      // CREATE HISTORY FOR OLD RECORDS
      // ==================================

      if (
        !Array.isArray(
          complaint.history
        ) ||
        complaint.history.length === 0
      ) {

        const history = [

          {

            status:
              'Pending',

            timestamp:
              complaint.createdAt ||
              new Date(),

            description:
              'Complaint was submitted.'

          }

        ]


        if (
          complaint.status ===
          'In Progress'
        ) {

          history.push({

            status:
              'In Progress',

            timestamp:
              new Date(),

            description:
              'Complaint is currently being processed.'

          })

        }


        if (
          complaint.status ===
          'Resolved'
        ) {

          history.push({

            status:
              'In Progress',

            timestamp:
              new Date(),

            description:
              'Complaint was processed by the authority.'

          })


          history.push({

            status:
              'Resolved',

            timestamp:
              new Date(),

            description:
              'Complaint was marked as resolved.'

          })

        }


        complaint.history =
          history

      }


      // ==================================
      // SAVE REPAIRED RECORD
      // ==================================

      await complaint.save()


      // ==================================
      // RESPONSE
      // ==================================

      res.json(
        complaint
      )


    } catch (error) {

      console.error(
        'GET COMPLAINT ERROR:',
        error
      )


      res.status(500).json({

        message:
          'Failed to fetch complaint.',

        error:
          error.message

      })

    }

  }
)


// ======================================
// CONNECT MONGODB + START SERVER
// ======================================

mongoose
  .connect(
    process.env.MONGODB_URI
  )

  .then(() => {

    console.log(
      'MongoDB connected successfully!'
    )


    const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`CivicPulse backend running on port ${PORT}`);
});
  })

  .catch(
    (error) => {

      console.error(
        'MongoDB connection failed:',
        error.message
      )

    }
  )