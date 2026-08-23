const express = require('express')
const { spawn } = require('child_process')
const path = require('path')
const cors = require('cors')
const mongoose = require('mongoose')
require('dotenv').config()


const app = express()
const PORT = 5000


// ======================================
// MIDDLEWARE
// ======================================

app.use(cors())
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
// C++ MAX HEAP
// ======================================

app.get(
  '/api/complaints/priority',
  async (req, res) => {

    try {

      console.log(
        'Priority API called'
      )


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
      // C++ MAX HEAP ENGINE
      // ==================================

      const cppPath =
        path.join(
          __dirname,
          '..',
          'dsa',
          'priority_engine.exe'
        )


      console.log(
        'Starting C++ Priority Engine:',
        cppPath
      )


      const cppProcess =
        spawn(cppPath)


      let output = ''
      let errorOutput = ''


      cppProcess.on(
        'error',
        (error) => {

          console.error(
            'Could not start Priority Engine:',
            error
          )

        }
      )


      // ==================================
      // SEND DATA TO C++
      // ==================================

      for (
        const complaint of complaints
      ) {

        const line =
          `${complaint.id}|` +
          `${complaint.title}|` +
          `${complaint.category}|` +
          `${complaint.severity}\n`


        cppProcess.stdin.write(
          line
        )

      }


      cppProcess.stdin.end()


      // ==================================
      // RECEIVE C++ OUTPUT
      // ==================================

      cppProcess.stdout.on(
        'data',
        (data) => {

          output +=
            data.toString()

        }
      )


      cppProcess.stderr.on(
        'data',
        (data) => {

          errorOutput +=
            data.toString()

        }
      )


      // ==================================
      // C++ FINISHED
      // ==================================

      cppProcess.on(
        'close',
        (code) => {

          console.log(
            'Priority engine finished:',
            code
          )


          if (code !== 0) {

            console.error(
              'Priority Engine error:',
              errorOutput
            )


            return res.status(500).json({

              message:
                'C++ Priority Engine failed.',

              error:
                errorOutput

            })

          }


          const lines =
            output
              .trim()
              .split('\n')
              .filter(
                line =>
                  line.trim().length > 0
              )


          const rankedComplaints =
            lines.map(
              (line) => {

                const [

                  id,
                  title,
                  category,
                  severity,
                  priority

                ] =
                  line.split('|')


                const originalComplaint =
                  complaints.find(
                    complaint =>
                      complaint.id === id
                  )


                return {

                  id:
                    id || '',

                  title:
                    title || '',

                  category:
                    category || '',

                  severity:
                    severity || '',

                  priority:
                    Number(priority) || 0,

                  location:
                    originalComplaint
                      ? originalComplaint.location
                      : '',

                  status:
                    originalComplaint
                      ? originalComplaint.status
                      : 'Pending',

                  createdAt:
                    originalComplaint
                      ? originalComplaint.createdAt
                      : null

                }

              }
            )


          res.json({

            message:
              'Complaints ranked using C++ Max Heap',

            complaints:
              rankedComplaints

          })

        }
      )


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
// C++ LINKED LIST
// ======================================

app.get(
  '/api/complaints/:id/history',
  async (req, res) => {

    try {

      console.log(
        'History API called:',
        req.params.id
      )


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
      // C++ LINKED LIST ENGINE
      // ==================================

      const cppPath =
        path.join(
          __dirname,
          '..',
          'dsa',
          'history_engine.exe'
        )


      console.log(
        'Starting History Engine:',
        cppPath
      )


      const cppProcess =
        spawn(cppPath)


      let output = ''
      let errorOutput = ''


      cppProcess.on(
        'error',
        (error) => {

          console.error(
            'Could not start History Engine:',
            error
          )

        }
      )


      // ==================================
      // SEND HISTORY TO C++
      // ==================================

      for (
        const item of complaint.history
      ) {

        const timestamp =
          new Date(
            item.timestamp
          ).toISOString()


        const line =
          `${item.status}|` +
          `${timestamp}|` +
          `${item.description || ''}\n`


        cppProcess.stdin.write(
          line
        )

      }


      cppProcess.stdin.end()


      // ==================================
      // RECEIVE C++ OUTPUT
      // ==================================

      cppProcess.stdout.on(
        'data',
        (data) => {

          output +=
            data.toString()

        }
      )


      cppProcess.stderr.on(
        'data',
        (data) => {

          errorOutput +=
            data.toString()

        }
      )


      // ==================================
      // C++ FINISHED
      // ==================================

      cppProcess.on(
        'close',
        (code) => {

          if (code !== 0) {

            console.error(
              'History Engine error:',
              errorOutput
            )


            return res.status(500).json({

              message:
                'C++ History Engine failed.',

              error:
                errorOutput

            })

          }


          const lines =
            output
              .trim()
              .split('\n')
              .filter(
                line =>
                  line.trim().length > 0
              )


          const historyResult =
            lines.map(
              (line) => {

                const parts =
                  line.split('|')


                return {

                  status:
                    parts[0] || '',

                  timestamp:
                    parts[1] || '',

                  description:
                    parts
                      .slice(2)
                      .join('|') || ''

                }

              }
            )


          res.json({

            message:
              'Complaint history processed using C++ Linked List',

            history:
              historyResult

          })

        }
      )


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
// C++ FIFO QUEUE
// ======================================

app.get(
  '/api/complaints/queue',
  async (req, res) => {

    try {

      console.log(
        'Queue API called'
      )


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
      // C++ QUEUE ENGINE
      // ==================================

      const cppPath =
        path.join(
          __dirname,
          '..',
          'dsa',
          'queue_engine.exe'
        )


      console.log(
        'Starting C++ Queue Engine:',
        cppPath
      )


      const cppProcess =
        spawn(cppPath)


      let output = ''
      let errorOutput = ''


      cppProcess.on(
        'error',
        (error) => {

          console.error(
            'Could not start Queue Engine:',
            error
          )

        }
      )


      // ==================================
      // SEND COMPLAINTS TO C++
      // ==================================

      for (
        const complaint of complaints
      ) {

        const line =
          `${complaint.id}|` +
          `${complaint.title}|` +
          `${complaint.category}|` +
          `${complaint.severity}\n`


        cppProcess.stdin.write(
          line
        )

      }


      cppProcess.stdin.end()


      // ==================================
      // RECEIVE C++ OUTPUT
      // ==================================

      cppProcess.stdout.on(
        'data',
        (data) => {

          output +=
            data.toString()

        }
      )


      cppProcess.stderr.on(
        'data',
        (data) => {

          errorOutput +=
            data.toString()

        }
      )


      // ==================================
      // C++ FINISHED
      // ==================================

      cppProcess.on(
        'close',
        (code) => {

          console.log(
            'Queue engine finished:',
            code
          )


          if (code !== 0) {

            console.error(
              'Queue Engine error:',
              errorOutput
            )


            return res.status(500).json({

              message:
                'C++ Queue Engine failed.',

              error:
                errorOutput

            })

          }


          const lines =
            output
              .trim()
              .split('\n')
              .filter(
                line =>
                  line.trim().length > 0
              )


          const queueComplaints =
            lines.map(
              (line, index) => {

                const [

                  id,
                  title,
                  category,
                  severity

                ] =
                  line.split('|')


                const originalComplaint =
                  complaints.find(
                    complaint =>
                      complaint.id === id
                  )


                return {

                  position:
                    index + 1,

                  id:
                    id || '',

                  title:
                    title || '',

                  category:
                    category || '',

                  severity:
                    severity || '',

                  priority:
                    originalComplaint
                      ? originalComplaint.priority
                      : 0,

                  status:
                    originalComplaint
                      ? originalComplaint.status
                      : 'Pending',

                  createdAt:
                    originalComplaint
                      ? originalComplaint.createdAt
                      : null

                }

              }
            )


          res.json({

            message:
              'Complaints processed using C++ FIFO Queue',

            queue:
              queueComplaints

          })

        }
      )


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


      console.log(
        'Complaint saved:',
        complaint.id
      )


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


      console.log(

        `Complaint ${complaint.id} status updated to ${status}`

      )


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

      console.log(
        'Searching complaint:',
        req.params.id
      )


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