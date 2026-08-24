const cloudinary = require('cloudinary').v2
const streamifier = require('streamifier')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Uploads an in-memory image buffer (from multer) to Cloudinary and
// resolves with the hosted URL + public ID needed to store/manage it.
function uploadBuffer(buffer, folder) {

  return new Promise((resolve, reject) => {

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {

        if (error) {
          return reject(error)
        }

        resolve({ url: result.secure_url, publicId: result.public_id })

      }
    )

    streamifier.createReadStream(buffer).pipe(uploadStream)

  })

}

module.exports = { uploadBuffer }
